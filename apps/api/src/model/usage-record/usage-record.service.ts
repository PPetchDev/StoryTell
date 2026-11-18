import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';

import { CallKind, CreditPool } from '../../service/model-gateway/model-gateway.js';
import { NewUsageRecord } from '../../service/model-gateway/real/real-model-gateway.js';
import { AccountModelService } from '../account/account.service.js';
import { UsageRecordEntity } from './entities/usage-record.entity.js';

export interface PoolSpend {
    spentUsd: number;
    calls: number;
}

/**
 * A pool's prompt cache over the calls whose host reported it (.scratch/prompt-cache/spec.md):
 * their prompt tokens, and how many of those were read from the cache.
 */
export interface PromptCacheSpend {
    promptTokens: number;
    cachedTokens: number;
}

/** One call kind's share of a pool's spend. */
export interface KindSpend extends PoolSpend {
    kind: CallKind;
}

/**
 * One model's, or one host's, share of a pool's spend this month (.scratch/cost-view/spec.md: "Usage
 * page"), with its prompt cache over the calls that reported it.
 */
export interface NamedSpend extends PoolSpend {
    name: string;
    cache: PromptCacheSpend | null;
}

/** One call kind's part of what a reply cost (.scratch/cost-view/spec.md). */
export interface ReplyKindCost {
    kind: CallKind;
    costUsd: number;
    calls: number;
    /** The cache of its calls that reported one; null when none did, and for every call that isn't text. */
    cache: PromptCacheSpend | null;
}

/** What one AI Message cost: every call it caused, by kind, most spent first. */
export interface ReplyCost {
    messageId: number;
    costUsd: number;
    calls: number;
    byKind: ReplyKindCost[];
}

/**
 * The calls a turn makes before its AI Message is stored (.scratch/cost-view/spec.md: "Calls made
 * before the Message exists"): given the Message once it is.
 */
export const TURN_CALL_KINDS: readonly CallKind[] = ['turn', 'context_search', 'character_thought', 'speech_repair', 'speech_repair_fallback'];

interface CacheRow {
    cacheCalls: string;
    cachePromptTokens: string;
    cachedTokens: string;
}

/** The cache of a group's calls that reported one; null when none did. */
function cacheOf(row: CacheRow): PromptCacheSpend | null {
    return Number(row.cacheCalls) > 0 ? { promptTokens: Number(row.cachePromptTokens), cachedTokens: Number(row.cachedTokens) } : null;
}

function addCache(into: PromptCacheSpend | null, more: PromptCacheSpend | null): PromptCacheSpend | null {
    if (!more) return into;
    return { promptTokens: (into?.promptTokens ?? 0) + more.promptTokens, cachedTokens: (into?.cachedTokens ?? 0) + more.cachedTokens };
}

@Injectable()
export class UsageRecordModelService {
    constructor(
        @InjectRepository(UsageRecordEntity) private readonly records: Repository<UsageRecordEntity>,
        private readonly accounts: AccountModelService,
    ) {}

    async record(record: NewUsageRecord): Promise<void> {
        // The Account of the request that made the call, or of the request that started its background work.
        await this.records.save(this.records.create({ ...record, userId: this.accounts.currentId() }));
    }

    /** The newest record's id, 0 with none: where a turn's own calls start (see `claimForReply`). */
    async lastId(): Promise<number> {
        const row = await this.records.createQueryBuilder('record').select('MAX(record.id)', 'id').getRawOne<{ id: number | null }>();
        return Number(row?.id ?? 0);
    }

    /**
     * Gives the AI Message the calls its turn made before it was stored: the Chat's records of the
     * turn's kinds after `afterId` that name no Message yet. The turn lock keeps any other turn of
     * the Chat from recording those kinds meanwhile.
     */
    async claimForReply(chatId: number, afterId: number, messageId: number): Promise<void> {
        await this.records.update({ chatId, id: MoreThan(afterId), messageId: IsNull(), kind: In([...TURN_CALL_KINDS]) }, { messageId });
    }

    /** What each AI Message of a Chat cost, for the Messages that have any calls, oldest first. */
    async costsOfChat(chatId: number): Promise<ReplyCost[]> {
        const rows = await this.cacheColumns(
            this.records
                .createQueryBuilder('record')
                .select('record.message_id', 'messageId')
                .addSelect('record.kind', 'kind')
                .addSelect('COALESCE(SUM(record.cost_usd), 0)', 'costUsd')
                .addSelect('COUNT(*)', 'calls'),
        )
            .where('record.chat_id = :chatId AND record.message_id IS NOT NULL', { chatId })
            .groupBy('record.message_id')
            .addGroupBy('record.kind')
            .getRawMany<CacheRow & { messageId: number; kind: CallKind; costUsd: string; calls: string }>();

        const byMessage = new Map<number, ReplyCost>();
        for (const row of rows) {
            const messageId = Number(row.messageId);
            const cost = byMessage.get(messageId) ?? { messageId, costUsd: 0, calls: 0, byKind: [] };
            byMessage.set(messageId, cost);
            const kind: ReplyKindCost = { kind: row.kind, costUsd: Number(row.costUsd), calls: Number(row.calls), cache: cacheOf(row) };
            cost.costUsd += kind.costUsd;
            cost.calls += kind.calls;
            cost.byKind.push(kind);
        }
        const costs = [...byMessage.values()].sort((a, b) => a.messageId - b.messageId);
        for (const cost of costs) cost.byKind.sort((a, b) => b.costUsd - a.costUsd || b.calls - a.calls || a.kind.localeCompare(b.kind));
        return costs;
    }

    /**
     * Each pool's spend since `from` per model and per host, most spent first, over every record (or
     * one Account's) (.scratch/cost-view/spec.md: "Usage page").
     */
    async spendByModelSince(from: Date, userId?: number): Promise<Record<CreditPool, { byModel: NamedSpend[]; byHost: NamedSpend[] }>> {
        const rows = await this.cacheColumns(
            this.records
                .createQueryBuilder('record')
                .select('record.pool', 'pool')
                .addSelect('record.model', 'model')
                .addSelect('record.host', 'host')
                .addSelect('COALESCE(SUM(record.cost_usd), 0)', 'spentUsd')
                .addSelect('COUNT(*)', 'calls'),
        )
            .where(userId === undefined ? { createdAt: MoreThanOrEqual(from) } : { createdAt: MoreThanOrEqual(from), userId })
            .groupBy('record.pool')
            .addGroupBy('record.model')
            .addGroupBy('record.host')
            .getRawMany<CacheRow & { pool: CreditPool; model: string; host: string; spentUsd: string; calls: string }>();

        const named = { text: { byModel: new Map<string, NamedSpend>(), byHost: new Map<string, NamedSpend>() }, image: { byModel: new Map<string, NamedSpend>(), byHost: new Map<string, NamedSpend>() } };
        const add = (into: Map<string, NamedSpend>, name: string, row: (typeof rows)[number]) => {
            const spend = into.get(name) ?? { name, spentUsd: 0, calls: 0, cache: null };
            into.set(name, spend);
            spend.spentUsd += Number(row.spentUsd);
            spend.calls += Number(row.calls);
            spend.cache = addCache(spend.cache, cacheOf(row));
        };
        for (const row of rows) {
            add(named[row.pool].byModel, row.model, row);
            add(named[row.pool].byHost, row.host, row);
        }
        const sorted = (spends: Map<string, NamedSpend>) => [...spends.values()].sort((a, b) => b.spentUsd - a.spentUsd || b.calls - a.calls || a.name.localeCompare(b.name));
        return {
            text: { byModel: sorted(named.text.byModel), byHost: sorted(named.text.byHost) },
            image: { byModel: sorted(named.image.byModel), byHost: sorted(named.image.byHost) },
        };
    }

    /** The prompt cache over only the calls that reported it, so older records don't read as misses. */
    private cacheColumns<T extends ReturnType<Repository<UsageRecordEntity>['createQueryBuilder']>>(query: T): T {
        return query
            .addSelect('COUNT(record.cached_tokens)', 'cacheCalls')
            .addSelect('COALESCE(SUM(record.prompt_tokens) FILTER (WHERE record.cached_tokens IS NOT NULL), 0)', 'cachePromptTokens')
            .addSelect('COALESCE(SUM(record.cached_tokens), 0)', 'cachedTokens') as T;
    }

    /**
     * What each Account spent since `from`, in USD, by Account id (.scratch/accounts/spec.md:
     * People, "Monthly cap"). An Account that spent nothing is left out.
     */
    async spentByAccountSince(from: Date): Promise<Map<number, number>> {
        const rows = await this.records
            .createQueryBuilder('record')
            .select('record.user_id', 'userId')
            .addSelect('COALESCE(SUM(record.cost_usd), 0)', 'spentUsd')
            .where({ createdAt: MoreThanOrEqual(from) })
            .groupBy('record.user_id')
            .getRawMany<{ userId: number; spentUsd: string }>();
        return new Map(rows.map((row) => [Number(row.userId), Number(row.spentUsd)]));
    }

    /** What one Account spent since `from`, in USD. */
    async spentSince(userId: number, from: Date): Promise<number> {
        const row = await this.records
            .createQueryBuilder('record')
            .select('COALESCE(SUM(record.cost_usd), 0)', 'spentUsd')
            .where({ createdAt: MoreThanOrEqual(from), userId })
            .getRawOne<{ spentUsd: string }>();
        return Number(row?.spentUsd ?? 0);
    }

    /**
     * Spend and call count per pool since `from`, over every record (or one Account's), with each pool's spend
     * per call kind, most spent first.
     */
    async spendSince(from: Date, userId?: number): Promise<Record<CreditPool, PoolSpend & { byKind: KindSpend[]; cache: PromptCacheSpend | null }>> {
        const rows = await this.records
            .createQueryBuilder('record')
            .select('record.pool', 'pool')
            .addSelect('record.kind', 'kind')
            .addSelect('COALESCE(SUM(record.cost_usd), 0)', 'spentUsd')
            .addSelect('COUNT(*)', 'calls')
            // The cache only over the calls that reported it, so older records don't read as misses.
            .addSelect('COUNT(record.cached_tokens)', 'cacheCalls')
            .addSelect('COALESCE(SUM(record.prompt_tokens) FILTER (WHERE record.cached_tokens IS NOT NULL), 0)', 'cachePromptTokens')
            .addSelect('COALESCE(SUM(record.cached_tokens), 0)', 'cachedTokens')
            .where(userId === undefined ? { createdAt: MoreThanOrEqual(from) } : { createdAt: MoreThanOrEqual(from), userId })
            .groupBy('record.pool')
            .addGroupBy('record.kind')
            .getRawMany<{
                pool: CreditPool;
                kind: CallKind;
                spentUsd: string;
                calls: string;
                cacheCalls: string;
                cachePromptTokens: string;
                cachedTokens: string;
            }>();

        const spend: Record<CreditPool, PoolSpend & { byKind: KindSpend[]; cache: PromptCacheSpend | null }> = {
            text: { spentUsd: 0, calls: 0, byKind: [], cache: null },
            image: { spentUsd: 0, calls: 0, byKind: [], cache: null },
        };
        for (const row of rows) {
            const pool = spend[row.pool];
            const kind = { kind: row.kind, spentUsd: Number(row.spentUsd), calls: Number(row.calls) };
            pool.spentUsd += kind.spentUsd;
            pool.calls += kind.calls;
            pool.byKind.push(kind);
            if (Number(row.cacheCalls) > 0) {
                const cache = (pool.cache ??= { promptTokens: 0, cachedTokens: 0 });
                cache.promptTokens += Number(row.cachePromptTokens);
                cache.cachedTokens += Number(row.cachedTokens);
            }
        }
        for (const pool of Object.values(spend)) {
            pool.byKind.sort((a, b) => b.spentUsd - a.spentUsd || b.calls - a.calls || a.kind.localeCompare(b.kind));
        }
        return spend;
    }
}

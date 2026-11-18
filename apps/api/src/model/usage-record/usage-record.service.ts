import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

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

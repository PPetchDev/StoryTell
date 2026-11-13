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
    async spendSince(from: Date, userId?: number): Promise<Record<CreditPool, PoolSpend & { byKind: KindSpend[] }>> {
        const rows = await this.records
            .createQueryBuilder('record')
            .select('record.pool', 'pool')
            .addSelect('record.kind', 'kind')
            .addSelect('COALESCE(SUM(record.cost_usd), 0)', 'spentUsd')
            .addSelect('COUNT(*)', 'calls')
            .where(userId === undefined ? { createdAt: MoreThanOrEqual(from) } : { createdAt: MoreThanOrEqual(from), userId })
            .groupBy('record.pool')
            .addGroupBy('record.kind')
            .getRawMany<{ pool: CreditPool; kind: CallKind; spentUsd: string; calls: string }>();

        const spend: Record<CreditPool, PoolSpend & { byKind: KindSpend[] }> = {
            text: { spentUsd: 0, calls: 0, byKind: [] },
            image: { spentUsd: 0, calls: 0, byKind: [] },
        };
        for (const row of rows) {
            const pool = spend[row.pool];
            const kind = { kind: row.kind, spentUsd: Number(row.spentUsd), calls: Number(row.calls) };
            pool.spentUsd += kind.spentUsd;
            pool.calls += kind.calls;
            pool.byKind.push(kind);
        }
        for (const pool of Object.values(spend)) {
            pool.byKind.sort((a, b) => b.spentUsd - a.spentUsd || b.calls - a.calls || a.kind.localeCompare(b.kind));
        }
        return spend;
    }
}

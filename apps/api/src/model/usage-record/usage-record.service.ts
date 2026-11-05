import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { CallKind, CreditPool } from '../../service/model-gateway/model-gateway.js';
import { NewUsageRecord } from '../../service/model-gateway/real/real-model-gateway.js';
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
    ) {}

    async record(record: NewUsageRecord): Promise<void> {
        await this.records.save(this.records.create(record));
    }

    /**
     * Spend and call count per pool since `from`, over every record, with each pool's spend
     * per call kind, most spent first.
     */
    async spendSince(from: Date): Promise<Record<CreditPool, PoolSpend & { byKind: KindSpend[] }>> {
        const rows = await this.records
            .createQueryBuilder('record')
            .select('record.pool', 'pool')
            .addSelect('record.kind', 'kind')
            .addSelect('COALESCE(SUM(record.cost_usd), 0)', 'spentUsd')
            .addSelect('COUNT(*)', 'calls')
            .where({ createdAt: MoreThanOrEqual(from) })
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

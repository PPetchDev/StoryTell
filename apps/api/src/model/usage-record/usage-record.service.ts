import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';

import { CreditPool } from '../../service/model-gateway/model-gateway.js';
import { NewUsageRecord } from '../../service/model-gateway/real/real-model-gateway.js';
import { UsageRecordEntity } from './entities/usage-record.entity.js';

export interface PoolSpend {
    spentUsd: number;
    calls: number;
}

@Injectable()
export class UsageRecordModelService {
    constructor(
        @InjectRepository(UsageRecordEntity) private readonly records: Repository<UsageRecordEntity>,
    ) {}

    async record(record: NewUsageRecord): Promise<void> {
        await this.records.save(this.records.create(record));
    }

    /** Spend and call count per pool since `from`, over every record. */
    async spendSince(from: Date): Promise<Record<CreditPool, PoolSpend>> {
        const rows = await this.records
            .createQueryBuilder('record')
            .select('record.pool', 'pool')
            .addSelect('COALESCE(SUM(record.cost_usd), 0)', 'spentUsd')
            .addSelect('COUNT(*)', 'calls')
            .where({ createdAt: MoreThanOrEqual(from) })
            .groupBy('record.pool')
            .getRawMany<{ pool: CreditPool; spentUsd: string; calls: string }>();

        const spend: Record<CreditPool, PoolSpend> = {
            text: { spentUsd: 0, calls: 0 },
            image: { spentUsd: 0, calls: 0 },
        };
        for (const row of rows) {
            spend[row.pool] = { spentUsd: Number(row.spentUsd), calls: Number(row.calls) };
        }
        return spend;
    }
}

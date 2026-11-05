import { Injectable } from '@nestjs/common';

import { SettingsModelService } from '../../model/settings/settings.service.js';
import { KindSpend, UsageRecordModelService } from '../../model/usage-record/usage-record.service.js';
import { CreditPool, ModelGateway } from '../../service/model-gateway/model-gateway.js';

export interface PoolUsage {
    /** Sum of this month's UsageRecords for the pool. */
    spentUsd: number;
    calls: number;
    /** This month's spend per call kind, most spent first; kinds with no calls are left out. */
    byKind: KindSpend[];
    /** Read from the provider; null when it can't be read (Venice without an Admin key). */
    remainingUsd: number | null;
    /** What the pool holds when topped up (Settings); the base of the percent threshold. */
    capUsd: number;
    lowCreditPercent: number;
    /** True when remaining credit is known and at or below the threshold. */
    lowCredit: boolean;
}

export interface UsageSummary {
    /** The month the spend covers, `YYYY-MM`, in the server's local time. */
    month: string;
    pools: Record<CreditPool, PoolUsage>;
}

@Injectable()
export class UsageManagerService {
    constructor(
        private readonly usageModel: UsageRecordModelService,
        private readonly settingsModel: SettingsModelService,
        private readonly gateway: ModelGateway,
    ) {}

    async currentUsage(now = new Date()): Promise<UsageSummary> {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const [spend, settings, credit] = await Promise.all([
            this.usageModel.spendSince(monthStart),
            this.settingsModel.get(),
            this.gateway.remainingCredit(),
        ]);

        const pool = (
            name: CreditPool,
            capUsd: number,
            lowCreditPercent: number,
        ): PoolUsage => {
            const remainingUsd = credit[name].remainingUsd;
            return {
                spentUsd: round(spend[name].spentUsd),
                calls: spend[name].calls,
                byKind: spend[name].byKind.map((kind) => ({ ...kind, spentUsd: round(kind.spentUsd) })),
                remainingUsd: remainingUsd === null ? null : round(remainingUsd),
                capUsd,
                lowCreditPercent,
                lowCredit: remainingUsd !== null && remainingUsd <= (capUsd * lowCreditPercent) / 100,
            };
        };

        return {
            month: `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
            pools: {
                text: pool('text', settings.textCreditCapUsd, settings.textLowCreditPercent),
                image: pool('image', settings.imageCreditCapUsd, settings.imageLowCreditPercent),
            },
        };
    }
}

function round(usd: number): number {
    return Math.round(usd * 1_000_000) / 1_000_000;
}

import { Injectable } from '@nestjs/common';

import { AccountModelService } from '../../model/account/account.service.js';
import { AccountRole } from '../../model/account/entities/account.entity.js';
import { SettingsModelService } from '../../model/settings/settings.service.js';
import { startOfMonthUtc } from '../../service/model-gateway/spend-cap.js';
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

/** A Member's Monthly cap and how much of it is spent (.scratch/accounts/spec.md). */
export interface MonthlyCapUsage {
    capUsd: number;
    /** Since the first of this month, UTC. */
    spentUsd: number;
    reached: boolean;
}

export interface UsageSummary {
    /** The month the spend covers, `YYYY-MM`: in the server's local time for the Owner, UTC for a Member, as their cap counts. */
    month: string;
    pools: Record<CreditPool, PoolUsage>;
    /** A Member's cap; null for the Owner, who has none. */
    monthlyCap: MonthlyCapUsage | null;
}

@Injectable()
export class UsageManagerService {
    constructor(
        private readonly usageModel: UsageRecordModelService,
        private readonly settingsModel: SettingsModelService,
        private readonly gateway: ModelGateway,
        private readonly accounts: AccountModelService,
    ) {}

    /**
     * This month's spend. The Owner sees everyone's and the providers' balances; a Member sees only
     * their own spend and Monthly cap, never the Owner's balances (.scratch/accounts/spec.md: "Owner-only").
     */
    async currentUsage(now = new Date()): Promise<UsageSummary> {
        const account = this.accounts.current();
        const member = account.role === AccountRole.Member;
        const monthStart = member ? startOfMonthUtc(now) : new Date(now.getFullYear(), now.getMonth(), 1);
        const [spend, settings, ownerCredit] = await Promise.all([
            this.usageModel.spendSince(monthStart, member ? account.id : undefined),
            this.settingsModel.get(),
            this.gateway.remainingCredit(),
        ]);
        const credit = member ? { text: { remainingUsd: null }, image: { remainingUsd: null } } : ownerCredit;

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
            month: member
                ? `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`
                : `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
            pools: {
                text: pool('text', settings.textCreditCapUsd, settings.textLowCreditPercent),
                image: pool('image', settings.imageCreditCapUsd, settings.imageLowCreditPercent),
            },
            monthlyCap: member && account.monthlyCapUsd !== null ? this.capUsage(account.monthlyCapUsd, spend.text.spentUsd + spend.image.spentUsd) : null,
        };
    }

    private capUsage(capUsd: number, spentUsd: number): MonthlyCapUsage {
        return { capUsd, spentUsd: round(spentUsd), reached: spentUsd >= capUsd };
    }
}

function round(usd: number): number {
    return Math.round(usd * 1_000_000) / 1_000_000;
}

import { Injectable } from '@nestjs/common';

import { AccountModelService } from '../../model/account/account.service.js';
import { AccountRole } from '../../model/account/entities/account.entity.js';
import { RepairCount, ReplyRecordModelService } from '../../model/reply-record/reply-record.service.js';
import { SettingsModelService } from '../../model/settings/settings.service.js';
import { startOfMonthUtc } from '../../service/model-gateway/spend-cap.js';
import { KindSpend, NamedSpend, PromptCacheSpend, UsageRecordModelService } from '../../model/usage-record/usage-record.service.js';
import { CreditPool, ModelGateway, WeeklyAllowance } from '../../service/model-gateway/model-gateway.js';

export interface PoolUsage {
    /** Sum of this month's UsageRecords for the pool. */
    spentUsd: number;
    calls: number;
    /** This month's spend per call kind, most spent first; kinds with no calls are left out. */
    byKind: KindSpend[];
    /** Read from the provider; null when it can't be read (a provider error, or Venice with no key). */
    remainingUsd: number | null;
    /** What the pool holds when topped up (Settings); the base of the percent threshold. */
    capUsd: number;
    lowCreditPercent: number;
    /** True when remaining credit is known and at or below the threshold. */
    lowCredit: boolean;
    /**
     * The text pool: the host of the text chain serving now (`openrouter`, `venice` or `free`,
     * .scratch/text-fallback/spec.md); null for the image pool, and when it isn't known.
     */
    host: string | null;
    /**
     * The text pool: a subscription host's Weekly allowance (.scratch/nanogpt-provider/spec.md), also
     * while it is used up and text runs on the next host. The Owner's only; null otherwise.
     */
    weeklyAllowance: WeeklyAllowance | null;
    /**
     * This month's prompt cache (.scratch/prompt-cache/spec.md): the prompt tokens of the calls
     * whose host reported its cache, and how many of them it read from the cache. Null while no
     * call reported it, and for the image pool.
     */
    cache: PromptCacheSpend | null;
    /**
     * This month's spend per model and per host, most spent first, each with its prompt cache
     * (.scratch/cost-view/spec.md: "Usage page"). The Owner's only: empty for a Member, who can't see the Models.
     */
    byModel: NamedSpend[];
    byHost: NamedSpend[];
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
    /** This month's repairs to replies (.scratch/reply-repair/spec.md), by kind and play model: the Owner sees everyone's, a Member their own. */
    repairs: RepairCount[];
}

/** The counts of each kind, every play model together. */
function acrossModels(repairs: readonly RepairCount[]): RepairCount[] {
    const byKind = new Map<string, RepairCount>();
    for (const repair of repairs) {
        const sum = byKind.get(repair.kind) ?? { kind: repair.kind, model: null, made: 0, refused: 0 };
        byKind.set(repair.kind, { ...sum, made: sum.made + repair.made, refused: sum.refused + repair.refused });
    }
    return [...byKind.values()];
}

@Injectable()
export class UsageManagerService {
    constructor(
        private readonly usageModel: UsageRecordModelService,
        private readonly replyRecords: ReplyRecordModelService,
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
        const [spend, settings, ownerCredit, named, repairs] = await Promise.all([
            this.usageModel.spendSince(monthStart, member ? account.id : undefined),
            this.settingsModel.get(),
            this.gateway.remainingCredit(),
            member ? null : this.usageModel.spendByModelSince(monthStart),
            this.replyRecords.repairCountsSince(monthStart, member ? account.id : undefined),
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
                // Which host serves text is not a balance, so a Member sees it too.
                host: ownerCredit[name].host ?? null,
                // How much of a subscription is left is the Owner's, as balances are.
                weeklyAllowance: member ? null : (ownerCredit[name].weeklyAllowance ?? null),
                cache: spend[name].cache,
                byModel: (named?.[name].byModel ?? []).map(rounded),
                byHost: (named?.[name].byHost ?? []).map(rounded),
            };
        };

        return {
            month: member
                ? `${monthStart.getUTCFullYear()}-${String(monthStart.getUTCMonth() + 1).padStart(2, '0')}`
                : `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`,
            pools: {
                // Text on Venice spends the Venice balance, so it is sized and warned as the Venice pool is
                // (.scratch/text-fallback/spec.md, "Low credit on Venice"): the text cap is OpenRouter's top-up.
                text:
                    ownerCredit.text.host === 'venice'
                        ? pool('text', settings.imageCreditCapUsd, settings.imageLowCreditPercent)
                        : pool('text', settings.textCreditCapUsd, settings.textLowCreditPercent),
                image: pool('image', settings.imageCreditCapUsd, settings.imageLowCreditPercent),
            },
            monthlyCap: member && account.monthlyCapUsd !== null ? this.capUsage(account.monthlyCapUsd, spend.text.spentUsd + spend.image.spentUsd) : null,
            // Which models there are is the Owner's to see, as with spend by model: a Member's counts are by kind alone.
            repairs: member ? acrossModels(repairs) : repairs,
        };
    }

    private capUsage(capUsd: number, spentUsd: number): MonthlyCapUsage {
        return { capUsd, spentUsd: round(spentUsd), reached: spentUsd >= capUsd };
    }
}

function rounded(spend: NamedSpend): NamedSpend {
    return { ...spend, spentUsd: round(spend.spentUsd) };
}

function round(usd: number): number {
    return Math.round(usd * 1_000_000) / 1_000_000;
}

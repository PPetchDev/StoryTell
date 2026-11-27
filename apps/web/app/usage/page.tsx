'use client';

import Link from 'next/link';

import { BackupBanner } from '@/components/backup-banner';
import { useAccount } from '@/lib/account';
import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { allowanceReset, CALL_KIND_LABEL, CreditPool, millionTokens, NamedSpend, POOL_LABEL, PoolUsage, REPAIR_KIND_LABEL, RepairCount, TEXT_HOST_LABEL, UsageResponse, usd } from '@/lib/types';

/**
 * Label and value, the label muted: the label over its value on a phone, so the value has the
 * card's width (docs/ui-audit-2026-11-13.md, M15), side by side from 480px.
 */
const FACTS =
    'm-0 grid grid-cols-1 gap-x-4 min-[30rem]:grid-cols-[max-content_1fr] min-[30rem]:gap-y-1.5 [&>dd]:m-0 [&>dt]:text-muted [&>dt:not(:first-child)]:mt-3 min-[30rem]:[&>dt:not(:first-child)]:mt-0';

const POOLS: CreditPool[] = ['text', 'image'];

function monthName(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('en', {
        month: 'long',
        year: 'numeric',
    });
}

/** Of a pool's prompt tokens, the share its host read from the cache, in whole percent; null while none were reported. */
function cachedShare(cache: PoolUsage['cache']): number | null {
    if (!cache || cache.promptTokens <= 0) return null;
    return Math.round((100 * cache.cachedTokens) / cache.promptTokens);
}

const tokens = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

function callCount(count: number): string {
    return `${count} ${count === 1 ? 'call' : 'calls'}`;
}

/**
 * What is left of the pool as a bar under the figures (audit L24): the share of what it holds when
 * topped up, in the warning colour once it is low. The figures say the same in words.
 */
function CreditBar({ pool, usage }: { pool: CreditPool; usage: PoolUsage }) {
    if (usage.remainingUsd === null || usage.capUsd <= 0) return null;
    const share = Math.max(0, Math.min(1, usage.remainingUsd / usage.capUsd));
    return (
        <div
            role="meter"
            aria-label={`${POOL_LABEL[pool]} credit left`}
            aria-valuemin={0}
            aria-valuemax={usage.capUsd}
            aria-valuenow={Math.min(usage.remainingUsd, usage.capUsd)}
            aria-valuetext={`${usd(usage.remainingUsd)} of ${usd(usage.capUsd)} left`}
            className="mt-2 h-2 overflow-hidden rounded-full bg-quiet-fill"
        >
            <div
                className={`h-full rounded-full ${usage.lowCredit ? 'bg-warning' : 'bg-accent'}`}
                style={{ width: `${Math.round(share * 1000) / 10}%` }}
            />
        </div>
    );
}

/** A Member's Monthly cap: what they may spend this month and what is left (.scratch/accounts/spec.md). */
function MonthlyCapCard({ cap }: { cap: NonNullable<UsageResponse['monthlyCap']> }) {
    const left = Math.max(0, cap.capUsd - cap.spentUsd);
    return (
        <section className="card" aria-labelledby="monthly-cap">
            <h2 id="monthly-cap">Your Monthly cap</h2>
            <dl className={FACTS}>
                <dt>Spent this month</dt>
                <dd>
                    {usd(cap.spentUsd)} of {usd(cap.capUsd)}
                </dd>
                <dt>Left</dt>
                <dd>
                    {cap.reached ? (
                        <strong className="text-caution-text">None: new sends and pictures wait for next month, or ask the Owner to raise it.</strong>
                    ) : (
                        usd(left)
                    )}
                </dd>
            </dl>
        </section>
    );
}

/** This month's spend by kind (M15): a row each, the amounts and counts in their own columns. */
function KindTable({ pool, usage }: { pool: CreditPool; usage: PoolUsage }) {
    const cell = 'py-1.5 text-right align-top';
    return (
        <table className="mt-4 w-full border-collapse text-md tabular-nums" aria-label={`${POOL_LABEL[pool]} spend by kind`}>
            <thead>
                <tr className="text-sm text-muted">
                    <th scope="col" className="pb-1 text-left font-normal">
                        Spent on
                    </th>
                    <th scope="col" className="pb-1 text-right font-normal">
                        Amount
                    </th>
                    <th scope="col" className="pb-1 pl-4 text-right font-normal">
                        Calls
                    </th>
                </tr>
            </thead>
            <tbody>
                {usage.byKind.map((kind) => (
                    <tr key={kind.kind} className="border-t border-line">
                        <th scope="row" className="py-1.5 pr-2 text-left align-top font-normal">
                            {CALL_KIND_LABEL[kind.kind]}
                        </th>
                        <td className={cell}>{usd(kind.spentUsd)}</td>
                        <td className={`${cell} pl-4 text-muted`}>{kind.calls}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** A host as the Usage page names it: the text chain's names, and DeepInfra behind OpenRouter. */
const HOST_LABEL: Record<string, string> = { ...TEXT_HOST_LABEL, deepinfra: 'DeepInfra' };

/**
 * This month's spend per model or per host (.scratch/cost-view/spec.md): a row each, the cached
 * share of its prompt tokens under its name, so the amounts keep their own column at 320px.
 */
function NamedTable({ pool, title, rows, label }: { pool: CreditPool; title: string; rows: NamedSpend[]; label(name: string): string }) {
    const cell = 'py-1.5 text-right align-top';
    return (
        <table className="mt-4 w-full border-collapse text-md tabular-nums" aria-label={`${POOL_LABEL[pool]} spend by ${title.toLowerCase()}`}>
            <thead>
                <tr className="text-sm text-muted">
                    <th scope="col" className="pb-1 text-left font-normal">
                        {title}
                    </th>
                    <th scope="col" className="pb-1 text-right font-normal">
                        Amount
                    </th>
                    <th scope="col" className="pb-1 pl-4 text-right font-normal">
                        Calls
                    </th>
                </tr>
            </thead>
            <tbody>
                {rows.map((row) => {
                    const cached = cachedShare(row.cache);
                    return (
                        <tr key={row.name} className="border-t border-line">
                            <th scope="row" className="py-1.5 pr-2 text-left align-top font-normal [overflow-wrap:anywhere]">
                                {label(row.name)}
                                {cached !== null && <span className="block text-sm text-muted">{cached}% read from cache</span>}
                            </th>
                            <td className={cell}>{usd(row.spentUsd)}</td>
                            <td className={`${cell} pl-4 text-muted`}>{row.calls}</td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );
}

function PoolCard({ pool, usage, member }: { pool: CreditPool; usage: PoolUsage; member: boolean }) {
    // The Venice pool's label already names its provider; text names the host of its chain serving now.
    const provider = pool === 'text' ? (TEXT_HOST_LABEL[usage.host ?? 'openrouter'] ?? usage.host) : null;
    const cached = cachedShare(usage.cache);
    return (
        <section className="card" aria-labelledby={`pool-${pool}`}>
            <h2 id={`pool-${pool}`}>
                {POOL_LABEL[pool]}
                {provider && <> <span className="muted">({provider})</span></>}
            </h2>
            <dl className={FACTS}>
                <dt>Spent this month</dt>
                <dd>
                    {usd(usage.spentUsd)} <span className="muted">· {callCount(usage.calls)}</span>
                </dd>
                {/* .scratch/prompt-cache/spec.md: cached prompt tokens bill at a fraction of the price. */}
                {cached !== null && usage.cache && (
                    <>
                        <dt>Read from cache</dt>
                        <dd>
                            {cached}% of prompt tokens{' '}
                            <span className="muted">
                                · {tokens.format(usage.cache.cachedTokens)} of {tokens.format(usage.cache.promptTokens)}
                            </span>
                        </dd>
                    </>
                )}
                {!member && (
                    <>
                        <dt>Remaining credit</dt>
                        <dd>
                            {usage.remainingUsd === null ? (
                                <span className="muted">
                                    Unknown
                                    {(pool === 'image' || usage.host === 'venice') && (
                                        // Why, in words (M15). Venice tells its balance to the ordinary key too, so unknown means the read failed.
                                        <>. Venice&apos;s balance could not be read just now.</>
                                    )}
                                    {pool === 'text' && usage.host === 'free' && <>. Text is on a free model while the paid hosts are out of credit.</>}
                                    {pool === 'text' && usage.host === 'nanogpt' && <>. Text is on NanoGPT&apos;s subscription, which charges nothing per call.</>}
                                </span>
                            ) : (
                                <>
                                    {usage.remainingUsd <= 0 ? <strong className="text-caution-text">Used up</strong> : <>{usd(usage.remainingUsd)} of {usd(usage.capUsd)}</>}
                                    <CreditBar pool={pool} usage={usage} />
                                </>
                            )}
                        </dd>
                        {/* .scratch/nanogpt-provider/spec.md: the subscription's tokens for the week. */}
                        {pool === 'text' && usage.weeklyAllowance && (
                            <>
                                <dt>Weekly allowance</dt>
                                <dd>
                                    {usage.weeklyAllowance.usedUp ? (
                                        <strong className="text-caution-text">
                                            Used up: text runs on {TEXT_HOST_LABEL[usage.host ?? 'openrouter'] ?? usage.host} until {allowanceReset(usage.weeklyAllowance.resetAt)}
                                        </strong>
                                    ) : (
                                        <>
                                            {millionTokens(usage.weeklyAllowance.limitTokens - usage.weeklyAllowance.usedTokens)} of {millionTokens(usage.weeklyAllowance.limitTokens)} input tokens left this
                                            week <span className="muted">· resets {allowanceReset(usage.weeklyAllowance.resetAt)}</span>
                                        </>
                                    )}
                                </dd>
                            </>
                        )}
                        <dt>Low-credit warning</dt>
                        <dd>
                            {usage.remainingUsd !== null && usage.remainingUsd <= 0 ? (
                                <strong className="text-caution-text">Used up: top up the credit to play on</strong>
                            ) : usage.lowCredit ? (
                                <strong className="text-caution-text">
                                    Low: at or below {usage.lowCreditPercent}% of {usd(usage.capUsd)}
                                </strong>
                            ) : (
                                <>
                                    below {usage.lowCreditPercent}% of {usd(usage.capUsd)}
                                </>
                            )}
                        </dd>
                    </>
                )}
            </dl>
            {usage.byKind.length > 0 && <KindTable pool={pool} usage={usage} />}
            {/* The Owner's only: where the month's money went, by model and by host (.scratch/cost-view/spec.md). */}
            {(usage.byModel?.length ?? 0) > 0 && <NamedTable pool={pool} title="Model" rows={usage.byModel!} label={(name) => name} />}
            {(usage.byHost?.length ?? 0) > 0 && <NamedTable pool={pool} title="Host" rows={usage.byHost!} label={(name) => HOST_LABEL[name] ?? name} />}
        </section>
    );
}

/**
 * What the app mended in replies this month (.scratch/reply-repair/spec.md, "6. Repair counts"): a
 * repair made, or one it weighed and left as written. Nothing of this shows in the Chat itself.
 */
function RepairsCard({ repairs }: { repairs: RepairCount[] }) {
    return (
        <section className="card" aria-labelledby="repairs">
            <h2 id="repairs">Replies mended</h2>
            {repairs.length === 0 ? (
                <p className="muted mb-0">No reply needed mending this month.</p>
            ) : (
                <table className="mt-2 w-full border-collapse text-md tabular-nums" aria-label="Replies mended by kind">
                    <thead>
                        <tr className="text-sm text-muted">
                            <th scope="col" className="pb-1 text-left font-normal">
                                What
                            </th>
                            <th scope="col" className="pb-1 text-right font-normal">
                                Mended
                            </th>
                            <th scope="col" className="pb-1 pl-4 text-right font-normal">
                                Left
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {repairs.map((repair) => (
                            <tr key={`${repair.kind} ${repair.model}`} className="border-t border-line">
                                <th scope="row" className="py-1.5 pr-2 text-left align-top font-normal [overflow-wrap:anywhere]">
                                    {REPAIR_KIND_LABEL[repair.kind] ?? repair.kind}
                                    {repair.model !== null && <span className="block text-sm text-muted">{repair.model}</span>}
                                </th>
                                <td className="py-1.5 text-right align-top">{repair.made}</td>
                                <td className="py-1.5 pl-4 text-right align-top">{repair.refused}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </section>
    );
}

export default function UsagePage() {
    const { isOwner } = useAccount();
    const usage = useApiQuery<UsageResponse>('/usage');

    return (
        <main>
            <h1>Usage</h1>
            {usage.status === 'loading' && <Loading label="Loading Usage…" className="card" />}
            {usage.status === 'error' && <ErrorState title="Couldn't load Usage." error={usage.error} onRetry={usage.retry} />}
            {usage.status === 'ready' && (
                <>
                    <p className="muted">{monthName(usage.data.month)}</p>
                    {usage.data.monthlyCap && <MonthlyCapCard cap={usage.data.monthlyCap} />}
                    {POOLS.map((pool) => (
                        <PoolCard key={pool} pool={pool} usage={usage.data.pools[pool]} member={usage.data.monthlyCap !== null} />
                    ))}
                    <RepairsCard repairs={usage.data.repairs ?? []} />
                    {/* Once for both pools, not under each (M15). Their sizes are the Owner's (.scratch/accounts/spec.md). */}
                    {usage.data.monthlyCap === null && (
                        <p className="mt-0 text-md">
                            <Link href="/settings" className="inline-flex min-h-11 items-center">
                                Change the pools&apos; sizes and warnings in Settings
                            </Link>
                        </p>
                    )}
                </>
            )}
            {/* Last, so a banner that arrives late pushes nothing down (audit M38). */}
            {isOwner && <BackupBanner />}
        </main>
    );
}

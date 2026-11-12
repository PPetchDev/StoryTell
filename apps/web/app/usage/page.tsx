'use client';

import Link from 'next/link';

import { BackupBanner } from '@/components/backup-banner';
import { useApiQuery } from '@/components/connection';
import { ErrorState, Loading } from '@/components/query-state';
import { CALL_KIND_LABEL, CreditPool, POOL_LABEL, PoolUsage, UsageResponse, usd } from '@/lib/types';

/** Label and value side by side; the label muted. */
const FACTS = 'm-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 [&>dd]:m-0 [&>dt]:text-muted';

const POOLS: CreditPool[] = ['text', 'image'];

function monthName(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('en', {
        month: 'long',
        year: 'numeric',
    });
}

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

function PoolCard({ pool, usage }: { pool: CreditPool; usage: PoolUsage }) {
    // The Venice pool's label already names its provider.
    const provider = pool === 'text' ? 'OpenRouter' : null;
    return (
        <section className="card" aria-labelledby={`pool-${pool}`}>
            <h2 id={`pool-${pool}`}>
                {POOL_LABEL[pool]}
                {provider && <> <span className="muted">({provider})</span></>}
            </h2>
            <dl className={FACTS}>
                <dt>Spent this month</dt>
                <dd>
                    {usd(usage.spentUsd)}{' '}
                    <span className="muted">({callCount(usage.calls)})</span>
                    {usage.byKind.length > 0 && (
                        <ul className="mt-1.5 mb-0 flex list-none flex-col gap-0.5 p-0 text-md" aria-label={`${POOL_LABEL[pool]} spend by kind`}>
                            {usage.byKind.map((kind) => (
                                <li key={kind.kind}>
                                    {CALL_KIND_LABEL[kind.kind]}: {usd(kind.spentUsd)}{' '}
                                    <span className="muted">({callCount(kind.calls)})</span>
                                </li>
                            ))}
                        </ul>
                    )}
                </dd>
                <dt>Remaining credit</dt>
                <dd>
                    {usage.remainingUsd === null ? (
                        <span className="muted">
                            unknown
                            {pool === 'image' && (
                                // Where to fix it, not just why (audit L24): the key is the API's setting.
                                <>
                                    {' '}
                                    (reading it needs a Venice Admin key: set <code>VENICE_ADMIN_KEY</code> where the API
                                    runs)
                                </>
                            )}
                        </span>
                    ) : (
                        <>
                            {usd(usage.remainingUsd)} of {usd(usage.capUsd)}
                            <CreditBar pool={pool} usage={usage} />
                        </>
                    )}
                </dd>
                <dt>Low-credit warning</dt>
                <dd>
                    {usage.lowCredit ? (
                        <strong className="text-caution-text">
                            Low: at or below {usage.lowCreditPercent}% of {usd(usage.capUsd)}
                        </strong>
                    ) : (
                        <>
                            below {usage.lowCreditPercent}% of {usd(usage.capUsd)}
                        </>
                    )}
                </dd>
            </dl>
            <p className="mt-3 mb-0 text-md">
                <Link href="/settings" className="inline-flex min-h-11 items-center">
                    Change the pool size and warning in Settings
                </Link>
            </p>
        </section>
    );
}

export default function UsagePage() {
    const usage = useApiQuery<UsageResponse>('/usage');

    return (
        <main>
            <h1>Usage</h1>
            {usage.status === 'loading' && <Loading label="Loading Usage…" className="card" />}
            {usage.status === 'error' && <ErrorState title="Couldn't load Usage." error={usage.error} onRetry={usage.retry} />}
            {usage.status === 'ready' && (
                <>
                    <p className="muted">{monthName(usage.data.month)}</p>
                    {POOLS.map((pool) => (
                        <PoolCard key={pool} pool={pool} usage={usage.data.pools[pool]} />
                    ))}
                </>
            )}
            {/* Last, so a banner that arrives late pushes nothing down (audit M38). */}
            <BackupBanner />
        </main>
    );
}

'use client';

import { BackupBanner } from '@/components/backup-banner';
import { useApiQuery } from '@/components/connection';
import { CreditPool, POOL_LABEL, PoolUsage, UsageResponse, usd } from '@/lib/types';

const POOLS: CreditPool[] = ['text', 'image'];

function monthName(month: string): string {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(year, monthNumber - 1, 1).toLocaleDateString('en', {
        month: 'long',
        year: 'numeric',
    });
}

function PoolCard({ pool, usage }: { pool: CreditPool; usage: PoolUsage }) {
    const provider = pool === 'text' ? 'OpenRouter' : 'Venice';
    return (
        <section className="card" aria-labelledby={`pool-${pool}`}>
            <h2 id={`pool-${pool}`}>
                {POOL_LABEL[pool]} <span className="muted">({provider})</span>
            </h2>
            <dl className="facts">
                <dt>Spent this month</dt>
                <dd>
                    {usd(usage.spentUsd)}{' '}
                    <span className="muted">
                        ({usage.calls} {usage.calls === 1 ? 'call' : 'calls'})
                    </span>
                </dd>
                <dt>Remaining credit</dt>
                <dd>
                    {usage.remainingUsd === null ? (
                        <span className="muted">
                            unknown{pool === 'image' ? ' (needs a Venice Admin key)' : ''}
                        </span>
                    ) : (
                        <>
                            {usd(usage.remainingUsd)} of {usd(usage.capUsd)}
                        </>
                    )}
                </dd>
                <dt>Low-credit warning</dt>
                <dd>
                    {usage.lowCredit ? (
                        <strong className="warning-text">
                            Low: at or below {usage.lowCreditPercent}% of {usd(usage.capUsd)}
                        </strong>
                    ) : (
                        <>
                            below {usage.lowCreditPercent}% of {usd(usage.capUsd)}
                        </>
                    )}
                </dd>
            </dl>
        </section>
    );
}

export default function UsagePage() {
    const usage = useApiQuery<UsageResponse>('/usage');

    return (
        <main>
            <h1>Usage</h1>
            <BackupBanner />
            {usage.status === 'loading' && <p className="muted">Loading…</p>}
            {usage.status === 'error' && <p role="alert">{usage.error.message}</p>}
            {usage.status === 'ready' && (
                <>
                    <p className="muted">{monthName(usage.data.month)}</p>
                    {POOLS.map((pool) => (
                        <PoolCard key={pool} pool={pool} usage={usage.data.pools[pool]} />
                    ))}
                </>
            )}
        </main>
    );
}

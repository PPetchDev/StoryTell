'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';
import { CreditPool, POOL_LABEL, UsageResponse, usd } from '@/lib/types';

/**
 * Shown on every page while a credit pool is at or below its low-credit threshold (spec:
 * "Usage view ... the app shows a warning"). It re-reads usage on each navigation, and shows
 * nothing when usage can't be read: the can't-connect screen covers an unreachable API, and
 * a provider error belongs on the Usage page.
 */
export function LowCreditBanner() {
    const pathname = usePathname();
    const [usage, setUsage] = useState<UsageResponse | undefined>();

    useEffect(() => {
        let cancelled = false;
        apiFetch<UsageResponse>('/usage').then(
            (data) => !cancelled && setUsage(data),
            () => !cancelled && setUsage(undefined),
        );
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    const low = usage
        ? (Object.keys(usage.pools) as CreditPool[]).filter((pool) => usage.pools[pool].lowCredit)
        : [];
    if (low.length === 0) return null;

    return (
        <div className="banner" role="status">
            {low.map((pool) => {
                const { remainingUsd, capUsd } = usage!.pools[pool];
                return (
                    <p key={pool}>
                        <strong>{POOL_LABEL[pool]} credit is low:</strong> {usd(remainingUsd ?? 0)} of{' '}
                        {usd(capUsd)} left.
                    </p>
                );
            })}
            <Link href="/usage">See usage</Link>
        </div>
    );
}

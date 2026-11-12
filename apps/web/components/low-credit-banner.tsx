'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { isChatScreen } from '@/components/bottom-nav/bottom-nav';
import { CloseIcon } from '@/components/icons';
import { apiFetch } from '@/lib/api';
import { CreditPool, POOL_LABEL, UsageResponse, usd } from '@/lib/types';

/** How old the usage read may get before a navigation reads it again. */
const FRESH_MS = 5 * 60_000;
/** This session's "Hide": the pools it hid, so a pool that runs low later still shows. */
const HIDDEN_KEY = 'storytell.lowCreditHidden';

// One read for the whole app, not one per page (audit M3).
let lastRead: { usage: UsageResponse | undefined; at: number } | undefined;

function readHidden(): string {
    try {
        return sessionStorage.getItem(HIDDEN_KEY) ?? '';
    } catch {
        return '';
    }
}

/**
 * Shown on every page while a credit pool is at or below its low-credit threshold (spec:
 * "Usage view ... the app shows a warning"). Usage is read once and again only after a few
 * minutes, so moving between pages neither refetches it nor reads it out again; it shows nothing
 * when usage can't be read: the can't-connect screen covers an unreachable API, and a provider
 * error belongs on the Usage page. On the Chat screen it is one thin line, and Hide puts it away
 * for the session (audit M3).
 */
export function LowCreditBanner() {
    const pathname = usePathname();
    const [usage, setUsage] = useState<UsageResponse | undefined>(lastRead?.usage);
    const [hidden, setHidden] = useState('');

    useEffect(() => setHidden(readHidden()), []);

    useEffect(() => {
        if (lastRead && Date.now() - lastRead.at < FRESH_MS) return;
        let cancelled = false;
        const keep = (read: UsageResponse | undefined) => {
            lastRead = { usage: read, at: Date.now() };
            if (!cancelled) setUsage(read);
        };
        apiFetch<UsageResponse>('/usage').then(keep, () => keep(undefined));
        return () => {
            cancelled = true;
        };
    }, [pathname]);

    const low = usage ? (Object.keys(usage.pools) as CreditPool[]).filter((pool) => usage.pools[pool].lowCredit) : [];
    const lowKey = low.join(',');
    const showing = low.length > 0 && hidden !== lowKey;

    const hide = () => {
        setHidden(lowKey);
        try {
            sessionStorage.setItem(HIDDEN_KEY, lowKey);
        } catch {
            // Hidden for this page only.
        }
    };

    const lines = low.map((pool) => {
        const { remainingUsd, capUsd } = usage!.pools[pool];
        return { pool, text: `${usd(remainingUsd ?? 0)} of ${usd(capUsd)} left.` };
    });

    // The status region is always there, so what appears in it is read out once.
    return (
        <div role="status">
            {showing && isChatScreen(pathname) && (
                <p className="m-0 flex min-h-11 items-center gap-2 border-b border-banner-line bg-banner-surface pl-3 text-sm">
                    <span className="min-w-0 flex-1 truncate">
                        <strong className="font-semibold">Credit is low:</strong>{' '}
                        {lines.map((line) => `${POOL_LABEL[line.pool]} ${line.text}`).join(' ')}
                    </span>
                    <Link href="/usage" className="flex-none text-text">
                        Usage
                    </Link>
                    <button type="button" className="bare-button grid size-11 flex-none place-items-center" aria-label="Hide the credit warning" onClick={hide}>
                        <CloseIcon size={18} />
                    </button>
                </p>
            )}
            {showing && !isChatScreen(pathname) && (
                <div className="banner flex flex-wrap items-start gap-x-3">
                    <div className="min-w-0 flex-1">
                        {lines.map((line) => (
                            <p key={line.pool}>
                                <strong>{POOL_LABEL[line.pool]} credit is low:</strong> {line.text}
                            </p>
                        ))}
                        <Link href="/usage">See usage</Link>
                    </div>
                    <button type="button" className="button button-quiet button-small" onClick={hide}>
                        Hide
                    </button>
                </div>
            )}
        </div>
    );
}

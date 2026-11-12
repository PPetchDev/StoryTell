'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api';

type BackupTarget = 'disk' | 'drive';

interface BackupStatus {
    configured: boolean;
    attemptedAt: string | null;
    backup: string | null;
    targets: { target: BackupTarget; ok: boolean; at: string; error: string | null }[];
    error: string | null;
    failed: boolean;
}

const TARGET_LABEL: Record<BackupTarget, string> = {
    disk: 'Second disk',
    drive: 'Google Drive',
};

/** The last backup's status: `undefined` while it loads, `null` when it can't be read. */
export type BackupRead = BackupStatus | null | undefined;

/** Reads the backup status once. A page can wait for it, so the banner doesn't arrive late above what it shows (audit M38). */
export function useBackupStatus(): BackupRead {
    const [status, setStatus] = useState<BackupRead>(undefined);

    useEffect(() => {
        let cancelled = false;
        apiFetch<BackupStatus>('/backup').then(
            (data) => !cancelled && setStatus(data),
            () => !cancelled && setStatus(null),
        );
        return () => {
            cancelled = true;
        };
    }, []);

    return status;
}

/**
 * Shown on the Usage and Settings pages when the daily backup's last run failed a target
 * (spec: "Failures are logged and shown as a banner ... They never block play"). Shows
 * nothing in dev, before the first run, or when the status can't be fetched.
 */
export function BackupBanner() {
    return <BackupBannerView status={useBackupStatus()} />;
}

/** The banner for a status the page read itself with `useBackupStatus`. */
export function BackupBannerView({ status }: { status: BackupRead }) {
    if (!status?.failed) return null;
    const when = status.attemptedAt ? new Date(status.attemptedAt).toLocaleString() : undefined;

    return (
        <div className="banner" role="status" aria-label="Backup">
            <p>
                <strong>The last backup{when ? ` (${when})` : ''} didn't fully work.</strong> Play is
                unaffected.
            </p>
            {status.error && <p>{status.error}</p>}
            {status.targets.map((target) => (
                <p key={target.target}>
                    {TARGET_LABEL[target.target] ?? target.target}: {target.ok ? 'saved' : `failed: ${target.error ?? 'no reason given'}`}
                </p>
            ))}
            <p className="muted">Details are in LIVE_HOME\logs\backup.log on the PC.</p>
        </div>
    );
}

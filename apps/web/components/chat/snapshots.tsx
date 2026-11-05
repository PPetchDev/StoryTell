'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';

import { useConnection } from '@/components/connection';
import { Sheet } from '@/components/sheet/sheet';
import { SnapshotViewer, snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { ChatSnapshots, chatSnapshotsPath, Snapshot, snapshotApi, snapshotImageUrl, SnapshotJob } from '@/lib/snapshot';

import styles from './message-snapshots.module.css';
import sheetStyles from './snapshot-sheet.module.css';

/** How often the Chat's Snapshots are re-read while one is being made. */
const SNAPSHOT_POLL_MS = 1_500;

const EMPTY: ChatSnapshots = { snapshots: [], jobs: [] };

/**
 * The Chat's Snapshots and jobs (spec: "Pending and failed Snapshots"). Re-read while a job
 * is pending; `refresh` after a write that may have cleared Message links (an edit, a reset).
 */
export function useChatSnapshots(storyId: number, chatId: number) {
    const { reportUnreachable } = useConnection();
    const [state, setState] = useState<ChatSnapshots>(EMPTY);
    const [error, setError] = useState<string | null>(null);

    const refresh = useCallback(async () => {
        try {
            setState(await apiFetch<ChatSnapshots>(chatSnapshotsPath(storyId, chatId)));
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
        }
    }, [storyId, chatId, reportUnreachable]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const pending = state.jobs.some((job) => job.status === 'pending');
    useEffect(() => {
        if (!pending) return;
        const timer = setTimeout(() => void refresh(), SNAPSHOT_POLL_MS);
        return () => clearTimeout(timer);
    }, [pending, state, refresh]);

    /** Runs a write, then re-reads; a typed error shows by the composer. */
    const run = async (write: () => Promise<unknown>) => {
        setError(null);
        try {
            await write();
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) {
                reportUnreachable();
                return;
            }
            setError(caught instanceof ApiError ? caught.message : 'The Snapshot could not be started.');
        }
        await refresh();
    };

    return {
        state,
        error,
        refresh,
        take: (hint: string, messageId?: number) => run(() => snapshotApi.take(storyId, chatId, hint, messageId)),
        retry: (job: SnapshotJob) => run(() => snapshotApi.retry(storyId, chatId, job.id)),
        dismiss: (job: SnapshotJob) => run(() => snapshotApi.dismiss(storyId, chatId, job.id)),
        remove: (snapshot: Snapshot) => run(() => snapshotApi.remove(storyId, snapshot.id)),
    };
}

interface MessageSnapshotsProps {
    snapshots: Snapshot[];
    jobs: SnapshotJob[];
    onOpen(snapshot: Snapshot): void;
    onRetry(job: SnapshotJob): void;
    onDismiss(job: SnapshotJob): void;
}

/** Under an AI Message: its Snapshots inline, a placeholder per job being made, an error per failed one. */
export function MessageSnapshots({ snapshots, jobs, onOpen, onRetry, onDismiss }: MessageSnapshotsProps) {
    if (snapshots.length === 0 && jobs.length === 0) return null;
    return (
        <div className={styles.snapshots} aria-label="Snapshots">
            {snapshots.map((snapshot) => (
                <button key={snapshot.id} type="button" className={styles.thumb} onClick={() => onOpen(snapshot)}>
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                    <img src={snapshotImageUrl(snapshot)} alt={snapshotAlt(snapshot)} />
                </button>
            ))}
            {jobs.map((job) =>
                job.status === 'pending' ? (
                    <div key={job.id} className={styles.placeholder} role="status" aria-label="Snapshot being made">
                        <span>Making a Snapshot…</span>
                    </div>
                ) : (
                    <div key={job.id} className={styles.failed} role="alert">
                        <span>The Snapshot failed: {job.error?.message ?? 'unknown error'}</span>
                        <span className="toolbar">
                            <button type="button" className="button button-quiet button-small" onClick={() => onRetry(job)}>
                                Retry
                            </button>
                            <button type="button" className="button button-quiet button-small" onClick={() => onDismiss(job)}>
                                Dismiss
                            </button>
                        </span>
                    </div>
                ),
            )}
        </div>
    );
}

interface SnapshotSheetProps {
    /** Image credit is used up: the sheet says so and takes nothing. */
    imageCreditOut: boolean;
    onTake(hint: string): void;
    onClose(): void;
}

/**
 * 📷 in the action row opens this (spec: "Snapshot sheet"): an optional hint, then one
 * Snapshot of the latest AI Message. It closes at once; the placeholder in the thread shows
 * the Snapshot being made, and a failure to start it shows by the composer.
 */
export function SnapshotSheet({ imageCreditOut, onTake, onClose }: SnapshotSheetProps) {
    const [hint, setHint] = useState('');
    const take = (event: FormEvent) => {
        event.preventDefault();
        if (imageCreditOut) return;
        onTake(hint);
        onClose();
    };
    return (
        <Sheet label="Take a Snapshot" onClose={onClose}>
            <form className={sheetStyles.form} onSubmit={take}>
                <h2 className={sheetStyles.title}>Take a Snapshot</h2>
                <p className={sheetStyles.lead}>A picture of this moment, seen through your eyes.</p>
                <label className={sheetStyles.field}>
                    <span>Hint (optional)</span>
                    <input
                        type="text"
                        aria-label="Snapshot hint"
                        placeholder="e.g. close-up on her face"
                        maxLength={300}
                        value={hint}
                        disabled={imageCreditOut}
                        onChange={(event) => setHint(event.target.value)}
                    />
                </label>
                {imageCreditOut && (
                    <p className={sheetStyles.note} role="status">
                        Snapshots are off: image credit is used up. Play goes on.
                    </p>
                )}
                <button type="submit" className={`button ${sheetStyles.take}`} disabled={imageCreditOut}>
                    Take Snapshot
                </button>
            </form>
        </Sheet>
    );
}

export { SnapshotViewer };

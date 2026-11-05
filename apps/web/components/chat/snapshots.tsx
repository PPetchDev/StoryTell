'use client';

import { useCallback, useEffect, useState } from 'react';

import { useConnection } from '@/components/connection';
import { SnapshotViewer, snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { ChatSnapshots, chatSnapshotsPath, Snapshot, snapshotApi, snapshotImageUrl, SnapshotJob } from '@/lib/snapshot';

import styles from './message-snapshots.module.css';

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
        dismiss: (job: SnapshotJob) => run(() => snapshotApi.dismiss(storyId, chatId, job.id)),
        remove: (snapshot: Snapshot) => run(() => snapshotApi.remove(storyId, snapshot.id)),
    };
}

interface MessageSnapshotsProps {
    snapshots: Snapshot[];
    jobs: SnapshotJob[];
    onOpen(snapshot: Snapshot): void;
    onDismiss(job: SnapshotJob): void;
}

/**
 * Under an AI Message: its Snapshots inline, a placeholder per job being made (its one
 * automatic retry included), and a plain line per failed one. Its Retry is the background
 * notice's, by the composer (.scratch/background-retry/spec.md).
 */
export function MessageSnapshots({ snapshots, jobs, onOpen, onDismiss }: MessageSnapshotsProps) {
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
                        <span>Couldn&apos;t make this Snapshot.</span>
                        <span className="toolbar">
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

export { SnapshotViewer };

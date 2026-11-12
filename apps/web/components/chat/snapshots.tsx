'use client';

import { useCallback, useContext, useEffect, useState } from 'react';

import { MessageTabStop } from '@/components/chat/chat-classes';
import { useConnection } from '@/components/connection';
import { SnapshotViewer, snapshotAlt } from '@/components/snapshot/snapshot-viewer';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { ChatSnapshots, chatSnapshotsPath, Snapshot, snapshotApi, snapshotImageUrl, SnapshotJob, SnapshotPrompt } from '@/lib/snapshot';

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

    /** The Snapshot sheet's first step; its failures are the sheet's to show, so they are thrown. */
    const writePrompt = async (hint: string, messageId?: number): Promise<SnapshotPrompt> => {
        try {
            return await snapshotApi.writePrompt(storyId, chatId, hint, messageId);
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            throw caught;
        }
    };

    return {
        state,
        error,
        refresh,
        writePrompt,
        draw: (prompt: SnapshotPrompt, text: string) => run(() => snapshotApi.draw(storyId, chatId, prompt.id, text)),
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
 *
 * Every Snapshot is drawn 2:3, so its room is kept before it loads (audit M31), and one further
 * up the thread loads only when it comes near. The group is named for screen readers (L11).
 */
export function MessageSnapshots({ snapshots, jobs, onOpen, onDismiss }: MessageSnapshotsProps) {
    const tabStop = useContext(MessageTabStop);
    if (snapshots.length === 0 && jobs.length === 0) return null;
    return (
        <div className="mt-3 grid gap-2" role="group" aria-label="Snapshots">
            {snapshots.map((snapshot) => (
                <button
                    key={snapshot.id}
                    type="button"
                    // Its sides, where a wide screen leaves room beside the picture, in the surface colour.
                    className="bare-button block w-full cursor-pointer overflow-hidden rounded-md bg-surface-raised press"
                    tabIndex={tabStop ? undefined : -1}
                    onClick={() => onOpen(snapshot)}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element -- served by the API from the image folder */}
                    <img
                        className="block aspect-2/3 max-h-[70dvh] w-full object-contain"
                        src={snapshotImageUrl(snapshot)}
                        alt={snapshotAlt(snapshot)}
                        loading="lazy"
                        decoding="async"
                    />
                </button>
            ))}
            {jobs.map((job) =>
                job.status === 'pending' ? (
                    <div
                        key={job.id}
                        className="relative grid aspect-2/3 w-full max-w-64 place-items-center rounded-md border border-dashed border-field-line p-2 text-center text-sm text-muted"
                        role="status"
                        aria-label="Snapshot being made"
                    >
                        {/* Only the fill pulses, and only with motion on (audit M33): the words keep their contrast. */}
                        <span className="absolute inset-0 rounded-md bg-surface motion-safe:animate-pulse-soft" aria-hidden="true" />
                        <span className="relative">Making a Snapshot…</span>
                    </div>
                ) : (
                    <div key={job.id} className="grid gap-1 rounded-sm border border-snapshot-failed-line bg-snapshot-failed-surface px-3 py-2 text-note" role="alert">
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

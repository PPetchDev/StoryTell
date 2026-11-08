'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Story } from '@/lib/story';

export type SaveState =
    | { kind: 'saved' }
    | { kind: 'dirty' }
    | { kind: 'saving' }
    | { kind: 'error'; message: string };

export const SAVE_LABELS: Record<SaveState['kind'], string> = {
    saved: 'Saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    error: "Couldn't save",
};

type OnError = (message: string) => void;

interface Pending {
    timer: ReturnType<typeof setTimeout>;
    run: () => Promise<unknown>;
    apply: (value: unknown) => void;
    onError?: OnError;
}

/** How long typing may pause before a field is sent (spec: "Autosave"). */
const DEBOUNCE_MS = 600;

/**
 * Sends edits to the API one after another, so nothing lands out of order, and reports one
 * save state for the whole editor. Field edits are debounced per field; structural changes
 * (add, remove, reorder) go at once, after any pending field edits.
 */
export function useAutosave() {
    const { reportUnreachable } = useConnection();
    const [state, setState] = useState<SaveState>({ kind: 'saved' });
    const pending = useRef(new Map<string, Pending>());
    const chain = useRef<Promise<void>>(Promise.resolve());
    const inFlight = useRef(0);
    const unmounted = useRef(false);

    useEffect(() => {
        unmounted.current = false;
        return () => {
            unmounted.current = true;
        };
    }, []);

    const settle = useCallback((next: SaveState | null) => {
        if (unmounted.current) return;
        if (next) setState(next);
        else if (inFlight.current === 0 && pending.current.size === 0) setState({ kind: 'saved' });
    }, []);

    const enqueue = useCallback(
        <T,>(run: () => Promise<T>, apply: (value: T) => void, onError?: OnError): Promise<T | undefined> => {
            inFlight.current += 1;
            setState({ kind: 'saving' });
            const result = chain.current.then(run).then(
                (value) => {
                    inFlight.current -= 1;
                    if (!unmounted.current) apply(value);
                    settle(null);
                    return value;
                },
                (error: unknown) => {
                    inFlight.current -= 1;
                    if (error instanceof ApiUnreachableError) {
                        reportUnreachable();
                        return undefined;
                    }
                    const message = error instanceof ApiError ? error.message : 'Something went wrong.';
                    if (onError && !unmounted.current) {
                        onError(message);
                        settle(null);
                    } else {
                        settle({ kind: 'error', message });
                    }
                    return undefined;
                },
            );
            chain.current = result.then(() => undefined);
            return result;
        },
        [reportUnreachable, settle],
    );

    /**
     * Debounced: a later call with the same key replaces the earlier one. The answer is usually
     * the Story; the Memory drawer, Personas and Settings (ticket 11) save other records. With
     * `onError`, a refusal is reported there (shown at the field) instead of in the save state.
     */
    const queue = useCallback(
        <T = Story,>(key: string, run: () => Promise<T>, apply: (value: T) => void, onError?: OnError) => {
            const earlier = pending.current.get(key);
            if (earlier) clearTimeout(earlier.timer);
            setState((current) => (current.kind === 'saving' ? current : { kind: 'dirty' }));
            const timer = setTimeout(() => {
                pending.current.delete(key);
                void enqueue(run, apply, onError);
            }, DEBOUNCE_MS);
            pending.current.set(key, { timer, run, apply: apply as (value: unknown) => void, onError });
        },
        [enqueue],
    );

    /**
     * Drops a field edit still waiting to be sent: the field now holds a value that must not be
     * saved (an empty name, a number out of range), so the one typed before it must not land either.
     */
    const cancel = useCallback(
        (key: string) => {
            const earlier = pending.current.get(key);
            if (!earlier) return;
            clearTimeout(earlier.timer);
            pending.current.delete(key);
            // Nothing left to send: "Unsaved changes" settles; a failed save keeps its message.
            if (unmounted.current || inFlight.current > 0 || pending.current.size > 0) return;
            setState((current) => (current.kind === 'dirty' ? { kind: 'saved' } : current));
        },
        [],
    );

    /** Sends every pending field edit now and waits for all of them. */
    const flush = useCallback(async () => {
        for (const [key, item] of pending.current) {
            clearTimeout(item.timer);
            pending.current.delete(key);
            void enqueue(item.run, item.apply, item.onError);
        }
        await chain.current;
    }, [enqueue]);

    /**
     * A structural change: runs after pending field edits, and applies its answer whole. With
     * `onError`, a failure is reported there (shown at the field) instead of in the save state.
     * The answer is usually the Story; the assistant (ticket 23) commits calls that answer more.
     */
    const commit = useCallback(
        async <T = Story,>(run: () => Promise<T>, apply: (value: T) => void, onError?: OnError): Promise<T | undefined> => {
            await flush();
            return enqueue(run, apply, onError);
        },
        [enqueue, flush],
    );

    return { state, queue, cancel, commit, flush };
}

/** What `useAutosave` hands a page, for the components that save through it. */
export type Autosave = ReturnType<typeof useAutosave>;

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Story } from '@/lib/story';

export type SaveState =
    | { kind: 'saved' }
    | { kind: 'dirty' }
    | { kind: 'saving' }
    /** `retry` sends the edits that failed again; they are kept until they land or are typed over. */
    | { kind: 'error'; message: string; retry(): void };

export const SAVE_LABELS: Record<SaveState['kind'], string> = {
    saved: 'Saved',
    dirty: 'Unsaved changes',
    saving: 'Saving…',
    error: "Couldn't save",
};

type OnError = (message: string) => void;

interface Send {
    run: () => Promise<unknown>;
    apply: (value: unknown) => void;
    onError?: OnError;
}

interface Pending extends Send {
    timer: ReturnType<typeof setTimeout>;
}

/** How long typing may pause before a field is sent (spec: "Autosave"). */
const DEBOUNCE_MS = 600;

/**
 * Sends edits to the API one after another, so nothing lands out of order, and reports one
 * save state for the whole editor. Field edits are debounced per field; structural changes
 * (add, remove, reorder) go at once, after any pending field edits.
 *
 * Nothing typed is lost (audit H1): an edit that fails is kept, and the error state's `retry`
 * (SaveStatus's Try again) sends it again, until it lands or a newer edit of the same field
 * replaces it. When the tab is hidden or the page is left, every waiting edit is sent at once,
 * as a keepalive request that outlives the page (lib/api.ts).
 */
export function useAutosave() {
    const { reportUnreachable } = useConnection();
    const [state, setState] = useState<SaveState>({ kind: 'saved' });
    const pending = useRef(new Map<string, Pending>());
    // Edits whose save failed, by key, in the order they were made; a structural change gets a key of its own.
    const failed = useRef(new Map<string, Send>());
    const lastError = useRef('');
    const structural = useRef(0);
    const chain = useRef<Promise<void>>(Promise.resolve());
    const inFlight = useRef(0);
    const unmounted = useRef(false);

    useEffect(() => {
        unmounted.current = false;
        return () => {
            unmounted.current = true;
        };
    }, []);

    // Set below, once enqueue exists; the error state's retry calls it through this ref.
    const retryRef = useRef<() => void>(() => {});
    const retry = useCallback(() => retryRef.current(), []);

    /** The error while a failed edit is kept, else Saved once nothing is waiting or in flight. */
    const settle = useCallback(() => {
        if (unmounted.current) return;
        if (failed.current.size > 0) setState({ kind: 'error', message: lastError.current, retry });
        else if (inFlight.current === 0 && pending.current.size === 0) setState({ kind: 'saved' });
    }, [retry]);

    /** Settles one write once its request answers: applies the answer, or keeps the edit for Try again. */
    const track = useCallback(
        <T,>(key: string, sent: Promise<T>, run: () => Promise<T>, apply: (value: T) => void, onError?: OnError): Promise<T | undefined> =>
            sent.then(
                (value) => {
                    inFlight.current -= 1;
                    if (!unmounted.current) apply(value);
                    settle();
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
                        // Refused for what was typed, and shown at the field: sending it again would not help.
                        onError(message);
                    } else if (!pending.current.has(key)) {
                        // Kept for Try again, unless a newer edit of the same field is already waiting.
                        failed.current.set(key, { run, apply: apply as (value: unknown) => void, onError });
                        lastError.current = message;
                    }
                    settle();
                    return undefined;
                },
            ),
        [reportUnreachable, settle],
    );

    /** Sends a write once every write before it has answered, so nothing lands out of order. */
    const enqueue = useCallback(
        <T,>(key: string, run: () => Promise<T>, apply: (value: T) => void, onError?: OnError): Promise<T | undefined> => {
            inFlight.current += 1;
            setState({ kind: 'saving' });
            const result = track(key, chain.current.then(run), run, apply, onError);
            chain.current = result.then(() => undefined);
            return result;
        },
        [track],
    );

    /**
     * Sends a write now, beside any still in flight: the page is being hidden or left, and a write
     * that waited its turn would start after the page is gone (audit H1). Its request starts while
     * the page is hidden, so lib/api.ts makes it a keepalive one.
     */
    const sendNow = useCallback(
        (key: string, item: Send) => {
            inFlight.current += 1;
            setState({ kind: 'saving' });
            let sent: Promise<unknown>;
            try {
                sent = item.run();
            } catch (error) {
                sent = Promise.reject(error);
            }
            const result = track(key, sent, item.run, item.apply, item.onError);
            chain.current = Promise.all([chain.current, result]).then(() => undefined);
        },
        [track],
    );

    useEffect(() => {
        retryRef.current = () => {
            const again = [...failed.current];
            failed.current.clear();
            for (const [key, item] of again) void enqueue(key, item.run, item.apply, item.onError);
        };
    }, [enqueue]);

    /**
     * Debounced: a later call with the same key replaces the earlier one. The answer is usually
     * the Story; the Memory drawer, Personas and Settings (ticket 11) save other records. With
     * `onError`, a refusal is reported there (shown at the field) instead of in the save state.
     */
    const queue = useCallback(
        <T = Story,>(key: string, run: () => Promise<T>, apply: (value: T) => void, onError?: OnError) => {
            const earlier = pending.current.get(key);
            if (earlier) clearTimeout(earlier.timer);
            // This edit replaces one of the same field that failed.
            failed.current.delete(key);
            setState((current) => (current.kind === 'saving' ? current : { kind: 'dirty' }));
            const timer = setTimeout(() => {
                pending.current.delete(key);
                void enqueue(key, run, apply, onError);
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
            const hadFailed = failed.current.delete(key);
            if (!earlier && !hadFailed) return;
            if (earlier) {
                clearTimeout(earlier.timer);
                pending.current.delete(key);
            }
            // Nothing left to send: "Unsaved changes" settles; another field's failed save keeps its message.
            if (inFlight.current > 0 || pending.current.size > 0) return;
            settle();
        },
        [settle],
    );

    /** Sends every pending field edit now and waits for all of them. */
    const flush = useCallback(async () => {
        for (const [key, item] of pending.current) {
            clearTimeout(item.timer);
            pending.current.delete(key);
            void enqueue(key, item.run, item.apply, item.onError);
        }
        await chain.current;
    }, [enqueue]);

    // Hiding the tab or leaving the page sends what is waiting, failed edits too, at once and side by
    // side, not behind a save still in flight: lib/api.ts makes a write sent while the page is hidden a
    // keepalive request, which outlives the page. Only an edit of a field whose earlier save is still in
    // flight could land out of order; it was sent last, so it almost always lands last.
    useEffect(() => {
        const sendAll = () => {
            const waiting: [string, Send][] = [...failed.current];
            failed.current.clear();
            for (const [key, item] of pending.current) {
                clearTimeout(item.timer);
                waiting.push([key, item]);
            }
            pending.current.clear();
            for (const [key, item] of waiting) sendNow(key, item);
        };
        const onVisibility = () => {
            if (document.visibilityState === 'hidden') sendAll();
        };
        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pagehide', sendAll);
        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pagehide', sendAll);
        };
    }, [sendNow]);

    /**
     * A structural change: runs after pending field edits, and applies its answer whole. With
     * `onError`, a failure is reported there (shown at the field) instead of in the save state.
     * The answer is usually the Story; the assistant (ticket 23) commits calls that answer more.
     */
    const commit = useCallback(
        async <T = Story,>(run: () => Promise<T>, apply: (value: T) => void, onError?: OnError): Promise<T | undefined> => {
            await flush();
            structural.current += 1;
            return enqueue(`structural:${structural.current}`, run, apply, onError);
        },
        [enqueue, flush],
    );

    return { state, queue, cancel, commit, flush };
}

/** What `useAutosave` hands a page, for the components that save through it. */
export type Autosave = ReturnType<typeof useAutosave>;

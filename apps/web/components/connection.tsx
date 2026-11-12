'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';

import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { CantConnect } from './cant-connect';

interface ConnectionContextValue {
    reportUnreachable(): void;
    /**
     * Keeps an authoring edit that couldn't reach the API (autosave only, never a Chat message), so
     * Retry on the can't-connect screen sends it before the page loads again. A later edit with the
     * same key replaces it. Kept in this tab's memory only: closing the tab drops it.
     */
    keepUnsent(key: string, send: () => Promise<unknown>): void;
}

const ConnectionContext = createContext<ConnectionContextValue>({ reportUnreachable() {}, keepUnsent() {} });

/**
 * Shows the one "can't connect" screen in place of the page whenever any API call finds the
 * API unreachable. Retry checks the API, sends the authoring edits that failed on the way down
 * (audit H1: typed text is never lost to an outage), then remounts the page so it loads afresh.
 * Nothing else is replayed, and Chat messages never are (spec: "PWA").
 */
export function ConnectionBoundary({ children }: { children: ReactNode }) {
    const [unreachable, setUnreachable] = useState(false);
    const [generation, setGeneration] = useState(0);
    const unsent = useRef(new Map<string, () => Promise<unknown>>());
    const [waiting, setWaiting] = useState(0);
    /** Why an edit kept through the outage was refused once the API was back. */
    const [refused, setRefused] = useState<string | null>(null);

    const reportUnreachable = useCallback(() => setUnreachable(true), []);

    const keepUnsent = useCallback((key: string, send: () => Promise<unknown>) => {
        // Moved to the end, so the edits go in the order they were last made.
        unsent.current.delete(key);
        unsent.current.set(key, send);
        setWaiting(unsent.current.size);
    }, []);

    /** Sends the kept edits in order; throws, keeping the rest, if the API is still out of reach. */
    const recover = useCallback(async () => {
        let refusal: string | null = null;
        for (const [key, send] of [...unsent.current]) {
            try {
                await send();
            } catch (error) {
                if (error instanceof ApiUnreachableError) throw error;
                refusal = error instanceof ApiError ? error.message : 'Something went wrong.';
            }
            unsent.current.delete(key);
            setWaiting(unsent.current.size);
        }
        setRefused(refusal);
        setUnreachable(false);
        setGeneration((value) => value + 1);
    }, []);

    if (unreachable) return <CantConnect onRecovered={recover} waiting={waiting} />;

    return (
        <ConnectionContext.Provider value={{ reportUnreachable, keepUnsent }}>
            <div key={generation} className="page">
                {refused !== null && (
                    <div className="banner flex flex-wrap items-start gap-x-3" role="alert">
                        <p className="m-0 min-w-0 flex-1">
                            An edit made as the connection dropped couldn&apos;t be saved: {refused} The page shows what is saved.
                        </p>
                        <button type="button" className="button button-quiet button-small" onClick={() => setRefused(null)}>
                            Hide
                        </button>
                    </div>
                )}
                {children}
            </div>
        </ConnectionContext.Provider>
    );
}

/** For components that call the API themselves: report an unreachable API to the boundary. */
export function useConnection(): ConnectionContextValue {
    return useContext(ConnectionContext);
}

export type QueryState<T> =
    | { status: 'loading' }
    | { status: 'ready'; data: T }
    | { status: 'error'; error: ApiError };

/** A query's state, and `retry`, which loads it again from scratch (audit M9). */
export type QueryResult<T> = QueryState<T> & { retry(): void };

/**
 * Loads `path` on mount, and again on `retry()`. An unreachable API switches to the "can't
 * connect" screen. Show the states with the shared Loading and ErrorState (components/query-state):
 * `{query.status === 'error' && <ErrorState error={query.error} onRetry={query.retry} />}`.
 */
export function useApiQuery<T>(path: string): QueryResult<T> {
    const { reportUnreachable } = useContext(ConnectionContext);
    const [state, setState] = useState<QueryState<T>>({ status: 'loading' });
    const [attempt, setAttempt] = useState(0);
    const retry = useCallback(() => {
        setState({ status: 'loading' });
        setAttempt((count) => count + 1);
    }, []);

    useEffect(() => {
        let cancelled = false;
        apiFetch<T>(path).then(
            (data) => !cancelled && setState({ status: 'ready', data }),
            (error: unknown) => {
                if (cancelled) return;
                if (error instanceof ApiUnreachableError) reportUnreachable();
                else if (error instanceof ApiError) setState({ status: 'error', error });
                else throw error;
            },
        );
        return () => {
            cancelled = true;
        };
    }, [path, reportUnreachable, attempt]);

    return { ...state, retry };
}

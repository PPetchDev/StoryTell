'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';

import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { CantConnect } from './cant-connect';

interface ConnectionContextValue {
    reportUnreachable(): void;
}

const ConnectionContext = createContext<ConnectionContextValue>({ reportUnreachable() {} });

/**
 * Shows the one "can't connect" screen in place of the page whenever any API call finds the
 * API unreachable. Retry checks the API, then remounts the page so it loads afresh; nothing
 * from before the outage is replayed.
 */
export function ConnectionBoundary({ children }: { children: ReactNode }) {
    const [unreachable, setUnreachable] = useState(false);
    const [generation, setGeneration] = useState(0);

    const reportUnreachable = useCallback(() => setUnreachable(true), []);

    const recover = useCallback(() => {
        setUnreachable(false);
        setGeneration((value) => value + 1);
    }, []);

    if (unreachable) return <CantConnect onRecovered={recover} />;

    return (
        <ConnectionContext.Provider value={{ reportUnreachable }}>
            <div key={generation} className="page">
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

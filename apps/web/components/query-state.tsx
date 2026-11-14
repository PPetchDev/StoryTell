'use client';

import { ApiError } from '@/lib/api';

interface LoadingProps {
    /** What is loading, said to screen readers and shown under the skeleton: "Loading Stories…". */
    label?: string;
    /** How many grey lines stand in for the content; 3 by default. */
    lines?: number;
    /** Utilities for the outer box (its margin, a card look: `card`). */
    className?: string;
}

/**
 * A page or a card while its data loads (audit M9): grey lines the shape of text, which pulse
 * unless motion is reduced, and the label in a status region. Pair it with `useApiQuery`:
 * `{query.status === 'loading' && <Loading label="Loading Stories…" />}`.
 */
export function Loading({ label = 'Loading…', lines = 3, className }: LoadingProps) {
    return (
        <div role="status" className={className}>
            <div aria-hidden="true" className="grid gap-2 py-1 motion-safe:animate-pulse-soft">
                {Array.from({ length: lines }, (_, line) => (
                    <div key={line} className={`h-4 rounded-sm bg-line ${line === lines - 1 ? 'w-3/5' : 'w-full'}`} />
                ))}
            </div>
            <p className="mt-2 mb-0 text-sm text-muted">{label}</p>
        </div>
    );
}

interface ErrorStateProps {
    /** The failure: an ApiError's message is shown, anything else a plain sentence. */
    error: ApiError | Error | string;
    /** What could not be loaded or done: "Couldn't load the Gallery." */
    title?: string;
    /** Runs the request again; `useApiQuery(...).retry`. Without it there is no button. */
    onRetry?(): void;
    className?: string;
}

/**
 * Something failed to load, and how to try again (audit M9, `error-recovery`): the reason and a
 * Try again button, as an alert so it is read out at once.
 */
export function ErrorState({ error, title = "Couldn't load this.", onRetry, className }: ErrorStateProps) {
    const reason = typeof error === 'string' ? error : error.message;
    return (
        <div role="alert" className={`notice flex flex-wrap items-center gap-x-3 gap-y-2 ${className ?? ''}`}>
            <p className="m-0 min-w-0 flex-1 basis-48">
                <strong className="font-semibold">{title}</strong> {reason}
            </p>
            {onRetry && (
                <button type="button" className="button button-quiet !ml-0" onClick={onRetry}>
                    Try again
                </button>
            )}
        </div>
    );
}

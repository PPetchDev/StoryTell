'use client';

import { useEffect, useRef, useState } from 'react';

import { SAVE_LABELS, SaveState } from './autosave';

/** How long saving must stay quiet before "Saved" is said (audit M16). */
const SAY_SAVED_MS = 2000;

/**
 * What a screen reader hears of the save state (audit M16): a failure at once, and "Saved" once
 * typing has paused for a while, not every "Unsaved changes → Saving… → Saved" as it flickers.
 * Nothing is said until something has been edited.
 */
function useSpokenSaveState(state: SaveState): string {
    const [spoken, setSpoken] = useState('');
    const edited = useRef(false);
    const message = state.kind === 'error' ? state.message : '';
    useEffect(() => {
        if (state.kind === 'error') {
            edited.current = true;
            setSpoken(`${SAVE_LABELS.error}: ${message}`);
            return;
        }
        if (state.kind !== 'saved') {
            edited.current = true;
            return;
        }
        if (!edited.current) return;
        const timer = setTimeout(() => setSpoken(SAVE_LABELS.saved), SAY_SAVED_MS);
        return () => clearTimeout(timer);
    }, [state.kind, message]);
    return spoken;
}

/**
 * The one "Saving… / Saved / Couldn't save: <reason>" line in a page's header (spec: "Saving"),
 * for the state `useAutosave` reports. After a failed save, Try again beside it sends the kept
 * edits once more (audit H1); it sits outside the status line, so the line reads the same.
 *
 * The line keeps its status role but is not live: what is said goes through a quieter region of
 * its own (M16). A failure shows in the warning colour.
 */
export function SaveStatus({ state, className }: { state: SaveState; className?: string }) {
    const spoken = useSpokenSaveState(state);
    return (
        <>
            <p
                className={[
                    'save-state',
                    state.kind === 'error' ? 'text-warning' : undefined,
                    className,
                ]
                    .filter(Boolean)
                    .join(' ')}
                role="status"
                aria-live="off"
                data-state={state.kind}
            >
                {SAVE_LABELS[state.kind]}
                {state.kind === 'error' && `: ${state.message}`}
            </p>
            <span className="sr-only" aria-live="polite" aria-atomic="true">
                {spoken}
            </span>
            {state.kind === 'error' && (
                <button type="button" className="button button-quiet button-small" onClick={state.retry}>
                    Try again
                </button>
            )}
        </>
    );
}

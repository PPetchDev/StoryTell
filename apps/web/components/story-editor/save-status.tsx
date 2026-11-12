import { SAVE_LABELS, SaveState } from './autosave';

/**
 * The one "Saving… / Saved / Couldn't save: <reason>" line in a page's header (spec: "Saving"),
 * for the state `useAutosave` reports. After a failed save, Try again beside it sends the kept
 * edits once more (audit H1); it sits outside the status line, so the line reads the same.
 */
export function SaveStatus({ state, className }: { state: SaveState; className?: string }) {
    return (
        <>
            <p
                className={className ? `save-state ${className}` : 'save-state'}
                role="status"
                aria-live="polite"
                data-state={state.kind}
            >
                {SAVE_LABELS[state.kind]}
                {state.kind === 'error' && `: ${state.message}`}
            </p>
            {state.kind === 'error' && (
                <button type="button" className="button button-quiet button-small" onClick={state.retry}>
                    Try again
                </button>
            )}
        </>
    );
}

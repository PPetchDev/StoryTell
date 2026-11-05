import { SAVE_LABELS, SaveState } from './autosave';

/**
 * The one "Saving… / Saved / Couldn't save: <reason>" line in a page's header (spec: "Saving"),
 * for the state `useAutosave` reports.
 */
export function SaveStatus({ state }: { state: SaveState }) {
    return (
        <p className="save-state" role="status" aria-live="polite">
            {SAVE_LABELS[state.kind]}
            {state.kind === 'error' && `: ${state.message}`}
        </p>
    );
}

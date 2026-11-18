'use client';

import { useId } from 'react';

/**
 * "Let the story make up events" (.scratch/ai-events/spec.md): the author's switch at the end of
 * the Sudden events section. On, the story may now and then propose a Sudden event of its own in a
 * Chat, which the player starts or declines; it stays in that Chat and never joins this list. The
 * track reads 3:1 when off and slides only with motion on, as the other switches do.
 */
export function AiEventsSwitch({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
    const noteId = useId();
    return (
        <div className="mt-4">
            <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-describedby={noteId}
                className="group bare-button inline-flex min-h-11 max-w-full items-center gap-2 rounded-sm px-1 text-left text-md text-text"
                onClick={() => onChange(!on)}
            >
                <span
                    aria-hidden="true"
                    className="relative h-5 w-9 flex-none rounded-full border border-field-line bg-quiet-fill group-aria-checked:border-accent-fill group-aria-checked:bg-accent-fill motion-safe:transition-colors motion-safe:duration-base"
                >
                    <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-text group-aria-checked:translate-x-4 group-aria-checked:bg-accent-text motion-safe:transition-transform motion-safe:duration-base" />
                </span>
                <span className="min-w-0">Let the story make up events</span>
            </button>
            <p id={noteId} className="mt-1 mb-0 text-sm text-muted">
                Now and then, when a moment calls for it, the story proposes a Sudden event of its own. The player starts it or says not now; it stays in that
                Chat and never joins this list. Rare, never while another event runs, never in an intimate moment.
            </p>
        </div>
    );
}

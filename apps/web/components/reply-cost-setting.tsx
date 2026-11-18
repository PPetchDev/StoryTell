'use client';

import { useId } from 'react';

import { setShowReplyCost, useShowReplyCost } from '@/lib/reply-cost';

/** A real switch, as the Chat menu's (audit M5): a track and a knob. */
const SWITCH_TRACK =
    'relative h-6 w-10 shrink-0 rounded-full border border-field-line bg-quiet-fill group-aria-checked:border-accent-fill group-aria-checked:bg-accent-fill motion-safe:transition-colors motion-safe:duration-base';
const SWITCH_KNOB =
    'absolute top-0.5 left-0.5 size-4 rounded-full bg-text group-aria-checked:translate-x-4 group-aria-checked:bg-accent-text motion-safe:transition-transform motion-safe:duration-base';

/**
 * Settings' "Show cost per reply" (.scratch/cost-view/spec.md): with it on, each reply in a Chat
 * shows what it cost. Off by default, and only on this device.
 */
export function ReplyCostSetting() {
    const on = useShowReplyCost();
    const noteId = useId();
    return (
        <section className="card">
            <button
                type="button"
                role="switch"
                aria-checked={on}
                aria-describedby={noteId}
                className="bare-button group flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md text-left text-text press focus-ring"
                onClick={() => setShowReplyCost(!on)}
            >
                <span className="card-title m-0 min-w-0 flex-1">Show cost per reply</span>
                <span aria-hidden="true" className={SWITCH_TRACK}>
                    <span className={SWITCH_KNOB} />
                </span>
            </button>
            <p id={noteId} className="muted mb-0">
                Under each reply in a Chat, what it cost: the reply and the checks and Memory keeping it set off. Kept on this device only.
            </p>
        </section>
    );
}

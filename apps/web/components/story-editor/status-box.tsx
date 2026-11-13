'use client';

import { useEffect, useRef } from 'react';

import { announce } from '@/components/announcer';
import { ChevronDownIcon, ChevronRightIcon } from '@/components/icons';
import { setFolded, useFolded } from '@/lib/folds';
import { MissingField } from '@/lib/story';

interface StatusBoxProps {
    playable: boolean;
    missing: MissingField[];
    /** Takes the author to a missing item's field: its tab, scrolled to, focused, lit. */
    onGo(item: MissingField): void;
    /**
     * Where the list's state is kept, per device (lib/folds.ts), e.g. `statusOpen:12`. The list
     * starts folded to its count (audit M47), so the key records that it was opened: opened once,
     * it stays open on this Story.
     */
    foldKey: string;
}

/** A focus ring in the warning colour, inside the button, which reads on the warning box. */
const WARNING_RING = 'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-warning';

/**
 * A moment after what caused it is said ("Rewrote Setting."): the announcer says the last thing
 * it was given in a frame, so the two would otherwise cut each other off.
 */
const SAY_AFTER_MS = 1500;

/** Says when the Story becomes playable, or stops being (audit H12): the box changes out of sight. */
function useSayPlayable(playable: boolean) {
    const was = useRef(playable);
    useEffect(() => {
        if (was.current === playable) return;
        was.current = playable;
        const timer = setTimeout(
            () => announce(playable ? 'The Story is playable now.' : 'The Story needs filling in before it can be played.'),
            SAY_AFTER_MS,
        );
        return () => clearTimeout(timer);
    }, [playable]);
}

/**
 * The playable status (spec: "Story editor", Status box): Playable, or what is still missing.
 * The missing items flow side by side, so eight of them take a few short rows rather than most
 * of a phone's screen (M47). It starts folded to "N to fill in", and remembers being opened.
 */
export function StatusBox({ playable, missing, onGo, foldKey }: StatusBoxProps) {
    const open = useFolded(foldKey);
    useSayPlayable(playable);
    if (playable) {
        // One small badge, not a box over every tab: nothing to do here but tap Play (docs/ui-audit-2026-11-13.md, M12).
        return (
            <section className="mb-3" aria-label="Playable status">
                <p className="m-0 inline-flex items-center gap-1.5 rounded-full border border-status-ok-line bg-status-ok-surface px-3 py-1 text-sm text-status-ok-text">
                    <span aria-hidden="true">✓</span>
                    <span>
                        <strong>Playable</strong> · tap Play to start a Chat
                    </span>
                </p>
            </section>
        );
    }
    return (
        <section className="mb-3 rounded-lg border border-warning-line bg-warning-surface" aria-label="Playable status">
            <button
                type="button"
                className={`bare-button flex min-h-11 w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-md text-status-toggle-text ${WARNING_RING}`}
                aria-expanded={open}
                onClick={() => setFolded(foldKey, !open)}
            >
                <span>
                    <strong>{missing.length} to fill in</strong> before you can play
                </span>
                <ChevronDownIcon
                    size={18}
                    className={`flex-none motion-safe:transition-transform motion-safe:duration-fast ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && (
                <ul className="m-0 flex list-none flex-wrap gap-2 px-2 pb-2">
                    {missing.map((item) => (
                        <li key={item.field} className="max-w-full">
                            <button
                                type="button"
                                className={`bare-button press flex min-h-11 max-w-full items-center gap-1.5 rounded-md bg-status-item-tint py-2 pr-2 pl-3 text-left text-md text-text ${WARNING_RING}`}
                                onClick={() => onGo(item)}
                            >
                                <span className="min-w-0 [overflow-wrap:anywhere]">{item.label}</span>
                                <ChevronRightIcon size={16} className="flex-none" />
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </section>
    );
}

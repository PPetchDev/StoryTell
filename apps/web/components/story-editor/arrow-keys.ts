import { KeyboardEvent } from 'react';

const ACROSS: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
const DOWN: Record<string, number> = { ArrowDown: 1, ArrowUp: -1 };
const BOTH: Record<string, number> = { ...ACROSS, ...DOWN };

/** Which arrows move along a row of choices: a tab bar's own direction, or all four (a radio group). */
export type ArrowOrientation = 'horizontal' | 'vertical' | 'both';

const STEPS: Record<ArrowOrientation, Record<string, number>> = { horizontal: ACROSS, vertical: DOWN, both: BOTH };

/**
 * Arrow-key movement in a row of choices (a tab list, a radio group): the index the key moves
 * to, wrapping round, or null when the key isn't one of them. Home and End go to the ends.
 * When `current` is not in the row, the first arrow press lands on the first or last choice. A
 * tab list moves only along its own direction (audit L28): Left and Right across, Up and Down down.
 */
export function movedIndex(event: KeyboardEvent, current: number, count: number, orientation: ArrowOrientation = 'both'): number | null {
    if (event.key === 'Home') return 0;
    if (event.key === 'End') return count - 1;
    const step = STEPS[orientation][event.key];
    if (!step) return null;
    if (current < 0) return step > 0 ? 0 : count - 1;
    return (current + step + count) % count;
}

/** Moves to that choice and focuses it, as the tab list and radio group patterns expect. */
export function focusChoice(container: HTMLElement | null, selector: string, index: number): void {
    container?.querySelectorAll<HTMLElement>(selector)[index]?.focus();
}

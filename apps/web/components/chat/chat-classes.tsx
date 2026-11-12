import { createContext } from 'react';

/*
 * Class lists the Chat screen repeats across its components (docs/adr/0004-tailwind-css.md: a long
 * list goes in a constant). Only the Chat screen's own pieces use them.
 */

/**
 * Whether the Message around a control is the thread's one tab stop (audit H10). Inside the
 * others, the controls every Message repeats (a speaker's Portrait, a Snapshot) leave the Tab
 * order, so Tab goes from the thread to the composer in a step or two; the arrow keys reach
 * the rest. Outside a thread (the Opening preview) everything stays in the Tab order.
 */
export const MessageTabStop = createContext(true);

/**
 * A Message action (✎ Edit, ↺ Again, ▶ Read aloud, ไทย, ⑂ Branch …): a quiet outlined pill, 44px
 * tall (audit H27), its edge 3:1 on the page (H14), with pressed, disabled and busy looks (M25).
 */
export const ACTION = [
    'bare-button inline-flex items-center gap-1',
    'min-h-11 px-3',
    'rounded-full border border-field-line bg-surface',
    'text-sm font-semibold whitespace-nowrap text-muted',
    'cursor-pointer press focus-ring',
    'aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-text',
    'disabled:cursor-not-allowed disabled:border-line disabled:text-faint',
    'aria-busy:cursor-progress motion-safe:aria-busy:animate-pulse-soft',
].join(' ');

/** The icon inside an ACTION, in the text colour so it reads beside the muted label. */
export const ACTION_ICON = 'shrink-0 text-text';

/**
 * A round icon button (the top bar's ‹ and ⋯, the composer's tools, 🎤): 44px (audit H28), a quiet
 * tint while pressed, the faint colour when it can't be used.
 */
export const ICON_BUTTON = [
    'bare-button grid shrink-0 place-items-center',
    'size-11 rounded-full',
    'text-muted',
    'cursor-pointer press focus-ring',
    'active:bg-surface-raised',
    'aria-pressed:bg-accent-soft aria-pressed:text-accent',
    'disabled:cursor-not-allowed disabled:text-faint aria-disabled:cursor-not-allowed aria-disabled:text-faint',
].join(' ');

/** The round accent button at the end of the box row: Send, Continue, Done. */
export const SEND_BUTTON = [
    'bare-button grid shrink-0 place-items-center',
    'size-11 rounded-full bg-accent-fill',
    'text-accent-text',
    'cursor-pointer press focus-ring',
    'disabled:cursor-not-allowed disabled:bg-surface-raised disabled:text-muted',
    'aria-disabled:cursor-not-allowed aria-disabled:bg-surface-raised aria-disabled:text-muted',
].join(' ');

/** A text box in a Chat sheet or form: 44px or more, a 3:1 edge (H14), the shared focus ring (M2). */
export const TEXT_BOX = [
    'block w-full min-w-0 min-h-11 px-3 py-2.5',
    'rounded-md border border-field-line bg-bg',
    'font-[inherit] text-base text-text',
    'focus-ring',
].join(' ');

/** A small heading over a group of lines (the Saved replies tray, Suggested reply kinds). */
export const LABEL_CAPS = 'text-xs font-semibold tracking-wide text-muted uppercase';

/** A quiet line under the box or in a panel: "Thinking up replies…", "Transcribing…". */
export const PANEL_NOTE = 'mt-0 mb-1 text-md text-muted';

/** A small turning arc: busy, drawn still when motion is reduced (it still reads as "loading"). */
export function Spinner({ size = 16 }: { size?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
            className="shrink-0 motion-safe:animate-spin"
        >
            <path d="M21 12a9 9 0 1 1-9-9" />
        </svg>
    );
}

/**
 * The Chat's reading column on a PC (spec: "Desktop layout"): the top bar, the strip, the toasts
 * and the composer keep about 48rem in the middle while the thread scrolls across the page.
 */
export const COLUMN = 'lg:mx-auto lg:w-[min(100%_-_3rem,48rem)]';

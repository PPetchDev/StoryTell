/**
 * The dashed "+ Add …" button at the end of a list (a Character, a Scene, a Lore entry, a Saved
 * reply, a Replace rule): full width, 44px tall, a 3:1 dashed edge (audit H14), and the shared
 * focus ring and press. `className={ADD_BUTTON}` on a <button>; ADD_BUTTON_IN_CARD inside a card's
 * body, where it keeps room above it instead of below.
 */
const ADD_BUTTON_LOOK = [
    'bare-button flex items-center justify-center gap-2',
    'min-h-11 w-full p-3',
    'rounded-lg border border-dashed border-field-line',
    'text-center font-semibold text-muted',
    'press focus-ring',
    'hover:border-accent-line hover:text-text active:bg-surface-raised',
    'disabled:cursor-not-allowed disabled:border-line disabled:text-faint',
    // Just jumped to (Add Character, from "At least one Character"): lit like a field. Set data-flash.
    'data-flash:border-accent data-flash:bg-accent-soft data-flash:text-text data-flash:ring-6 data-flash:ring-accent-line',
].join(' ');

export const ADD_BUTTON = `${ADD_BUTTON_LOOK} mb-3`;

export const ADD_BUTTON_IN_CARD = `${ADD_BUTTON_LOOK} mt-4`;

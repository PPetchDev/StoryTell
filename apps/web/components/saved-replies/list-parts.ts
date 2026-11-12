/**
 * The dashed "+ Add …" button at the end of a Saved replies or Replace rules list: full width,
 * 44px, the accent edge on hover and press.
 */
export const ADD_BUTTON = [
    'bare-button mt-4 mb-0 block min-h-11 w-full p-3',
    'rounded-md border border-dashed border-field-line text-center font-semibold text-muted',
    'hover:border-accent-line hover:text-text active:border-accent-line active:text-text',
    'disabled:cursor-not-allowed disabled:text-faint',
].join(' ');

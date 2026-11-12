import { devicePreference } from './device-preference';

/**
 * The story text size, S, M or L (spec: stories 11–12). A per-device preference: it lives in
 * this browser's storage, read safely, so a blocked or empty storage gives M.
 */
export type TextSize = 'S' | 'M' | 'L';

export const TEXT_SIZES: readonly { value: TextSize; label: string }[] = [
    { value: 'S', label: 'Small' },
    { value: 'M', label: 'Medium' },
    { value: 'L', label: 'Large' },
];

/** The story text's font size for each choice; applied through the --story-size property. S is 16px, no smaller (audit L6). */
export const STORY_TEXT_SIZE: Record<TextSize, string> = {
    S: '1rem',
    M: '1.0625rem',
    L: '1.1875rem',
};

function isTextSize(value: unknown): value is TextSize {
    return TEXT_SIZES.some((option) => option.value === value);
}

const textSize = devicePreference<TextSize>({
    key: 'storytell.textSize',
    fallback: 'M',
    parse: (stored) => (isTextSize(stored) ? stored : null),
    serialise: (size) => size,
});

export const setTextSize = textSize.set;

/** This device's text size; M while rendering on the server. */
export const useTextSize = textSize.useValue;

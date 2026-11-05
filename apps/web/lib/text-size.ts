import { useSyncExternalStore } from 'react';

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

/** The story text's font size for each choice; applied through the --story-size property. */
export const STORY_TEXT_SIZE: Record<TextSize, string> = {
    S: '0.9375rem',
    M: '1.0625rem',
    L: '1.1875rem',
};

const DEFAULT_TEXT_SIZE: TextSize = 'M';
const STORAGE_KEY = 'storytell.textSize';

/** The choice made in this tab when storage refused to keep it, so it still holds until a reload. */
let unsaved: TextSize | null = null;
const listeners = new Set<() => void>();

function isTextSize(value: unknown): value is TextSize {
    return TEXT_SIZES.some((option) => option.value === value);
}

function read(): TextSize {
    if (unsaved) return unsaved;
    try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        if (isTextSize(stored)) return stored;
    } catch {
        // Storage is blocked (private mode, a locked-down browser): fall through.
    }
    return DEFAULT_TEXT_SIZE;
}

function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    // Another tab of the app changed it.
    window.addEventListener('storage', onChange);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener('storage', onChange);
    };
}

export function setTextSize(size: TextSize): void {
    try {
        window.localStorage.setItem(STORAGE_KEY, size);
        unsaved = null;
    } catch {
        // Storage is blocked or full: kept for this tab only.
        unsaved = size;
    }
    for (const listener of listeners) listener();
}

/** This device's text size; M while rendering on the server. */
export function useTextSize(): TextSize {
    return useSyncExternalStore(subscribe, read, () => DEFAULT_TEXT_SIZE);
}

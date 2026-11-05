import { useSyncExternalStore } from 'react';

/**
 * Whether the Chat's Scene strip is hidden (spec: story 45). A per-device preference: it lives
 * in this browser's storage, read safely, so a blocked or empty storage shows the strip.
 */
const STORAGE_KEY = 'storytell.sceneStrip';
const HIDDEN = 'hidden';

/** The choice made in this tab when storage refused to keep it, so it still holds until a reload. */
let unsaved: boolean | null = null;
const listeners = new Set<() => void>();

function read(): boolean {
    if (unsaved !== null) return unsaved;
    try {
        return window.localStorage.getItem(STORAGE_KEY) === HIDDEN;
    } catch {
        // Storage is blocked (private mode, a locked-down browser): the strip shows.
        return false;
    }
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

export function setSceneStripHidden(hidden: boolean): void {
    try {
        if (hidden) window.localStorage.setItem(STORAGE_KEY, HIDDEN);
        else window.localStorage.removeItem(STORAGE_KEY);
        unsaved = null;
    } catch {
        // Storage is blocked or full: kept for this tab only.
        unsaved = hidden;
    }
    for (const listener of listeners) listener();
}

/** True when this device hides the Scene strip; shown while rendering on the server. */
export function useSceneStripHidden(): boolean {
    return useSyncExternalStore(subscribe, read, () => false);
}

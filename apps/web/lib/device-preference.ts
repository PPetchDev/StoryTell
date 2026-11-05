import { useSyncExternalStore } from 'react';

interface DevicePreferenceOptions<T> {
    /** The browser storage key. */
    key: string;
    /** Used while storage is empty, blocked or holds something unreadable, and on the server. */
    fallback: T;
    /** The stored text as a value; null when it isn't one. */
    parse(stored: string): T | null;
    /** The value as stored text; null removes the key. */
    serialise(value: T): string | null;
}

/**
 * A per-device preference (spec: "Per-device preferences"): kept in this browser's storage and
 * read safely, so a blocked or empty storage gives the fallback. When storage refuses to keep a
 * choice, it still holds in this tab until a reload. Other tabs of the app see changes.
 */
export function devicePreference<T>({
    key,
    fallback,
    parse,
    serialise,
}: DevicePreferenceOptions<T>) {
    let unsaved: { value: T } | null = null;
    const listeners = new Set<() => void>();

    function read(): T {
        if (unsaved) return unsaved.value;
        try {
            const stored = window.localStorage.getItem(key);
            if (stored !== null) return parse(stored) ?? fallback;
        } catch {
            // Storage is blocked (private mode, a locked-down browser): fall through.
        }
        return fallback;
    }

    function subscribe(onChange: () => void): () => void {
        listeners.add(onChange);
        window.addEventListener('storage', onChange);
        return () => {
            listeners.delete(onChange);
            window.removeEventListener('storage', onChange);
        };
    }

    function set(value: T): void {
        try {
            const stored = serialise(value);
            if (stored === null) window.localStorage.removeItem(key);
            else window.localStorage.setItem(key, stored);
            unsaved = null;
        } catch {
            // Storage is blocked or full: kept for this tab only.
            unsaved = { value };
        }
        for (const listener of listeners) listener();
    }

    function useValue(): T {
        return useSyncExternalStore(subscribe, read, () => fallback);
    }

    return { useValue, set };
}

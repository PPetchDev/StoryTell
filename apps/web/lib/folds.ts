import { useSyncExternalStore } from 'react';

/**
 * Which folding cards the user has folded on this device (a per-device preference, like the
 * List / Graph switch). Everything starts unfolded, so only folded keys are kept, together
 * under one key as a list. Keys name what is folded: `storySoFar`, `character:<id>`,
 * `bonds:<characterId>`, `scene:<id>`, `lore:<id>`, `feelings:<characterId>`, and in the Gallery
 * `galleryStory:<storyId>` and `galleryChat:<storyId>:<chatId or "deleted">`.
 */
const STORAGE_KEY = 'storytell.folded';

const EMPTY: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();
/** Kept for this tab when storage refuses a write, until a reload. */
let unsaved: ReadonlySet<string> | null = null;
/** The last stored text and the set read from it, so a read returns the same set until it changes. */
let cached: { raw: string | null; set: ReadonlySet<string> } = { raw: null, set: EMPTY };

function parse(raw: string | null): ReadonlySet<string> {
    if (raw === null) return EMPTY;
    try {
        const value: unknown = JSON.parse(raw);
        if (Array.isArray(value)) return new Set(value.filter((key): key is string => typeof key === 'string'));
    } catch {
        // Unreadable: treated as nothing folded.
    }
    return EMPTY;
}

function read(): ReadonlySet<string> {
    if (unsaved) return unsaved;
    let raw: string | null = null;
    try {
        raw = window.localStorage.getItem(STORAGE_KEY);
    } catch {
        // Storage is blocked: nothing folded.
    }
    if (raw !== cached.raw) cached = { raw, set: parse(raw) };
    return cached.set;
}

function subscribe(onChange: () => void): () => void {
    listeners.add(onChange);
    window.addEventListener('storage', onChange);
    return () => {
        listeners.delete(onChange);
        window.removeEventListener('storage', onChange);
    };
}

/** Folds or unfolds one card, and tells every card listening. */
export function setFolded(key: string, folded: boolean): void {
    const current = read();
    if (current.has(key) === folded) return;
    const next = new Set(current);
    if (folded) next.add(key);
    else next.delete(key);
    try {
        if (next.size === 0) window.localStorage.removeItem(STORAGE_KEY);
        else window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
        unsaved = null;
    } catch {
        unsaved = next;
    }
    for (const listener of listeners) listener();
}

/** Whether a card is folded; unfolded on the server and until the page reads storage. */
export function useFolded(key: string): boolean {
    const folded = useSyncExternalStore(subscribe, read, () => EMPTY);
    return folded.has(key);
}

/** Whether a card is folded, read once outside React (for a jump that must unfold it first). */
export function isFolded(key: string): boolean {
    return read().has(key);
}

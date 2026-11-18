/**
 * Search within a Chat (.scratch/chat-search/spec.md): a plain substring, case-insensitive, over
 * text whose runs of whitespace are one space. No word splitting, since Thai has no spaces
 * between words. Pure, so it is the one definition of a match whatever the database's locale.
 */

/** The longest query the API takes, after trimming. */
export const SEARCH_QUERY_MAX = 200;
/** The most results answered; `total` says how many matched in all. */
export const SEARCH_HITS_MAX = 50;
/** About how many characters a snippet shows on each side of its match. */
const SNIPPET_SIDE = 50;
/** How far back or forward a cut looks for a space to cut at instead of mid-word. */
const SPACE_LOOK = 12;
/** How long a Bookmark's snippet (the start of its Message) is, about. */
const LEAD_LENGTH = 120;

/** Runs of whitespace, newlines included, as one space, and none at the ends. */
export function collapseSpace(text: string): string {
    return text.replace(/\s+/gu, ' ').trim();
}

/**
 * `text` lower-cased one UTF-16 unit at a time where that keeps its length, so an offset in the
 * folded text is the same offset in `text`. A code point whose lower case is longer ("İ") or
 * that is half of a surrogate pair stays as it is.
 */
export function foldCase(text: string): string {
    let folded = '';
    for (let index = 0; index < text.length; index++) {
        const unit = text[index];
        const lower = unit.toLowerCase();
        folded += lower.length === 1 ? lower : unit;
    }
    return folded;
}

/** Where `query` first appears in `text`, case-insensitively; both already collapsed. -1 when nowhere. */
export function matchAt(text: string, query: string): number {
    if (query === '') return -1;
    return foldCase(text).indexOf(foldCase(query));
}

/** A piece of a text with its match, where the match is in the piece. */
export interface Snippet {
    snippet: string;
    match: { start: number; length: number };
}

/** A combining mark (a Thai vowel or tone mark), or the second half of a surrogate pair: never the first unit of a piece. */
function startsInside(text: string, at: number): boolean {
    if (at <= 0 || at >= text.length) return false;
    const code = text.charCodeAt(at);
    return (code >= 0xdc00 && code <= 0xdfff) || /\p{M}/u.test(text[at]);
}

/** Moves a cut back to a space within reach, else to the start of a whole character. */
function cutStart(text: string, at: number): number {
    if (at <= 0) return 0;
    const space = text.lastIndexOf(' ', at);
    if (space >= 0 && at - space <= SPACE_LOOK) return space + 1;
    let cut = at;
    while (cut > 0 && startsInside(text, cut)) cut--;
    return cut;
}

/** Moves a cut (the end, exclusive) on to a space within reach, else past the marks of the last character. */
function cutEnd(text: string, at: number): number {
    if (at >= text.length) return text.length;
    const space = text.indexOf(' ', at);
    if (space >= 0 && space - at <= SPACE_LOOK) return space;
    let cut = at;
    while (cut < text.length && startsInside(text, cut)) cut++;
    return cut;
}

/** About `SNIPPET_SIDE` characters each side of the match at `start`, cut cleanly, with "…" where it was cut. */
export function snippetAround(text: string, start: number, length: number): Snippet {
    const from = cutStart(text, Math.max(0, start - SNIPPET_SIDE));
    const to = cutEnd(text, Math.min(text.length, start + length + SNIPPET_SIDE));
    const before = from > 0 ? '…' : '';
    const after = to < text.length ? '…' : '';
    return { snippet: `${before}${text.slice(from, to)}${after}`, match: { start: start - from + before.length, length } };
}

/** The start of a text, for a Bookmark: collapsed and cut cleanly at about `LEAD_LENGTH`. */
export function leadOf(text: string): string {
    const collapsed = collapseSpace(text);
    if (collapsed.length <= LEAD_LENGTH) return collapsed;
    return `${collapsed.slice(0, cutEnd(collapsed, LEAD_LENGTH))}…`;
}

/** One searchable piece of the Chat: a user Message, or one part of an AI Message, as the screen shows it. */
export interface SearchablePart {
    messageId: number;
    kind: 'user' | 'ai';
    speaker: string;
    text: string;
}

export interface SearchHit extends Snippet {
    messageId: number;
    kind: 'user' | 'ai';
    speaker: string;
}

export interface SearchResult {
    total: number;
    hits: SearchHit[];
}

/**
 * Every part that holds `query`, newest first (`parts` come in thread order), one result per
 * part at its first match, at most `SEARCH_HITS_MAX` of them.
 */
export function searchParts(parts: readonly SearchablePart[], query: string): SearchResult {
    const wanted = collapseSpace(query);
    const hits: SearchHit[] = [];
    let total = 0;
    for (let index = parts.length - 1; index >= 0; index--) {
        const part = parts[index];
        const text = collapseSpace(part.text);
        const at = matchAt(text, wanted);
        if (at < 0) continue;
        total++;
        if (hits.length < SEARCH_HITS_MAX) {
            hits.push({ messageId: part.messageId, kind: part.kind, speaker: part.speaker, ...snippetAround(text, at, wanted.length) });
        }
    }
    return { total, hits };
}

/** "Mira", "Mira and Nara", "Mira, Nara and Ash". */
export function joinNames(names: readonly string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

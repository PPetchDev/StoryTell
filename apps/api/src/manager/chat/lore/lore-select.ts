import { estimateTokens } from '../turn/prompt-tokens.js';

/**
 * Spec: "Lore": which of the Story's Lore entries a prompt carries. Pure logic over plain
 * inputs: no model call, so a turn stays as fast and as cheap as without Lore.
 */

/** A Lore entry as the prompts read it. */
export interface PromptLoreEntry {
    id: number;
    name: string;
    keywords: string[];
    text: string;
    alwaysOn: boolean;
}

/** The Story's Lore as the prompts read it; takes a Story with its `lore` loaded. */
export function promptLore(story: { lore: PromptLoreEntry[] }): PromptLoreEntry[] {
    return story.lore.map(({ id, name, keywords, text, alwaysOn }) => ({ id, name, keywords: [...keywords], text, alwaysOn }));
}

/** Spec: "about 1,500 tokens". */
export const LORE_CAP_TOKENS = 1_500;
/** The newest Messages scanned for triggers, besides the user's new message. */
export const LORE_SCAN_MESSAGES = 4;

/** The block's heading; tests find the block by it. */
export const LORE_HEADING = '# Lore';

const LATIN_OR_DIGIT = /[a-z0-9]/i;

/** The entry's triggers: its name and keywords, trimmed, blanks dropped. */
function triggers(entry: PromptLoreEntry): string[] {
    return [entry.name, ...entry.keywords].map((trigger) => trigger.trim()).filter((trigger) => trigger !== '');
}

/**
 * Whether `trigger` comes up in `text`, ignoring case. A trigger that starts with a Latin letter
 * or a digit must start a word ("elf" never fires on "herself"); its end is free, so "Crescent"
 * matches "Crescents". Any other trigger, Thai among them, matches anywhere.
 */
export function mentions(text: string, trigger: string): boolean {
    const haystack = text.toLocaleLowerCase();
    const needle = trigger.trim().toLocaleLowerCase();
    if (needle === '') return false;
    const wordStart = LATIN_OR_DIGIT.test(needle[0]);
    for (let at = haystack.indexOf(needle); at >= 0; at = haystack.indexOf(needle, at + 1)) {
        if (!wordStart || at === 0 || !LATIN_OR_DIGIT.test(haystack[at - 1])) return true;
    }
    return false;
}

/** How an entry is written in a prompt. */
export function loreEntryText(entry: PromptLoreEntry): string {
    return `## ${entry.name.trim() || 'Untitled'}\n${entry.text.trim()}`;
}

/**
 * The entries a prompt carries, in the order it writes them. `scan` is the text to look in,
 * newest first: the user's new message (when there is one), then the newest Messages. Entries
 * with blank text are never sent. Always-on entries come first in position order, then
 * mentioned ones by how recently they came up, position breaking ties. Entries are taken in that
 * order while they fit under `cap`; one that doesn't fit is skipped and the rest still tried.
 */
export function selectLore(entries: PromptLoreEntry[], scan: string[], cap = LORE_CAP_TOKENS): PromptLoreEntry[] {
    const sendable = entries.filter((entry) => entry.text.trim() !== '');
    const always = sendable.filter((entry) => entry.alwaysOn);
    const mentioned = sendable
        .filter((entry) => !entry.alwaysOn)
        .map((entry, position) => ({
            entry,
            position,
            recency: scan.findIndex((text) => triggers(entry).some((trigger) => mentions(text, trigger))),
        }))
        .filter((candidate) => candidate.recency >= 0)
        .sort((a, b) => a.recency - b.recency || a.position - b.position)
        .map((candidate) => candidate.entry);

    const chosen: PromptLoreEntry[] = [];
    let used = 0;
    for (const entry of [...always, ...mentioned]) {
        const cost = estimateTokens(loreEntryText(entry));
        if (used + cost > cap) continue;
        used += cost;
        chosen.push(entry);
    }
    return chosen;
}

/**
 * The block the turn's trailing system message carries, or null when no entry is selected.
 * Lore is common knowledge of the world (spec): secrets stay on Character cards.
 */
export function loreBlock(selected: PromptLoreEntry[]): string | null {
    if (selected.length === 0) return null;
    return `${LORE_HEADING} (facts of this world that matter right now: common knowledge, so every Character knows them as anyone living there would)
${selected.map(loreEntryText).join('\n\n')}`;
}

/** The most the Lore block can take for this Story: its whole sendable Lore, or the cap. */
export function loreReserveTokens(entries: PromptLoreEntry[], cap = LORE_CAP_TOKENS): number {
    const sendable = entries.filter((entry) => entry.text.trim() !== '');
    if (sendable.length === 0) return 0;
    const whole = estimateTokens(`${LORE_HEADING}\n${sendable.map(loreEntryText).join('\n\n')}`) + 30;
    return Math.min(whole, cap + 30);
}

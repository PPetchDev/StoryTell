import { apiFetch } from './api';
import type { LoreEntry, LoreSecondaryMode } from './story';

// Mirrors the API's Lore in play DTO (apps/api/src/api/chat/dto/lore-in-play.response.dto.ts)
// and its reasons (apps/api/src/manager/chat/lore/lore-select.ts).

/** Why an entry is in play (.scratch/lore-triggers/spec.md: "Lore in play"). */
export type InPlayReason =
    | { kind: 'always' }
    /** `messagesAgo`: 0 is the newest scanned Message. */
    | { kind: 'cameUp'; trigger: string; messagesAgo: number }
    | { kind: 'staying'; messagesLeft: number }
    | { kind: 'broughtIn'; byName: string };

/** Why an entry that came up was left out. */
export type LeftOutReason =
    | { kind: 'condition'; mode: LoreSecondaryMode; keywords: string[] }
    | { kind: 'waiting'; messagesLeft: number }
    | { kind: 'resting'; messagesLeft: number }
    | { kind: 'chance'; chance: number }
    | { kind: 'group'; group: string; winner: string }
    | { kind: 'noRoom' };

export interface LoreInPlayEntry {
    id: number;
    name: string;
    /** Sent on every turn, whether or not it comes up. */
    alwaysOn: boolean;
    /** The share of the times it comes up that it goes in, 0–100; 100 means no roll. */
    chance: number;
    why: InPlayReason;
}

export interface LoreLeftOutEntry {
    id: number;
    name: string;
    why: LeftOutReason;
}

/** The Lore a turn would send now, as a Continue would, with reasons (spec: "Lore in play"). */
export interface LoreInPlay {
    entries: LoreInPlayEntry[];
    /** The entries that came up but did not go in. */
    leftOut: LoreLeftOutEntry[];
}

const messages = (count: number) => `${count} ${count === 1 ? 'Message' : 'Messages'}`;
const more = (count: number) => `${count} more ${count === 1 ? 'Message' : 'Messages'}`;

/** An in-play reason in plain words ("came up: yurt, 2 Messages back", "always"). */
export function inPlayWords(why: InPlayReason): string {
    switch (why.kind) {
        case 'always':
            return 'always';
        case 'cameUp':
            return `came up: ${why.trigger}, ${why.messagesAgo === 0 ? 'in the newest Message' : `${messages(why.messagesAgo)} back`}`;
        case 'staying':
            return `stays ${more(why.messagesLeft)}`;
        case 'broughtIn':
            return `brought in by ${why.byName}`;
    }
}

/** A left-out reason in plain words ("no room"). */
export function leftOutWords(why: LeftOutReason): string {
    switch (why.kind) {
        case 'condition':
            return `${why.mode === 'unless' ? 'not with' : 'needs one of'}: ${why.keywords.join(', ')}`;
        case 'waiting':
            return `waits ${more(why.messagesLeft)}`;
        case 'resting':
            return `resting, ${more(why.messagesLeft)}`;
        case 'chance':
            return `lost its ${why.chance}% chance`;
        case 'group':
            return `the group ${why.group} went to ${why.winner}`;
        case 'noRoom':
            return 'no room';
    }
}

/**
 * The More triggers summary (.scratch/lore-triggers/spec.md: "The Lore card in the editor"):
 * every setting not at its default, in the spec's order, joined by " · "; "None" when all are.
 * The API's Story assistant reads the same words (apps/api/src/manager/chat/lore/lore-summary.ts).
 */
export function loreTriggerSummary(entry: LoreEntry): string {
    const parts: string[] = [];
    if (entry.secondaryKeywords.length > 0) {
        parts.push(`${entry.secondaryMode === 'unless' ? 'Unless' : 'Also needs'}: ${entry.secondaryKeywords.join(', ')}`);
    }
    if (entry.patterns.length > 0) parts.push(entry.patterns.length === 1 ? '1 pattern' : `${entry.patterns.length} patterns`);
    if (entry.sticky > 0) parts.push(`Stays ${entry.sticky}`);
    if (entry.cooldown > 0) parts.push(`Rests ${entry.cooldown}`);
    if (entry.delay > 0) parts.push(`Waits ${entry.delay}`);
    if (entry.chance < 100) parts.push(`${entry.chance}%`);
    if (entry.group.trim() !== '') parts.push(`Group: ${entry.group.trim()}`);
    if (!entry.recursable) parts.push('Not from other entries');
    return parts.length > 0 ? parts.join(' · ') : 'None';
}

export const loreApi = {
    inPlay: (storyId: number, chatId: number) => apiFetch<LoreInPlay>(`/stories/${storyId}/chats/${chatId}/lore`),
};

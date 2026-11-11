import { apiFetch, apiSend } from './api';
import type { MemoriesInPlay } from './chat';

// Mirrors the API's Memory response DTOs (apps/api/src/api/memory/dto/memory.response.dto.ts).

export type MemoryAuthor = 'ai' | 'user';

export interface Memory {
    id: number;
    /** With `{user}` where it names the user; render it with `renderUser`. */
    text: string;
    /** Character ids, in cast order. */
    knownBy: number[];
    writtenBy: MemoryAuthor;
    locked: boolean;
    archived: boolean;
    /** The AI Message that added it; null when the user wrote it. */
    messageId: number | null;
    createdAt: string;
}

/**
 * Something one Character holds to be true, which may be false (.scratch/memory-by-meaning/spec.md,
 * "Beliefs"). Mirrors the API's BeliefDTO.
 */
export interface Belief {
    id: number;
    characterId: number;
    /** With `{user}` where it names the user; render it with `renderUser`. */
    text: string;
    /** The Memory it contradicts; null for none. */
    contradictsMemoryId: number | null;
    writtenBy: MemoryAuthor;
    /** The AI Message whose extraction made it; null when the user wrote it or it was seeded. */
    messageId: number | null;
    /** Null while held; once given up, the Message that showed the truth and its line. */
    givenUp: { messageId: number; line: string } | null;
    createdAt: string;
}

export interface MemoryList {
    chatId: number;
    storyId: number;
    identityName: string;
    cast: Array<{ id: number; name: string }>;
    /** The Characters present in the latest exchange: a hand-added Memory is known by these. */
    present: number[];
    /** Active and archived, oldest first. */
    memories: Memory[];
    /** Every Belief, given-up ones included, oldest first. */
    beliefs: Belief[];
    /** What the last turn sent: these show "In play". */
    inPlay: MemoriesInPlay;
    /** The locked Memories alone take more than half the room a turn has for Memory. */
    lockedWarning: boolean;
}

/** The drawer's note when the locked Memories crowd the rest out (.scratch/memory-by-meaning/spec.md). */
export const LOCKED_WARNING =
    'Your locked Memories take most of the room, so fewer others reach the story. Unlock some you no longer need.';

const base = (storyId: number, chatId: number) => `/stories/${storyId}/chats/${chatId}/memories`;

export const memoryApi = {
    list: (storyId: number, chatId: number) => apiFetch<MemoryList>(base(storyId, chatId)),
    /** Adds a Memory the user wrote: locked, known by the Characters present unless `knownBy` is given. */
    add: (storyId: number, chatId: number, text: string, knownBy?: number[]) =>
        apiSend<Memory>('POST', base(storyId, chatId), knownBy ? { text, knownBy } : { text }),
    /** Edits the text or the Known-by set; the Memory is locked afterwards. */
    edit: (storyId: number, chatId: number, memoryId: number, fields: { text?: string; knownBy?: number[] }) =>
        apiSend<Memory>('PATCH', `${base(storyId, chatId)}/${memoryId}`, fields),
    remove: (storyId: number, chatId: number, memoryId: number) =>
        apiSend<void>('DELETE', `${base(storyId, chatId)}/${memoryId}`),
    /** Brings an archived Memory back into play, locked. */
    restore: (storyId: number, chatId: number, memoryId: number) =>
        apiSend<Memory>('POST', `${base(storyId, chatId)}/${memoryId}/restore`),
};

const beliefBase = (storyId: number, chatId: number) => `/stories/${storyId}/chats/${chatId}/beliefs`;

export interface BeliefFields {
    characterId: number;
    text: string;
    /** null for none. */
    contradictsMemoryId: number | null;
}

export const beliefApi = {
    /** Adds a Belief the user wrote. */
    add: (storyId: number, chatId: number, fields: BeliefFields) => apiSend<Belief>('POST', beliefBase(storyId, chatId), fields),
    /** Changes who holds it, what they believe, or the Memory it doesn't match. */
    edit: (storyId: number, chatId: number, beliefId: number, fields: BeliefFields) =>
        apiSend<Belief>('PATCH', `${beliefBase(storyId, chatId)}/${beliefId}`, fields),
    remove: (storyId: number, chatId: number, beliefId: number) => apiSend<void>('DELETE', `${beliefBase(storyId, chatId)}/${beliefId}`),
};

/** Renders `{user}` as the worn identity's name (spec: story 48). */
export function renderUser(text: string, identityName: string): string {
    return text.split('{user}').join(identityName);
}

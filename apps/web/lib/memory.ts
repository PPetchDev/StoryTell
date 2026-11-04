import { apiFetch, apiSend } from './api';

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

export interface MemoryList {
    chatId: number;
    storyId: number;
    identityName: string;
    cast: Array<{ id: number; name: string }>;
    /** The Characters present in the latest exchange: a hand-added Memory is known by these. */
    present: number[];
    /** Active and archived, oldest first. */
    memories: Memory[];
}

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

/** Renders `{user}` as the worn identity's name (spec: story 48). */
export function renderUser(text: string, identityName: string): string {
    return text.split('{user}').join(identityName);
}

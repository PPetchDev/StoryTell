import { apiFetch, apiSend } from '@/lib/api';

/** One part of the Chat that holds the words searched for (.scratch/chat-search/spec.md). */
export interface SearchHit {
    messageId: number;
    kind: 'user' | 'ai';
    /** The user's identity name, a Character's name, or "Narrator". */
    speaker: string;
    snippet: string;
    /** Where the match is in `snippet`. */
    match: { start: number; length: number };
}

export interface SearchResult {
    /** How many parts matched in all; `hits` holds the newest 50. */
    total: number;
    hits: SearchHit[];
}

/** A bookmarked Message, with who spoke in it and how it starts. */
export interface Bookmark {
    messageId: number;
    kind: 'user' | 'ai';
    speaker: string;
    snippet: string;
    createdAt: string;
}

/** The fewest characters the Find sheet searches for: one Thai or Latin letter matches nearly everything. */
export const SEARCH_MIN = 2;
/** The most the API takes. */
export const SEARCH_MAX = 200;

/** A query as the API matches it: whitespace runs as one space, none at the ends. */
export function searchable(query: string): string {
    return query.replace(/\s+/gu, ' ').trim();
}

export const chatSearchApi = {
    search: (storyId: number, chatId: number, query: string, signal?: AbortSignal) =>
        apiFetch<SearchResult>(`/stories/${storyId}/chats/${chatId}/search?${new URLSearchParams({ q: query })}`, { signal }),
    bookmarks: async (storyId: number, chatId: number) =>
        (await apiFetch<{ bookmarks: Bookmark[] }>(`/stories/${storyId}/chats/${chatId}/bookmarks`)).bookmarks,
    setBookmark: async (storyId: number, chatId: number, messageId: number, on: boolean) =>
        (await apiSend<{ bookmarks: Bookmark[] }>(on ? 'PUT' : 'DELETE', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/bookmark`)).bookmarks,
};

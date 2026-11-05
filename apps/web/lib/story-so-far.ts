import { apiFetch, apiSend } from './api';

// Mirrors the API's Story so far DTO (apps/api/src/api/story-so-far/dto/story-so-far.dto.ts).

export interface StorySoFar {
    chatId: number;
    /** Null while the whole Chat still fits and there is none. */
    text: string | null;
    /** How many of the Chat's first Messages it covers; 0 while there is none. */
    coveredMessages: number;
    writtenBy: 'ai' | 'user';
    updatedAt: string | null;
    /** Why the last update failed; it is tried again after the next turn. */
    failedReason: string | null;
}

const path = (storyId: number, chatId: number) => `/stories/${storyId}/chats/${chatId}/story-so-far`;

export const storySoFarApi = {
    get: (storyId: number, chatId: number) => apiFetch<StorySoFar>(path(storyId, chatId)),
    /** The user's own text; its corrections win over later AI rewrites. */
    save: (storyId: number, chatId: number, text: string) => apiSend<StorySoFar>('PUT', path(storyId, chatId), { text }),
};

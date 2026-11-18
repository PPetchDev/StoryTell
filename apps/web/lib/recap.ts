import { apiFetch, apiSend } from './api';

// Mirrors the API's Recap DTO (apps/api/src/api/recap/dto/recap.dto.ts), .scratch/previously-on/spec.md.

/** The Recap for the Chat's newest Message. */
export interface RecapEntry {
    /** The Message it tells the story up to. */
    messageId: number;
    text: string;
    /** The user put it away: it no longer shows by itself until the next gap. */
    dismissed: boolean;
    writtenAt: string;
}

export interface RecapView {
    /** It should show by itself now: 6 hours or more since the newest Message, and not dismissed. */
    due: boolean;
    recap: RecapEntry | null;
}

const recap = (storyId: number, chatId: number) => `/stories/${storyId}/chats/${chatId}/recap`;

export const recapApi = {
    /** Whether a Recap is due, and the stored one. No model call. */
    get: (storyId: number, chatId: number) => apiFetch<RecapView>(recap(storyId, chatId)),
    /** The stored Recap for the newest Message, or one written now. */
    write: (storyId: number, chatId: number) => apiSend<RecapView>('POST', recap(storyId, chatId)),
    /** Puts it away until the next gap. */
    dismiss: (storyId: number, chatId: number) => apiSend<RecapView>('POST', `${recap(storyId, chatId)}/dismiss`),
};

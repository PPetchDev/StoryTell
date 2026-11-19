import { apiSend } from './api';

// Mirrors the API's DTO (apps/api/src/api/lore-suggestions/dto/lore-suggestions.dto.ts), .scratch/lore-from-chat/spec.md.

/** A new Lore entry suggested from what a Chat has established about the world. Nothing is added until the user adds it. */
export interface LoreSuggestion {
    name: string;
    keywords: string[];
    text: string;
}

export const loreSuggestionsApi = {
    /** One background call: at most six suggestions, none already in the Story's Lore. */
    suggest: (storyId: number, chatId: number) =>
        apiSend<{ suggestions: LoreSuggestion[] }>('POST', `/stories/${storyId}/chats/${chatId}/lore-suggestions`),
};

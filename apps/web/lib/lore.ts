import { apiFetch } from './api';

// Mirrors the API's Lore in play DTO (apps/api/src/api/chat/dto/lore-in-play.response.dto.ts).

export interface LoreInPlayEntry {
    id: number;
    name: string;
    /** Sent on every turn, whether or not it comes up. */
    alwaysOn: boolean;
}

/** The Lore entries a turn would send now, as a Continue would (spec: "Lore in play"). */
export interface LoreInPlay {
    entries: LoreInPlayEntry[];
}

export const loreApi = {
    inPlay: (storyId: number, chatId: number) => apiFetch<LoreInPlay>(`/stories/${storyId}/chats/${chatId}/lore`),
};

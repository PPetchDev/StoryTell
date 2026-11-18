import { apiFetch, apiSend } from './api';
import type { Chat } from './chat';

// Mirrors the API's Chapters DTO (apps/api/src/api/chapters/dto/chapters.dto.ts), .scratch/scene-chapters/spec.md.

/** Written; being written now; waiting for a coming turn; failed, for Try again; or nothing played in it. */
export type ChapterStatus = 'written' | 'writing' | 'waiting' | 'failed' | 'empty';

/** One ended Chapter: the part of the Chat played in one Scene. */
export interface Chapter {
    /** The id of the Scene advance that ended it. */
    id: number;
    number: number;
    /** The Scene it was played in. */
    sceneName: string;
    /** The Scene it led to; null for free play. */
    toSceneName: string | null;
    movedBy: 'judge' | 'user';
    event: string;
    messageId: number;
    endedAt: string;
    summary: string | null;
    writtenBy: 'ai' | 'user';
    status: ChapterStatus;
    failedReason: string | null;
}

export interface Chapters {
    /** The Chapter under way, and the Scene it is in (null in free play). */
    current: { number: number; scene: { id: number; name: string } | null };
    /** Every ended Chapter, oldest first. */
    chapters: Chapter[];
}

const chat = (storyId: number, chatId: number) => `/stories/${storyId}/chats/${chatId}`;

export const chaptersApi = {
    list: (storyId: number, chatId: number) => apiFetch<Chapters>(`${chat(storyId, chatId)}/chapters`),
    /** The user's own summary; the AI never writes over it. */
    save: (storyId: number, chatId: number, chapterId: number, text: string) =>
        apiSend<Chapters>('PUT', `${chat(storyId, chatId)}/chapters/${chapterId}`, { text }),
    /** Writes a failed Chapter again, in the background. */
    retry: (storyId: number, chatId: number, chapterId: number) => apiSend<Chapters>('POST', `${chat(storyId, chatId)}/chapters/${chapterId}/write`),
    /** Move on: ends the current Scene, to `toSceneId` or into free play (null). Answers with the Chat. */
    moveOn: (storyId: number, chatId: number, toSceneId: number | null) => apiSend<Chat>('POST', `${chat(storyId, chatId)}/scene`, { toSceneId }),
};

/** The Scene Move on preselects: the next in order, free play after the last, the first from free play. */
export function defaultMoveTarget(scenes: readonly { id: number }[], currentSceneId: number | null): number | null {
    const index = scenes.findIndex((scene) => scene.id === currentSceneId);
    if (index === -1) return scenes[0]?.id ?? null;
    return scenes[index + 1]?.id ?? null;
}

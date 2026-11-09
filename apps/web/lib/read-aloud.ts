import { apiAudio, ApiError, apiFetch, ApiUnreachableError } from './api';

/** One item of a Message's play queue (.scratch/read-aloud/spec.md, "Audio cache"): no text, just where it is read from. */
export interface SpeechItem {
    index: number;
    /** The part of the Message it is read from. */
    partIndex: number;
    /** A narration item's paragraph within its part's shown text, as the thread splits it; null for speech. */
    paragraph: number | null;
    voice: string;
    characters: number;
    /** Its audio is on the API's disk: playing it costs nothing. */
    cached: boolean;
}

const speechPath = (storyId: number, chatId: number, messageId: number) => `/stories/${storyId}/chats/${chatId}/messages/${messageId}/speech`;

export const readAloudApi = {
    /** The queue as the Message reads now, Replace rules and voices applied. Makes no call to a model. */
    queue: async (storyId: number, chatId: number, messageId: number): Promise<SpeechItem[]> =>
        (await apiFetch<{ items: SpeechItem[] }>(speechPath(storyId, chatId, messageId))).items,
    /** One item's audio: from the API's disk when it is there, else made once and kept. */
    item: (storyId: number, chatId: number, messageId: number, index: number, signal?: AbortSignal): Promise<Blob> =>
        apiAudio(`${speechPath(storyId, chatId, messageId)}/${index}`, signal),
};

const OUT_OF_VENICE_CREDIT = '402.001.004';
const SPEECH_ITEM_NOT_FOUND = '404.004.023';
const MODEL_REFUSED = '422.001.002';

/** Why a reading stopped, as the line under the Message says it ("Couldn't read this aloud: …"). */
export function readAloudError(error: unknown): string {
    if (error instanceof ApiError && error.code === OUT_OF_VENICE_CREDIT) return "Out of Venice credit: replies you've already heard still play.";
    if (error instanceof ApiUnreachableError) return "Couldn't read this aloud: can't reach the Storytell API.";
    if (error instanceof ApiError && error.code === SPEECH_ITEM_NOT_FOUND) return "Couldn't read this aloud: the Message changed. Try again.";
    if (error instanceof ApiError && error.code === MODEL_REFUSED) return "Couldn't read this aloud: Venice refused this text.";
    const reason = error instanceof Error && error.message ? error.message : 'something went wrong.';
    return `Couldn't read this aloud: ${reason}`;
}

import { apiSend } from './api';
import { MissingField } from './story';

// Mirrors the API's Chat response DTOs (apps/api/src/api/chat/dto/chat.response.dto.ts).

export interface ChatSummary {
    id: number;
    storyId: number;
    title: string;
    createdAt: string;
    lastPlayedAt: string;
}

export type MessagePart =
    | { kind: 'narration'; text: string }
    | { kind: 'speech'; characterId: number | null; speakerName: string; text: string };

export interface UserMessage {
    id: number;
    kind: 'user';
    text: string;
    identityName: string;
    createdAt: string;
}

export interface AiMessage {
    id: number;
    kind: 'ai';
    /** "author" for the Opening. */
    model: string;
    parts: MessagePart[];
    createdAt: string;
}

export type Message = UserMessage | AiMessage;

export interface Chat extends ChatSummary {
    currentScene: { id: number; name: string } | null;
    identityName: string;
    messages: Message[];
    /** The last Message is a User Message whose turn failed: show Retry. */
    awaitingReply: boolean;
    playable: boolean;
    missing: MissingField[];
    textCreditOut: boolean;
    playModel: string;
    drift: { lastModel: string; playModel: string } | null;
}

/** Writes answer with the whole Chat; the list and the Chat itself are read with useApiQuery. */
export const chatApi = {
    create: (storyId: number) => apiSend<Chat>('POST', `/stories/${storyId}/chats`),
    rename: (storyId: number, chatId: number, title: string) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { title }),
    remove: (storyId: number, chatId: number) => apiSend<void>('DELETE', `/stories/${storyId}/chats/${chatId}`),
    send: (storyId: number, chatId: number, text: string) =>
        apiSend<Chat>('POST', `/stories/${storyId}/chats/${chatId}/messages`, { text }),
    retry: (storyId: number, chatId: number) => apiSend<Chat>('POST', `/stories/${storyId}/chats/${chatId}/retry`),
    /** Rewrites a Message and discards every Message after it; a User Message gets a new reply. */
    edit: (storyId: number, chatId: number, messageId: number, text: string) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}/messages/${messageId}`, { text }),
    /** Clears every Message and copies the current Opening in again. */
    reset: (storyId: number, chatId: number) => apiSend<Chat>('POST', `/stories/${storyId}/chats/${chatId}/reset`),
};

/** An AI Message as `@Name:` text, the form the edit box shows and the API re-splits. */
export function messageText(message: Message): string {
    if (message.kind === 'user') return message.text;
    return message.parts
        .map((part) => (part.kind === 'speech' ? `@${part.speakerName}: ${part.text}` : part.text))
        .join('\n\n');
}

const MODEL_LABELS: Record<string, string> = {
    'glm-5.3': 'GLM-5.3',
    'deepseek-v4-pro': 'DeepSeek V4 Pro',
};

export function modelLabel(model: string): string {
    return MODEL_LABELS[model] ?? model;
}

export function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

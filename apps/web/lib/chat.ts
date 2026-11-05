import { apiSend, apiSendStream } from './api';
import { MissingField } from './story';

// Mirrors the API's Chat response DTOs (apps/api/src/api/chat/dto/chat.response.dto.ts).

export interface ChatSummary {
    id: number;
    storyId: number;
    title: string;
    createdAt: string;
    lastPlayedAt: string;
}

/** A Chat as a Story's Chat list shows it (mirrors ChatListItemDTO). */
export interface ChatListItem extends ChatSummary {
    /** The Scene the Chat is on; null for free play. */
    sceneName: string | null;
    /** The latest Message as one plain line of about 100 characters. */
    latestLine: string;
}

export type MessagePart =
    | { kind: 'narration'; text: string }
    | { kind: 'speech'; characterId: number | null; speakerName: string; text: string };

export interface UserMessage {
    id: number;
    kind: 'user';
    text: string;
    /** The identity worn when it was written, stamped: kept after a Persona is renamed or deleted. */
    identityName: string;
    /** The Persona worn; null for the Role and once that Persona is deleted. */
    personaId: number | null;
    createdAt: string;
}

export type BackgroundStatus = 'pending' | 'done' | 'failed';

export interface BackgroundCall {
    status: BackgroundStatus;
    error: string | null;
}

export interface AiMessage {
    id: number;
    kind: 'ai';
    /** "author" for the Opening. */
    model: string;
    parts: MessagePart[];
    /** The Bond, Arc and Scene judge; null on the Opening, which is never judged. */
    judge: BackgroundCall | null;
    /** Memory extraction; null on the Opening and on replies from before it existed. */
    memory: BackgroundCall | null;
    createdAt: string;
}

export type Message = UserMessage | AiMessage;

/** Where the Chat's story is in the day (CONTEXT.md: "Time of day"). */
export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

export interface Chat extends ChatSummary {
    currentScene: { id: number; name: string } | null;
    /** null until the story makes the time of day clear. */
    timeOfDay: TimeOfDay | null;
    /** The worn identity, under which the next User Message shows. */
    identityName: string;
    /** The worn Persona; null while the Chat wears its Story's Role. */
    personaId: number | null;
    roleName: string;
    messages: Message[];
    /** The last Message is a User Message whose turn failed: show Retry. */
    awaitingReply: boolean;
    playable: boolean;
    missing: MissingField[];
    textCreditOut: boolean;
    /** Image credit is used up: only the camera is off. */
    imageCreditOut: boolean;
    playModel: string;
    drift: { lastModel: string; playModel: string } | null;
}

export interface RollbackCounts {
    memoryChanges: number;
    bondChanges: number;
    arcSteps: number;
    sceneAdvances: number;
}

/** An edit, or ↺ Again, answers with the Chat plus what the rewind rolled back. */
export interface EditedChat extends Chat {
    rolledBack: RollbackCounts;
}

export interface BondChange {
    id: number;
    fromCharacterId: number;
    toCharacterId: number | null;
    label: string;
    description: string;
    before: { label: string; description: string } | null;
    /** null for a StartingBond seed. */
    event: string | null;
    /** null for a StartingBond seed. */
    messageId: number | null;
    createdAt: string;
}

export interface DashboardBond {
    toward: { characterId: number | null; name: string };
    label: string;
    description: string;
    /** Newest first. */
    history: BondChange[];
}

export interface ArcStep {
    id: number;
    characterId: number;
    step: string;
    event: string;
    messageId: number;
    createdAt: string;
}

export interface DashboardCharacter {
    id: number;
    name: string;
    bonds: DashboardBond[];
    arcSteps: ArcStep[];
    arcDirection: string;
}

export interface SceneAdvance {
    id: number;
    fromSceneName: string;
    toSceneName: string | null;
    event: string;
    messageId: number;
    createdAt: string;
}

export interface DashboardBackground {
    messageId: number;
    position: number;
    judge: BackgroundCall;
    memory: BackgroundCall | null;
}

/** The read-only dashboard (mirrors ChatDashboardResponseBodyDTO). */
export interface ChatDashboard {
    chatId: number;
    storyId: number;
    title: string;
    identityName: string;
    characters: DashboardCharacter[];
    scene: { current: { id: number; name: string } | null; advance: SceneAdvance | null };
    background: DashboardBackground[];
}

/**
 * A Suggested reply (spec: "Suggested replies"): something the worn identity does, a line it
 * says, or a bold move that pushes the story on. It only fills the composer.
 */
export interface SuggestedReply {
    kind: 'action' | 'speech' | 'move';
    text: string;
}

/**
 * A turn asked for as a stream (spec: streaming replies): each `parts` event is the whole
 * reply so far, and aborting `signal` stops it (Stop). The answer is the same Chat either way.
 */
export interface TurnStream {
    signal: AbortSignal;
    onParts(parts: MessagePart[]): void;
}

/** A turn write: streamed when `stream` is given, else answered once as JSON. */
function turn<T>(method: 'POST' | 'PATCH', path: string, body: object | undefined, stream?: TurnStream): Promise<T> {
    if (!stream) return apiSend<T>(method, path, body);
    return apiSendStream<T>(method, path, body, {
        signal: stream.signal,
        onEvent: (event, data) => {
            if (event === 'parts') stream.onParts((data as { parts: MessagePart[] }).parts);
        },
    });
}

/** Writes answer with the whole Chat; the list and the Chat itself are read with useApiQuery. */
export const chatApi = {
    create: (storyId: number) => apiSend<Chat>('POST', `/stories/${storyId}/chats`),
    rename: (storyId: number, chatId: number, title: string) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { title }),
    remove: (storyId: number, chatId: number) => apiSend<void>('DELETE', `/stories/${storyId}/chats/${chatId}`),
    send: (storyId: number, chatId: number, text: string, stream?: TurnStream) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/messages`, { text }, stream),
    retry: (storyId: number, chatId: number, stream?: TurnStream) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/retry`, undefined, stream),
    /** Lets the story go on without a line from the user: the Narrator writes the next reply. */
    continue: (storyId: number, chatId: number, stream?: TurnStream) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/continue`, undefined, stream),
    /** Three things the user might write next, as the worn identity. Nothing is stored. */
    suggest: (storyId: number, chatId: number) =>
        apiSend<{ suggestions: SuggestedReply[] }>('POST', `/stories/${storyId}/chats/${chatId}/suggestions`),
    /**
     * Rewrites a Message, discards every Message after it and rolls back their changes; a
     * User Message gets a new reply, an AI Message is judged again.
     */
    edit: (storyId: number, chatId: number, messageId: number, text: string, stream?: TurnStream) =>
        turn<EditedChat>('PATCH', `/stories/${storyId}/chats/${chatId}/messages/${messageId}`, { text }, stream),
    /**
     * ↺ Again: replaces the newest AI Message with a freshly written one, rolling back its
     * changes like an edit. A failed turn has already removed the old reply.
     */
    regenerate: (storyId: number, chatId: number, messageId: number, stream?: TurnStream) =>
        turn<EditedChat>('POST', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/regenerate`, undefined, stream),
    /** Wears a Persona, or the Story's Role for null, from the next User Message on. */
    swapIdentity: (storyId: number, chatId: number, personaId: number | null) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/identity`, { personaId }),
    /** Clears every Message and copies the current Opening in again. */
    reset: (storyId: number, chatId: number) => apiSend<Chat>('POST', `/stories/${storyId}/chats/${chatId}/reset`),
    /** Runs the failed Bond, Arc and Scene judge of the latest AI Message again. Answers with the dashboard. */
    retryJudge: (storyId: number, chatId: number, messageId: number) =>
        apiSend<ChatDashboard>('POST', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/judge`),
    /** Runs the failed Memory extraction of the latest AI Message again. Answers with the dashboard. */
    retryExtraction: (storyId: number, chatId: number, messageId: number) =>
        apiSend<ChatDashboard>('POST', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/memory`),
};

/** The Opening's copy in a Chat: the AI Message the author wrote (model "author"), not a model. */
export function isOpening(message: Message): boolean {
    return message.kind === 'ai' && message.model === 'author';
}

/** The latest AI Message a model wrote, whose background calls may still be pending or have failed. */
export function latestReply(chat: Chat): AiMessage | null {
    for (let i = chat.messages.length - 1; i >= 0; i--) {
        const message = chat.messages[i];
        if (message.kind === 'ai' && (message.judge || message.memory)) return message;
    }
    return null;
}

/** True while either background call of the latest reply is still running. */
export function backgroundPending(chat: Chat): boolean {
    const reply = latestReply(chat);
    return reply?.judge?.status === 'pending' || reply?.memory?.status === 'pending';
}

/** Where a dashboard item's causing Message is on the Chat screen. */
export function messageHref(storyId: number, chatId: number, messageId: number): string {
    return `/stories/${storyId}/chats/${chatId}#message-${messageId}`;
}

/** The rollback notice (spec: story 75), or null when nothing was rolled back. */
export function rollbackNotice(counts: RollbackCounts): string | null {
    const parts = [
        [counts.memoryChanges, 'Memory change', 'Memory changes'],
        [counts.bondChanges, 'Bond change', 'Bond changes'],
        [counts.arcSteps, 'Arc step', 'Arc steps'],
        [counts.sceneAdvances, 'Scene advance', 'Scene advances'],
    ] as const;
    const named = parts.filter(([n]) => n > 0).map(([n, one, many]) => `${n} ${n === 1 ? one : many}`);
    return named.length === 0 ? null : `Rolled back: ${named.join(', ')}.`;
}

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

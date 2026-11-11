import { apiFetch, apiSend, apiSendStream } from './api';
import type { Belief } from './memory';
import type { BondLevels } from './bonds';
import type { Emotion } from './expressions';
import { MissingField } from './story';
import type { TraySavedReply } from './saved-replies';
import type { ChatReplaceRule } from './replace-rules';

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
    /** Shown as "Branched from <title>"; null when never branched, or once that Chat is deleted. */
    branchedFrom: { chatId: number; title: string } | null;
}

export type MessagePart =
    | { kind: 'narration'; text: string }
    | {
          kind: 'speech';
          characterId: number | null;
          speakerName: string;
          text: string;
          /** What the Judge tagged the line with (.scratch/expressions/spec.md); null until then. */
          emotion: Emotion | null;
      };

export interface UserMessage {
    id: number;
    kind: 'user';
    text: string;
    /** The identity worn when it was written, stamped: kept after a Persona is renamed or deleted. */
    identityName: string;
    /** The Persona worn; null for the Role and once that Persona is deleted. */
    personaId: number | null;
    createdAt: string;
    /** Its Thai reading for the text as it stands; null when none was made (.scratch/write-for-me/spec.md). */
    thaiReading: string | null;
}

export type BackgroundStatus = 'pending' | 'done' | 'failed';

export interface BackgroundCall {
    status: BackgroundStatus;
    error: string | null;
}

/** Where the shown Reply version stands: the n and m of ‹ n/m › (.scratch/swipe/spec.md). */
export interface ReplyVersions {
    /** 1-based, in the order the versions were written. */
    current: number;
    count: number;
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
    /** Its Reply versions; null while it has only one. Only the newest AI Message has more. */
    versions: ReplyVersions | null;
    createdAt: string;
    /** Its Thai reading for the text as it stands; null when none was made (.scratch/write-for-me/spec.md). */
    thaiReading: string | null;
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
    /** Both names come from the API; a model that has left the list shows its stored id. */
    drift: { lastModel: string; playModel: string; lastModelLabel: string; playModelLabel: string } | null;
    /** The Chat menu's link back to where a Branch came from: null when never branched, or once that Chat is deleted. */
    branchedFrom: { chatId: number; title: string; messageId: number | null } | null;
    /** The Author's note: the user's standing direction for this Chat; empty when there is none. */
    authorsNote: string;
    /** Read replies aloud: new replies of turns started in this tab play by themselves. Off by default. */
    autoRead: boolean;
    /** The ids of the Characters sitting out of this Chat's turns, in cast order; empty when everyone is in. */
    sittingOut: number[];
    /** The composer tray's Saved replies: the Story's own, then the app-wide ones, each in add order. */
    savedReplies: TraySavedReply[];
    /** The Chat's Replace rules in apply order, app-wide then the Story's; parked ones left out. */
    replaceRules: ChatReplaceRule[];
    /** Every current Bond in the Chat. */
    bonds: ChatBond[];
    /** The Memories and Beliefs the last turn sent, shown as "In play" in the Memory drawer; empty before any turn. */
    memoriesInPlay: MemoriesInPlay;
    /** Every Belief of the Chat, given-up ones included, oldest first. */
    beliefs: Belief[];
}

/** What the last turn's Memory choice sent, by id. */
export interface MemoriesInPlay {
    memoryIds: number[];
    beliefIds: number[];
}

/** A current Bond as the Chat reads it: its direction, label and levels. */
export interface ChatBond {
    fromCharacterId: number;
    /** null means toward the user. */
    toCharacterId: number | null;
    label: string;
    /** null while the Bond has no levels yet ("Not measured yet"). */
    levels: BondLevels | null;
}

export interface RollbackCounts {
    memoryChanges: number;
    bondChanges: number;
    arcSteps: number;
    sceneAdvances: number;
}

/** A Branch answers with the new Chat, plus the User Message's text when it was branched from one. */
export interface BranchedChat extends Chat {
    draft: string | null;
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
    /** Its current levels; null while it has none yet. */
    levels: BondLevels | null;
    /** Newest first. */
    history: BondChange[];
    /** The same changes oldest first, as the Bond chart draws them. */
    trend: BondTrendPoint[];
}

/** One change of a Bond, as a point on its chart (.scratch/bond-axes/spec.md, "The Dashboard"). */
export interface BondTrendPoint {
    /** The change, as the history lists it. */
    id: number;
    /** The causing Message; null for the seed. */
    messageId: number | null;
    /** That Message's place in the Chat; null for the seed, which stands at the start. */
    position: number | null;
    /** null while the Bond had no levels. */
    levels: BondLevels | null;
    /** The label changed here: a pin on the chart. */
    labelChanged: boolean;
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
    /** The newest Message's place in the Chat: where the Bond charts end. */
    lastPosition: number;
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

/**
 * The Character nudged for a turn (.scratch/speaker-controls/spec.md, "Nudge") as the turn's body
 * field; with none the request is exactly as before, so Retry, Continue and Again send no body.
 */
function withNudge(body: object | undefined, nudge: number | null | undefined): object | undefined {
    return nudge === null || nudge === undefined ? body : { ...body, nudgeCharacterId: nudge };
}

/** The file name a recording is sent under: the API reads the type from its bytes, but a name helps logs. */
function recordingExtension(mimeType: string): string {
    if (mimeType.startsWith('audio/mp4')) return 'm4a';
    if (mimeType.startsWith('audio/ogg')) return 'ogg';
    if (mimeType.startsWith('audio/wav')) return 'wav';
    return 'webm';
}

/** Writes answer with the whole Chat; the list and the Chat itself are read with useApiQuery. */
export const chatApi = {
    create: (storyId: number) => apiSend<Chat>('POST', `/stories/${storyId}/chats`),
    rename: (storyId: number, chatId: number, title: string) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { title }),
    /** Read replies aloud (.scratch/read-aloud/spec.md, "Auto-read"), on or off. */
    setAutoRead: (storyId: number, chatId: number, autoRead: boolean) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { autoRead }),
    /** Sets the Author's note, read from the next turn on; an empty text clears it. */
    setAuthorsNote: (storyId: number, chatId: number, text: string) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/authors-note`, { text }),
    /** Replaces who is sitting out, read from the next turn on; an empty list brings everyone back. */
    setSittingOut: (storyId: number, chatId: number, characterIds: number[]) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/sitting-out`, { characterIds }),
    remove: (storyId: number, chatId: number) => apiSend<void>('DELETE', `/stories/${storyId}/chats/${chatId}`),
    send: (storyId: number, chatId: number, text: string, stream?: TurnStream, nudge?: number | null) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/messages`, withNudge({ text }, nudge), stream),
    retry: (storyId: number, chatId: number, stream?: TurnStream, nudge?: number | null) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/retry`, withNudge(undefined, nudge), stream),
    /** Lets the story go on without a line from the user: the Narrator writes the next reply. */
    continue: (storyId: number, chatId: number, stream?: TurnStream, nudge?: number | null) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/continue`, withNudge(undefined, nudge), stream),
    /** Three things the user might write next, as the worn identity. Nothing is stored. */
    suggest: (storyId: number, chatId: number) =>
        apiSend<{ suggestions: SuggestedReply[] }>('POST', `/stories/${storyId}/chats/${chatId}/suggestions`),
    /** The user's next Message in English, as the worn identity, from the composer's draft (or from nothing). Nothing is stored. */
    writeForMe: (storyId: number, chatId: number, draft: string) =>
        apiSend<{ text: string }>('POST', `/stories/${storyId}/chats/${chatId}/write-for-me`, { draft }),
    /** .scratch/dictation/spec.md: a recording's text, for the composer. Nothing is stored, the audio included. */
    dictate: (storyId: number, chatId: number, recording: Blob, language: 'th' | 'en', durationMs: number) => {
        const form = new FormData();
        form.append('audio', recording, `dictation.${recordingExtension(recording.type)}`);
        form.append('language', language);
        form.append('durationMs', String(Math.round(durationMs)));
        return apiFetch<{ text: string }>(`/stories/${storyId}/chats/${chatId}/dictation`, { method: 'POST', body: form });
    },
    /** The Message's stored text in Thai, made once by the background model and kept. */
    thaiReading: (storyId: number, chatId: number, messageId: number) =>
        apiSend<{ messageId: number; text: string }>('POST', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/thai-reading`),
    /**
     * Rewrites a Message, discards every Message after it and rolls back their changes; a
     * User Message gets a new reply, an AI Message is judged again.
     */
    edit: (storyId: number, chatId: number, messageId: number, text: string, stream?: TurnStream, nudge?: number | null) =>
        turn<EditedChat>('PATCH', `/stories/${storyId}/chats/${chatId}/messages/${messageId}`, withNudge({ text }, nudge), stream),
    /**
     * ↺ Again: writes the newest AI Message again, rolling back its changes like an edit; the
     * replaced reply is kept as a Reply version. A failed turn keeps the reply it had.
     */
    regenerate: (storyId: number, chatId: number, messageId: number, stream?: TurnStream, nudge?: number | null) =>
        turn<EditedChat>('POST', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/regenerate`, withNudge(undefined, nudge), stream),
    /**
     * Shows another Reply version of the newest AI Message: what the shown one changed is rolled
     * back, and the chosen one is judged and extracted from again.
     */
    chooseVersion: (storyId: number, chatId: number, messageId: number, version: number) =>
        apiSend<EditedChat>('PUT', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/version`, { version }),
    /** Wears a Persona, or the Story's Role for null, from the next User Message on. */
    swapIdentity: (storyId: number, chatId: number, personaId: number | null) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/identity`, { personaId }),
    /**
     * ⑂ Branch: a new Chat holding this Chat's Messages up to this one (up to the one before it,
     * for a User Message, whose text comes back as `draft`). No model is called.
     */
    branch: (storyId: number, chatId: number, messageId: number) =>
        apiSend<BranchedChat>('POST', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/branch`),
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

/**
 * The one notice for what didn't save in the background (.scratch/background-retry/spec.md):
 * the latest reply's calls whose automatic retry failed too, and the Chat's failed Snapshots,
 * in plain words. Null when nothing failed. Only a reply's call holds the next send.
 */
export function backgroundNotice(chat: Chat, failedSnapshots: number): string | null {
    const reply = latestReply(chat);
    const judge = reply?.judge?.status === 'failed';
    const memory = reply?.memory?.status === 'failed';
    const sentences: string[] = [];
    if (judge && memory) sentences.push("Couldn't save the Memories, feelings and Scene from that reply.");
    else if (memory) sentences.push("Couldn't save the Memories from that reply.");
    else if (judge) sentences.push("Couldn't save the feelings and the Scene from that reply.");
    if (failedSnapshots === 1) sentences.push("Couldn't make the Snapshot.");
    else if (failedSnapshots > 1) sentences.push(`Couldn't make ${failedSnapshots} Snapshots.`);
    if (judge || memory) sentences.push("Sending waits until it's saved.");
    return sentences.length === 0 ? null : sentences.join(' ');
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

export function formatWhen(iso: string): string {
    return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

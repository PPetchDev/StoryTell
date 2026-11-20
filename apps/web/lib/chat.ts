import { apiFetch, apiSend } from './api';
import { resumableTurn } from './turn-stream';
import type { Belief } from './memory';
import type { BondLevels } from './bonds';
import type { Emotion, Expression, ExpressionEmotion } from './expressions';
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
    /** The Ending the Chat reached (CONTEXT.md, "Ending"), its id null for one the AI suggested; null when it reached none. */
    ending: { id: number | null; name: string } | null;
}

/** A Story's Chats, and the Endings they have found between them (mirrors ListChatsResponseBodyDTO). */
export interface ChatListResponse {
    chats: ChatListItem[];
    endings: { total: number; found: Array<{ id: number; name: string }> };
}

/** The Ending a Chat reached, as the Chat screen shows it (mirrors ChatEndingDTO). */
export interface ChatEnding {
    /** The author's Ending; null for one the AI suggested. */
    id: number | null;
    name: string;
    /** The AI suggested it, in a Story with no Endings of its own: the user may say "Not yet". */
    suggested: boolean;
    /** What brought the story there, in a sentence; may be empty. */
    reason: string;
    /** The AI Message the story reached it with. */
    messageId: number;
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
    /** The Roll it was sent with (CONTEXT.md, "Roll"); null without one. */
    roll: MessageRoll | null;
    /** The face it was written with, picked or guessed by the Judge (.scratch/your-faces/spec.md); null or left out without one. */
    face?: { emotion: ExpressionEmotion; by: 'user' | 'judge' } | null;
    createdAt: string;
    /** Its Thai reading for the text as it stands; null when none was made (.scratch/write-for-me/spec.md). */
    thaiReading: string | null;
}

export type RollOutcome = 'critical_success' | 'success' | 'failure' | 'critical_failure';

/** A User Message's Roll: what the d20 showed, the number to reach, and how it came out. */
export interface MessageRoll {
    value: number;
    target: number;
    outcome: RollOutcome;
    /** The Role's Stat it was made for and the number it added (CONTEXT.md, "Stat"); left out without one. */
    stat?: RollStat;
}

/** A Stat added to a Roll, or the one a Roll offer names, with its number. */
export interface RollStat {
    name: string;
    bonus: number;
}

/** The Roll the Judge offers for the next Message (CONTEXT.md, "Roll offer"; .scratch/judge-rolls/spec.md). */
export interface RollOffer {
    /** One short question to the user: what is at stake. */
    stakes: string;
    /** The Role's Stat that applies, with its number now; null for none. */
    stat: RollStat | null;
}

/** "+2" or "-1": how a Stat's number reads beside its name. */
export function signedStat(value: number): string {
    return value < 0 ? `${value}` : `+${value}`;
}

export const ROLL_OUTCOME_LABELS: Record<RollOutcome, string> = {
    critical_success: 'Critical success',
    success: 'Success',
    failure: 'Failure',
    critical_failure: 'Critical failure',
};

/** The Chat's Sudden event as the Chat screen shows it (mirrors ChatSuddenEventDTO). */
export interface ChatSuddenEvent {
    id: number;
    name: string;
    /** What the Gauge measures. */
    gauge: string;
    direction: 'lower' | 'raise';
    /** Under way, or how it ended with the newest reply. */
    status: 'active' | 'success' | 'failure';
    /** The Gauge now, 0 to 100. */
    value: number;
    start: number;
    /** The Gauge the user must reach. */
    goal: number;
    /** The end of the Gauge that fails at once. */
    fail: number;
    /** The replies the user still has; 0 once it has ended. */
    turnsLeft: number;
    /** Why the Gauge last moved, or why the event began; may be empty. */
    reason: string;
}

/**
 * A Sudden event the story made up and proposes now (.scratch/ai-events/spec.md), for the user to
 * start or decline (mirrors ChatEventProposalDTO).
 */
export interface ChatEventProposal {
    id: number;
    name: string;
    /** What is happening now, in a sentence. */
    trigger: string;
    /** What the Gauge measures. */
    gauge: string;
    direction: 'lower' | 'raise';
    /** How many replies the user gets. */
    turns: number;
    /** Where the Gauge starts. */
    start: number;
    /** The Gauge the user must reach. */
    goal: number;
    /** The end of the Gauge that fails at once. */
    fail: number;
    /** Why the story proposes it now; may be empty. */
    reason: string;
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
    /** Whether it was written as the story's Epilogue (CONTEXT.md, "Epilogue"). */
    epilogue: boolean;
    /** Whether a Character sent it on their own while the user was away (.scratch/reach-outs/spec.md). */
    reachOut?: boolean;
    createdAt: string;
    /** Its Thai reading for the text as it stands; null when none was made (.scratch/write-for-me/spec.md). */
    thaiReading: string | null;
    /** What each Character thought before it (.scratch/character-minds/spec.md), shown only on a tap; empty or absent for none. */
    thoughts?: MessageThought[];
}

/** One Character's Thought before a reply. */
export interface MessageThought {
    characterId: number;
    characterName: string;
    text: string;
}

export type Message = UserMessage | AiMessage;

/** Where the Chat's story is in the day (CONTEXT.md: "Time of day"). */
export type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

export interface Chat extends ChatSummary {
    currentScene: { id: number; name: string } | null;
    /** null until the story makes the time of day clear. */
    timeOfDay: TimeOfDay | null;
    /** The Sudden event under way, or the one that ended with the newest reply; null otherwise. */
    suddenEvent: ChatSuddenEvent | null;
    /** A Sudden event the story made up and proposes now; null otherwise. */
    eventProposal: ChatEventProposal | null;
    /** The Ending the Chat reached; null when it reached none. */
    ending: ChatEnding | null;
    /** Whether the Judge may suggest an Ending here; null when the Story has Endings of its author's (then it suggests none). */
    endingSuggestions: boolean | null;
    /** Whether the Characters write Diary entries by themselves as the story goes (.scratch/diary/spec.md). */
    autoDiary: boolean;
    /** Whether the stage is dressed as the story goes (.scratch/dressed-stage/spec.md). Off by default. */
    dressStage?: boolean;
    /** What the dressed stage shows now; null (or left out) with the switch off. */
    stage?: ChatStage | null;
    /** Whether each Character thinks on their own before a reply (.scratch/character-minds/spec.md). */
    characterThoughts: boolean;
    /** What each Character is after now, for those who are after something (.scratch/character-minds/spec.md). */
    goals?: Array<{ characterId: number; goal: string }>;
    /** What has lastingly changed about each Character in this Chat (.scratch/growing-cards/spec.md), for those with a Now note; `note` with `{user}`. */
    nowNotes?: Array<{ characterId: number; note: string }>;
    /** The Chat's Established facts (.scratch/facts-panel/spec.md), in the order their topics were first set; `byUser` for the user's own telling. */
    facts?: ChatFact[];
    /** The Chat's Items (.scratch/story-items/spec.md), held and gone, in the order first recorded; `holder` is `{user}` for the user. */
    items?: ChatItem[];
    /** Entries are being written by themselves right now: the Chat screen re-reads until they are done. */
    diaryWriting: boolean;
    /** Each Character's newest Diary entry: a new one is shown as a toast. */
    diaryLatest: Array<{ characterId: number; entryId: number }>;
    /** The number a Roll sent now must reach, from the Story's Difficulty. */
    rollTarget: number;
    /** The Roll the Judge offers for the next Message; null when none is pending (.scratch/judge-rolls/spec.md). Left out by an older API. */
    rollOffer?: RollOffer | null;
    /** Where the story is now (CONTEXT.md, "Place"); null until the story makes it clear. */
    place: string | null;
    /** The weather in the story now; null until the story shows it. */
    weather: string | null;
    /** What each Character is wearing now (CONTEXT.md, "Outfit"), for those the story has shown, in cast order. */
    outfits: Array<{ characterId: number; outfit: string }>;
    /** The worn identity, under which the next User Message shows. */
    identityName: string;
    /** The worn Persona; null while the Chat wears its Story's Role. */
    personaId: number | null;
    /** The pictures of the Personas this Chat shows: the worn one and those its User Messages were written as, where they have one. */
    personaImages: Array<{ personaId: number; imagePath: string }>;
    /** The Role's picture, for your lines written as the Role (.scratch/role-image/spec.md); left out by an older API. */
    roleImagePath?: string | null;
    /** The Role's Expressions, for the faces of your lines written as the Role (.scratch/your-faces/spec.md); left out by an older API. */
    roleExpressions?: Expression[];
    /** The Expressions of the Personas in this Chat that have any; left out by an older API. */
    personaExpressions?: Array<{ personaId: number; expressions: Expression[] }>;
    roleName: string;
    /** What this Chat answered to its Story's Opening questions, by key; null when it was asked none. */
    openingAnswers?: Record<string, string> | null;
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
    /**
     * The Secrets this Chat has revealed (.scratch/secret-reveals/spec.md), in the order they came out,
     * each with the AI Message that told it. Never one not yet revealed. Left out by an older API.
     */
    secretReveals?: SecretReveal[];
}

/** A Secret the Chat has revealed: a "Secret revealed" card under its Message, and in the profile. */
export interface SecretReveal {
    secretId: number;
    characterId: number;
    messageId: number;
    text: string;
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

/** One change to a Character's Arc: what caused it and where, never the step's words (.scratch/arc-changes/spec.md). */
export interface ArcChange {
    /** The causing AI Message. */
    messageId: number;
    /** The story event that caused it. */
    cause: string;
    createdAt: string;
}

export interface DashboardCharacter {
    id: number;
    name: string;
    bonds: DashboardBond[];
    /** Every change to their Arc, in story order. The Arc direction is never given in play. */
    arcChanges: ArcChange[];
}

export interface SceneAdvance {
    id: number;
    fromSceneName: string;
    toSceneName: string | null;
    event: string;
    /** The Judge, or the user's Move on (.scratch/scene-chapters/spec.md). */
    movedBy: 'judge' | 'user';
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
 * A dropped stream is picked up again by itself (.scratch/resume-reply/spec.md), so `onParts`
 * may start again from the reply so far.
 */
export interface TurnStream {
    signal: AbortSignal;
    onParts(parts: MessagePart[]): void;
}

/** A turn write: streamed when `stream` is given, else answered once as JSON. */
function turn<T>(method: 'POST' | 'PATCH', path: string, body: object | undefined, stream?: TurnStream): Promise<T> {
    if (!stream) return apiSend<T>(method, path, body);
    return resumableTurn<T>(method, path, body, {
        signal: stream.signal,
        onEvent: (event, data) => {
            if (event === 'parts') stream.onParts((data as { parts: MessagePart[] }).parts);
        },
    });
}

/** One Established fact of a Chat (CONTEXT.md, .scratch/facts-panel/spec.md). */
export interface ChatFact {
    /** What it is about, such as "Nara's age". */
    topic: string;
    fact: string;
    /** The current telling is the user's own, set in the Facts panel. */
    byUser: boolean;
}

/** The limits of a fact (mirror FACT_TOPIC_MAX, FACT_TEXT_MAX and FACTS_MAX in apps/api/src/manager/chat/details/facts.ts). */
export const FACT_TOPIC_MAX = 60;
export const FACT_TEXT_MAX = 120;
export const FACTS_MAX = 40;

/** How an Item ended (CONTEXT.md, "Item"). */
export type ItemEnd = 'used' | 'lost' | 'destroyed';

/** One Item of a Chat (CONTEXT.md, .scratch/story-items/spec.md). */
export interface ChatItem {
    name: string;
    /** Who has it, or had it last: `{user}` for the user, a Character's name, or anyone or anywhere else. */
    holder: string;
    /** How it came to them, or how it ended; may be empty. */
    how: string;
    /** Null while it is held. */
    end: ItemEnd | null;
    /** The current record is the user's own, set in the Items sheet. */
    byUser: boolean;
}

/** How the user is stored as a holder (mirrors USER_HOLDER in apps/api/src/manager/chat/details/items.ts). */
export const USER_HOLDER = '{user}';
/** The limits of an Item (mirror ITEM_NAME_MAX, ITEM_HOLDER_MAX, ITEM_HOW_MAX and ITEMS_MAX in items.ts). */
export const ITEM_NAME_MAX = 60;
export const ITEM_HOLDER_MAX = 60;
export const ITEM_HOW_MAX = 80;
export const ITEMS_MAX = 30;

/** What the user sends to set an Item; `remove` deletes it. */
export interface ItemChange {
    name: string;
    holder?: string;
    how?: string;
    end?: ItemEnd | null;
    remove?: boolean;
}

/** The longest Cue the API takes (mirrors CUE_MAX in apps/api/src/manager/chat/turn/prompt.ts). */
export const CUE_MAX = 300;

/** What may ride on one turn besides its text: a Nudge and a Cue, neither stored, and on a send a Roll. */
export interface TurnExtras {
    /** The Character nudged for this turn (.scratch/speaker-controls/spec.md, "Nudge"). */
    nudge?: number | null;
    /** The Cue for this turn (CONTEXT.md, "Cue"): a few words to the Narrator for this one reply. */
    cue?: string | null;
    /** A send only (CONTEXT.md, "Roll"): the app throws the dice for what this Message attempts. */
    roll?: boolean;
    /** With `roll`: the Role's Stat the Roll is made for, from a Roll offer taken (.scratch/judge-rolls/spec.md). */
    rollStat?: string | null;
    /** A send only (.scratch/your-faces/spec.md): the face the user picked; the Narrator is told it. */
    face?: ExpressionEmotion | null;
}

/**
 * A turn's body with its extras; with none the request is exactly as before, so Retry, Continue
 * and Again send no body. A blank Cue is no Cue.
 */
function withExtras(body: object | undefined, extras: TurnExtras | undefined): object | undefined {
    const nudge = extras?.nudge;
    const cue = extras?.cue?.trim() ?? '';
    const nudged = nudge === null || nudge === undefined ? body : { ...body, nudgeCharacterId: nudge };
    return cue === '' ? nudged : { ...nudged, cue };
}

/** The file name a recording is sent under: the API reads the type from its bytes, but a name helps logs. */
function recordingExtension(mimeType: string): string {
    if (mimeType.startsWith('audio/mp4')) return 'm4a';
    if (mimeType.startsWith('audio/ogg')) return 'ogg';
    if (mimeType.startsWith('audio/wav')) return 'wav';
    return 'webm';
}

/** One entry of a Character's Diary in a Chat (CONTEXT.md, "Diary"). */
export interface DiaryEntry {
    id: number;
    characterId: number;
    /** The AI Message the story stood at when it was written. */
    messageId: number;
    /** When and where in the story ("Night, the lamp room"); null when the Chat knew neither. */
    moment: string | null;
    text: string;
    createdAt: string;
}

/** Writes answer with the whole Chat; the list and the Chat itself are read with useApiQuery. */
export const chatApi = {
    /** With `answers` for the Story's Opening questions; a blank or missing one takes its default. */
    create: (storyId: number, answers?: Record<string, string>) =>
        apiSend<Chat>('POST', `/stories/${storyId}/chats`, answers ? { answers } : undefined),
    rename: (storyId: number, chatId: number, title: string) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { title }),
    /** Read replies aloud (.scratch/read-aloud/spec.md, "Auto-read"), on or off. */
    setAutoRead: (storyId: number, chatId: number, autoRead: boolean) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { autoRead }),
    /** Whether the Judge may suggest an Ending in this Chat: "Not yet" turns it off, the Chat menu's switch sets it either way. */
    setEndingSuggestions: (storyId: number, chatId: number, endingSuggestions: boolean) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { endingSuggestions }),
    /** Whether each Character thinks before a reply in this Chat. */
    setCharacterThoughts: (storyId: number, chatId: number, characterThoughts: boolean) =>
        apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { characterThoughts }),
    /** Whether the Characters write Diary entries by themselves in this Chat. */
    setAutoDiary: (storyId: number, chatId: number, autoDiary: boolean) => apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { autoDiary }),
    /** Dresses the stage as the story goes, or stops (.scratch/dressed-stage/spec.md). */
    setDressStage: (storyId: number, chatId: number, dressStage: boolean) => apiSend<Chat>('PATCH', `/stories/${storyId}/chats/${chatId}`, { dressStage }),
    /** Sets the Author's note, read from the next turn on; an empty text clears it. */
    setAuthorsNote: (storyId: number, chatId: number, text: string) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/authors-note`, { text }),
    /** Sets the user's own Now note for one Character (.scratch/growing-cards/spec.md); an empty text clears it. */
    setNowNote: (storyId: number, chatId: number, characterId: number, text: string) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/characters/${characterId}/now`, { text }),
    /** Sets the user's own Established fact for a topic (.scratch/facts-panel/spec.md); an empty fact deletes it. */
    setFact: (storyId: number, chatId: number, topic: string, fact: string) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/facts`, { topic, fact }),
    /** Sets, ends or deletes the user's own Item (.scratch/story-items/spec.md). */
    setItem: (storyId: number, chatId: number, change: ItemChange) => apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/items`, change),
    /** Replaces who is sitting out, read from the next turn on; an empty list brings everyone back. */
    setSittingOut: (storyId: number, chatId: number, characterIds: number[]) =>
        apiSend<Chat>('PUT', `/stories/${storyId}/chats/${chatId}/sitting-out`, { characterIds }),
    remove: (storyId: number, chatId: number) => apiSend<void>('DELETE', `/stories/${storyId}/chats/${chatId}`),
    send: (storyId: number, chatId: number, text: string, stream?: TurnStream, extras?: TurnExtras) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/messages`, withExtras({ text, ...(extras?.roll ? { roll: true, ...(extras.rollStat ? { rollStat: extras.rollStat } : {}) } : {}), ...(extras?.face ? { face: extras.face } : {}) }, extras), stream),
    retry: (storyId: number, chatId: number, stream?: TurnStream, extras?: TurnExtras) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/retry`, withExtras(undefined, extras), stream),
    /** Lets the story go on without a line from the user: the Narrator writes the next reply. */
    continue: (storyId: number, chatId: number, stream?: TurnStream, extras?: TurnExtras) =>
        turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/continue`, withExtras(undefined, extras), stream),
    /** Closes the story: the Narrator writes its Epilogue, for the Ending reached or an end the user chose. An AI Message like any other. */
    epilogue: (storyId: number, chatId: number, stream?: TurnStream) => turn<Chat>('POST', `/stories/${storyId}/chats/${chatId}/epilogue`, undefined, stream),
    /** "Not yet": takes the Chat's suggested Ending away, and the AI suggests no more in this Chat. */
    dismissEnding: (storyId: number, chatId: number) => apiSend<Chat>('DELETE', `/stories/${storyId}/chats/${chatId}/ending`),
    /** "Not now" on a Roll offer (.scratch/judge-rolls/spec.md): it goes, and still counts for the gap between offers. */
    dismissRollOffer: (storyId: number, chatId: number) => apiSend<Chat>('DELETE', `/stories/${storyId}/chats/${chatId}/roll-offer`),
    /** Starts the Sudden event the story proposes now (.scratch/ai-events/spec.md). */
    acceptEventProposal: (storyId: number, chatId: number, eventId: number) =>
        apiSend<Chat>('POST', `/stories/${storyId}/chats/${chatId}/event-proposals/${eventId}/accept`),
    /** "Not now": declines it; it never shows again. */
    declineEventProposal: (storyId: number, chatId: number, eventId: number) =>
        apiSend<Chat>('POST', `/stories/${storyId}/chats/${chatId}/event-proposals/${eventId}/decline`),
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
    /** Every Diary entry of the Chat, all Characters', newest first. */
    diary: (storyId: number, chatId: number) => apiFetch<{ entries: DiaryEntry[] }>(`/stories/${storyId}/chats/${chatId}/diary`),
    /** Asks a Character for a Diary entry about the story since their last one. A model call; the entry is kept. */
    writeDiaryEntry: (storyId: number, chatId: number, characterId: number) =>
        apiSend<DiaryEntry>('POST', `/stories/${storyId}/chats/${chatId}/characters/${characterId}/diary`),
    deleteDiaryEntry: (storyId: number, chatId: number, entryId: number) =>
        apiSend<void>('DELETE', `/stories/${storyId}/chats/${chatId}/diary/${entryId}`),
    /**
     * Rewrites a Message, discards every Message after it and rolls back their changes; a
     * User Message gets a new reply, an AI Message is judged again.
     */
    edit: (storyId: number, chatId: number, messageId: number, text: string, stream?: TurnStream, extras?: TurnExtras) =>
        turn<EditedChat>('PATCH', `/stories/${storyId}/chats/${chatId}/messages/${messageId}`, withExtras({ text }, extras), stream),
    /**
     * ↺ Again: writes the newest AI Message again, rolling back its changes like an edit; the
     * replaced reply is kept as a Reply version. A failed turn keeps the reply it had.
     */
    regenerate: (storyId: number, chatId: number, messageId: number, stream?: TurnStream, extras?: TurnExtras) =>
        turn<EditedChat>('POST', `/stories/${storyId}/chats/${chatId}/messages/${messageId}/regenerate`, withExtras(undefined, extras), stream),
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
    // Diary entries written by themselves come after the reply's calls: the screen re-reads until they are in.
    return reply?.judge?.status === 'pending' || reply?.memory?.status === 'pending' || chat.diaryWriting === true;
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

/** One drawn emotion of a Character's outfit on the dressed stage (.scratch/dressed-stage/spec.md). */
export interface StageSprite {
    /** "neutral" for the plain drawing, else an Expression emotion. */
    emotion: string;
    imagePath: string;
    /** A cut-out, to stand on the stage; false when the cut-out failed. */
    cutOut: boolean;
}

/** What the dressed stage shows now (.scratch/dressed-stage/spec.md). */
export interface ChatStage {
    /** The place the Chat is in, drawn with no one in it; null for none yet. */
    placePicturePath: string | null;
    /** Each Character in an outfit drawn for this Chat, with its drawn emotions. */
    outfits: { characterId: number; sprites: StageSprite[] }[];
    /** The place at each change, oldest first, by the Message that made it (null picture: none drawn). */
    places?: { messageId: number | null; imagePath: string | null }[];
    /** Each Character's outfit at each change, oldest first: usual (their Expressions) or what is drawn. */
    outfitChanges?: { messageId: number | null; characterId: number; usual: boolean; sprites: StageSprite[] }[];
    /** How many drawings are under way. */
    drawing: number;
}

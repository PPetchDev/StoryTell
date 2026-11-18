import { BOND_AXES, BondLevels, bondLevelsInWords } from '../../../model/ledger/bond-axes.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { CastName, parseReply, ReplyPart } from '../turn/reply-parser.js';
import { estimateTokens } from '../turn/prompt.js';

/**
 * Reach-outs (.scratch/reach-outs/spec.md): a Character messages the user first, after the user has
 * been away from a Chat for the time its setting chose. Pure logic: quiet hours, who speaks, the
 * prompt and how its answer is read. The Chat manager checks the rules and stores the Message.
 */

/** The user's time zone: one for this Storytell, which has no per-Account zone yet. */
export const REACH_OUT_TIME_ZONE = 'Asia/Bangkok';
/** Quiet hours, local: from 22:00 to 08:00 no Reach-out is sent. */
export const QUIET_FROM_HOUR = 22;
export const QUIET_UNTIL_HOUR = 8;

/** Room for one short narration sentence and a line of about 50 words. */
export const REACH_OUT_MAX_TOKENS = 160;
/** The most of the latest story the Character reads, newest kept. */
export const REACH_OUT_STORY_TOKENS = 2_000;
/** The most of the Story so far they read. */
export const REACH_OUT_STORY_SO_FAR_CHARACTERS = 2_000;
/** The longest line an alert shows, as a reply alert's. */
export const REACH_OUT_ALERT_MAX = 120;

const hourFormat = new Intl.DateTimeFormat('en-GB', { timeZone: REACH_OUT_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' });

/** The hour, 0 to 23, at `now` in the user's time zone. */
export function localHour(now: Date): number {
    return Number(hourFormat.format(now)) % 24;
}

/** Whether `now` falls in quiet hours (22:00 to 08:00 in Asia/Bangkok). */
export function inQuietHours(now: Date): boolean {
    const hour = localHour(now);
    return hour >= QUIET_FROM_HOUR || hour < QUIET_UNTIL_HOUR;
}

/** One Character who may write, with their Bond toward the user and when they last spoke. */
export interface SpeakerCandidate {
    id: number;
    name: string;
    /** Their current Bond toward the user: its levels, or null for a Bond without any; undefined for no Bond. */
    bondLevels?: BondLevels | null;
    /** The position of the newest Message they spoke in; -1 for never. */
    lastSpokeAt: number;
}

/** How warmly a Bond feels toward the user: Trust + Affection + Desire. */
export function warmth(levels: BondLevels | null): number {
    if (!levels) return 0;
    return BOND_AXES.filter((axis) => axis !== 'tension').reduce((sum, axis) => sum + levels[axis], 0);
}

/**
 * Who writes the Reach-out: of those not sitting out, the warmest Bond toward the user (no Bond ranks
 * below any Bond), then whoever spoke most recently, then cast order. Null when nobody can.
 */
export function reachOutSpeaker(cast: readonly SpeakerCandidate[], sittingOut: readonly number[]): SpeakerCandidate | null {
    const out = new Set(sittingOut);
    const able = cast.map((member, order) => ({ member, order })).filter(({ member }) => !out.has(member.id));
    if (able.length === 0) return null;
    const score = (member: SpeakerCandidate): number => (member.bondLevels === undefined ? -Infinity : warmth(member.bondLevels));
    able.sort((a, b) => score(b.member) - score(a.member) || b.member.lastSpokeAt - a.member.lastSpokeAt || a.order - b.order);
    return able[0].member;
}

export interface ReachOutPromptInput {
    /** The writer. Their Secrets and Arc direction are not here, on purpose: the user reads this first. */
    character: { name: string; personality: string; voice: string; background: string };
    identityName: string;
    identityDescription: string;
    setting: string;
    scene: { name: string; situation: string } | null;
    timeOfDay: string | null;
    place: string | null;
    /** What has lastingly changed about them in this Chat; null with none. */
    nowNote: string | null;
    /** Their Bond toward the user; null with none. */
    bond: { label: string; description: string; levels: BondLevels | null } | null;
    /** Their inner-life line from their newest Diary entry; null without one in play. */
    innerLife: string | null;
    /** Their newest Thought; null with none. */
    thought: string | null;
    /** The Chat's Story so far; null while it has none. */
    storySoFar: string | null;
    /** The latest of the story, oldest first, each Message as the Transcript lays it out. */
    story: string[];
    /** Whole hours since the user was last in the Chat. */
    hoursAway: number;
}

/** The newest of `items` that fit `budget` tokens, oldest first; the newest is always kept. */
function newestThatFit(items: readonly string[], budget: number): string[] {
    let remaining = budget;
    const kept: string[] = [];
    for (let i = items.length - 1; i >= 0; i--) {
        const cost = estimateTokens(items[i]);
        if (cost > remaining && kept.length > 0) break;
        remaining -= cost;
        kept.unshift(items[i]);
    }
    return kept;
}

function writerBlock(input: ReachOutPromptInput): string {
    const { character, identityName } = input;
    const name = character.name;
    const lines = [`The character is ${name}.`];
    if (character.personality.trim()) lines.push(`Personality: ${character.personality.trim()}`);
    if (character.voice.trim()) lines.push(`Voice (how ${name} talks): ${character.voice.trim()}`);
    if (character.background.trim()) lines.push(`Background: ${character.background.trim()}`);
    if (input.nowNote) lines.push(`What has changed about ${name} in this story (this holds over anything above): ${input.nowNote}`);
    if (input.bond) {
        lines.push(`How ${name} feels about ${identityName} now: "${input.bond.label}" — ${input.bond.description}${input.bond.levels ? ` (${bondLevelsInWords(input.bond.levels)})` : ''}`);
    }
    if (input.innerLife) lines.push(`What ${name} keeps to themselves lately: ${input.innerLife}`);
    if (input.thought) lines.push(`${name}'s last private thought: ${input.thought}`);
    lines.push(`${identityName} is the person the user plays.${input.identityDescription.trim() ? ` Who ${identityName} is: ${input.identityDescription.trim()}` : ''}`);
    return lines.join('\n');
}

function cutStorySoFar(text: string): string {
    const trimmed = text.trim();
    if (trimmed.length <= REACH_OUT_STORY_SO_FAR_CHARACTERS) return trimmed;
    // The newest part of the account matters most here.
    return `…${trimmed.slice(trimmed.length - REACH_OUT_STORY_SO_FAR_CHARACTERS)}`;
}

/** "a few hours", "half a day", "a day", "a few days": how long away, in words. */
export function awayInWords(hours: number): string {
    if (hours < 10) return 'a few hours';
    if (hours < 20) return 'half a day';
    if (hours < 40) return 'about a day';
    return 'a few days';
}

/**
 * One call outside the story's own prompt, shaped like a Thought's: a system message about the
 * story and the writer, then where things stand, the story and the ask.
 */
export function buildReachOutPrompt(input: ReachOutPromptInput): { messages: PromptMessage[]; maxTokens: number } {
    const name = input.character.name;
    const identity = input.identityName;
    const system = [
        'You write one character of an ongoing piece of interactive fiction for adult readers. Every character is an adult.',
        input.setting.trim() ? `Setting: ${input.setting.trim()}` : null,
        writerBlock(input),
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    const where = [
        input.scene ? `Scene: ${input.scene.name}${input.scene.situation.trim() ? ` (${input.scene.situation.trim()})` : ''}.` : null,
        input.timeOfDay ? `Time: ${input.timeOfDay}.` : null,
        input.place ? `Place: ${input.place}.` : null,
    ].filter((line): line is string => line !== null);
    const story = newestThatFit(input.story, REACH_OUT_STORY_TOKENS);
    const user = [
        input.storySoFar ? `The story so far, in short:\n<story_so_far>\n${cutStorySoFar(input.storySoFar)}\n</story_so_far>` : null,
        where.length > 0 ? `Where things stood: ${where.join(' ')}` : null,
        `The latest of the story, as it was told. Lines labelled "${identity}:" are ${identity}'s own.\n<story>\n${story.join('\n\n')}\n</story>`,
        `${identity} has been away for ${awayInWords(input.hoursAway)}. ${name} reaches out to ${identity} first, on their own.
Write it in this form:
- First, one short sentence of narration, in the second person ("you"), saying how ${name}'s words reach ${identity} after the time apart, as fits the Setting: a knock at the door, a note slipped under it, a message on the phone, a voice calling up the stair.
- Then a line that starts "@${name}: " with one to three sentences, under about 50 words in all, in ${name}'s own voice: what ${name} wants to say to ${identity} now, about where things stand between them and what happened last.
Rules:
- Speak only for ${name}. Never write ${identity}'s words, thoughts or actions, and decide nothing for ${identity}.
- Keep to what ${name} knows and feels. No new events, no other characters speaking.
- Never guess ${identity}'s gender: only who ${identity} is above, or ${identity}'s own lines, can state it. Until then, call ${identity} by name or "you".
- Keep the story's tone, warm or tense as it stands, and keep it suggestive at most: no sexual act. Everyone in the story is an adult.
Answer with only the narration sentence and the line.`,
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    return {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        maxTokens: REACH_OUT_MAX_TOKENS,
    };
}

/** The most narration parts and speech parts a Reach-out keeps. */
const MAX_NARRATION = 2;
const MAX_SPEECH = 1;

/**
 * Reads the answer as a reply (the cast, sitting-out and user-line guards), keeping only narration
 * and the writer's own line: at most two narration parts and one speech part, in order. Null when
 * no line of the writer's is left, which fails the attempt.
 */
export function readReachOut(
    text: string,
    writer: { id: number; name: string },
    cast: CastName[],
    identityName: string,
    sittingOut: number[],
): ReplyPart[] | null {
    let fenced = text.trim();
    const fence = fenced.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fence) fenced = fence[1].trim();
    const parsed = parseReply(fenced, cast, identityName, { sittingOut });
    const kept: ReplyPart[] = [];
    let narration = 0;
    let speech = 0;
    for (const part of parsed.parts) {
        if (part.kind === 'narration') {
            if (narration >= MAX_NARRATION || part.text.trim() === '') continue;
            narration += 1;
            kept.push(part);
        } else if (part.characterId === writer.id && speech < MAX_SPEECH && part.text.trim() !== '') {
            speech += 1;
            kept.push(part);
        }
    }
    // Narration after the line goes: the line is what the user is answering.
    const lineAt = kept.findIndex((part) => part.kind === 'speech');
    if (lineAt === -1) return null;
    return kept.filter((part, index) => part.kind === 'speech' || index < lineAt);
}

/** "Nara: The stall's closed. I keep thinking about last night.", cut to `REACH_OUT_ALERT_MAX`. */
export function reachOutAlertBody(parts: readonly ReplyPart[]): string | null {
    const line = parts.find((part): part is Extract<ReplyPart, { kind: 'speech' }> => part.kind === 'speech');
    if (!line) return null;
    const body = `${line.speakerName}: ${line.text}`.replace(/\s+/g, ' ').trim();
    return body.length <= REACH_OUT_ALERT_MAX ? body : `${body.slice(0, REACH_OUT_ALERT_MAX - 1)}…`;
}

/** A Message as the rules read it. */
export interface ReachOutMessage {
    id: number;
    position: number;
    kind: 'user' | 'ai';
    reachOut: boolean;
    epilogue: boolean;
    createdAt: Date;
}

/** Where a Chat stands for a Reach-out at `now`: due, with the absence it is for, or why not. */
export type ReachOutCheck = { due: true; userMessageId: number; hoursAway: number } | { due: false; why: string };

const HOUR_MS = 60 * 60 * 1000;

/**
 * The rules that read only the Chat's Messages and its setting (.scratch/reach-outs/spec.md, "When
 * a Reach-out is sent", 2 and 4 to 7 in part): the user has written, no Reach-out since, the newest
 * Message is an AI Message and not the Epilogue, and the time away is up. Quiet hours, the turn
 * lock, background calls, an Ending, credit and the cap are the Chat manager's.
 */
export function reachOutCheck(
    messages: readonly ReachOutMessage[],
    lastPlayedAt: Date,
    setting: { afterHours: number; setAt: Date },
    now: Date,
): ReachOutCheck {
    const ordered = [...messages].sort((a, b) => a.position - b.position);
    const newest = ordered.at(-1);
    const user = [...ordered].reverse().find((message) => message.kind === 'user');
    if (!newest || !user) return { due: false, why: 'the user has not written in it' };
    if (newest.kind === 'user') return { due: false, why: 'a Message waits for its reply' };
    if (ordered.some((message) => message.reachOut && message.position > user.position)) return { due: false, why: 'it reached out already this absence' };
    if (newest.epilogue) return { due: false, why: 'the story has its Epilogue' };
    const lastHere = Math.max(lastPlayedAt.getTime(), newest.createdAt.getTime());
    const since = Math.max(lastHere, setting.setAt.getTime());
    if (now.getTime() - since < setting.afterHours * HOUR_MS) return { due: false, why: 'not away long enough' };
    return { due: true, userMessageId: user.id, hoursAway: Math.floor((now.getTime() - lastHere) / HOUR_MS) };
}

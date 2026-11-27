import { bondLevelsInWords } from '../../../model/ledger/bond-axes.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { ThoughtBond } from '../thoughts/thoughts.js';
import { estimateTokens } from '../turn/prompt.js';

/**
 * Meanwhile (.scratch/meanwhile/spec.md): what a Character who is not in the moment does on their
 * own, between replies, toward what they are after. Pure logic: who acts, the prompt, reading it.
 */

/** Every this many replies written since a Character's last Meanwhile, they are due another. */
export const MEANWHILE_EVERY_REPLIES = 6;

/** A Character who spoke in any of this many latest replies is in the moment, not away. */
export const MEANWHILE_AWAY_REPLIES = 3;

/** At most this many Characters act in one run. */
export const MEANWHILE_MAX_AT_ONCE = 3;

export interface MeanwhileActorsInput {
    /** The Chat's Messages, oldest first: `written` when a model wrote it, with who spoke in it. */
    messages: { position: number; written: boolean; speakers: number[] }[];
    /** The reply just judged, the Chat's newest AI Message, and what happened at it. */
    at: { position: number; epilogue: boolean; sceneMoved: boolean; endingReached: boolean };
    /** The cast in cast order, each with their current Goal (null or empty: none). */
    cast: { id: number; goal: string | null }[];
    sittingOut: number[];
    /** Each Character's newest Meanwhile, by the position of the Message it is at; none for one with none. */
    lastMeanwhileAt: ReadonlyMap<number, number>;
}

/**
 * Who acts at a reply: a Character the story has met (they have a Goal, or spoke in it at least
 * once), not sitting out, who spoke in none of the latest `MEANWHILE_AWAY_REPLIES` written replies,
 * when the Scene moved on at this reply or `MEANWHILE_EVERY_REPLIES` written replies have passed
 * since their last Meanwhile. One with no Goal sets their first aim as they act (2026-11-27: the
 * Judge gives Goals only to Characters in the latest exchange, so those away had none). None at the
 * Epilogue or an Ending. At most `MEANWHILE_MAX_AT_ONCE`, those furthest behind first, then cast order.
 */
export function meanwhileActors(input: MeanwhileActorsInput): number[] {
    const { at } = input;
    if (at.epilogue || at.endingReached) return [];
    const written = input.messages.filter((message) => message.written && message.position <= at.position);
    const inTheMoment = new Set(written.slice(-MEANWHILE_AWAY_REPLIES).flatMap((message) => message.speakers));
    const met = new Set(input.messages.filter((message) => message.position <= at.position).flatMap((message) => message.speakers));
    const out = new Set(input.sittingOut);
    const due = input.cast.flatMap((character, order) => {
        if (!(character.goal?.trim() || met.has(character.id)) || out.has(character.id) || inTheMoment.has(character.id)) return [];
        const since = input.lastMeanwhileAt.get(character.id) ?? -Infinity;
        if (since >= at.position) return [];
        const behind = written.filter((message) => message.position > since).length;
        if (!at.sceneMoved && behind < MEANWHILE_EVERY_REPLIES) return [];
        return [{ id: character.id, behind, order }];
    });
    return due
        .sort((a, b) => b.behind - a.behind || a.order - b.order)
        .slice(0, MEANWHILE_MAX_AT_ONCE)
        .map((actor) => actor.id);
}

/** Room for up to three Meanwhiles of about 40 words each, in their JSON. */
export const MEANWHILE_MAX_TOKENS = 300;

/** The most of the recent story the actors read, newest kept. */
export const MEANWHILE_STORY_TOKENS = 1_500;

/** The most of one actor's Memories they read, newest kept. */
export const MEANWHILE_MEMORY_TOKENS = 600;

export interface MeanwhileActor {
    /** Their Secrets and Arc direction are not here, on purpose: a Meanwhile can be read by tapping. */
    character: { name: string; personality: string; voice: string; background: string };
    nowNote: string | null;
    /** Null with none yet: they set their first aim as they act. */
    goal: string | null;
    /** Their own Bonds, never anyone else's. */
    bonds: ThoughtBond[];
    beliefs: string[];
    /** The Memories they are in Known by, oldest first. */
    memories: string[];
    /** Their inner-life line from their newest Diary entry in play; null without one. */
    innerLife: string | null;
    /** Their latest Thought; null without one. */
    thought: string | null;
}

export interface MeanwhilePromptInput {
    setting: string;
    identityName: string;
    /** Every Character of the Story, so none of them is met while away. */
    castNames: string[];
    scene: { name: string; situation: string } | null;
    timeOfDay: string | null;
    place: string | null;
    storySoFar: string | null;
    /** The latest of the story, oldest first, each Message as the Transcript lays it out. */
    story: string[];
    actors: MeanwhileActor[];
}

export interface MeanwhilePrompt {
    messages: PromptMessage[];
    maxTokens: number;
}

/** The newest of `items` that fit `budget` tokens, oldest first; the newest is always kept. */
function newestThatFit(items: string[], budget: number): string[] {
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

/** "A", "A and B", "A, B or C". */
function listOf(names: string[], last: 'and' | 'or'): string {
    return names.length <= 1 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} ${last} ${names[names.length - 1]}`;
}

function actorBlock(actor: MeanwhileActor): string {
    const { character } = actor;
    const name = character.name;
    const lines = [`<character name="${name}">`];
    if (character.personality.trim()) lines.push(`Personality: ${character.personality.trim()}`);
    if (character.voice.trim()) lines.push(`Voice (how ${name} talks): ${character.voice.trim()}`);
    if (character.background.trim()) lines.push(`Background: ${character.background.trim()}`);
    if (actor.nowNote?.trim()) lines.push(`Changed in this story: ${actor.nowNote.trim()}`);
    lines.push(
        actor.goal
            ? `What ${name} is after now: ${actor.goal}`
            : `What ${name} is after now: nothing yet. First decide, from who ${name} is and the story so far, one short aim from their side, and give it as "goal".`,
    );
    if (actor.bonds.length > 0) {
        lines.push(`How ${name} feels right now:`);
        for (const bond of actor.bonds) {
            lines.push(`- toward ${bond.towardName}: "${bond.label}" — ${bond.description}${bond.levels ? ` (${bondLevelsInWords(bond.levels)})` : ''}`);
        }
    }
    if (actor.innerLife) lines.push(`What ${name} keeps to themselves lately: ${actor.innerLife}`);
    if (actor.thought) lines.push(`${name}'s latest thought: ${actor.thought}`);
    if (actor.beliefs.length > 0) {
        lines.push(`What ${name} believes, which may be false:`);
        for (const belief of actor.beliefs) lines.push(`- ${belief}`);
    }
    const memories = newestThatFit(actor.memories, MEANWHILE_MEMORY_TOKENS);
    if (memories.length > 0) {
        lines.push(`What ${name} knows of the story (what is not here, ${name} does not know):`);
        for (const memory of memories) lines.push(`- ${memory}`);
    }
    lines.push('</character>');
    return lines.join('\n');
}

/**
 * One call for every actor of a run: a system message with one block per actor, each holding only
 * what that Character knows, then the moment they are away from and the rules of one small step.
 */
export function buildMeanwhilePrompt(input: MeanwhilePromptInput): MeanwhilePrompt {
    const identity = input.identityName;
    const names = input.actors.map((actor) => actor.character.name);
    const system = [
        'You write what characters of an ongoing piece of interactive fiction for adult readers do on their own while the story is elsewhere. Everyone in the story is an adult.',
        input.setting.trim() ? `Setting: ${input.setting.trim()}` : null,
        "Each character knows only what is in their own block. Never let one act on what is in another's.",
        ...input.actors.map(actorBlock),
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    const where = [
        input.scene ? `Scene: ${input.scene.name}${input.scene.situation.trim() ? ` (${input.scene.situation.trim()})` : ''}.` : null,
        input.timeOfDay ? `Time: ${input.timeOfDay}.` : null,
        input.place ? `Place: ${input.place}.` : null,
    ].filter((line): line is string => line !== null);
    const story = newestThatFit(input.story, MEANWHILE_STORY_TOKENS);
    const everyone = listOf([identity, ...input.castNames.filter((name) => name !== identity)], 'or');
    const user = [
        input.storySoFar?.trim() ? `Story so far: ${input.storySoFar.trim()}` : null,
        where.length > 0 ? `Where the story is, away from them: ${where.join(' ')}` : null,
        `The latest of the story, as it was told. Lines labelled "${identity}:" are ${identity}'s own.\n<story>\n${story.join('\n\n')}\n</story>`,
        `${listOf(names, 'and')} ${names.length === 1 ? 'is' : 'are'} away from this moment. For each, say what they did meanwhile, on their own: one small, concrete step toward what they are after, somewhere that fits where they last were and the Setting.
- Alone, or with people who are not characters of this story (a shopkeeper, a guard). Never with or to ${everyone}: they are not there.
- Nothing that kills, badly hurts or removes anyone, ends the story, or gives away what they keep secret. No sexual act.
- One or two sentences, past tense, plain fact, under about 40 words, starting with their name ("${names[0]} sold the nets…"), ending with where they are now.
- "goal": null when they are still after the same thing; "" when this step reached it or they gave it up; or a short new aim, from their side, when they now want something else.
Answer with only JSON: {"meanwhile":[{"character":"Name","did":"...","goal":null}]}`,
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    return {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        maxTokens: MEANWHILE_MAX_TOKENS,
    };
}

export interface ReadMeanwhile {
    character: string;
    did: string;
    /** null: still after the same thing; "": reached or given up; otherwise their new aim. */
    goal: string | null;
}

/** The most of one Meanwhile kept once read. */
export const MEANWHILE_MAX = 400;

/** The most of a new Goal kept, as a Goal detail record holds. */
const GOAL_MAX = 160;

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** On one line, cut to `max` at a word. */
function oneLine(text: string, max: number): string {
    const line = text.replace(/\s+/g, ' ').trim();
    if (line.length <= max) return line;
    const cut = line.slice(0, max);
    const space = cut.lastIndexOf(' ');
    return `${(space > max * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/**
 * Reads a run's answer: one Meanwhile per actor, the first given, named as the actor is. One for
 * someone who is not an actor, with nothing done, or naming the Role (the Role was not there) is
 * dropped. Null when no JSON object with a "meanwhile" list can be read.
 */
export function readMeanwhile(text: string, actorNames: string[], identityName: string): ReadMeanwhile[] | null {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    let json: unknown;
    try {
        json = JSON.parse(match[0]);
    } catch {
        return null;
    }
    const list = (json as { meanwhile?: unknown } | null)?.meanwhile;
    if (!Array.isArray(list)) return null;
    const namesRole = identityName.trim() ? new RegExp(`\\b${escapeRegExp(identityName.trim())}\\b`, 'i') : null;
    const read: ReadMeanwhile[] = [];
    for (const item of list) {
        if (typeof item !== 'object' || item === null) continue;
        const { character, did, goal } = item as Record<string, unknown>;
        const name = typeof character === 'string' ? actorNames.find((actor) => actor.toLowerCase() === character.trim().toLowerCase()) : undefined;
        if (!name || read.some((entry) => entry.character === name)) continue;
        // A line opening with a pronoun names who did it: the Memory it becomes is read without them (seen on a real model, 2026-11-27).
        const line = typeof did === 'string' ? oneLine(did, MEANWHILE_MAX).replace(/^(she|he|they)\b/i, name) : '';
        if (line === '' || namesRole?.test(line)) continue;
        read.push({ character: name, did: line, goal: typeof goal === 'string' ? oneLine(goal, GOAL_MAX) : null });
    }
    return read;
}

/** A Meanwhile older than this many written replies is no longer told to the Narrator, only kept as a Memory. */
export const MEANWHILE_IN_PLAY_REPLIES = 20;

export interface MeanwhilesInPlayInput {
    /** The Chat's Meanwhiles, oldest first. */
    entries: ReadonlyArray<{ characterId: number; messageId: number; text: string }>;
    /** The Chat's Messages, oldest first: `written` when a model wrote it, with who spoke in it. */
    messages: ReadonlyArray<{ id: number; position: number; written: boolean; speakers: readonly number[] }>;
    cast: ReadonlyArray<{ id: number; name: string }>;
    /** The names of the Characters in the latest exchange: theirs are not told, they are back. */
    present: readonly string[];
}

/**
 * What the Narrator is told of the Characters away from the moment: each one's newest Meanwhile
 * written within the last `MEANWHILE_IN_PLAY_REPLIES` written replies, for those not in the latest
 * exchange, freshest first. A Character back in the moment has it only as their Memory.
 */
export function meanwhilesInPlay(input: MeanwhilesInPlayInput): Array<{ characterName: string; text: string }> {
    const written = input.messages.filter((message) => message.written);
    const newest = written.at(-1)?.position ?? 0;
    const positionOf = new Map(input.messages.map((message) => [message.id, message.position]));
    const newestOf = new Map<number, { text: string; position: number }>();
    for (const entry of input.entries) {
        const position = positionOf.get(entry.messageId);
        if (position !== undefined) newestOf.set(entry.characterId, { text: entry.text, position });
    }
    const out: Array<{ characterName: string; text: string; repliesAgo: number }> = [];
    for (const [characterId, entry] of newestOf) {
        const character = input.cast.find((member) => member.id === characterId);
        if (!character || input.present.includes(character.name)) continue;
        // Back in the moment since: they have it only as their Memory.
        if (written.some((message) => message.position > entry.position && message.speakers.includes(characterId))) continue;
        const repliesAgo = written.filter((message) => message.position > entry.position && message.position <= newest).length;
        if (repliesAgo >= MEANWHILE_IN_PLAY_REPLIES) continue;
        out.push({ characterName: character.name, text: entry.text, repliesAgo });
    }
    return out.sort((a, b) => a.repliesAgo - b.repliesAgo).map(({ characterName, text }) => ({ characterName, text }));
}

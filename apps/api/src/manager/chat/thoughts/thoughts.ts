import { BondLevels, bondLevelsInWords } from '../../../model/ledger/bond-axes.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { estimateTokens } from '../turn/prompt.js';

/**
 * Thoughts (.scratch/character-minds/spec.md): before each reply, each Character in the moment
 * thinks on their own, in a call given only what they know. Pure logic: who thinks, what each is
 * told, and how the answer is read. The Chat manager gathers the inputs and runs the calls.
 */

/** The most Characters who think before one reply. */
export const THINKERS_MAX = 4;

/**
 * Room for a thought: one or two sentences of about 35 words asked for, with slack so a sentence is
 * never cut. Thoughts of up to 70 words, drafting the line to be said, put about 3 seconds before
 * each reply (2026-11-16); short, they still say what the Character feels and means to do.
 */
export const THOUGHT_MAX_TOKENS = 120;

/** The most of a thought kept once read. */
export const THOUGHT_MAX = 400;

/** The most of the recent story a thinker reads, newest kept. */
export const THOUGHT_STORY_TOKENS = 1_500;

/** The most of a thinker's Memories they read, newest kept. */
export const THOUGHT_MEMORY_TOKENS = 600;

/** A thought slower than this is dropped, and the reply is written without it. */
export const THOUGHT_TIMEOUT_MS = 12_000;

export interface ThinkerCandidate {
    id: number;
    name: string;
}

/**
 * Who thinks before this reply: the nudged Character first, then those in the latest exchange,
 * in its order, never one sitting out, at most `THINKERS_MAX`. With nobody in the moment, nobody.
 */
export function thinkers(input: { cast: ThinkerCandidate[]; present: string[]; nudge: string | null; sittingOut: number[] }): ThinkerCandidate[] {
    const out = new Set(input.sittingOut);
    const chosen: ThinkerCandidate[] = [];
    for (const name of [...(input.nudge ? [input.nudge] : []), ...input.present]) {
        const character = input.cast.find((member) => member.name === name);
        if (!character || out.has(character.id) || chosen.some((member) => member.id === character.id)) continue;
        chosen.push(character);
        if (chosen.length === THINKERS_MAX) break;
    }
    return chosen;
}

/** A Bond of the thinker's, as they are told it. */
export interface ThoughtBond {
    towardName: string;
    label: string;
    description: string;
    levels: BondLevels | null;
}

export interface ThoughtPromptInput {
    /** The thinker. Their Secrets and Arc direction are not here, on purpose: a Thought can be read. */
    character: { name: string; personality: string; voice: string; background: string };
    identityName: string;
    identityDescription: string;
    setting: string;
    scene: { name: string; situation: string } | null;
    timeOfDay: string | null;
    place: string | null;
    /** What they are after now; null with none. */
    goal: string | null;
    /** Their own Bonds, never anyone else's. */
    bonds: ThoughtBond[];
    /** What they hold to be true, which may be false. */
    beliefs: string[];
    /** The Memories they are in Known by, oldest first. */
    memories: string[];
    /** Their inner-life line from their newest Diary entry; null without one in play. */
    innerLife: string | null;
    /** The latest of the story, oldest first, each Message as the Transcript lays it out. */
    story: string[];
    /** What the user just wrote, when this reply answers it; null on a Continue. */
    userText: string | null;
}

export interface ThoughtPrompt {
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

function thinkerBlock(input: ThoughtPromptInput): string {
    const { character, identityName } = input;
    const name = character.name;
    const lines = [`The character is ${name}.`];
    if (character.personality.trim()) lines.push(`Personality: ${character.personality.trim()}`);
    if (character.voice.trim()) lines.push(`Voice (how ${name} talks): ${character.voice.trim()}`);
    if (character.background.trim()) lines.push(`Background: ${character.background.trim()}`);
    if (input.goal) lines.push(`What ${name} is after now: ${input.goal}`);
    if (input.bonds.length > 0) {
        lines.push(`How ${name} feels right now:`);
        for (const bond of input.bonds) {
            lines.push(`- toward ${bond.towardName}: "${bond.label}" — ${bond.description}${bond.levels ? ` (${bondLevelsInWords(bond.levels)})` : ''}`);
        }
    }
    if (input.innerLife) lines.push(`What ${name} keeps to themselves lately: ${input.innerLife}`);
    if (input.beliefs.length > 0) {
        lines.push(`What ${name} believes, which may be false (${name} does not doubt it):`);
        for (const belief of input.beliefs) lines.push(`- ${belief}`);
    }
    const memories = newestThatFit(input.memories, THOUGHT_MEMORY_TOKENS);
    if (memories.length > 0) {
        lines.push(`What ${name} knows of the story so far (what is not here, ${name} does not know):`);
        for (const memory of memories) lines.push(`- ${memory}`);
    }
    lines.push(`${identityName} is the person the user plays.${input.identityDescription.trim() ? ` Who ${identityName} is: ${input.identityDescription.trim()}` : ''}`);
    return lines.join('\n');
}

/**
 * One call per thinker, outside the story's own prompt: a system message about them, then the
 * moment and the instruction. They are given only what they know.
 */
export function buildThoughtPrompt(input: ThoughtPromptInput): ThoughtPrompt {
    const name = input.character.name;
    const identity = input.identityName;
    const system = [
        "You think privately as one character of an ongoing piece of interactive fiction for adult readers, just before the story's next moment. Every character is an adult.",
        input.setting.trim() ? `Setting: ${input.setting.trim()}` : null,
        thinkerBlock(input),
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    const where = [
        input.scene ? `Scene: ${input.scene.name}${input.scene.situation.trim() ? ` (${input.scene.situation.trim()})` : ''}.` : null,
        input.timeOfDay ? `Time: ${input.timeOfDay}.` : null,
        input.place ? `Place: ${input.place}.` : null,
    ].filter((line): line is string => line !== null);
    const story = newestThatFit(input.story, THOUGHT_STORY_TOKENS);
    const user = [
        where.length > 0 ? `Where things are: ${where.join(' ')}` : null,
        `The latest of the story, as it was told. Lines labelled "${identity}:" are ${identity}'s own.\n<story>\n${story.join('\n\n')}\n</story>`,
        input.userText !== null ? `What ${identity} just said or did:\n${identity}: ${input.userText.trim()}` : null,
        `As ${name}, in the first person and in ${name}'s own voice, in one or two sentences of no more than about 35 words: how you feel about this moment and what you mean to do next.
- Say what you feel and mean to do. Don't draft your line, and don't describe your own movements: the story tells those.
- Think only from what you know and can see. Decide nothing for ${identity} or anyone else; nothing happens in a thought.
- Never guess ${identity}'s gender: only who ${identity} is above, or ${identity}'s own lines, can state it. Until then, call ${identity} by name or "they".
- Keep the story's tone. Everyone in it is an adult.
Answer with only the thought.`,
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    return {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        maxTokens: THOUGHT_MAX_TOKENS,
    };
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads a thought: trimmed, out of a code fence, without a leading `Name:` label, wrapping quotes
 * or asterisks, on one line, cut to `THOUGHT_MAX` at a word. Null when nothing is left.
 */
export function readThought(text: string, characterName: string): string | null {
    let thought = text.trim();
    const fenced = thought.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fenced) thought = fenced[1].trim();
    thought = thought.replace(new RegExp(`^@?\\*{0,2}${escapeRegExp(characterName)}\\*{0,2}\\s*(?:\\(thinking\\))?\\s*:\\s*`, 'i'), '');
    thought = thought.replace(/\s+/g, ' ').trim();
    thought = thought.replace(/^[\s"“*_]+|[\s"”*_]+$/g, '');
    if (thought.length > THOUGHT_MAX) {
        const cut = thought.slice(0, THOUGHT_MAX);
        const space = cut.lastIndexOf(' ');
        thought = `${(space > THOUGHT_MAX * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
    }
    return thought === '' ? null : thought;
}

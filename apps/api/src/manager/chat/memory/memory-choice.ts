import { similarity } from '../../document/document-search.js';
import { estimateTokens } from '../turn/prompt-tokens.js';
import { memoryLine } from './memory-prompt.js';
import { memoryIsAbout } from './present.js';
import { renderUser } from './render-user.js';

/**
 * Which Memories reach a turn (.scratch/memory-by-meaning/spec.md, "Choosing Memories for a
 * turn"). Pure: the turn, Suggested replies, Write for me and the Snapshot prompt all call it,
 * with the same query, so they agree on what the Characters remember.
 *
 * The budget is filled in this order:
 *  1. every locked Memory, oldest first, even past the budget;
 *  2. the active Beliefs of the Characters present, oldest first;
 *  3. Memories by closeness to the query, closest first, at or above the floor (archived ones too);
 *  4. the newest Memories about the people present or the worn identity, newest first;
 *  5. nothing else.
 * One that doesn't fit the room left is skipped while smaller ones are still tried. The chosen
 * Memories come back in story order, oldest first, each with why it was chosen.
 */

/** Spec: "up to about 4,000 tokens of Memories". */
export const MEMORY_BUDGET_TOKENS = 4_000;
/** Spec: "above a similarity floor (0.35, tuned with the Documents floor in mind)". */
export const MEMORY_MIN_SIMILARITY = 0.35;
/** How many top scores each Memory search logs. */
export const MEMORY_LOGGED_SCORES = 5;

export type MemoryChoiceReason = 'locked' | 'believed' | 'meaning' | 'recent';

/** A Memory as the choice reads it: its text with `{user}`, who knows it by name, its flags and its vector. */
export interface ChoiceMemory {
    id: number;
    text: string;
    knownBy: string[];
    locked: boolean;
    archived: boolean;
    /** At unit length; null while it has none. */
    embedding: number[] | null;
    embeddingModel: string | null;
}

/** An active Belief (ticket 04): the Character who holds it, by name, and what they believe, with `{user}`. */
export interface ChoiceBelief {
    id: number;
    characterName: string;
    text: string;
}

/** The turn's search query as a vector at unit length, with the model that made it. */
export interface ContextQueryVector {
    vector: number[];
    model: string;
}

export interface MemoryChoiceInput {
    /** Every Memory of the Chat, archived ones included, in story order (oldest first). */
    memories: ChoiceMemory[];
    /** The Chat's active Beliefs, oldest first. */
    beliefs: ChoiceBelief[];
    /** Every Character's name, to tell a Memory that names someone from one that names nobody. */
    cast: string[];
    /** The Characters present, by name. */
    present: string[];
    /** The worn identity's name. */
    identityName: string;
    /** Null when the search failed or there was nothing to search. */
    query: ContextQueryVector | null;
    budget?: number;
    floor?: number;
}

export interface ChosenMemory {
    memory: ChoiceMemory;
    reason: Exclude<MemoryChoiceReason, 'believed'>;
    /** Its similarity to the query; null when either has no comparable vector. */
    score: number | null;
}

export interface ChosenBelief {
    belief: ChoiceBelief;
    reason: 'believed';
}

export interface MemoryChoice {
    /** In story order. */
    memories: ChosenMemory[];
    /** Oldest first. */
    beliefs: ChosenBelief[];
    /** The estimated tokens of the chosen lines. */
    usedTokens: number;
    /** Every comparable Memory's score, highest first, marked when sent: for the debug log. */
    scored: Array<{ id: number; score: number; sent: boolean }>;
}

/** What one Memory takes of the budget: its line in the Memory layer, and the line break after it. */
export function memoryCost(memory: { text: string; knownBy: string[] }): number {
    return estimateTokens(memoryLine(memory)) + 1;
}

/** Spec: "Each active Belief of a present Character is a line in the Memory layer". */
export function beliefLine(characterName: string, text: string): string {
    return `- ${characterName} believes: ${text}`;
}

/** What one Belief takes of the budget. */
export function beliefCost(belief: ChoiceBelief): number {
    return estimateTokens(beliefLine(belief.characterName, belief.text)) + 1;
}

/** Whether the Memory is about one of `names` or the worn identity: by its text, or, when it names nobody, by who knows it. */
export function memoryAboutAnyOf(memory: { text: string; knownBy: string[] }, names: string[], cast: string[], identityName: string): boolean {
    if (memoryIsAbout(memory.text, names, identityName)) return true;
    if (memoryIsAbout(memory.text, cast, identityName)) return false;
    return memory.knownBy.some((name) => names.includes(name));
}

/** The locked Memories that are sent as locked: the ones not archived. */
const sentAsLocked = (memory: ChoiceMemory) => memory.locked && !memory.archived;

/**
 * Spec: "when the locked Memories alone take more than half the budget, the Memory drawer
 * says so".
 */
export function lockedOverHalf(memories: ChoiceMemory[], budget = MEMORY_BUDGET_TOKENS): boolean {
    return memories.filter(sentAsLocked).reduce((sum, memory) => sum + memoryCost(memory), 0) > budget / 2;
}

export function chooseMemories(input: MemoryChoiceInput): MemoryChoice {
    const budget = input.budget ?? MEMORY_BUDGET_TOKENS;
    const floor = input.floor ?? MEMORY_MIN_SIMILARITY;
    const chosen = new Map<number, ChosenMemory>();
    const beliefs: ChosenBelief[] = [];
    let used = 0;
    const scoreOf = (memory: ChoiceMemory): number | null =>
        input.query && memory.embedding && memory.embeddingModel === input.query.model ? similarity(memory.embedding, input.query.vector) : null;
    const take = (memory: ChoiceMemory, reason: ChosenMemory['reason']): void => {
        chosen.set(memory.id, { memory, reason, score: scoreOf(memory) });
        used += memoryCost(memory);
    };
    const fits = (cost: number) => used + cost <= budget;

    // 1. Locked: never left out.
    for (const memory of input.memories) if (sentAsLocked(memory)) take(memory, 'locked');

    // 2. The Beliefs of the Characters present.
    for (const belief of input.beliefs) {
        if (!input.present.includes(belief.characterName) || !fits(beliefCost(belief))) continue;
        beliefs.push({ belief, reason: 'believed' });
        used += beliefCost(belief);
    }

    // 3. Closest in meaning, above the floor. Ties keep story order.
    const scored = input.memories
        .flatMap((memory) => {
            const score = scoreOf(memory);
            return score === null ? [] : [{ memory, score }];
        })
        .sort((a, b) => b.score - a.score);
    for (const { memory, score } of scored) {
        if (score < floor) break;
        if (!chosen.has(memory.id) && fits(memoryCost(memory))) take(memory, 'meaning');
    }

    // 4. The newest about the people present or the worn identity.
    for (let at = input.memories.length - 1; at >= 0; at--) {
        const memory = input.memories[at];
        if (memory.archived || chosen.has(memory.id)) continue;
        if (!memoryAboutAnyOf(memory, input.present, input.cast, input.identityName)) continue;
        if (fits(memoryCost(memory))) take(memory, 'recent');
    }

    return {
        memories: input.memories.flatMap((memory) => chosen.get(memory.id) ?? []),
        beliefs,
        usedTokens: used,
        scored: scored.map(({ memory, score }) => ({ id: memory.id, score, sent: chosen.has(memory.id) })),
    };
}

/**
 * The Memory search's debug line (spec: "log the scores of the chosen ones in development, to tune
 * it"): the floor and the top scores by Memory id, marked when sent. No Memory or query text.
 */
export function memorySearchLogLine(storyId: number, chatId: number, choice: MemoryChoice, floor = MEMORY_MIN_SIMILARITY): string {
    const top = choice.scored.slice(0, MEMORY_LOGGED_SCORES).map(({ id, score, sent }) => `${score.toFixed(3)} #${id}${sent ? ' (sent)' : ''}`);
    const reasons = choice.memories.reduce<Record<string, number>>((counts, { reason }) => ({ ...counts, [reason]: (counts[reason] ?? 0) + 1 }), {});
    const sent = Object.entries(reasons).map(([reason, count]) => `${count} ${reason}`).join(', ') || 'none';
    return `Story ${storyId}, Chat ${chatId}: Memory search, floor ${floor}; top scores: ${top.length > 0 ? top.join(', ') : 'none'}; sent: ${sent}, ${choice.beliefs.length} believed`;
}

/** A chosen Memory as the Memory layer lists it, with `{user}` rendered by the prompt. */
export function renderedBeliefLine(belief: ChoiceBelief, identityName: string): string {
    return beliefLine(belief.characterName, renderUser(belief.text, identityName));
}

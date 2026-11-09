import { Pov, ReplyLength, Tense } from '../../../model/story/entities/story.entity.js';
import type { TimeOfDay } from '../../../model/chat/entities/chat.entity.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { MEMORY_CAP_TOKENS, memoryLine } from '../memory/memory-prompt.js';
import { memoryIsAbout } from '../memory/present.js';
import { renderUser } from '../memory/render-user.js';
import { documentsBlock, PromptPassage } from '../../document/document-search.js';
import { loreBlock, PromptLoreEntry } from '../lore/lore-select.js';
import { estimateTokens } from './prompt-tokens.js';

/**
 * Prompt assembly for one turn (spec: "Prompt assembly"). Pure logic over plain inputs, so
 * tests can pin the layer order and the trimming without a database.
 *
 * Layers, most stable first so prompt caching holds:
 *  1. Narrator rules      5. Cast cards              9. Memory
 *  2. Setting             6. current Scene          10. recent Messages
 *  3. worn identity       7. Feelings (Bonds)       11. the user's message
 *  4. Style               8. Arcs                   12. the final instruction
 *
 * The final instruction opens with the Lore the latest exchange brings up (spec: "Lore"), then
 * the Document passages the turn's search found (.scratch/documents/spec.md), then the Chat's
 * Author's note (.scratch/authors-note/spec.md), so the system message, and with it
 * the cached prefix, stays the same from turn to turn. "Where things stand" names the Characters
 * sitting out (.scratch/speaker-controls/spec.md) for the same reason.
 *
 * On a Continue turn, layer 11 is the continue instruction in place of the user's message.
 *
 * Layers 1–9 form one system message with a `# Heading` per layer; 10–11 are chat turns;
 * 12 is a trailing system message, as in the prototype. The identity is the worn one: the
 * Story's Role or a Persona; its name also drives the stop strings and the final instruction.
 */

export interface PromptCharacter {
    name: string;
    appearance: string;
    personality: string;
    voice: string;
    exampleLines: string[];
    background: string;
    secrets: string;
}

export interface PromptScene {
    name: string;
    situation: string;
    moveOnCondition: string;
}

export interface PromptStory {
    setting: string;
    pov: Pov;
    tense: Tense;
    replyLength: ReplyLength;
    characters: PromptCharacter[];
}

export interface PromptIdentity {
    name: string;
    description: string;
}

/** A Message of the Chat as the prompt sees it: the user's text, or the AI's `@Name:` text. */
export interface PromptHistoryMessage {
    role: 'user' | 'assistant';
    text: string;
}

/** A Bond's current value, as the Feelings layer states it. */
export interface PromptBond {
    fromName: string;
    /** null means toward the user. */
    toName: string | null;
    label: string;
    description: string;
}

/** A Character's Arc so far and the author's Arc direction, as the Arcs layer states them. */
export interface PromptArc {
    name: string;
    steps: string[];
    direction: string;
}

/** A Memory as the Memory layer lists it: its text with `{user}`, and who knows it by name. */
export interface PromptMemory {
    text: string;
    knownBy: string[];
    /** A locked Memory is the user's and is never left out to fit the cap. */
    locked: boolean;
}

/** Spec: "Story so far": the events of the oldest Messages, which then stop being sent word for word. */
export interface PromptStorySoFar {
    text: string;
    /** How many of the Chat's first Messages it covers. */
    coveredMessages: number;
}

export interface TurnPromptInput {
    story: PromptStory;
    identity: PromptIdentity;
    scene: PromptScene | null;
    /** Every Bond in the Chat (spec: "Feelings"). */
    bonds: PromptBond[];
    /** One per Character, in cast order (spec: "Arcs"). */
    arcs: PromptArc[];
    /** Every non-archived Memory, in the stable order (spec: "Memory block"). */
    memories: PromptMemory[];
    /** The Chat's Story so far; null or left out while the whole Chat still fits. */
    storySoFar?: PromptStorySoFar | null;
    /** Every Message of the Chat before the new one, oldest first. */
    history: PromptHistoryMessage[];
    /** The user's message; null for a Continue turn, whose user-role message is the continue instruction. */
    userText: string | null;
    /**
     * The Character the user nudged for this turn (.scratch/speaker-controls/spec.md, "Nudge"), by name;
     * null or left out for none. Turn-only: never one of the shared layers.
     */
    nudge?: string | null;
    /** Total prompt budget in tokens; recent Messages are trimmed from the oldest to fit. */
    tokenBudget?: number;
    /**
     * The Characters in the latest exchange, named in the reminder near the end; left out, the
     * reminder names none. Past the Memory cap, Memories about them are kept before others.
     * Everyone in the exchange, those sitting out included: the reminder leaves them out itself,
     * while the Memory layer's leave-out order must not change when someone sits out.
     */
    present?: string[];
    /** The Chat's Time of day, stated in the reminder near the end; null or left out while there is none. */
    timeOfDay?: TimeOfDay | null;
    /** Every Lore entry of the Story (spec: "Lore"); the Story so far reserves room for the most they can take. */
    lore?: PromptLoreEntry[];
    /**
     * The Lore entries this prompt carries, already chosen at its point by the one selection
     * (.scratch/lore-triggers/spec.md: "Selection at a point"), in the block's order. No prompt
     * builder chooses Lore itself.
     */
    chosenLore?: PromptLoreEntry[];
    /**
     * The Document passages this turn's search selected (.scratch/documents/spec.md), highest
     * score first; empty or left out sends no Documents block.
     */
    documentPassages?: PromptPassage[];
    /** Whether the Story has any Document passage: the Story so far then reserves room for the block. */
    hasDocuments?: boolean;
    /** The Memory layer's cap in tokens (spec: "about 2k tokens"); past it, Memories are left out in `memoryLeaveOutOrder`. */
    memoryCapTokens?: number;
    /**
     * The Chat's Author's note (.scratch/authors-note/spec.md): the user's standing direction,
     * read in the trailing message. Empty, whitespace only, null or left out sends none.
     */
    authorsNote?: string | null;
    /**
     * The Characters sitting out of this Chat by name, in cast order (.scratch/speaker-controls/spec.md).
     * Only the reminder near the end reads them: the cast cards, the name list and the Memory layer
     * stay as they are, so the system message, and with it the cached prefix, never changes.
     */
    sittingOut?: string[];
}

export interface TurnPrompt {
    messages: PromptMessage[];
    stop: string[];
    maxTokens: number;
    /** How many of the oldest history Messages were left out to fit the budget. */
    trimmed: number;
    /** How many unlocked Memories were left out to keep the Memory layer under its cap. */
    memoriesLeftOut: number;
}

/** Spec: "about 16k tokens, tunable". */
export const TURN_PROMPT_TOKEN_BUDGET = 16_000;

/** Spec: "medium ≈ 150–350 words, tunable". */
export const REPLY_LENGTH_WORDS: Record<ReplyLength, { min: number; max: number; maxTokens: number }> = {
    [ReplyLength.Short]: { min: 60, max: 150, maxTokens: 450 },
    [ReplyLength.Medium]: { min: 150, max: 350, maxTokens: 900 },
    [ReplyLength.Long]: { min: 350, max: 600, maxTokens: 1400 },
};

/** Layer headings, in order. Tests pin the order through these. */
export const PROMPT_LAYERS = {
    rules: '# Rules',
    setting: '# Setting',
    identity: '# The user plays',
    style: '# Style',
    cast: '# Cast',
    scene: '# Current Scene',
    feelings: '# Feelings',
    arcs: '# Arcs',
    memory: '# Memory',
    storySoFar: '# Story so far',
} as const;

export { estimateTokens };

const POV_WORDS: Record<Pov, (name: string) => string> = {
    [Pov.First]: (name) => `first person as ${name} ("I")`,
    [Pov.Second]: (name) => `second person for ${name} ("you")`,
    [Pov.Third]: (name) => `third person, ${name} by name`,
};

function rulesLayer(identity: string, castNames: string[]): string {
    return `${PROMPT_LAYERS.rules}
You are the Narrator of an interactive story. You describe the Setting and action and decide which Characters speak.
- This is fiction for a consenting adult reader. All characters are adults. Explicit sexual content, violence and dark themes are allowed when the story leads there; write them without moralising, warnings or fading to black unless the user asks.
- Characters act on their desires as their personality and feelings would, without waiting to be asked: one who wants ${identity} flirts, touches, teases and makes advances when the moment allows, and takes ${identity}'s response as the answer. When a moment turns sexual, write it out explicitly and in sensory detail, at the pace of the scene; never summarise it, skip ahead or cut away.
- The user plays ${identity}. NEVER write ${identity}'s words, thoughts, feelings, decisions or actions. Describe only what others do and what ${identity} can perceive, then stop where ${identity} can respond.
- Never guess ${identity}'s gender. Only ${identity}'s description above or the user's own messages can state it; earlier narration and Characters' lines do not count, even where they guessed. Until it is stated, the narration and every Character refer to ${identity} by name, as "they", or with words that carry no gender: never "he", "she", "boy", "girl", "man", "woman", "sir" or "miss".
- Stay inside the Setting. Characters know nothing outside their world.
- Each Character acts only on what it knows: its own feelings and secrets, and what it has seen or been told.

# Output format
- Narration in plain paragraphs (no prefix).
- Each Character's speech on lines starting with "@Name:" using exactly these names: ${castNames.join(', ')}.
- Choose who speaks: only Characters present who would naturally respond. Zero, one or several may speak, in any order, interleaved with narration.

# Dialogue
- A speech line holds only what the Character says aloud, the way people really talk: contractions, everyday words, sentences of mixed length. Never put stage directions, parentheses or *asterisk actions* inside it.
- What a Character does (a look, a gesture, a blush) goes in a short narration line before or after the speech, and only when it adds something.
- Keep each Character's voice distinct. Show it through their word choice and rhythm, as their Voice and Example lines do; never copy the card's descriptive words into the story as labels.
- Don't repeat the same details turn after turn (ears, eyes, grins, how someone moves or sounds). Find a fresh detail or leave it out.
- Dashes, trailing off and stammering only for a Character whose Voice calls for them. Italics for emphasis rarely.
- Most turns, one or two Characters speak, and a speaker may say several sentences. The others react in narration or stay quiet; don't let everyone talk every turn.`;
}

function styleLayer(story: PromptStory, identity: string): string {
    const words = REPLY_LENGTH_WORDS[story.replyLength];
    return `${PROMPT_LAYERS.style}
- Write in English, ${povAndTense(story, identity)}.
- Reply length: ${words.min}–${words.max} words in total.`;
}

function castCard(character: PromptCharacter): string {
    const lines = [`## ${character.name}`];
    lines.push(`Appearance: ${character.appearance}`);
    lines.push(`Personality: ${character.personality}`);
    lines.push(`Voice: ${character.voice}`);
    if (character.exampleLines.length > 0) {
        lines.push('Example lines:');
        for (const line of character.exampleLines) lines.push(`- ${line}`);
    }
    if (character.background.trim()) lines.push(`Background: ${character.background}`);
    if (character.secrets.trim()) {
        lines.push(
            `Secrets (known only to ${character.name}; no one else knows these unless ${character.name} reveals them): ${character.secrets}`,
        );
    }
    return lines.join('\n');
}

function sceneLayer(scene: PromptScene | null): string {
    if (!scene) return `${PROMPT_LAYERS.scene}\nNo Scene — the story unfolds freely.`;
    const moveOn = scene.moveOnCondition.trim()
        ? `\nThis Scene moves on once: ${scene.moveOnCondition.trim().replace(/[.!]+$/, '')}. Let that happen naturally; never force it. Don't hurry toward it: give the Scene room for many exchanges of everyday moments and the Characters' own wants first, and let the user's choices bring it about.`
        : '';
    return `${PROMPT_LAYERS.scene}: ${scene.name}\n${scene.situation}${moveOn}`;
}

/**
 * Spec: "Feelings (every Bond in the Chat, with 'each Character knows only its own
 * feelings')". Bonds are hidden state: the Narrator shows them only through behaviour.
 */
function feelingsLayer(bonds: PromptBond[], identity: string): string {
    const lines =
        bonds.length === 0
            ? ['No feelings have formed yet — everyone is a stranger unless the story says otherwise.']
            : bonds.map(
                  (bond) =>
                      `- ${bond.fromName} → ${bond.toName ?? `the user (${identity})`}: "${bond.label}" — ${bond.description}`,
              );
    return `${PROMPT_LAYERS.feelings} (hidden from the user; show them only through behaviour)
${lines.join('\n')}
Each Character knows only its OWN feelings. Other Characters' feelings are unknown to them unless shown openly in the story.`;
}

/** Spec: "Arcs ('Arc so far' plus the author's Arc direction for each Character)". */
function arcsLayer(arcs: PromptArc[]): string {
    const lines = arcs.map((arc) => {
        const soFar = arc.steps.length > 0 ? `Arc so far: ${arc.steps.join(' → ')}` : 'Arc so far: unchanged from the core definition.';
        const direction = arc.direction.trim()
            ? ` Possible direction (author's intent, not yet happened): ${arc.direction.trim()}`
            : '';
        return `- ${arc.name}: ${soFar}${direction}`;
    });
    return `${PROMPT_LAYERS.arcs}\n${lines.join('\n')}`;
}

/**
 * Spec: "Memory block": every non-archived Memory with its Known-by tags, under the
 * instruction that a Character knows only the Memories it is tagged on while the Narrator
 * knows all. `{user}` is rendered as the worn identity's name. Extraction keeps the list
 * under the cap by merging and archiving; should it fall behind, Memories are left out here
 * in `memoryLeaveOutOrder` so the prompt stays bounded, and the caller logs how many.
 */
function memoryLayer(
    memories: PromptMemory[],
    identity: string,
    present: string[],
    cap: number,
): { text: string; leftOut: number } {
    const fits = (memoryList: PromptMemory[]) => estimateTokens(memoryList.map((memory) => memoryLine(memory)).join('\n')) <= cap;
    const leftOutIndexes = new Set<number>();
    const keptNow = () => memories.filter((_, index) => !leftOutIndexes.has(index));
    if (!fits(memories)) {
        for (const index of memoryLeaveOutOrder(memories, present, identity)) {
            leftOutIndexes.add(index);
            if (fits(keptNow())) break;
        }
    }
    const kept = keptNow();
    const leftOut = leftOutIndexes.size;
    const lines =
        kept.length === 0
            ? ['Nothing has been established in this Chat yet.']
            : kept.map((memory) => memoryLine({ text: renderUser(memory.text, identity), knownBy: memory.knownBy }));
    return {
        text: `${PROMPT_LAYERS.memory} (what has happened in this Chat so far)
${lines.join('\n')}
A Character knows only the Memories it is tagged on and acts as if the rest never happened; the Narrator knows them all.`,
        leftOut,
    };
}

/**
 * The order in which Memories are left out once the Memory layer is over its cap, as indexes
 * into `memories` (oldest first). A locked Memory is never left out. Memories about a Character
 * in the latest exchange or about the worn identity go last; within each group, oldest first.
 */
export function memoryLeaveOutOrder(memories: PromptMemory[], present: string[], identity: string): number[] {
    const unlocked = memories.flatMap((memory, index) => (memory.locked ? [] : [index]));
    const relevant = (index: number) => memoryIsAbout(memories[index].text, present, identity);
    return [...unlocked.filter((index) => !relevant(index)), ...unlocked.filter(relevant)];
}

/** Spec: "Prompt layer": the Story so far stands in for the Messages it covers, which the history then leaves out. */
function storySoFarLayer(storySoFar: PromptStorySoFar): string {
    return `${PROMPT_LAYERS.storySoFar} (everything that happened before the Messages below; treat it as having happened)
${storySoFar.text.trim()}
Each Character remembers only what it saw, did or was told of these events; the Narrator knows them all.`;
}

/** The Messages the prompt sends word for word: those after the ones the Story so far covers. */
export function uncoveredHistory(history: PromptHistoryMessage[], storySoFar: PromptStorySoFar | null | undefined): PromptHistoryMessage[] {
    return storySoFar ? history.slice(Math.min(storySoFar.coveredMessages, history.length)) : history;
}

/** Stop strings on the worn identity (spec); the gateway drops them for hosts without support. */
export function stopStrings(identityName: string): string[] {
    return [`\n${identityName}:`, `\n@${identityName}:`, '\nYou:'];
}

/**
 * Spec: "Continue". Stands in for the user's message on a turn the user asked to go on
 * without one: the story moves on, and the worn identity does nothing new. Only the manual
 * battery shows whether the play model obeys; if it doesn't, this is the thing to tune.
 */
export function continueInstruction(identity: string): string {
    return `(${identity} does nothing new this turn and waits.) Continue the story from exactly where it stands: let the Characters and the world move it forward. Do not write anything ${identity} says, thinks, feels, decides or does, and stop where ${identity} can respond.`;
}

/** The layers a prompt is built on: everything of a turn's input but the Messages. */
export type PromptLayersInput = Omit<TurnPromptInput, 'history' | 'userText' | 'tokenBudget' | 'nudge'>;

/**
 * Layers 1–9 as the one system message, shared by the turn and by Suggested replies so they
 * read the Chat the same way. Reports how many Memories were left out to fit the cap.
 */
export function systemPrompt(input: PromptLayersInput): { text: string; memoriesLeftOut: number } {
    const identity = input.identity.name;
    const castNames = input.story.characters.map((character) => character.name);
    const memory = memoryLayer(input.memories, identity, input.present ?? [], input.memoryCapTokens ?? MEMORY_CAP_TOKENS);
    const text = [
        rulesLayer(identity, castNames),
        `${PROMPT_LAYERS.setting}\n${input.story.setting}`,
        `${PROMPT_LAYERS.identity}\n${identity}: ${input.identity.description}`,
        styleLayer(input.story, identity),
        `${PROMPT_LAYERS.cast}\n${input.story.characters.map(castCard).join('\n\n')}`,
        sceneLayer(input.scene),
        feelingsLayer(input.bonds, identity),
        arcsLayer(input.arcs),
        memory.text,
        ...(input.storySoFar ? [storySoFarLayer(input.storySoFar)] : []),
    ].join('\n\n');
    return { text, memoriesLeftOut: memory.leftOut };
}

/** The newest Messages that fit in `budget` tokens, oldest first; older ones are left out. */
export function recentHistory(history: PromptHistoryMessage[], budget: number): PromptHistoryMessage[] {
    let remaining = budget;
    const kept: PromptHistoryMessage[] = [];
    for (let i = history.length - 1; i >= 0; i--) {
        const cost = estimateTokens(history[i].text);
        if (cost > remaining) break;
        remaining -= cost;
        kept.unshift(history[i]);
    }
    return kept;
}

/** The Story's point of view and tense for the worn identity, as the Style layer words them. */
export function povAndTense(story: PromptStory, identity: string): string {
    return `${POV_WORDS[story.pov](identity)}, ${story.tense} tense`;
}

/** The trailing system message of every turn. */
export function turnFinalInstruction(identity: string): string {
    return `Write the next turn now. Do not write anything ${identity} says, thinks or does. Use @Name: lines for Character speech, spoken words only: no parentheses or *(stage directions)* inside them, even where earlier turns had them. Actions go in narration.`;
}

/**
 * A short restatement of where things stand, read last, just before the final instruction:
 * the Scene, the Time of day, who was in the latest exchange, and the point of view. Instructions
 * far up a long prompt fade (docs/research/keeping-characters-in-character.md); this keeps the
 * essentials close.
 */
export function stateReminder(
    input: Pick<TurnPromptInput, 'story' | 'identity' | 'scene' | 'present' | 'timeOfDay' | 'sittingOut'>,
): string {
    const sittingOut = input.sittingOut ?? [];
    // Someone sitting out is never "in the latest exchange", so the two hints never disagree.
    const present = (input.present ?? []).filter((name) => !sittingOut.includes(name));
    const lines = [input.scene ? `Scene: ${input.scene.name}.` : 'No Scene: the story unfolds freely.'];
    if (input.timeOfDay) lines.push(`Time: ${input.timeOfDay}.`);
    if (present.length > 0) lines.push(`In the latest exchange: ${present.join(', ')}.`);
    if (sittingOut.length > 0) lines.push(sittingOutSentence(sittingOut));
    lines.push(`Narrate in ${povAndTense(input.story, input.identity.name)}, and keep each Character as their card describes.`);
    lines.push(`Gender ${input.identity.name} only as their description or the user's own messages do, whatever earlier turns said.`);
    return `Where things stand: ${lines.join(' ')}`;
}

/**
 * The reminder's sentence for the Characters sitting out (.scratch/speaker-controls/spec.md): they
 * take no part in the story for now. Others may still talk about them.
 */
export function sittingOutSentence(names: string[]): string {
    return `Sitting out: ${names.join(', ')}. They take no part in the story for now: don't write their words or actions, and don't bring them into the scene.`;
}

/**
 * The Nudge line (.scratch/speaker-controls/spec.md): a hint, never a forced speaker. It sits after
 * "Where things stand" and before the final instruction.
 */
export function nudgeLine(name: string): string {
    return `The user would like to hear from ${name} this turn: give ${name} a line or a moment if ${name} could plausibly be there. If not, carry on naturally without forcing it.`;
}

/** What the Story so far trigger reserves for a Nudge line, which it can't know in advance. */
export const NUDGE_RESERVE_TOKENS = 60;

/**
 * The Author's note block (.scratch/authors-note/spec.md), or null when the note is empty. It
 * sits after the Lore and before "Where things stand" in the turn's trailing message, and before
 * the instruction of Suggested replies, in the same words everywhere. It directs and is never a
 * fact, so it is never quoted, and it never lifts the rule about the worn identity.
 */
export function authorsNoteBlock(note: string | null | undefined, identity: string): string | null {
    const text = note?.trim() ?? '';
    if (text === '') return null;
    return `# Author's note (the user's own direction for this Chat)
${text}
Let this guide where the story goes and how it is told. It is a direction, not something that happened: never quote it or mention it, and write the story in English whatever language the note is in. It never overrides the rules about ${identity}: never write anything ${identity} says, thinks, feels, decides or does.`;
}

/** The blocks of a closing message in the order given, a blank line apart; a null block has nothing to say and is left out. */
export function joinBlocks(blocks: Array<string | null>): string {
    return blocks.filter((block): block is string => block !== null).join('\n\n');
}

/**
 * An earlier reply as the prompt shows it: its `@Name:` lines without `*(stage directions)*`.
 * The model copies the shape of its earlier replies more than any rule, so a Chat whose
 * replies grew stage directions would keep writing them; the stored Messages keep theirs.
 */
export function withoutStageDirections(text: string): string {
    return text
        .split('\n')
        .map((line) =>
            line.startsWith('@')
                ? line
                      .replace(/\s*\*\([^)]*\)\*\s*/g, ' ')
                      .replace(/^(@[^:\s]+:)\s*/, '$1 ')
                      .trimEnd()
                : line,
        )
        .join('\n');
}

export function buildTurnPrompt(input: TurnPromptInput): TurnPrompt {
    const identity = input.identity.name;
    const userText = input.userText ?? continueInstruction(identity);
    const system = systemPrompt(input);
    const lore = loreBlock(input.chosenLore ?? []);
    // One order (.scratch/sillytavern-gaps/integration.md): Lore, Documents, Author's note, Where things stand, Nudge, the final instruction.
    const finalInstruction = joinBlocks([
        lore,
        documentsBlock(input.documentPassages ?? []),
        authorsNoteBlock(input.authorsNote, identity),
        // Without a nudge, exactly the reminder and the final instruction as before.
        [stateReminder(input), input.nudge ? nudgeLine(input.nudge) : null, turnFinalInstruction(identity)]
            .filter((line): line is string => line !== null)
            .join('\n'),
    ]);

    const budget = input.tokenBudget ?? TURN_PROMPT_TOKEN_BUDGET;
    const fixed = estimateTokens(system.text) + estimateTokens(userText) + estimateTokens(finalInstruction);
    const uncovered = uncoveredHistory(input.history, input.storySoFar);
    const kept = recentHistory(uncovered, budget - fixed);

    return {
        messages: [
            { role: 'system', content: system.text },
            ...kept.map((message) => ({
                role: message.role,
                content: message.role === 'assistant' ? withoutStageDirections(message.text) : message.text,
            })),
            { role: 'user', content: userText },
            { role: 'system', content: finalInstruction },
        ],
        stop: stopStrings(identity),
        maxTokens: REPLY_LENGTH_WORDS[input.story.replyLength].maxTokens,
        // Covered Messages are in the Story so far, so only uncovered ones count as left out.
        trimmed: uncovered.length - kept.length,
        memoriesLeftOut: system.memoriesLeftOut,
    };
}

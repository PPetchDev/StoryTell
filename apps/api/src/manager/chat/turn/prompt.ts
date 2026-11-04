import { Pov, ReplyLength, Tense } from '../../../model/story/entities/story.entity.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { MEMORY_CAP_TOKENS, memoryLine } from '../memory/memory-prompt.js';
import { renderUser } from '../memory/render-user.js';

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
    /** Every Message of the Chat before the new one, oldest first. */
    history: PromptHistoryMessage[];
    userText: string;
    /** Total prompt budget in tokens; recent Messages are trimmed from the oldest to fit. */
    tokenBudget?: number;
    /** The Memory layer's cap in tokens (spec: "about 2k tokens"); the oldest unlocked Memories are left out past it. */
    memoryCapTokens?: number;
}

export interface TurnPrompt {
    messages: PromptMessage[];
    stop: string[];
    maxTokens: number;
    /** How many of the oldest history Messages were left out to fit the budget. */
    trimmed: number;
    /** How many of the oldest unlocked Memories were left out to keep the Memory layer under its cap. */
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
} as const;

/** A rough token count: about four characters per token of English prose. */
export function estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
}

const POV_WORDS: Record<Pov, (name: string) => string> = {
    [Pov.First]: (name) => `first person as ${name} ("I")`,
    [Pov.Second]: (name) => `second person for ${name} ("you")`,
    [Pov.Third]: (name) => `third person, ${name} by name`,
};

function rulesLayer(identity: string, castNames: string[]): string {
    return `${PROMPT_LAYERS.rules}
You are the Narrator of an interactive story. You describe the Setting and action and decide which Characters speak.
- This is fiction for a consenting adult reader. All characters are adults. Explicit sexual content, violence and dark themes are allowed when the story leads there; write them without moralising, warnings or fading to black unless the user asks.
- The user plays ${identity}. NEVER write ${identity}'s words, thoughts, feelings, decisions or actions. Describe only what others do and what ${identity} can perceive, then stop where ${identity} can respond.
- Stay inside the Setting. Characters know nothing outside their world.
- Keep each Character's voice distinct, and don't let everyone talk every turn.
- Each Character acts only on what it knows: its own feelings and secrets, and what it has seen or been told.

# Output format
- Narration in plain paragraphs (no prefix).
- Each Character's speech and small actions on lines starting with "@Name:" using exactly these names: ${castNames.join(', ')}.
- Choose who speaks: only Characters present who would naturally respond. Zero, one or several may speak, in any order, interleaved with narration.`;
}

function styleLayer(story: PromptStory, identity: string): string {
    const words = REPLY_LENGTH_WORDS[story.replyLength];
    return `${PROMPT_LAYERS.style}
- Write in English, ${POV_WORDS[story.pov](identity)}, ${story.tense} tense.
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
        ? `\nThis Scene moves on once: ${scene.moveOnCondition}. Let that happen naturally; never force it.`
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
 * under the cap by merging and archiving; should it fall behind, the oldest unlocked
 * Memories are left out here so the prompt stays bounded, and the caller logs how many.
 */
function memoryLayer(memories: PromptMemory[], identity: string, cap: number): { text: string; leftOut: number } {
    const fits = (kept: PromptMemory[]) => estimateTokens(kept.map((memory) => memoryLine(memory)).join('\n')) <= cap;
    const kept = [...memories];
    let leftOut = 0;
    while (!fits(kept)) {
        const oldestUnlocked = kept.findIndex((memory) => !memory.locked);
        if (oldestUnlocked < 0) break;
        kept.splice(oldestUnlocked, 1);
        leftOut++;
    }
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

/** Stop strings on the worn identity (spec); the gateway drops them for hosts without support. */
export function stopStrings(identityName: string): string[] {
    return [`\n${identityName}:`, `\n@${identityName}:`, '\nYou:'];
}

export function buildTurnPrompt(input: TurnPromptInput): TurnPrompt {
    const identity = input.identity.name;
    const castNames = input.story.characters.map((character) => character.name);
    const memory = memoryLayer(input.memories, identity, input.memoryCapTokens ?? MEMORY_CAP_TOKENS);
    const system = [
        rulesLayer(identity, castNames),
        `${PROMPT_LAYERS.setting}\n${input.story.setting}`,
        `${PROMPT_LAYERS.identity}\n${identity}: ${input.identity.description}`,
        styleLayer(input.story, identity),
        `${PROMPT_LAYERS.cast}\n${input.story.characters.map(castCard).join('\n\n')}`,
        sceneLayer(input.scene),
        feelingsLayer(input.bonds, identity),
        arcsLayer(input.arcs),
        memory.text,
    ].join('\n\n');
    const finalInstruction = `Write the next turn now. Do not write anything ${identity} says, thinks or does. Use @Name: lines for Character speech.`;

    const budget = input.tokenBudget ?? TURN_PROMPT_TOKEN_BUDGET;
    const fixed = estimateTokens(system) + estimateTokens(input.userText) + estimateTokens(finalInstruction);
    let remaining = budget - fixed;
    const kept: PromptHistoryMessage[] = [];
    for (let i = input.history.length - 1; i >= 0; i--) {
        const cost = estimateTokens(input.history[i].text);
        if (cost > remaining) break;
        remaining -= cost;
        kept.unshift(input.history[i]);
    }

    return {
        messages: [
            { role: 'system', content: system },
            ...kept.map((message) => ({ role: message.role, content: message.text })),
            { role: 'user', content: input.userText },
            { role: 'system', content: finalInstruction },
        ],
        stop: stopStrings(identity),
        maxTokens: REPLY_LENGTH_WORDS[input.story.replyLength].maxTokens,
        trimmed: input.history.length - kept.length,
        memoriesLeftOut: memory.leftOut,
    };
}

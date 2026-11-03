import { Pov, ReplyLength, Tense } from '../../../model/story/entities/story.entity.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';

/**
 * Prompt assembly for one turn (spec: "Prompt assembly"). Pure logic over plain inputs, so
 * tests can pin the layer order and the trimming without a database.
 *
 * Layers, most stable first so prompt caching holds:
 *  1. Narrator rules      5. Cast cards              9. Memory (ticket 28)
 *  2. Setting             6. current Scene          10. recent Messages
 *  3. Role                7. Feelings (ticket 27)   11. the user's message
 *  4. Style               8. Arcs (ticket 27)       12. the final instruction
 *
 * Layers 1–9 form one system message with a `# Heading` per layer; 10–11 are chat turns;
 * 12 is a trailing system message, as in the prototype.
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

export interface TurnPromptInput {
    story: PromptStory;
    identity: PromptIdentity;
    scene: PromptScene | null;
    /** Every Message of the Chat before the new one, oldest first. */
    history: PromptHistoryMessage[];
    userText: string;
    /** Total prompt budget in tokens; recent Messages are trimmed from the oldest to fit. */
    tokenBudget?: number;
}

export interface TurnPrompt {
    messages: PromptMessage[];
    stop: string[];
    maxTokens: number;
    /** How many of the oldest history Messages were left out to fit the budget. */
    trimmed: number;
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
    identity: "# The user's Role",
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

/** Stop strings on the worn identity (spec); the gateway drops them for hosts without support. */
export function stopStrings(identityName: string): string[] {
    return [`\n${identityName}:`, `\n@${identityName}:`, '\nYou:'];
}

export function buildTurnPrompt(input: TurnPromptInput): TurnPrompt {
    const identity = input.identity.name;
    const castNames = input.story.characters.map((character) => character.name);
    const system = [
        rulesLayer(identity, castNames),
        `${PROMPT_LAYERS.setting}\n${input.story.setting}`,
        `${PROMPT_LAYERS.identity}\n${identity}: ${input.identity.description}`,
        styleLayer(input.story, identity),
        `${PROMPT_LAYERS.cast}\n${input.story.characters.map(castCard).join('\n\n')}`,
        sceneLayer(input.scene),
        // Feelings (Bonds), Arcs and Memory go here, in that order: tickets 27 and 28.
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
    };
}

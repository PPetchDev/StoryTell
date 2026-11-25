import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { ROLL_RESERVE_TOKENS } from '../roll.js';
import { SUDDEN_EVENT_RESERVE_TOKENS } from '../sudden-event/sudden-event.js';
import {
    authorsNoteBlock,
    estimateTokens,
    CUE_RESERVE_TOKENS,
    NUDGE_RESERVE_TOKENS,
    PromptHistoryMessage,
    PromptLayersInput,
    stateReminder,
    systemPrompt,
    TURN_PROMPT_TOKEN_BUDGET,
    turnFinalInstruction,
} from '../turn/prompt.js';
import { documentsReserveTokens } from '../../document/document-search.js';
import { loreReserveTokens } from '../lore/lore-select.js';
import { beliefCost, memoryCost } from '../memory/memory-choice.js';
import { factsBlock } from '../details/facts.js';
import { itemsBlock } from '../details/items.js';
import { secretsBlock } from '../secrets/secrets.js';
import { PRESSING_RESERVE_TOKENS } from '../details/pressing.js';
import { REPEATS_RESERVE_TOKENS } from '../speech/repeated-phrases.js';

/**
 * The Story so far (spec: "Story so far"): when it is written, and the call that writes it.
 * Pure logic over plain inputs, like the turn prompt.
 */

/** An update runs once the uncovered Messages would take more than the room left minus this. */
export const STORY_SO_FAR_TRIGGER_MARGIN = 1_000;
/** An update covers enough Messages that the rest fit in the room minus this, so several turns pass before the next. */
export const STORY_SO_FAR_HEADROOM = 4_000;
/** The next user message is not known when the check runs; this stands in for it. */
export const NEXT_USER_MESSAGE_TOKENS = 300;
/** Spec: "at most about 500 words". */
export const STORY_SO_FAR_WORDS = 500;
/**
 * The writer's hard cap, well above the 500 words it is asked for (spec: "Length cap"): at
 * 1,000, half its answers on a long Chat ran past ~730 words and were cut off.
 */
export const STORY_SO_FAR_MAX_TOKENS = 2_000;
/** The newest Messages are always sent word for word. */
const ALWAYS_UNCOVERED = 2;

/**
 * Spec: "When it is written (no gap)". The number of first Messages the Story so far should
 * cover after this turn, or null when no update is due: the Messages after the covered ones
 * still fit in the room left, minus the trigger margin. The new number leaves the rest
 * fitting in the room minus the headroom, which counts the summary's own growth to its cap.
 */
export function storySoFarCoverage(layers: PromptLayersInput, history: PromptHistoryMessage[], budget = TURN_PROMPT_TOKEN_BUDGET): number | null {
    const covered = Math.min(layers.storySoFar?.coveredMessages ?? 0, history.length);
    // The reminder names who is present, which isn't known here: the cast stands in for it.
    const reminder = stateReminder({ ...layers, present: layers.story.characters.map((character) => character.name) });
    const fixed =
        estimateTokens(systemPrompt(layers).text) +
        NEXT_USER_MESSAGE_TOKENS +
        // The Lore block varies by turn; the most it can take is reserved.
        loreReserveTokens(layers.lore ?? []) +
        // So is the Documents block's cap, when the Story has passages (.scratch/documents/spec.md: "Budget").
        documentsReserveTokens(layers.hasDocuments) +
        // The Memory the next turn may choose, past what the layer holds now (.scratch/memory-by-meaning/spec.md: "The budget is reserved").
        Math.max(
            0,
            (layers.memoryRoomTokens ?? 0) -
                layers.memories.reduce((sum, memory) => sum + memoryCost(memory), 0) -
                (layers.beliefs ?? []).reduce((sum, belief) => sum + beliefCost({ id: 0, ...belief }), 0),
        ) +
        // A Nudge line may ride on the next turn (.scratch/speaker-controls/spec.md): a small fixed allowance.
        NUDGE_RESERVE_TOKENS +
        // And a Cue (CONTEXT.md): room for the longest one.
        CUE_RESERVE_TOKENS +
        // A Roll may ride on it too (.scratch/roll/spec.md), and a Sudden event's block where the Story has one.
        ROLL_RESERVE_TOKENS +
        (layers.hasSuddenEvents ? SUDDEN_EVENT_RESERVE_TOKENS : 0) +
        // The Author's note, as the Chat holds it when the check runs.
        estimateTokens(authorsNoteBlock(layers.authorsNote, layers.identity.name) ?? '') +
        // The Established facts as they stand, and a line of repeated phrases (.scratch/story-quality/spec.md).
        estimateTokens(factsBlock(layers.facts) ?? '') +
        // And the Items as they stand (.scratch/story-items/spec.md).
        estimateTokens(itemsBlock(layers.items, layers.identity.name) ?? '') +
        // And the Secrets block as it stands (.scratch/secret-reveals/spec.md).
        estimateTokens(secretsBlock(layers.secrets, layers.identity.name) ?? '') +
        REPEATS_RESERVE_TOKENS +
        // And a pressing note's line, which only the turn before can give (.scratch/reply-repair/spec.md).
        PRESSING_RESERVE_TOKENS +
        estimateTokens(`${reminder}
${turnFinalInstruction(layers.identity.name)}`);
    const room = budget - fixed;
    const cost = (message: PromptHistoryMessage) => estimateTokens(message.text);
    let uncovered = history.slice(covered).reduce((sum, message) => sum + cost(message), 0);
    if (uncovered <= room - STORY_SO_FAR_TRIGGER_MARGIN) return null;

    const growth = Math.max(0, STORY_SO_FAR_MAX_TOKENS - estimateTokens(layers.storySoFar?.text ?? ''));
    const target = room - STORY_SO_FAR_HEADROOM - growth;
    let next = covered;
    while (next < history.length - ALWAYS_UNCOVERED && uncovered > target) {
        uncovered -= cost(history[next]);
        next++;
    }
    return next > covered ? next : null;
}

export interface StorySoFarPromptInput {
    identityName: string;
    castNames: string[];
    /** Every Message the Story so far will cover, oldest first, each with who wrote it. */
    messages: Array<{ speaker: string; text: string }>;
    /** The user's own last text, if they ever wrote one: their corrections win. Null otherwise. */
    corrections: string | null;
    /**
     * The answer before this one ran to the length cap and was cut off: ask for a shorter account
     * (.scratch/story-so-far-length/spec.md). Asked again in the same words, the second answer was
     * cut off too one time in three on live.
     */
    ranLong?: boolean;
}

/** What a second try asks for after a cut-off: well under the words first asked for, so it ends. */
export const STORY_SO_FAR_SHORTER_WORDS = 350;
/** Why an answer that used the whole length cap can't be stored. */
export const STORY_SO_FAR_CUT_OFF = 'The Story so far writer was cut off at its length cap.';

/**
 * Spec: "How it is written (from scratch)". Every covered Message goes in each time, so no
 * detail fades over many rewrites; the user's own text rides along as corrections that win.
 */
export function storySoFarPromptMessages(input: StorySoFarPromptInput): PromptMessage[] {
    const name = input.identityName;
    const system = `You keep the record of an interactive story: an account of everything that has happened so far, which the storyteller reads before writing what comes next.

Rules:
- Tell the events in the order they happened: who did what, where, what was said that matters, what changed between people, and where things stand at the end.
- Keep every detail that could matter later: names, promises, secrets revealed or kept, gifts, injuries, places, plans.
- Write in the third person and the past tense. ${name} is the character the user plays: call them ${name}, and never guess ${name}'s gender; use their name or "they" unless the story itself states it.
- Everyone in the story is an adult: never call anyone a girl, boy, child or kid.
- Only what the Messages show. Add nothing, explain nothing, judge nothing.
- At most ${STORY_SO_FAR_WORDS} words of plain prose: no headings, no lists, no quotes of long dialogue.
- The Characters are: ${input.castNames.join(', ')}.

Reply with the account only.`;

    const sections = [`The Messages, oldest first:\n\n${input.messages.map((message) => `[${message.speaker}]\n${message.text}`).join('\n\n')}`];
    if (input.corrections && input.corrections.trim() !== '') {
        sections.push(
            `The user corrected the previous account to read as below. Where it and the Messages differ, the user's version wins; keep everything it says:\n\n${input.corrections.trim()}`,
        );
    }
    sections.push(
        input.ranLong
            ? `Your last account ran too long and was cut off before it reached the end. Write the account again, shorter: at most ${STORY_SO_FAR_SHORTER_WORDS} words, and carry it through to the last of the Messages.`
            : 'Write the account now.',
    );
    return [
        { role: 'system', content: system },
        { role: 'user', content: sections.join('\n\n') },
    ];
}

/** The model's answer as the account: trimmed, without a heading it may add. Null when nothing is left. */
export function parseStorySoFar(text: string): string | null {
    const cleaned = text
        .trim()
        .replace(/^#+\s*story so far\s*:?\s*/i, '')
        .replace(/^\*\*story so far:?\*\*\s*/i, '')
        .replace(/^story so far:\s*/i, '')
        .replace(/^\[account\]\s*/i, '')
        .trim();
    return cleaned === '' ? null : cleaned;
}

/**
 * Spec: "Writer output guard". Why the writer's answer can't be stored as the account, or null
 * when it can. `speakers` are the tags the Messages were given to it under.
 */
export function storySoFarRejection(text: string, completionTokens: number, speakers: string[], maxTokens = STORY_SO_FAR_MAX_TOKENS): string | null {
    // Using the whole cap means the model was stopped there: the account's last events are missing.
    if (completionTokens >= maxTokens) return STORY_SO_FAR_CUT_OFF;
    const tag = /^\[([^\]\n]+)\]/.exec(text.trim())?.[1]?.trim().toLowerCase();
    if (tag !== undefined && speakers.some((speaker) => speaker.trim().toLowerCase() === tag)) {
        return 'The Story so far writer went on with the story instead of telling it.';
    }
    return null;
}

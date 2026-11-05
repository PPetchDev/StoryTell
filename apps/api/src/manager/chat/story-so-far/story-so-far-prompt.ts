import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import {
    estimateTokens,
    PromptHistoryMessage,
    PromptLayersInput,
    stateReminder,
    systemPrompt,
    TURN_PROMPT_TOKEN_BUDGET,
    turnFinalInstruction,
} from '../turn/prompt.js';

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
export const STORY_SO_FAR_MAX_TOKENS = 1_000;
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
}

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
    sections.push('Write the account now.');
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
        .trim();
    return cleaned === '' ? null : cleaned;
}

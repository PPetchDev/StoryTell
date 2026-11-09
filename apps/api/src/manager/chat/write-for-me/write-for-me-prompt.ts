import { UnreadableWriteForMeError } from '../../../errors/chat.errors.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { documentsBlock } from '../../document/document-search.js';
import { loreBlock } from '../lore/lore-select.js';
import {
    authorsNoteBlock,
    estimateTokens,
    joinBlocks,
    povAndTense,
    PromptHistoryMessage,
    PromptLayersInput,
    recentHistory,
    systemPrompt,
    TURN_PROMPT_TOKEN_BUDGET,
    uncoveredHistory,
} from '../turn/prompt.js';

/** .scratch/write-for-me/spec.md: the composer's draft, whatever language, at most this long. */
export const WRITE_FOR_ME_DRAFT_MAX = 4_000;

/** Room for a long Thai draft rendered in English; the instruction asks for far less. */
export const WRITE_FOR_ME_MAX_TOKENS = 600;

/** A Character's speech line: the model has stopped writing for the user and started on the cast. */
export const WRITE_FOR_ME_STOP = ['\n@'];

/** The markers around the user's draft, so the model can tell it from the instruction. */
export const DRAFT_OPEN = '<draft>';
export const DRAFT_CLOSE = '</draft>';

export interface WriteForMePromptInput extends PromptLayersInput {
    /** Every Message of the Chat, oldest first. */
    history: PromptHistoryMessage[];
    /** What is in the composer: Thai, notes, half a line, or nothing. */
    draft: string;
}

export interface WriteForMePrompt {
    messages: PromptMessage[];
    maxTokens: number;
    stop: string[];
}

/**
 * The instruction after the history. Like Suggested replies it steps outside the story to write
 * the worn identity's own words, which the Rules layer forbids the Narrator. The length is fixed
 * and short: the Story's reply length sizes the Narrator's turn, the wrong size for a player's line.
 */
export function writeForMeInstruction(input: Pick<WriteForMePromptInput, 'identity' | 'story' | 'draft'>): string {
    const identity = input.identity.name;
    const draft = input.draft.trim();
    const source =
        draft === ''
            ? `The user has written nothing for it. Decide what ${identity} does and says next, in keeping with ${identity} and the moment.`
            : `Between the ${DRAFT_OPEN} markers is the user's own rough draft of it. It may be in Thai or another language, notes, or half a line. Keep everything it says ${identity} does and says, in its order, add no new decisions of weight, and turn it into natural English.
${DRAFT_OPEN}
${draft}
${DRAFT_CLOSE}`;
    return `Step outside the story for this one answer. The user plays ${identity} and wants ${identity}'s next Message written for them, as ${identity}, in ${povAndTense(input.story, identity)}, following on from exactly where the story stands.
${source}
Write only ${identity}'s words and actions, never what a Character says, does or feels. Put actions in *asterisks* and speech in quotes, like the user's earlier Messages. Keep it to one to four sentences, at most about 120 words; when the draft holds more, keep all of it.
Answer with only the Message: no name label and no notes.`;
}

/**
 * The turn's system message (its cached prefix) and recent history, then one closing `user`
 * message: Lore → Documents → Author's note → the instruction (.scratch/sillytavern-gaps/integration.md), each block
 * only when it has something. The history is kept to the budget left after that message.
 */
export function buildWriteForMePrompt(input: WriteForMePromptInput): WriteForMePrompt {
    const system = systemPrompt(input);
    const closing = joinBlocks([
        loreBlock(input.chosenLore ?? []),
        documentsBlock(input.documentPassages ?? []),
        authorsNoteBlock(input.authorsNote, input.identity.name),
        writeForMeInstruction(input),
    ]);
    const kept = recentHistory(
        uncoveredHistory(input.history, input.storySoFar),
        TURN_PROMPT_TOKEN_BUDGET - estimateTokens(system.text) - estimateTokens(closing),
    );
    return {
        messages: [
            { role: 'system', content: system.text },
            ...kept.map((message) => ({ role: message.role, content: message.text })),
            // A user message, not a trailing system one: GLM-5.3 on DeepInfra answered that with nothing for Suggested replies.
            { role: 'user', content: closing },
        ],
        maxTokens: WRITE_FOR_ME_MAX_TOKENS,
        stop: WRITE_FOR_ME_STOP,
    };
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Reads the model's answer as the user's next Message: trimmed, out of a wrapping code fence,
 * without a leading `Name:` or `@Name:` label for the worn identity, and cut at the first line
 * that starts with `@` (a Character's line, behind the stop string). Empty throws
 * `UnreadableWriteForMeError`.
 */
export function readWriteForMe(text: string, identityName: string): string {
    let answer = text.trim();
    const fenced = answer.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fenced) answer = fenced[1].trim();
    answer = answer.replace(new RegExp(`^@?${escapeRegExp(identityName)}\\s*:\\s*`, 'i'), '');
    const lines = answer.split('\n');
    const characterLine = lines.findIndex((line) => line.trimStart().startsWith('@'));
    if (characterLine >= 0) answer = lines.slice(0, characterLine).join('\n');
    answer = answer.trim();
    if (answer === '') throw new UnreadableWriteForMeError();
    return answer;
}

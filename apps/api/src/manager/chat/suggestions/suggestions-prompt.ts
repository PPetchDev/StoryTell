import { UnreadableSuggestionsError } from '../../../errors/chat.errors.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import {
    estimateTokens,
    povAndTense,
    PromptHistoryMessage,
    PromptLayersInput,
    recentHistory,
    systemPrompt,
    TURN_PROMPT_TOKEN_BUDGET,
} from '../turn/prompt.js';

/**
 * Spec: "Suggested replies". Three things the user might write next, each of its own kind:
 * something the worn identity does, a line it says, and a bold move that pushes the story on.
 */
export const SUGGESTION_KINDS = ['action', 'speech', 'move'] as const;
export type SuggestionKind = (typeof SUGGESTION_KINDS)[number];

export interface SuggestedReply {
    kind: SuggestionKind;
    text: string;
}

export interface SuggestionsPromptInput extends PromptLayersInput {
    /** Every Message of the Chat, oldest first. */
    history: PromptHistoryMessage[];
}

export interface SuggestionsPrompt {
    messages: PromptMessage[];
    maxTokens: number;
}

/** Three short options in JSON fit well under this. */
export const SUGGESTIONS_MAX_TOKENS = 400;

/**
 * The instruction after the history. The Rules layer forbids writing the worn identity's
 * words and actions; this answer steps outside the story to do exactly that, as options the
 * user may pick from. Only the manual battery shows whether the three come out distinct.
 */
export function suggestionsInstruction(input: PromptLayersInput): string {
    const identity = input.identity.name;
    return `Step outside the story for this one answer. The user plays ${identity} and wants ideas for what ${identity} could do next. Suggest three short options the user could send, written as ${identity} in ${povAndTense(input.story, identity)}, following on from exactly where the story stands:
- "action": something ${identity} does.
- "speech": a line ${identity} says aloud.
- "move": a bold move by ${identity} that pushes the story forward.
Each option is one or two sentences, and the three must be clearly different. Write only for ${identity}, never for the Characters.
Answer with only this JSON object and nothing else:
{"suggestions":[{"kind":"action","text":"..."},{"kind":"speech","text":"..."},{"kind":"move","text":"..."}]}`;
}

/** The turn's system layers and recent history, then the suggestions instruction. */
export function buildSuggestionsPrompt(input: SuggestionsPromptInput): SuggestionsPrompt {
    const system = systemPrompt(input);
    const instruction = suggestionsInstruction(input);
    const kept = recentHistory(input.history, TURN_PROMPT_TOKEN_BUDGET - estimateTokens(system.text) - estimateTokens(instruction));
    return {
        messages: [
            { role: 'system', content: system.text },
            ...kept.map((message) => ({ role: message.role, content: message.text })),
            // A user message, not a trailing system one: GLM-5.3 on DeepInfra answered that with an empty {"": ""}.
            { role: 'user', content: instruction },
        ],
        maxTokens: SUGGESTIONS_MAX_TOKENS,
    };
}

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;
const isKind = (value: unknown): value is SuggestionKind => SUGGESTION_KINDS.includes(value as SuggestionKind);

/**
 * Reads the model's JSON strictly: exactly three suggestions, one of each kind, each with
 * text. Anything else throws `UnreadableSuggestionsError`. Answers in the order action,
 * speech, move, whatever order the model wrote them in.
 */
export function parseSuggestions(text: string): SuggestedReply[] {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new UnreadableSuggestionsError('no JSON object');
    let json: unknown;
    try {
        json = JSON.parse(match[0]);
    } catch (error) {
        throw new UnreadableSuggestionsError((error as Error).message);
    }
    const items = isObject(json) ? json.suggestions : undefined;
    if (!Array.isArray(items) || items.length !== SUGGESTION_KINDS.length) {
        throw new UnreadableSuggestionsError('not three suggestions');
    }
    const suggestions = items.map((item): SuggestedReply => {
        if (!isObject(item) || !isKind(item.kind) || typeof item.text !== 'string' || item.text.trim() === '') {
            throw new UnreadableSuggestionsError('a suggestion with no kind or no text');
        }
        return { kind: item.kind, text: item.text.trim() };
    });
    return SUGGESTION_KINDS.map((kind) => {
        const found = suggestions.filter((suggestion) => suggestion.kind === kind);
        if (found.length !== 1) throw new UnreadableSuggestionsError(`not one "${kind}"`);
        return found[0];
    });
}

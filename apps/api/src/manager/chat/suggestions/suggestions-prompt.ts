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
    uncoveredHistory,
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
Answer with only this JSON object and nothing else, one key per option:
{"action":"...","speech":"...","move":"..."}`;
}

/** The turn's system layers and recent history, then the suggestions instruction. */
export function buildSuggestionsPrompt(input: SuggestionsPromptInput): SuggestionsPrompt {
    const system = systemPrompt(input);
    const instruction = suggestionsInstruction(input);
    const kept = recentHistory(
        uncoveredHistory(input.history, input.storySoFar),
        TURN_PROMPT_TOKEN_BUDGET - estimateTokens(system.text) - estimateTokens(instruction),
    );
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

/** Exactly one of each kind, each with text, in the order action, speech, move; else the reason. */
function oneOfEach(suggestions: SuggestedReply[]): SuggestedReply[] | string {
    if (suggestions.some((suggestion) => suggestion.text.trim() === '')) return 'a suggestion with no text';
    const ordered: SuggestedReply[] = [];
    for (const kind of SUGGESTION_KINDS) {
        const found = suggestions.filter((suggestion) => suggestion.kind === kind);
        if (found.length !== 1) return `not one "${kind}"`;
        ordered.push({ kind, text: found[0].text.trim() });
    }
    return ordered;
}

/** The asked-for shape: `{"action": "...", "speech": "...", "move": "..."}`. */
function fromFlat(json: unknown): SuggestedReply[] | null {
    if (!isObject(json) || !SUGGESTION_KINDS.every((kind) => typeof json[kind] === 'string')) return null;
    return SUGGESTION_KINDS.map((kind) => ({ kind, text: json[kind] as string }));
}

/** The earlier shape, still accepted: `{"suggestions": [{"kind": "action", "text": "..."}, ...]}`. */
function fromList(json: unknown): SuggestedReply[] | string {
    const items = isObject(json) ? json.suggestions : undefined;
    if (!Array.isArray(items) || items.length !== SUGGESTION_KINDS.length) return 'not three suggestions';
    const suggestions: SuggestedReply[] = [];
    for (const item of items) {
        if (!isObject(item) || !isKind(item.kind) || typeof item.text !== 'string') return 'a suggestion with no kind or no text';
        suggestions.push({ kind: item.kind, text: item.text });
    }
    return suggestions;
}

/**
 * The kind and text pairs in the order written, straight from the text. GLM-5.3 wrote the
 * list shape as one object with the `kind` and `text` keys repeated, which `JSON.parse`
 * collapses to its last pair (seen 2026-11-05); this reads all three back.
 */
function fromPairs(text: string): SuggestedReply[] {
    const pairs = text.matchAll(/"kind"\s*:\s*"(action|speech|move)"\s*,\s*"text"\s*:\s*("(?:[^"\\]|\\.)*")/g);
    const suggestions: SuggestedReply[] = [];
    for (const [, kind, quoted] of pairs) {
        try {
            suggestions.push({ kind: kind as SuggestionKind, text: JSON.parse(quoted) as string });
        } catch {
            // A broken string is skipped; the count check below then refuses the answer.
        }
    }
    return suggestions;
}

/**
 * Reads the model's JSON: exactly three suggestions, one of each kind, each with text,
 * answered in the order action, speech, move. Anything else throws
 * `UnreadableSuggestionsError`, with the first reason found.
 */
export function parseSuggestions(text: string): SuggestedReply[] {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new UnreadableSuggestionsError('no JSON object');
    let json: unknown;
    let reason: string;
    try {
        json = JSON.parse(match[0]);
        const flat = fromFlat(json);
        const read = flat ?? fromList(json);
        const checked = typeof read === 'string' ? read : oneOfEach(read);
        if (typeof checked !== 'string') return checked;
        reason = checked;
    } catch (error) {
        reason = (error as Error).message;
    }
    const recovered = oneOfEach(fromPairs(match[0]));
    if (typeof recovered !== 'string') return recovered;
    throw new UnreadableSuggestionsError(reason);
}

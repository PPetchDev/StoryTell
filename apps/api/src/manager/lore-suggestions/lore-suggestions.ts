import type { PromptMessage } from '../../service/model-gateway/model-gateway.js';
import { estimateTokens } from '../chat/turn/prompt-tokens.js';
import { MAX_LORE_KEYWORD_LENGTH, MAX_LORE_KEYWORDS } from '../story-drafting/draft-schema.js';

/**
 * Lore from a Chat (.scratch/lore-from-chat/spec.md), as pure logic: what the background model is
 * told, and how its answer is read. The suggestions are answered and forgotten; an added one goes
 * through the Story's own "add Lore" endpoint.
 */

/** Spec: "suggest up to 6 entries". */
export const LORE_SUGGESTIONS_MAX = 6;
/** The writer's hard cap: six entries of a few sentences fit well inside it. */
export const LORE_SUGGESTIONS_MAX_TOKENS = 1_500;
/** The newest Messages the call reads, in tokens, newest kept. */
export const LORE_SUGGESTIONS_MESSAGE_TOKENS = 8_000;
/** A Lore entry's name, as the add-Lore endpoint takes it. */
const LORE_NAME_MAX = 200;

export interface LoreSuggestionMessage {
    speaker: string;
    text: string;
}

export interface LoreSuggestionsInput {
    setting: string;
    /** Every Lore entry the Story reads, its own and its linked sets'. */
    lore: readonly { name: string; text: string }[];
    castNames: readonly string[];
    identityName: string;
    storySoFar: string | null;
    /** The written Chapter summaries, oldest first. */
    chapters: readonly { sceneName: string; summary: string }[];
    facts: readonly { topic: string; fact: string }[];
    /** The Places the Chat has been, in the order first noted. */
    places: readonly string[];
    messages: readonly LoreSuggestionMessage[];
}

export interface LoreSuggestion {
    name: string;
    keywords: string[];
    text: string;
}

/** The newest Messages that fit the budget, oldest first. The newest one is always kept, however long. */
export function newestMessagesThatFit(messages: readonly LoreSuggestionMessage[], budget = LORE_SUGGESTIONS_MESSAGE_TOKENS): LoreSuggestionMessage[] {
    let remaining = budget;
    const kept: LoreSuggestionMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const cost = estimateTokens(`${messages[i].speaker}: ${messages[i].text}`);
        if (cost > remaining && kept.length > 0) break;
        remaining -= cost;
        kept.unshift(messages[i]);
    }
    return kept;
}

const SYSTEM = `You keep the Lore of an ongoing piece of interactive fiction for adult readers: short notes about its world that every Chat of the story reads, so the world stays the same from one Chat to the next. Every character is an adult.

From what this Chat has established, suggest new Lore entries: lasting truths of the world that anyone living there would know. Places, peoples, customs and rites, trades and markets, institutions, objects, foods, animals, words of the world's own.
- Only what the Chat itself has made true. Add nothing it doesn't show.
- Not events, not what anyone did or said, not how anyone feels or what they mean to do.
- Not a Character's secret or anything only one person knows.
- Not entries about the Characters or the user's own character themselves: they have cards of their own.
- Nothing the Setting or the Lore already covers, even in other words.
- Each entry: a short name as the story says it; its text in one to three plain sentences, in the story's own words, said as plain fact; keywords for the other ways the story may mention it (other names, plurals), the name already counts.
- At most ${LORE_SUGGESTIONS_MAX} entries, the ones most worth keeping first. None when the Chat has established nothing new about the world.

Answer with only JSON: {"entries":[{"name":"...","keywords":["..."],"text":"..."}]}`;

/** The call's messages: the rules, then the Story's world and what the Chat has established. */
export function loreSuggestionsMessages(input: LoreSuggestionsInput): PromptMessage[] {
    const sections: string[] = [];
    sections.push(`# Setting\n${input.setting.trim() || '(none)'}`);
    sections.push(
        `# Lore the story already has (suggest nothing these cover)\n${
            input.lore.length > 0 ? input.lore.map((entry) => `- ${entry.name}: ${entry.text.trim()}`).join('\n') : '(none)'
        }`,
    );
    sections.push(`# Not Lore (they have cards of their own)\nCharacters: ${input.castNames.join(', ') || '(none)'}. The user's character: ${input.identityName}.`);
    if (input.storySoFar?.trim()) sections.push(`# Story so far\n${input.storySoFar.trim()}`);
    if (input.chapters.length > 0) sections.push(`# Chapters\n${input.chapters.map((chapter) => `## ${chapter.sceneName}\n${chapter.summary.trim()}`).join('\n\n')}`);
    if (input.facts.length > 0) sections.push(`# Established facts\n${input.facts.map((fact) => `- ${fact.topic}: ${fact.fact}`).join('\n')}`);
    if (input.places.length > 0) sections.push(`# Places this Chat has been\n${input.places.map((place) => `- ${place}`).join('\n')}`);
    const kept = newestMessagesThatFit(input.messages);
    const cut = kept.length < input.messages.length;
    sections.push(
        `# The newest Messages${cut ? ' (earlier ones are told in the Story so far)' : ''}\n${kept.map((message) => `${message.speaker}: ${message.text}`).join('\n\n')}`,
    );
    return [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `${sections.join('\n\n')}\n\nSuggest the new Lore entries now, as JSON only.` },
    ];
}

const fold = (text: string): string => text.trim().toLowerCase();

/**
 * The answer's entries, kept as the spec says: a name and text each, at most six, none named as an
 * existing Lore entry, a Character or the identity, keywords cleaned. Null when the answer is not
 * a JSON object with an `entries` list.
 */
export function readLoreSuggestions(
    answer: Record<string, unknown>,
    taken: { lore: readonly string[]; castNames: readonly string[]; identityName: string },
): LoreSuggestion[] | null {
    const entries = answer.entries;
    if (!Array.isArray(entries)) return null;
    const used = new Set([...taken.lore, ...taken.castNames, taken.identityName].map(fold));
    const kept: LoreSuggestion[] = [];
    for (const entry of entries) {
        if (kept.length >= LORE_SUGGESTIONS_MAX) break;
        if (typeof entry !== 'object' || entry === null) continue;
        const { name, text, keywords } = entry as Record<string, unknown>;
        if (typeof name !== 'string' || typeof text !== 'string') continue;
        const cleanName = name.trim().slice(0, LORE_NAME_MAX);
        const cleanText = text.trim();
        if (cleanName === '' || cleanText === '' || used.has(fold(cleanName))) continue;
        used.add(fold(cleanName));
        const seen = new Set([fold(cleanName)]);
        const cleanKeywords: string[] = [];
        for (const keyword of Array.isArray(keywords) ? keywords : []) {
            if (typeof keyword !== 'string') continue;
            const trimmed = keyword.trim().slice(0, MAX_LORE_KEYWORD_LENGTH);
            if (trimmed === '' || seen.has(fold(trimmed))) continue;
            seen.add(fold(trimmed));
            cleanKeywords.push(trimmed);
            if (cleanKeywords.length >= MAX_LORE_KEYWORDS) break;
        }
        kept.push({ name: cleanName, keywords: cleanKeywords, text: cleanText });
    }
    return kept;
}

import { InvalidGreetingError } from '../../errors/character-card.errors.js';
import { Pov, ReplyLength, Tense } from '../../model/story/entities/story.entity.js';
import { CharacterFields, cleanKeywords, LoreEntryFields, StoryFields } from '../story/story.service.js';
import { CardBookEntry, CardData } from './card-reader.js';

/**
 * The fixed mapping from a Character card to a new Story (spec: "The mapping"). Pure: no
 * database, no model call. Every text that comes in has its macros replaced, its line
 * endings made `\n`, and is trimmed and cut to what the editor accepts.
 */

/** The editor's limit for a text field. */
export const TEXT_MAX = 20_000;
export const MAX_EXAMPLE_LINES = 50;
export const MAX_LORE_ENTRIES = 200;
export const LORE_NAME_MAX = 200;
export const MAX_KEYWORDS = 20;
export const KEYWORD_MAX = 100;
export const ROLE_NAME_MAX = 200;

export interface CardChoices {
    /** The name the user plays under: `{{user}}` everywhere. */
    roleName: string;
    /** 0 is `first_mes`, 1..n the alternate greetings in order. */
    greeting: number;
}

export interface CardStoryPlan {
    story: Required<Pick<StoryFields, 'title' | 'setting' | 'opening'>> & Pick<StoryFields, 'pov' | 'tense' | 'replyLength' | 'imageStyle'>;
    role: { name: string; description: string };
    character: Required<CharacterFields>;
    lore: Required<LoreEntryFields>[];
    /** Plain lines for the "Won't come along" list. */
    leftOut: string[];
}

/** Storytell's own block in `data.extensions.storytell`, as the card writer makes it. */
export interface StorytellBlock {
    character: {
        appearance: string;
        personality: string;
        voice: string;
        exampleLines: string[];
        background: string;
        secrets: string;
        arcDirections: string;
    };
    role: { name: string; description: string };
    style: { pov?: Pov; tense?: Tense; replyLength?: ReplyLength; imageStyle: string };
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function str(value: unknown): string {
    return typeof value === 'string' ? value : '';
}

function oneOf<T extends string>(values: Record<string, T>, value: unknown): T | undefined {
    return (Object.values(values) as string[]).includes(value as string) ? (value as T) : undefined;
}

/** The block Storytell's own cards carry, or null when the card has none (or one this version can't read). */
export function storytellBlock(card: CardData): StorytellBlock | null {
    const block = card.extensions.storytell;
    if (!isObject(block) || block.version !== 1 || !isObject(block.character)) return null;
    const character = block.character;
    const role = isObject(block.role) ? block.role : {};
    const style = isObject(block.style) ? block.style : {};
    return {
        character: {
            appearance: str(character.appearance),
            personality: str(character.personality),
            voice: str(character.voice),
            exampleLines: Array.isArray(character.exampleLines)
                ? character.exampleLines.filter((line): line is string => typeof line === 'string')
                : [],
            background: str(character.background),
            secrets: str(character.secrets),
            arcDirections: str(character.arcDirections),
        },
        role: { name: str(role.name), description: str(role.description) },
        style: {
            pov: oneOf(Pov, style.pov),
            tense: oneOf(Tense, style.tense),
            replyLength: oneOf(ReplyLength, style.replyLength),
            imageStyle: str(style.imageStyle),
        },
    };
}

/** The card's greetings in the order the import numbers them: `first_mes`, then the alternates. */
export function greetingsOf(card: CardData): string[] {
    return [card.first_mes, ...card.alternate_greetings];
}

/** V3's nickname when it has one, else the name, else "Character". */
export function characterNameOf(card: CardData): string {
    return card.nickname.trim() || card.name.trim() || 'Character';
}

export function titleOf(card: CardData): string {
    return card.name.trim() || 'Imported card';
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** `{{user}}`/`<USER>` to the Role's name, `{{char}}`/`<BOT>`/`<char>` to the Character's, ignoring case. */
export function replaceMacros(text: string, names: { user: string; char: string }): string {
    return text
        .replace(/\{\{\s*user\s*\}\}|<user>/gi, () => names.user)
        .replace(/\{\{\s*char\s*\}\}|<bot>|<char>/gi, () => names.char);
}

/** A `/pattern/flags` key: a regular expression, which Lore can't use until Lore triggers. */
export function isRegexKey(key: string): boolean {
    return /^\/.+\/[a-z]*$/i.test(key.trim());
}

/** The content with its leading `@@` decorator lines removed. */
function withoutDecorators(content: string): string {
    const lines = content.replace(/\r\n?/g, '\n').split('\n');
    let first = 0;
    while (first < lines.length && lines[first].trimStart().startsWith('@@')) first++;
    return lines.slice(first).join('\n');
}

function plural(count: number, one: string, many = `${one}s`): string {
    return `${count} ${count === 1 ? one : many}`;
}

const SETTING_WORDS: Record<string, string> = {
    scan_depth: 'scan depth',
    token_budget: 'token budget',
    recursive_scanning: 'recursive scanning',
    insertion_order: 'insertion order',
    position: 'position',
    priority: 'priority',
    case_sensitive: 'case sensitivity',
};

/** Extensions SillyTavern writes that carry nothing a reader would miss (spec: "other extensions"). */
const QUIET_EXTENSIONS = new Set(['storytell']);

/**
 * The new Story a card makes, by the fixed mapping, plus the "won't come along" list.
 * `InvalidGreetingError` for a greeting the card doesn't have.
 */
export function mapCard(card: CardData, choices: CardChoices): CardStoryPlan {
    const greetings = greetingsOf(card);
    if (!Number.isInteger(choices.greeting) || choices.greeting < 0 || choices.greeting >= greetings.length) {
        throw new InvalidGreetingError(greetings.length);
    }
    const characterName = characterNameOf(card);
    const names = { user: choices.roleName.trim(), char: characterName };
    const leftOut: string[] = [];
    const cuts: string[] = [];

    /** Macros replaced, `\n` line endings, trimmed. */
    const clean = (value: string) => replaceMacros(value.replace(/\r\n?/g, '\n'), names).trim();
    /** Cleaned and cut at the editor's limit; a cut is listed. */
    const field = (label: string, value: string) => {
        const cleaned = clean(value);
        if (cleaned.length <= TEXT_MAX) return cleaned;
        cuts.push(label);
        return cleaned.slice(0, TEXT_MAX);
    };

    const block = storytellBlock(card);

    const story: CardStoryPlan['story'] = {
        title: field('The title', titleOf(card)),
        setting: field('The Setting', card.scenario),
        opening: field('The Opening', greetings[choices.greeting]),
    };
    if (block) {
        Object.assign(story, {
            ...(block.style.pov && { pov: block.style.pov }),
            ...(block.style.tense && { tense: block.style.tense }),
            ...(block.style.replyLength && { replyLength: block.style.replyLength }),
            imageStyle: field('The Image style', block.style.imageStyle),
        });
    }

    let exampleLines: string[];
    let droppedExamples = 0;
    if (block) {
        exampleLines = block.character.exampleLines.map((line, index) => field(`Example line ${index + 1}`, line)).filter((line) => line !== '');
    } else {
        exampleLines = card.mes_example
            .split(/<START>/i)
            .map((part) => clean(part))
            .filter((part) => part !== '')
            .map((part) => withoutOwnLabel(part, characterName))
            .map((part, index) => {
                if (part.length <= TEXT_MAX) return part;
                cuts.push(`Example line ${index + 1}`);
                return part.slice(0, TEXT_MAX);
            });
    }
    if (exampleLines.length > MAX_EXAMPLE_LINES) {
        droppedExamples = exampleLines.length - MAX_EXAMPLE_LINES;
        exampleLines = exampleLines.slice(0, MAX_EXAMPLE_LINES);
    }

    const character: Required<CharacterFields> = block
        ? {
              name: characterName,
              appearance: field('Appearance', block.character.appearance),
              personality: field('Personality', block.character.personality),
              voice: field('Voice', block.character.voice),
              exampleLines,
              background: field('Background', block.character.background),
              secrets: field('Secrets', block.character.secrets),
              arcDirections: field('Arc directions', block.character.arcDirections),
          }
        : {
              name: characterName,
              appearance: '',
              personality: field('Personality', card.personality),
              voice: '',
              exampleLines,
              background: field('Background', card.description),
              secrets: '',
              arcDirections: '',
          };

    const role = { name: names.user, description: block ? field("The Role's description", block.role.description) : '' };

    const lore = mapLore(card, clean, field, leftOut);

    // What doesn't come along, in plain words (spec: "What doesn't come along").
    const notes: string[] = [];
    if (card.system_prompt.trim()) notes.push("The card's system prompt (Storytell writes its own).");
    if (card.post_history_instructions.trim()) notes.push("The card's post-history instructions (Storytell writes its own).");
    if (card.creator_notes.trim()) notes.push("The creator's notes (shown here, not kept).");
    if (card.tags.length > 0) notes.push(`Tags: ${card.tags.join(', ')}.`);
    if (card.creator.trim()) notes.push(`The creator's name (${card.creator.trim()}).`);
    if (card.character_version.trim()) notes.push(`The card's version (${card.character_version.trim()}).`);
    if (greetings.length > 1) notes.push(`The greetings you don't choose (${greetings.length - 1} of ${greetings.length}).`);
    if (card.group_only_greetings.length > 0) notes.push(`${plural(card.group_only_greetings.length, 'group-only greeting')}.`);
    const extraAssets = card.assets.filter((asset) => !(asset.type === 'icon' && asset.name === 'main')).length;
    if (extraAssets > 0) notes.push(`${plural(extraAssets, 'extra picture or asset', 'extra pictures or assets')} (only the main picture comes along).`);
    const otherExtensions = Object.keys(card.extensions).filter((key) => !QUIET_EXTENSIONS.has(key));
    if (otherExtensions.length > 0) notes.push(`Other extensions: ${otherExtensions.join(', ')}.`);
    if (droppedExamples > 0) notes.push(`${plural(droppedExamples, 'example message')} past the ${MAX_EXAMPLE_LINES} Example lines.`);
    leftOut.unshift(...notes);
    for (const label of cuts) leftOut.push(`${label} was cut to ${TEXT_MAX.toLocaleString('en-US')} characters.`);

    return { story, role, character, lore, leftOut };
}

/** A single-line example that starts with the Character's own label loses it; other blocks keep their labels. */
function withoutOwnLabel(block: string, characterName: string): string {
    if (block.includes('\n')) return block;
    const label = new RegExp(`^${escapeRegExp(characterName)}\\s*:\\s*`, 'i');
    return block.replace(label, '').trim() || block;
}

function mapLore(
    card: CardData,
    clean: (value: string) => string,
    field: (label: string, value: string) => string,
    leftOut: string[],
): Required<LoreEntryFields>[] {
    const book = card.character_book;
    if (!book) return [];
    let disabled = 0;
    let empty = 0;
    let past = 0;
    let regexKeys = 0;
    let secondKeys = 0;
    let droppedKeywords = 0;
    const entrySettings = new Set<string>();
    const lore: Required<LoreEntryFields>[] = [];

    book.entries.forEach((entry: CardBookEntry) => {
        if (!entry.enabled) {
            disabled++;
            return;
        }
        const text = withoutDecorators(entry.content);
        if (text.trim() === '') {
            empty++;
            return;
        }
        if (lore.length >= MAX_LORE_ENTRIES) {
            past++;
            return;
        }
        for (const setting of entry.settings) entrySettings.add(setting);
        if (entry.secondary_keys.some((key) => key.trim() !== '')) secondKeys++;

        const keys = entry.keys.map(clean).filter((key) => key !== '');
        const plainKeys = entry.use_regex ? [] : keys.filter((key) => !isRegexKey(key));
        regexKeys += keys.length - plainKeys.length;

        const name = (clean(entry.name) || clean(entry.comment) || plainKeys[0] || `Lore ${lore.length + 1}`).slice(0, LORE_NAME_MAX);
        const sameAsName = name.toLocaleLowerCase();
        const candidates = cleanKeywords(plainKeys).filter((key) => key.toLocaleLowerCase() !== sameAsName);
        const fitting = candidates.filter((key) => key.length <= KEYWORD_MAX);
        const keywords = fitting.slice(0, MAX_KEYWORDS);
        droppedKeywords += candidates.length - keywords.length;

        lore.push({
            name,
            keywords,
            text: field(`Lore "${name}"`, text),
            alwaysOn: entry.constant,
        });
    });

    if (disabled > 0) leftOut.push(`${plural(disabled, 'disabled Lore entry', 'disabled Lore entries')}.`);
    if (empty > 0) leftOut.push(`${plural(empty, 'empty Lore entry', 'empty Lore entries')}.`);
    if (past > 0) leftOut.push(`${plural(past, 'Lore entry', 'Lore entries')} past the ${MAX_LORE_ENTRIES} limit.`);
    if (regexKeys > 0) leftOut.push(`${plural(regexKeys, 'regex keyword')} (patterns aren't supported yet).`);
    if (secondKeys > 0) leftOut.push(`Second keywords on ${plural(secondKeys, 'Lore entry', 'Lore entries')}.`);
    if (droppedKeywords > 0) leftOut.push(`${plural(droppedKeywords, 'Lore keyword')} over ${KEYWORD_MAX} characters or past ${MAX_KEYWORDS} on an entry.`);
    const bookSettings = book.settings.map((key) => SETTING_WORDS[key] ?? key);
    if (bookSettings.length > 0) leftOut.push(`Lorebook settings: ${bookSettings.join(', ')}.`);
    if (entrySettings.size > 0) {
        leftOut.push(`Lore entry settings: ${[...entrySettings].map((key) => SETTING_WORDS[key] ?? key).join(', ')}.`);
    }
    return lore;
}

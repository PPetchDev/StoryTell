import { UnreadableDiaryEntryError } from '../../../errors/chat.errors.js';
import { BondLevels, bondLevelsInWords } from '../../../model/ledger/bond-axes.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { estimateTokens, PromptDiary } from '../turn/prompt.js';

/**
 * Diary (.scratch/diary/spec.md), as pure logic: what the writer is told, how its answer is read,
 * and which Messages an entry tells of. The writer is a call outside the story: it is given only
 * what the user may see of the Character, never their Secrets or their Arc direction, since the
 * user reads every word it writes.
 */

/** The most an entry holds once read. The instruction asks for far less. */
export const DIARY_ENTRY_MAX = 2_400;

/** Room for the entry and its inner-life line: about 150 words and two sentences asked for, with slack for a talkative model. */
export const DIARY_MAX_TOKENS = 600;

/** The most of an inner-life line kept once read. */
export const DIARY_INNER_LIFE_MAX = 400;

/** The most of the story since the last entry that the writer reads, newest kept. */
export const DIARY_STORY_TOKEN_BUDGET = 6_000;

/** The most of the diarist's Memories the writer reads, newest kept. */
export const DIARY_MEMORY_TOKEN_BUDGET = 1_200;

/** One Message of the Chat as the writer reads it: its place in the Chat and its text in the Transcript's layout. */
export interface DiaryStoryMessage {
    position: number;
    text: string;
    /** The story's Epilogue: it tells what came after, perhaps long after, and is marked so. */
    epilogue?: boolean;
}

/**
 * The moment of an entry written at an Epilogue. The Chat's Time of day and Place are where the
 * story stood before it, and an Epilogue may run weeks or years past them: an entry dated
 * "Evening, the quay" told of what the Epilogue said happened a month later (2026-11-16).
 */
export const DIARY_AFTER_THE_ENDING = 'After the ending';

/** Model-written replies since a Character's last entry after which they write one by themselves. */
export const DIARY_AUTO_EVERY_REPLIES = 10;

/** The most entries written by themselves at one reply: a Scene's end can be due for the whole cast. */
export const DIARY_AUTO_MAX_AT_ONCE = 3;

/** One Message of the Chat as the automatic entries read it. */
export interface AutoDiaryMessage {
    position: number;
    /** An AI Message a model wrote: the Opening, the author's, is not one. */
    written: boolean;
    /** The Characters who have a line in it. */
    speakers: number[];
}

export interface AutoDiaryInput {
    /** The Chat's Messages, in order. */
    messages: AutoDiaryMessage[];
    /** The reply just judged, the Chat's newest AI Message, and what happened at it. */
    at: { position: number; epilogue: boolean; sceneMoved: boolean; endingReached: boolean };
    /** The Characters in play, in cast order: those sitting out write nothing. */
    cast: number[];
    /** Each Character's newest entry, by the position of the Message it was written at; none for a Character with none. */
    lastEntryAt: ReadonlyMap<number, number>;
}

/**
 * Who writes an entry by themselves at a reply (.scratch/diary/spec.md, "Entries the Characters
 * write by themselves"): a Character who spoke since their last entry, when at this reply the
 * Scene moved on, an Ending was reached or it is the Epilogue, or when `DIARY_AUTO_EVERY_REPLIES`
 * replies have passed since that entry. At most `DIARY_AUTO_MAX_AT_ONCE`, those furthest behind
 * first, then in cast order.
 */
export function autoDiaryWriters(input: AutoDiaryInput): number[] {
    const { at } = input;
    const milestone = at.epilogue || at.sceneMoved || at.endingReached;
    const due = input.cast.flatMap((characterId, order) => {
        const since = input.lastEntryAt.get(characterId) ?? -Infinity;
        if (since >= at.position) return [];
        const replies = input.messages.filter((message) => message.written && message.position > since && message.position <= at.position);
        if (!replies.some((message) => message.speakers.includes(characterId))) return [];
        if (!milestone && replies.length < DIARY_AUTO_EVERY_REPLIES) return [];
        return [{ characterId, behind: replies.length, order }];
    });
    return due
        .sort((a, b) => b.behind - a.behind || a.order - b.order)
        .slice(0, DIARY_AUTO_MAX_AT_ONCE)
        .map((writer) => writer.characterId);
}

/** How many model-written replies an entry stays in the Narrator's view; an older one has had its say. */
export const DIARY_IN_PLAY_REPLIES = 20;

/** The most entries the Narrator reads in one turn. */
export const DIARY_IN_PLAY_MAX = 3;

export interface DiariesInPlayInput {
    /** The Chat's entries, oldest first. Only the inner-life line is read: the entry's own text never is. */
    entries: Array<{ characterId: number; messageId: number; innerLife: string | null }>;
    /** The Chat's Messages, in order. */
    messages: Array<{ id: number; position: number; written: boolean }>;
    /** The Characters in play, in cast order: those sitting out are not here. */
    cast: Array<{ id: number; name: string }>;
}

/**
 * The entries the Narrator reads this turn (.scratch/diary/spec.md, "The Narrator reads them, as
 * feelings only"): each Character's newest, written within `DIARY_IN_PLAY_REPLIES` replies, at
 * most `DIARY_IN_PLAY_MAX`, freshest first.
 */
export function diariesInPlay(input: DiariesInPlayInput): PromptDiary[] {
    const positionOf = new Map(input.messages.map((message) => [message.id, message.position]));
    const newest = new Map<number, { messageId: number; innerLife: string | null }>();
    for (const entry of input.entries) newest.set(entry.characterId, entry);
    return input.cast
        .flatMap((character, order) => {
            const entry = newest.get(character.id);
            const position = entry ? positionOf.get(entry.messageId) : undefined;
            // Their newest entry's line, or nothing: an older entry's feelings have been overtaken.
            if (!entry || position === undefined || entry.innerLife === null) return [];
            const repliesAgo = input.messages.filter((message) => message.written && message.position > position).length;
            if (repliesAgo > DIARY_IN_PLAY_REPLIES) return [];
            return [{ diary: { characterName: character.name, text: entry.innerLife, repliesAgo }, order }];
        })
        .sort((a, b) => a.diary.repliesAgo - b.diary.repliesAgo || a.order - b.order)
        .slice(0, DIARY_IN_PLAY_MAX)
        .map(({ diary }) => diary);
}

/** How an Epilogue is marked in the passage the writer reads. */
const EPILOGUE_MARK = "[The story's Epilogue: what came after, perhaps long after]";

/** A Bond of the diarist's, as the writer is told it. */
export interface DiaryBond {
    /** Who it is toward: the worn identity's name, or another Character's. */
    towardName: string;
    label: string;
    description: string;
    levels: BondLevels | null;
}

export interface DiaryPromptInput {
    /** The diarist. Their Secrets and Arc direction are not here, on purpose. */
    character: { name: string; personality: string; voice: string; background: string };
    /** The worn identity's name. */
    identityName: string;
    /** Who the worn identity is, as the user wrote it: with their own lines, the only word on their gender. */
    identityDescription: string;
    setting: string;
    /** How the diarist has changed in this Chat, oldest first: their Arc steps, never the direction. */
    arcSteps: string[];
    /** The diarist's own Bonds, never anyone else's. */
    bonds: DiaryBond[];
    /** What the diarist holds to be true, with the identity's name rendered; it may be false. */
    beliefs: string[];
    /** The Memories the diarist knows (they are in its Known by), oldest first, with the identity's name rendered. */
    memories: string[];
    /** Their entry before this one, for continuity; null for a first entry. */
    previousEntry: string | null;
    /** The story since that entry, oldest first, up to the Message this entry is written at. */
    story: DiaryStoryMessage[];
    /** The Time of day and the Place now, in words; null when the Chat knows neither. */
    moment: string | null;
}

export interface DiaryPrompt {
    messages: PromptMessage[];
    maxTokens: number;
}

/** "Night, the lamp room": the Time of day, then the Place; null with neither. */
export function diaryMoment(timeOfDay: string | null | undefined, place: string | null | undefined): string | null {
    const time = timeOfDay?.trim() ?? '';
    const where = place?.trim() ?? '';
    const words = [time, where].filter((word) => word !== '').join(', ');
    return words === '' ? null : words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * The Messages an entry tells of: those after the Character's entry before it (all of them for a
 * first entry), up to and including the Message at `throughPosition`.
 */
export function storySince<T extends { position: number }>(messages: T[], previousPosition: number | null, throughPosition: number): T[] {
    return messages.filter((message) => message.position > (previousPosition ?? -Infinity) && message.position <= throughPosition);
}

/** The newest of the diarist's Memories that fit the budget, oldest first. */
export function fitMemories(memories: string[], budget: number = DIARY_MEMORY_TOKEN_BUDGET): string[] {
    let remaining = budget;
    const kept: string[] = [];
    for (let i = memories.length - 1; i >= 0; i--) {
        const cost = estimateTokens(memories[i]);
        if (cost > remaining) break;
        remaining -= cost;
        kept.unshift(memories[i]);
    }
    return kept;
}

/** The newest of `story` that fit the budget, oldest first, and whether older ones were left out. */
export function fitStory(story: DiaryStoryMessage[], budget: number = DIARY_STORY_TOKEN_BUDGET): { kept: DiaryStoryMessage[]; cut: boolean } {
    let remaining = budget;
    const kept: DiaryStoryMessage[] = [];
    for (let i = story.length - 1; i >= 0; i--) {
        const cost = estimateTokens(story[i].text);
        // The newest Message is always read, however long: an entry about nothing is no entry.
        if (cost > remaining && kept.length > 0) break;
        remaining -= cost;
        kept.unshift(story[i]);
    }
    return { kept, cut: kept.length < story.length };
}

function diaristBlock(input: DiaryPromptInput): string {
    const { character, identityName } = input;
    const lines = [`The diarist is ${character.name}.`];
    if (character.personality.trim()) lines.push(`Personality: ${character.personality.trim()}`);
    if (character.voice.trim()) lines.push(`Voice (how ${character.name} talks and writes): ${character.voice.trim()}`);
    if (character.background.trim()) lines.push(`Background: ${character.background.trim()}`);
    if (input.arcSteps.length > 0) lines.push(`How this story has changed ${character.name} so far: ${input.arcSteps.join(' → ')}`);
    if (input.bonds.length > 0) {
        lines.push(`How ${character.name} feels right now:`);
        for (const bond of input.bonds) {
            lines.push(`- toward ${bond.towardName}: "${bond.label}" — ${bond.description}${bond.levels ? ` (${bondLevelsInWords(bond.levels)})` : ''}`);
        }
    }
    if (input.beliefs.length > 0) {
        lines.push(`What ${character.name} believes, which may be false (${character.name} does not doubt it):`);
        for (const belief of input.beliefs) lines.push(`- ${belief}`);
    }
    const memories = fitMemories(input.memories);
    if (memories.length > 0) {
        lines.push(`What ${character.name} knows of the story so far (their Memories; what is not here, they do not know):`);
        for (const memory of memories) lines.push(`- ${memory}`);
    }
    lines.push(`${identityName} is the person the user plays.`);
    if (input.identityDescription.trim()) lines.push(`Who ${identityName} is: ${input.identityDescription.trim()}`);
    return lines.join('\n');
}

/** The rules of an entry, after the story it tells of. */
export function diaryInstruction(input: Pick<DiaryPromptInput, 'character' | 'identityName' | 'previousEntry' | 'story'>): string {
    const name = input.character.name;
    const identity = input.identityName;
    // Written at an Epilogue: once it is over, looking back, in the order things happened.
    const afterTheEnding = input.story.at(-1)?.epilogue
        ? `\n- The passage ends with the story's Epilogue, which tells what came after, perhaps long after. ${name} writes once it is all over, looking back on it, and keeps things in the order they happened.`
        : '';
    return `Write ${name}'s diary entry about the passage above${input.previousEntry ? ', following on from their last entry' : ''}.
- First person, as ${name}, written in private where nobody will read it, in the past tense.
- Write it the way ${name} would: their Personality and Voice above decide the mood, what they dwell on or skip, how long or clipped their sentences run, and the words they reach for.
- How ${name} feels about each person, and what they know and believe, colour what they notice and how they judge it; they know nothing beyond that and the passage.
- Tell only of what ${name} saw, heard or took part in there: what it meant to them, what they felt and kept to themselves, what they noticed about ${identity}, and what they hope, fear or mean to do next.
- Add no events, places or people that are not in the passage, and decide nothing for ${identity}. Do not copy lines of speech out of it.
- Never guess ${identity}'s gender. Only who ${identity} is above, or ${identity}'s own lines, can state it; the narration and other characters' lines do not count, even where they guessed. Until it is stated, ${name} calls ${identity} by name or "they", never "he" or "she".${afterTheEnding}
- If ${name} was not there for any of it, write a short entry of their own thoughts from where they were, knowing nothing of what happened.
- Keep the story's tone and how explicit it is. Everyone in it is an adult.
- 80 to 150 words, in one to three short paragraphs of plain prose: no heading, no date, no signature, no *asterisks* and no "Name:" labels.
Then, on a line of its own, write --- and after it one or two sentences in the third person, beginning with ${name}'s name, of how ${name} feels toward each person now and what they mean to do next. Feelings and intentions only: nothing that happened, nothing anyone said or did, nothing ${name} learned or found out. Nobody but the story's writer reads that part.
Answer with only the entry, the --- line and those sentences.`;
}

/**
 * A call outside the story, so none of the play layers are sent: a system message about the
 * diarist, then one user message holding their last entry, the story since and the instruction.
 */
export function buildDiaryPrompt(input: DiaryPromptInput): DiaryPrompt {
    const name = input.character.name;
    const system = [
        'You write a private diary entry for one character of an ongoing piece of interactive fiction for adult readers. Every character is an adult.',
        input.setting.trim() ? `Setting: ${input.setting.trim()}` : null,
        diaristBlock(input),
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    const { kept, cut } = fitStory(input.story);
    const user = [
        input.previousEntry ? `${name}'s last diary entry, for continuity (do not repeat it):\n${input.previousEntry}` : null,
        `What has happened since${input.previousEntry ? ' that entry' : ' the story began'}, as the story told it${
            cut ? ' (its earlier part is left out here)' : ''
        }. Lines labelled "${input.identityName}:" are ${input.identityName}'s own.${input.moment ? `\nIt is now: ${input.moment}.` : ''}\n<story>\n${kept
            .map((message) => (message.epilogue ? `${EPILOGUE_MARK}\n${message.text}` : message.text))
            .join('\n\n')}\n</story>`,
        diaryInstruction(input),
    ]
        .filter((block): block is string => block !== null)
        .join('\n\n');
    return {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        maxTokens: DIARY_MAX_TOKENS,
    };
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** An entry as read: the text the user reads, and the inner-life line only the Narrator reads, or null. */
export interface ReadDiaryEntry {
    text: string;
    innerLife: string | null;
}

/**
 * Reads the model's answer: the entry, and the inner-life line after its last `---` line. The entry
 * is trimmed, out of a wrapping code fence, without a leading `Name:` label or a "Diary entry"
 * heading line, and cut to `DIARY_ENTRY_MAX` at a word; an empty one throws
 * `UnreadableDiaryEntryError`. The line loses an "Inner life:" label and is cut to
 * `DIARY_INNER_LIFE_MAX`; none, or an empty one, is null and the Narrator reads nothing.
 */
export function readDiaryEntry(text: string, characterName: string): ReadDiaryEntry {
    let answer = text.trim();
    const fencedAnswer = answer.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fencedAnswer) answer = fencedAnswer[1].trim();
    const rules = [...answer.matchAll(/^[ \t]*-{3,}[ \t]*$/gm)];
    const rule = rules.at(-1);
    const inner = rule ? answer.slice(rule.index + rule[0].length).trim() : '';
    if (rule) answer = answer.slice(0, rule.index);
    // "Inner life:", "**Inner life:**" or "**Inner life**:", the label the instruction never asked for.
    const line = inner.replace(/^(?:\*\*)?inner[ -]life(?:\*\*)?\s*:\s*(?:\*\*)?\s*/i, '').replace(/\s+/g, ' ').trim();
    return { text: readEntryText(answer, characterName), innerLife: line === '' ? null : line.slice(0, DIARY_INNER_LIFE_MAX).trim() };
}

function readEntryText(text: string, characterName: string): string {
    let entry = text.trim();
    const fenced = entry.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fenced) entry = fenced[1].trim();
    entry = entry.replace(new RegExp(`^@?${escapeRegExp(characterName)}\\s*:\\s*`, 'i'), '');
    // A heading the instruction ruled out: "Diary entry", "**Mira's diary**", "# Diary". "Dear diary," is the entry's own.
    entry = entry.replace(/^(?:#{1,6}[ \t]*|\*\*|__)?(?:[^\n]{0,30}['’]s )?diary(?: entry)?(?:\*\*|__)?:?[ \t]*\n+/i, '').trim();
    if (entry.length > DIARY_ENTRY_MAX) {
        const cut = entry.slice(0, DIARY_ENTRY_MAX);
        const space = cut.lastIndexOf(' ');
        entry = `${(space > DIARY_ENTRY_MAX * 0.8 ? cut.slice(0, space) : cut).trimEnd()}…`;
    }
    if (entry === '') throw new UnreadableDiaryEntryError();
    return entry;
}

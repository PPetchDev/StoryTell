import { UnreadableDiaryEntryError } from '../../../errors/chat.errors.js';
import { BondLevels, bondLevelsInWords } from '../../../model/ledger/bond-axes.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { estimateTokens } from '../turn/prompt.js';

/**
 * Diary (.scratch/diary/spec.md), as pure logic: what the writer is told, how its answer is read,
 * and which Messages an entry tells of. The writer is a call outside the story: it is given only
 * what the user may see of the Character, never their Secrets or their Arc direction, since the
 * user reads every word it writes.
 */

/** The most an entry holds once read. The instruction asks for far less. */
export const DIARY_ENTRY_MAX = 2_400;

/** Room for the entry: about 150 words asked for, with slack for a talkative model. */
export const DIARY_MAX_TOKENS = 500;

/** The most of the story since the last entry that the writer reads, newest kept. */
export const DIARY_STORY_TOKEN_BUDGET = 6_000;

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
- First person, as ${name}, in their own voice, written in private where nobody will read it, in the past tense.
- Tell only of what ${name} saw, heard or took part in there: what it meant to them, what they felt and kept to themselves, what they noticed about ${identity}, and what they hope, fear or mean to do next.
- Add no events, places or people that are not in the passage, and decide nothing for ${identity}. Do not copy lines of speech out of it.
- Never guess ${identity}'s gender. Only who ${identity} is above, or ${identity}'s own lines, can state it; the narration and other characters' lines do not count, even where they guessed. Until it is stated, ${name} calls ${identity} by name or "they", never "he" or "she".${afterTheEnding}
- If ${name} was not there for any of it, write a short entry of their own thoughts from where they were, knowing nothing of what happened.
- Keep the story's tone and how explicit it is. Everyone in it is an adult.
- 80 to 150 words, in one to three short paragraphs of plain prose: no heading, no date, no signature, no *asterisks* and no "Name:" labels.
Answer with only the entry.`;
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

/**
 * Reads the model's answer as the entry: trimmed, out of a wrapping code fence, without a leading
 * `Name:` label or a "Diary entry" heading line, and cut to `DIARY_ENTRY_MAX` at a word. Empty
 * throws `UnreadableDiaryEntryError`.
 */
export function readDiaryEntry(text: string, characterName: string): string {
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

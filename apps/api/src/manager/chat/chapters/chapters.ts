import { NotAMoveError } from '../../../errors/chat.errors.js';
import type { NewSceneAdvance } from '../../../model/ledger/ledger.service.js';
import type { PromptMessage } from '../../../service/model-gateway/model-gateway.js';

/**
 * Move on, and Chapters (.scratch/scene-chapters/spec.md): where the user may move the Scene, the
 * Messages each Chapter covers, which Chapters a run writes, and the call that writes one. Pure logic
 * over plain inputs, like the Story so far's.
 */

/** A run writes at most this many Chapters: a new one at once, an older Chat's past ones a few per turn. */
export const CHAPTERS_PER_RUN = 2;
/** The writer's hard cap, well above the 80 words it is asked for. */
export const CHAPTER_MAX_TOKENS = 400;
/** Spec: "40 to 80 words". */
export const CHAPTER_WORDS = 80;
/** The event of a user's Move on, which the Dashboard shows under "Moved on from … to …". */
export const MOVED_ON_EVENT = 'You moved the story on.';
/** What a move from free play is stamped as having left. */
export const FREE_PLAY_NAME = 'Free play';

export interface MoveScene {
    id: number;
    name: string;
}

/**
 * The Scene advance a Move on makes, or NotAMoveError: the target is any Scene of the Story other than
 * the current one, or free play (null) while the Chat is on a Scene. A Story with no Scenes has none.
 */
export function sceneMove(scenes: readonly MoveScene[], currentSceneId: number | null, toSceneId: number | null): NewSceneAdvance {
    if (scenes.length === 0 || toSceneId === currentSceneId) throw new NotAMoveError();
    const here = scenes.find((scene) => scene.id === currentSceneId) ?? null;
    const to = toSceneId === null ? null : scenes.find((scene) => scene.id === toSceneId);
    if (to === undefined) throw new NotAMoveError();
    // A current Scene the Story no longer has reads as free play, as the strip shows it.
    if (here === null && to === null) throw new NotAMoveError();
    return {
        fromSceneId: here?.id ?? null,
        fromSceneName: here?.name ?? FREE_PLAY_NAME,
        toSceneId: to?.id ?? null,
        toSceneName: to?.name ?? null,
        event: MOVED_ON_EVENT,
    };
}

/** The Scene the control preselects: the next in order, free play from the last, the first from free play. */
export function defaultMoveTarget(scenes: readonly MoveScene[], currentSceneId: number | null): number | null {
    const index = scenes.findIndex((scene) => scene.id === currentSceneId);
    if (index === -1) return scenes[0]?.id ?? null;
    return scenes[index + 1]?.id ?? null;
}

export interface RangeMessage {
    id: number;
    position: number;
}

export interface RangeAdvance {
    id: number;
    messageId: number;
}

/** The Messages one Chapter covers, by position, both ends included; `from > through` when it has none. */
export interface ChapterRange {
    advanceId: number;
    from: number;
    through: number;
}

/**
 * Each Chapter's Messages: the first from the Opening, each later one from after the Message of the
 * advance before, through the Message of its own advance. Two advances at one Message leave the second
 * Chapter empty. An advance whose Message is gone is left out.
 */
export function chapterRanges(messages: readonly RangeMessage[], advances: readonly RangeAdvance[]): ChapterRange[] {
    const positionOf = new Map(messages.map((message) => [message.id, message.position]));
    const ranges: ChapterRange[] = [];
    let from = 0;
    for (const advance of advances) {
        const through = positionOf.get(advance.messageId);
        if (through === undefined) continue;
        ranges.push({ advanceId: advance.id, from, through });
        from = Math.max(from, through + 1);
    }
    return ranges;
}

export interface WritableChapter {
    advanceId: number;
    /** The Chapter covers at least one Message. */
    hasMessages: boolean;
    summary: string | null;
    failed: string | null;
}

/** Spec: "When it is written". The Chapters never tried yet (no summary, no failure, some Messages), newest first, at most `max`. */
export function chaptersToWrite(chapters: readonly WritableChapter[], max = CHAPTERS_PER_RUN): number[] {
    return chapters
        .filter((chapter) => chapter.hasMessages && chapter.summary === null && chapter.failed === null)
        .map((chapter) => chapter.advanceId)
        .reverse()
        .slice(0, max);
}

export interface ChapterPromptInput {
    /** The Scene the Chapter was played in. Its situation and condition are never sent. */
    sceneName: string;
    identityName: string;
    castNames: string[];
    /** The Chapter's Messages, oldest first, each with who wrote it. */
    messages: Array<{ speaker: string; text: string }>;
    /** The Chapter before's summary, as context only; null for the first or when it has none. */
    previous: string | null;
}

/**
 * Spec: "How it is written". The Chapter's Messages, the previous Chapter's summary for context, and the
 * rules. The Scene's goal stays out: restating it made the passed-by event claim what did or didn't happen.
 */
export function chapterPromptMessages(input: ChapterPromptInput): PromptMessage[] {
    const name = input.identityName;
    const system = `You write the chapter summaries of an interactive story. A chapter is the part of the story played in one scene. Its summary lets the reader look back over the story part by part.

Rules:
- Tell what happened in this chapter, in order: who did what, what was said that matters, what changed between people, and where things stood at its end.
- 2 to 4 sentences, ${CHAPTER_WORDS / 2} to ${CHAPTER_WORDS} words of plain prose: no heading, no list, no quotes of dialogue.
- Write in the third person and the past tense. ${name} is the character the user plays: call them ${name}, and never guess ${name}'s gender; use their name or "they" unless the story itself states it.
- Everyone in the story is an adult: never call anyone a girl, boy, child or kid.
- Only what the Messages show. Add nothing, explain nothing, judge nothing, and don't say what the chapter was meant to bring about.
- Don't retell the chapter before: it is given only so you know where this one starts.
- The Characters are: ${input.castNames.join(', ')}.

Reply with the summary only.`;

    const sections: string[] = [];
    if (input.previous && input.previous.trim() !== '') sections.push(`The chapter before, for context only:\n${input.previous.trim()}`);
    sections.push(`This chapter's scene: ${input.sceneName}`);
    sections.push(`Its Messages, oldest first:\n\n${input.messages.map((message) => `[${message.speaker}]\n${message.text}`).join('\n\n')}`);
    sections.push('Write the summary of this chapter now.');
    return [
        { role: 'system', content: system },
        { role: 'user', content: sections.join('\n\n') },
    ];
}

/** The model's answer as a summary: trimmed, without a label it may add. Null when nothing is left. */
export function parseChapter(text: string): string | null {
    const cleaned = text
        .trim()
        .replace(/^#+\s*(chapter\s+)?summary\s*:?\s*/i, '')
        .replace(/^\*\*(chapter\s+)?summary:?\*\*\s*/i, '')
        .replace(/^(chapter\s+)?summary:\s*/i, '')
        .trim();
    return cleaned === '' ? null : cleaned;
}

/**
 * The Story so far's output guard, for a Chapter: why its answer can't be kept, or null when it can.
 * `speakers` are the tags the Messages were given to it under.
 */
export function chapterRejection(text: string, completionTokens: number, speakers: string[], maxTokens = CHAPTER_MAX_TOKENS): string | null {
    if (completionTokens >= maxTokens) return 'The Chapter writer was cut off at its length cap.';
    const tag = /^\[([^\]\n]+)\]/.exec(text.trim())?.[1]?.trim().toLowerCase();
    if (tag !== undefined && speakers.some((speaker) => speaker.trim().toLowerCase() === tag)) {
        return 'The Chapter writer went on with the story instead of telling it.';
    }
    return null;
}

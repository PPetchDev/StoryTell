import { createHash } from 'node:crypto';

import type { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import type { ReplyPart } from '../turn/reply-parser.js';

/**
 * Turn a Chat into a novel (.scratch/chat-novel/spec.md): what the Book chapter writer reads, the rules
 * it gets, how its answer is read and guarded, the hash that tells a Book chapter is out of date, and
 * what a write is expected to cost. Pure logic over plain inputs, like the Chapters'.
 */

/** The writer's hard cap: GLM-5.3 always reasons a little, and 2,000 words is about 2,800 tokens. */
export const BOOK_CHAPTER_MAX_TOKENS = 6_000;
/** Spec: "the Chapter's own word count, at least 400 and at most 2,000 words". */
export const BOOK_MIN_WORDS = 400;
export const BOOK_MAX_WORDS = 2_000;
/** How much of the Book chapter before is given as context, so the join reads smoothly. */
export const PREVIOUS_TAIL_CHARS = 600;
/** Spec "Price": characters per prompt token, and output tokens per word. */
const CHARS_PER_TOKEN = 3.5;
const TOKENS_PER_WORD = 1.5;

/** One Message of a Chapter, as the writer reads it. */
export type BookSourceMessage = { kind: 'user'; name: string; text: string } | { kind: 'ai'; parts: ReplyPart[] };

export interface BookCastMember {
    name: string;
    /** How they look: public on their card. Personality, Secrets and Arc directions are never sent. */
    appearance: string;
}

export interface BookChapterInput {
    storyTitle: string;
    setting: string;
    tense: 'past' | 'present';
    identity: { name: string; description: string };
    cast: BookCastMember[];
    number: number;
    sceneName: string;
    messages: BookSourceMessage[];
    /** The Book chapter before's text, when it has one: only its tail is sent, as context. */
    previousText: string | null;
}

/** One Message as `[Speaker]` and its text: narration as written, each speech line as `Nara: "…"`. */
export function sourceBlock(message: BookSourceMessage): string {
    if (message.kind === 'user') return `[${message.name}]\n${message.text.trim()}`;
    const body = message.parts
        .map((part) => (part.kind === 'speech' ? `${part.speakerName}: "${stripQuotes(part.text.trim())}"` : part.text.trim()))
        .filter((line) => line !== '')
        .join('\n\n');
    return `[Story]\n${body}`;
}

function stripQuotes(text: string): string {
    const match = /^["“](.*)["”]$/s.exec(text);
    return match ? match[1] : text;
}

/** The Chapter's Messages as one text, as the writer reads them. */
export function sourceText(messages: readonly BookSourceMessage[]): string {
    return messages.map(sourceBlock).join('\n\n');
}

/** Spec "Source hash": over the Scene name and the Messages as the writer reads them. */
export function sourceHash(sceneName: string, messages: readonly BookSourceMessage[]): string {
    return createHash('sha256').update(JSON.stringify([sceneName, sourceText(messages)])).digest('hex');
}

function wordCount(text: string): number {
    return text.split(/\s+/).filter((word) => word !== '').length;
}

/** About as long as the Chapter itself, between BOOK_MIN_WORDS and BOOK_MAX_WORDS, to the nearest 50. */
export function targetWords(messages: readonly BookSourceMessage[]): number {
    const words = messages.reduce(
        (sum, message) => sum + (message.kind === 'user' ? wordCount(message.text) : message.parts.reduce((parts, part) => parts + wordCount(part.text), 0)),
        0,
    );
    return Math.round(Math.min(BOOK_MAX_WORDS, Math.max(BOOK_MIN_WORDS, words)) / 50) * 50;
}

/**
 * Spec "Writing": the rules, the Story's public frame, the Chapter's Messages, and the tail of the chapter
 * before. Never a Character's Personality notes, Secrets, Arc direction, Beliefs, Thoughts, Diary or
 * Memories, and never the Scene's situation or condition: the Book tells only what the Chat showed.
 */
export function bookChapterMessages(input: BookChapterInput): PromptMessage[] {
    const name = input.identity.name;
    const words = targetWords(input.messages);
    const system = `You turn one chapter of an interactive story into a chapter of a novel. The story was played as a chat: the reader played ${name}, and a narrator wrote everything else. Your chapter retells exactly what happened, as polished novel prose.

Rules:
- Write in the third person and the ${input.tense} tense, as a novel would.
- ${name} is a character like any other: call them ${name}, and write what they said and did, from their Messages, as part of the prose. Never write "you", "the user", "the player" or "the reader" for them. Never guess ${name}'s gender: use their name or "they" unless the story itself states it.
- Keep every event, in order. Keep the dialogue that matters, in quotation marks, with who says it made clear by the prose. You may smooth the telling and add a little sensory detail, but add nothing that changes what happened, and no new events.
- Tell only what the Messages show: no motive, secret, plan or past that the Messages do not reveal.
- Everyone in the story is an adult: never call anyone a girl, boy, child or kid.
- No chat leftovers: no speaker names before lines, no "@", no [brackets], no notes, no headings, no lists, no comments about the story or the chat.
- About ${words} words.
- Reply with the chapter only: the first line is "Title: " and a title of 2 to 6 words, then a blank line, then the prose.`;

    const cast = input.cast.map((member) => (member.appearance.trim() === '' ? `- ${member.name}` : `- ${member.name}: ${member.appearance.trim()}`));
    const sections = [
        `The story: ${input.storyTitle.trim()}`,
        `Its setting:\n${input.setting.trim()}`,
        `${name}${input.identity.description.trim() === '' ? '' : `: ${input.identity.description.trim()}`}`,
        `The characters:\n${cast.join('\n') || '- (none)'}`,
    ];
    if (input.previousText && input.previousText.trim() !== '') {
        sections.push(`How the chapter before ended, for context only (don't repeat it):\n…${tail(input.previousText.trim(), PREVIOUS_TAIL_CHARS)}`);
    }
    sections.push(`This is chapter ${input.number}, played in the scene "${input.sceneName}". Its Messages, oldest first:\n\n${sourceText(input.messages)}`);
    sections.push('Write the chapter now.');
    return [
        { role: 'system', content: system },
        { role: 'user', content: sections.join('\n\n') },
    ];
}

function tail(text: string, chars: number): string {
    if (text.length <= chars) return text;
    const cut = text.slice(text.length - chars);
    const space = cut.indexOf(' ');
    return space === -1 ? cut : cut.slice(space + 1);
}

/** What writing a chapter is expected to cost at the play model's list price, rounded up to a tenth of a cent. */
export function bookChapterPriceUsd(messages: readonly PromptMessage[], words: number, price: { input: number; output: number }): number {
    const promptChars = messages.reduce((sum, message) => sum + message.content.length, 0);
    const usd = ((promptChars / CHARS_PER_TOKEN) * price.input + words * TOKENS_PER_WORD * price.output) / 1_000_000;
    return Math.ceil(usd * 1000) / 1000;
}

export interface ParsedBookChapter {
    title: string;
    text: string;
}

/** The answer as a title and prose. Without a title line, `fallbackTitle` (the Scene's name) stands in. Null when no prose is left. */
export function parseBookChapter(answer: string, fallbackTitle: string): ParsedBookChapter | null {
    const lines = answer.replace(/\r\n?/g, '\n').trim().split('\n');
    let title: string | null = null;
    const first = lines[0]?.trim() ?? '';
    const labelled = /^(?:#+\s*)?(?:\*\*)?\s*title\s*:\s*(.+?)(?:\*\*)?$/i.exec(first);
    const heading = /^#+\s*(.+)$/.exec(first);
    const bold = /^\*\*(.+)\*\*$/.exec(first);
    const match = labelled ?? heading ?? bold;
    if (match) {
        title = cleanTitle(match[1]);
        lines.shift();
    }
    const text = lines
        .join('\n')
        .trim()
        .replace(/\n{3,}/g, '\n\n');
    if (text === '') return null;
    return { title: title && title !== '' ? title : fallbackTitle, text };
}

function cleanTitle(title: string): string {
    return title
        .replace(/\*\*/g, '')
        .replace(/^chapter\s+\d+\s*[:.\-–—]\s*/i, '')
        .replace(/^["“'](.*)["”']$/, '$1')
        .trim();
}

/**
 * Spec "Output guard": why an answer can't be kept, or null when it can. `speakers` are the tags the
 * Messages were given under and the Characters' names. Never asked for again by itself: each try is paid.
 */
export function bookChapterRejection(text: string, completionTokens: number, speakers: string[], maxTokens = BOOK_CHAPTER_MAX_TOKENS): string | null {
    if (completionTokens >= maxTokens) return 'The chapter ran past its length cap and was cut off.';
    const tags = new Set(speakers.map((speaker) => speaker.trim().toLowerCase()));
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (/^@[^\s:][^:\n]{0,60}:/.test(trimmed)) return 'The chapter still had chat lines ("@Name:") in it.';
        const tag = /^\[([^\]\n]+)\]/.exec(trimmed)?.[1]?.trim().toLowerCase();
        if (tag !== undefined && (tag === 'story' || tags.has(tag))) return 'The chapter still had chat tags ("[Name]") in it.';
    }
    return null;
}

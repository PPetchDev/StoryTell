import type { StoredMessagePart } from '../../model/chat/entities/message-part.entity.js';

/** The longest item sent in one request: under Venice's 4,096 so a request never runs over. */
export const MAX_ITEM_CHARACTERS = 4000;

/** The voices a Message is read in, as the Story stands when Read aloud asks. */
export interface ReadAloudVoices {
    /** The Story's Narration voice, or the default when it has none. */
    narration: string;
    /** Each Character in the cast: their Speaking voice, or null to be read in the Narration voice. */
    byCharacterId: ReadonlyMap<number, string | null>;
}

/** One request's worth of a Message, in reading order (.scratch/read-aloud/spec.md, "The play queue"). */
export interface ReadAloudItem {
    /** Its place in the queue, from 0. */
    index: number;
    /** The part it is read from. */
    partIndex: number;
    /** A narration item's paragraph within its part's shown text, as the thread splits it; null for speech. */
    paragraph: number | null;
    voice: string;
    text: string;
}

/** Narration paragraphs, split as the thread splits them (AiMessageParts). */
const PARAGRAPH_BREAK = /\n\s*\n/;
/** `*…*` spans in a line, found as the thread finds them for italics. */
const ACTION_SPAN = /(\*[^*\n]+\*)/g;
const SPEAKABLE = /[\p{L}\p{N}]/u;
/** A sentence end: its mark, any closing quotes or brackets, then a space. */
const SENTENCE_END = /[.!?…]["'”’)\]]*\s/g;

/**
 * A Message's play queue from its parts as shown (Replace rules already applied). Narration is
 * one item per paragraph in the Narration voice. A line is split at its `*…*` spans: each span
 * is read without its asterisks in the Narration voice, the words between in the speaker's
 * Speaking voice (or the Narration voice when they have none, the line has no Character link,
 * or the Character is gone). Items with no letter or digit are dropped, and any item over
 * MAX_ITEM_CHARACTERS is split at the last sentence end before it, else the last space.
 */
export function readAloudQueue(parts: readonly StoredMessagePart[], voices: ReadAloudVoices): ReadAloudItem[] {
    const queue: ReadAloudItem[] = [];
    const add = (partIndex: number, paragraph: number | null, voice: string, text: string) => {
        for (const piece of fitted(text.trim())) {
            if (SPEAKABLE.test(piece)) queue.push({ index: queue.length, partIndex, paragraph, voice, text: piece });
        }
    };

    parts.forEach((part, partIndex) => {
        if (part.kind === 'narration') {
            part.text
                .split(PARAGRAPH_BREAK)
                .filter((paragraph) => paragraph.trim() !== '')
                .forEach((paragraph, index) => add(partIndex, index, voices.narration, paragraph));
            return;
        }
        const speaker = part.characterId === null ? null : voices.byCharacterId.get(part.characterId);
        const lineVoice = speaker ?? voices.narration;
        part.text.split(ACTION_SPAN).forEach((piece, index) => {
            // Odd pieces are the `*…*` spans the split captured.
            if (index % 2 === 1) add(partIndex, null, voices.narration, piece.slice(1, -1));
            else add(partIndex, null, lineVoice, piece);
        });
    });
    return queue;
}

/** The text in pieces of at most MAX_ITEM_CHARACTERS, cut at sentence ends, else spaces. */
function fitted(text: string): string[] {
    const pieces: string[] = [];
    let rest = text;
    while (rest.length > MAX_ITEM_CHARACTERS) {
        const window = rest.slice(0, MAX_ITEM_CHARACTERS + 1);
        let cut = 0;
        for (const match of window.matchAll(SENTENCE_END)) cut = match.index + match[0].trimEnd().length;
        if (cut === 0) cut = window.lastIndexOf(' ');
        if (cut <= 0) cut = MAX_ITEM_CHARACTERS;
        pieces.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
    }
    pieces.push(rest);
    return pieces;
}

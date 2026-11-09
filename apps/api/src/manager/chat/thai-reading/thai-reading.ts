import { createHash } from 'node:crypto';

import { UnreadableThaiReadingError } from '../../../errors/chat.errors.js';
import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';

import type { MessageResponse } from '../../../model/chat/entities/message.entity.js';

/** One reading per Reply version at most: the version cap (.scratch/swipe/spec.md). */
export const THAI_READINGS_PER_MESSAGE = 5;

/** Thai takes many tokens; a long reply needs room. */
export const THAI_READING_MAX_TOKENS = 4_000;

/**
 * What a Thai reading translates: always the stored text, never the shown one. A User Message is
 * its text; an AI Message (the Opening too) is its parts in the Transcript's layout, narration as
 * it is and speech as `Name: text`, joined by blank lines, with no Replace rules applied
 * (.scratch/sillytavern-gaps/integration.md, "Replace rules and what each reader sees").
 */
export function thaiReadingSource(message: MessageResponse): string {
    if (message.kind === 'user') return message.text;
    return message.parts
        .map((part) => (part.kind === 'speech' ? `${part.speakerName}: ${part.text.trim()}` : part.text.trim()))
        .filter((block) => block !== '')
        .join('\n\n');
}

/** SHA-256 hex of the source text: a reading belongs to exactly the text it translated. */
export function sourceFingerprint(source: string): string {
    return createHash('sha256').update(source, 'utf8').digest('hex');
}

export interface ThaiReadingPromptInput {
    /** `thaiReadingSource` of the Message. */
    source: string;
    /** The cast's names and the worn identity's, kept in their own spelling. */
    names: string[];
}

export interface ThaiReadingPrompt {
    messages: PromptMessage[];
    maxTokens: number;
}

/** A background call outside the story: the play layers are not sent. */
export function buildThaiReadingPrompt(input: ThaiReadingPromptInput): ThaiReadingPrompt {
    const names = [...new Set(input.names.map((name) => name.trim()).filter((name) => name !== ''))];
    const keepNames = names.length > 0 ? ` Keep these names in their original spelling: ${names.join(', ')}.` : '';
    const system = `Translate this passage of interactive fiction into natural, faithful Thai for an adult Thai reader. Keep its meaning, tone and explicitness exactly: no softening, no notes, nothing added or left out.
Keep every line's "Name:" label exactly as written, in its original spelling.${keepNames}
Keep the blank lines between paragraphs, and keep *asterisks* around actions.
Answer with only the Thai translation.`;
    return {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: input.source },
        ],
        maxTokens: THAI_READING_MAX_TOKENS,
    };
}

/** The trimmed translation; an empty one throws `UnreadableThaiReadingError`. */
export function readThaiReading(text: string): string {
    const reading = text.trim();
    if (reading === '') throw new UnreadableThaiReadingError();
    return reading;
}

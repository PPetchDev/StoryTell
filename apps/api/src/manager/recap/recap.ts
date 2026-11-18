import { createHash } from 'node:crypto';

import type { PromptMessage } from '../../service/model-gateway/model-gateway.js';
import { estimateTokens } from '../chat/turn/prompt-tokens.js';

/**
 * "Previously on…" (.scratch/previously-on/spec.md), as pure logic: when a Recap is due, how a stored
 * one is known to still tell the Chat as it stands, what the writer is told, and how its answer is read.
 * The writer is told only what the user may see: never a card, a Secret or an Arc direction.
 */

/** Spec: "The gap". Hours since the newest Message after which coming back shows a Recap. */
export const RECAP_GAP_HOURS = 6;
export const RECAP_GAP_MS = RECAP_GAP_HOURS * 60 * 60 * 1000;
/** The writer's hard cap, well above the 110 words it is asked for. */
export const RECAP_MAX_TOKENS = 400;
/** Spec: "50 to 110 words". */
export const RECAP_WORDS = { min: 50, max: 110 };
/** The newest Messages the writer reads, in tokens, newest kept. */
export const RECAP_MESSAGE_TOKENS = 4_000;
/** The end of the Story so far the writer reads, in tokens. */
export const RECAP_STORY_SO_FAR_TOKENS = 1_500;
/** The newest written Chapter summaries the writer reads. */
export const RECAP_CHAPTERS = 3;

export interface DueInput {
    /** When the Chat's newest Message was written. */
    newestAt: Date;
    /** How many Messages the Chat has, the Opening included. */
    messageCount: number;
    /** The stored Recap for the newest Message, or null with none. */
    stored: { dismissed: boolean } | null;
    now: Date;
}

/** A Chat has something to recap once a Message follows its Opening. */
export function hasSomethingToRecap(messageCount: number): boolean {
    return messageCount >= 2;
}

/** Spec: "Due". The gap holds, there is something to recap, and the Recap for the newest Message isn't dismissed. */
export function recapDue(input: DueInput): boolean {
    if (!hasSomethingToRecap(input.messageCount)) return false;
    if (input.now.getTime() - input.newestAt.getTime() < RECAP_GAP_MS) return false;
    return !(input.stored?.dismissed ?? false);
}

/** What a Message says, as a Recap's row remembers it: a Message changed in place (Regenerate, a version, an edit) no longer matches. */
export function recapFingerprint(kind: string, text: string): string {
    return createHash('sha256').update(`${kind}\n${text}`).digest('hex');
}

export interface RecapMessage {
    speaker: string;
    text: string;
}

/** The newest Messages that fit the budget, oldest first. The newest one is always kept, however long. */
export function newestThatFit(messages: readonly RecapMessage[], budget = RECAP_MESSAGE_TOKENS): { kept: RecapMessage[]; cut: boolean } {
    let remaining = budget;
    const kept: RecapMessage[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
        const cost = estimateTokens(messages[i].text) + 4;
        if (cost > remaining && kept.length > 0) break;
        remaining -= cost;
        kept.unshift(messages[i]);
    }
    return { kept, cut: kept.length < messages.length };
}

/** The end of a long text that fits the budget, from a paragraph or sentence start where one is near. */
export function tailThatFits(text: string, budget = RECAP_STORY_SO_FAR_TOKENS): string {
    const trimmed = text.trim();
    const chars = budget * 4;
    if (trimmed.length <= chars) return trimmed;
    const tail = trimmed.slice(trimmed.length - chars);
    const start = tail.search(/(?<=[.!?]\s)\S/);
    return `…${start > 0 && start < chars / 4 ? tail.slice(start) : tail}`;
}

export interface RecapPromptInput {
    storyTitle: string;
    identityName: string;
    /** Who the identity is, as the user wrote it: the only word on their gender. */
    identityDescription: string;
    /** The Characters' names only: their cards, Secrets and Arc directions are never sent. */
    castNames: string[];
    /** The Chat's Story so far, or null while it has none. */
    storySoFar: string | null;
    /** The newest written Chapter summaries, oldest first. */
    chapters: Array<{ sceneName: string; summary: string }>;
    /** The current Scene's name, or null in free play or a Story with no Scenes. Never its situation or condition. */
    sceneName: string | null;
    /** The Time of day and the Place, in words; null with neither. */
    moment: string | null;
    /** How each Character feels toward the identity and each other, as the user may read it. */
    bonds: Array<{ fromName: string; towardName: string; label: string; description: string }>;
    /** What has lastingly changed about each Character, with the identity's name rendered. */
    nowNotes: Array<{ name: string; note: string }>;
    /** The Chat's Messages, oldest first; the writer reads the newest that fit. */
    messages: RecapMessage[];
}

/** Spec: "What it is written from (and never from)", and its rules. */
export function recapPromptMessages(input: RecapPromptInput): PromptMessage[] {
    const name = input.identityName;
    const system = `You write the "Previously on…" recap of an interactive story for adult readers, shown to the reader when they come back to it after a while away, like the recap before a TV episode.

Rules:
- Tell where the story stands now: what has just happened, how the characters feel about each other, and what is unresolved. End on the open question the story left hanging.
- 3 to 5 sentences, ${RECAP_WORDS.min} to ${RECAP_WORDS.max} words of plain prose. Make it vivid and dramatic, but use only what the material below shows.
- Add no events, people or places, predict nothing, and hint at nothing the story has not shown.
- Third person. Past tense for what happened, present tense for how things stand now.
- ${name} is the character the reader plays: call them ${name}, and never guess ${name}'s gender; use their name or "they" unless who ${name} is below, or ${name}'s own lines, state it.
- Everyone in the story is an adult: never call anyone a girl, boy, child or kid.
- No heading, no "Previously on" label, no list, no quoted dialogue.
- The characters are: ${input.castNames.join(', ') || 'none named'}.

Reply with the recap only.`;

    const sections: string[] = [`The story: ${input.storyTitle}`];
    sections.push(`${name} is the reader's character.${input.identityDescription.trim() ? ` Who ${name} is: ${input.identityDescription.trim()}` : ''}`);
    if (input.storySoFar && input.storySoFar.trim() !== '') sections.push(`The story so far, from the beginning:\n${tailThatFits(input.storySoFar)}`);
    if (input.chapters.length > 0) {
        sections.push(`The latest chapters, oldest first:\n${input.chapters.map((chapter) => `- ${chapter.sceneName}: ${chapter.summary.trim()}`).join('\n')}`);
    }
    const now = [input.sceneName ? `Scene: ${input.sceneName}` : null, input.moment ? `It is now: ${input.moment}` : null].filter((line) => line !== null);
    if (now.length > 0) sections.push(now.join('\n'));
    if (input.bonds.length > 0) {
        sections.push(`How the characters feel now:\n${input.bonds.map((bond) => `- ${bond.fromName} toward ${bond.towardName}: "${bond.label}" — ${bond.description}`).join('\n')}`);
    }
    if (input.nowNotes.length > 0) {
        sections.push(`What has lastingly changed for them:\n${input.nowNotes.map((note) => `- ${note.name}: ${note.note}`).join('\n')}`);
    }
    const { kept, cut } = newestThatFit(input.messages);
    sections.push(
        `The latest Messages, oldest first${cut ? ' (earlier ones are left out)' : ''}:\n\n${kept.map((message) => `[${message.speaker}]\n${message.text}`).join('\n\n')}`,
    );
    sections.push('Write the recap now.');
    return [
        { role: 'system', content: system },
        { role: 'user', content: sections.join('\n\n') },
    ];
}

/** The model's answer as a Recap: trimmed, without a label or wrapping quotes it may add. Null when nothing is left. */
export function parseRecap(text: string): string | null {
    let cleaned = text.trim();
    const fenced = cleaned.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fenced) cleaned = fenced[1].trim();
    cleaned = cleaned
        .replace(/^#+\s*/, '')
        .replace(/^\*\*\s*(previously on[^*\n]*|recap)\s*:?\s*\*\*\s*:?\s*/i, '')
        .replace(/^(previously on(?:\s*(?:…|\.\.\.))?|recap)\s*[:\-—–]\s*/i, '')
        .replace(/^previously on\s*(?:…|\.\.\.)\s*/i, '')
        .trim();
    if (/^["“][^"“”]+["”]$/.test(cleaned)) cleaned = cleaned.slice(1, -1).trim();
    return cleaned === '' ? null : cleaned;
}

/**
 * The Chapters' output guard, for a Recap: why its answer can't be kept, or null when it can.
 * `speakers` are the tags the Messages were given to it under.
 */
export function recapRejection(text: string, completionTokens: number, speakers: string[], maxTokens = RECAP_MAX_TOKENS): string | null {
    if (completionTokens >= maxTokens) return 'The recap writer was cut off at its length cap.';
    const tag = /^\[([^\]\n]+)\]/.exec(text.trim())?.[1]?.trim().toLowerCase();
    if (tag !== undefined && speakers.some((speaker) => speaker.trim().toLowerCase() === tag)) {
        return 'The recap writer went on with the story instead of telling it.';
    }
    return null;
}

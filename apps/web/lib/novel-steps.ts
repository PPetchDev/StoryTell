import type { Message, MessagePart } from './chat';
import type { Emotion } from './expressions';
import type { Snapshot } from './snapshot';

/**
 * The Visual novel view's steps (.scratch/chat-looks/spec.md, "Visual novel view"): the Chat one
 * part at a time, from the same data the thread renders. Pure, so the view and its tests agree.
 */
export type NovelStep =
    | { kind: 'user'; key: string; messageId: number | null; identityName: string; text: string }
    | { kind: 'narration'; key: string; messageId: number | null; partIndex: number; paragraph: number; text: string }
    | {
          kind: 'speech';
          key: string;
          messageId: number | null;
          partIndex: number;
          characterId: number | null;
          speakerName: string;
          text: string;
          emotion: Emotion | null;
      }
    | { kind: 'snapshot'; key: string; messageId: number; snapshot: Snapshot };

export interface NovelInput {
    messages: readonly Message[];
    /** The line just sent, before the API stored it. */
    pending: { identityName: string; text: string } | null;
    /** The reply so far while a turn streams. */
    replySoFar: readonly MessagePart[] | null;
    /** The reply ↺ Again is replacing: left out, as the thread hides it. */
    replacing: number | null;
    /** The Chat's Snapshots; those under a Message follow its last part, oldest first. */
    snapshots: readonly Snapshot[];
    /** The Chat's On AI Messages Replace rules, as the thread applies them. Names never go through it. */
    shown: (text: string) => string;
}

const PENDING_KEY = 'pending';
const LIVE_PREFIX = 'live:';

/** Narration paragraphs as the thread splits them (AiMessageParts), and as Read aloud numbers them. */
export function paragraphsOf(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map((paragraph) => paragraph.trim())
        .filter((paragraph) => paragraph !== '');
}

/**
 * An AI Message's parts as steps, in their shown text: the rules run on a narration part before its
 * paragraphs are split (so a rule can remove one, and its step) and on a speech part as a whole. A
 * part the rules leave blank gives no step.
 */
function partSteps(parts: readonly MessagePart[], shown: (text: string) => string, messageId: number | null, keyOf: (rest: string) => string): NovelStep[] {
    const steps: NovelStep[] = [];
    parts.forEach((part, partIndex) => {
        const text = shown(part.text);
        if (part.kind === 'narration') {
            paragraphsOf(text).forEach((paragraph, index) =>
                steps.push({ kind: 'narration', key: keyOf(`${partIndex}:${index}`), messageId, partIndex, paragraph: index, text: paragraph }),
            );
            return;
        }
        if (text.trim() === '') return;
        steps.push({
            kind: 'speech',
            key: keyOf(`${partIndex}:0`),
            messageId,
            partIndex,
            characterId: part.characterId,
            speakerName: part.speakerName,
            text,
            emotion: part.emotion,
        });
    });
    return steps;
}

/** The Chat as steps, each with a key that stays put while the list grows. */
export function novelSteps({ messages, pending, replySoFar, replacing, snapshots, shown }: NovelInput): NovelStep[] {
    const steps: NovelStep[] = [];
    for (const message of messages) {
        if (message.id === replacing) continue;
        if (message.kind === 'user') {
            steps.push({ kind: 'user', key: `m${message.id}:u`, messageId: message.id, identityName: message.identityName, text: message.text });
            continue;
        }
        steps.push(...partSteps(message.parts, shown, message.id, (rest) => `m${message.id}:${rest}`));
        for (const snapshot of snapshots) {
            if (snapshot.messageId === message.id) steps.push({ kind: 'snapshot', key: `s${snapshot.id}`, messageId: message.id, snapshot });
        }
    }
    if (pending) steps.push({ kind: 'user', key: PENDING_KEY, messageId: null, identityName: pending.identityName, text: pending.text });
    if (replySoFar) steps.push(...partSteps(replySoFar, shown, null, (rest) => `${LIVE_PREFIX}${rest}`));
    return steps;
}

/** A streamed step: the reply being written, not yet stored. */
export function isLive(step: NovelStep): boolean {
    return step.key.startsWith(LIVE_PREFIX);
}

/** The newest AI Message's id among the steps; null when there is none. */
function newestAiMessageId(steps: readonly NovelStep[]): number | null {
    for (let index = steps.length - 1; index >= 0; index--) {
        const step = steps[index];
        if ((step.kind === 'narration' || step.kind === 'speech') && step.messageId !== null) return step.messageId;
    }
    return null;
}

/**
 * Where a step key is now. A streamed step's key finds the stored reply's step of the same part and
 * paragraph once the turn settles (live part n is stored part n), and the sent line finds the stored
 * User Message, so the position holds. -1 when the key is gone.
 */
export function stepIndex(steps: readonly NovelStep[], key: string): number {
    const found = steps.findIndex((step) => step.key === key);
    if (found >= 0) return found;
    if (key === PENDING_KEY) return steps.findLastIndex((step) => step.kind === 'user');
    if (key.startsWith(LIVE_PREFIX)) {
        const messageId = newestAiMessageId(steps);
        if (messageId === null) return -1;
        const stored = steps.findIndex((step) => step.key === `m${messageId}:${key.slice(LIVE_PREFIX.length)}`);
        return stored >= 0 ? stored : steps.findLastIndex((step) => step.messageId === messageId && step.kind !== 'snapshot');
    }
    return -1;
}

/** A Message's first step; -1 when it has none. */
export function firstStepOf(steps: readonly NovelStep[], messageId: number): number {
    return steps.findIndex((step) => step.messageId === messageId);
}

/**
 * Where the view opens: the first step of the newest AI Message, or the newest step when the
 * user's line comes after it (a reply still to come).
 */
export function openingStep(steps: readonly NovelStep[]): number {
    if (steps.length === 0) return -1;
    const lastAi = steps.findLastIndex((step) => step.kind === 'narration' || step.kind === 'speech');
    const lastUser = steps.findLastIndex((step) => step.kind === 'user');
    if (lastAi < 0 || lastUser > lastAi) return steps.length - 1;
    return firstStepOf(steps, steps[lastAi].messageId ?? -1) >= 0 ? firstStepOf(steps, steps[lastAi].messageId!) : lastAi;
}

/**
 * The step a Read aloud item belongs to: its part, and for narration its paragraph among the shown
 * text's paragraphs. Several items (the `*action*` spans of one line, a long paragraph read in two)
 * share one step. -1 when the Message has no such step.
 */
export function readingStep(steps: readonly NovelStep[], messageId: number, partIndex: number, paragraph: number | null): number {
    return steps.findIndex(
        (step) =>
            step.messageId === messageId &&
            ((step.kind === 'speech' && step.partIndex === partIndex) ||
                (step.kind === 'narration' && step.partIndex === partIndex && step.paragraph === (paragraph ?? 0))),
    );
}

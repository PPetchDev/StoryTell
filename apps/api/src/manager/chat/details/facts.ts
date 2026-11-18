import { DetailKind } from '../../../model/ledger/entities/detail-change.entity.js';
import { NewDetail } from './details.js';

/**
 * Established facts (.scratch/story-quality/spec.md): a Chat's canon numbers, ages, durations,
 * dates, names and ties, which the Judge records as the story states them and the Narrator reads
 * every turn, so "nine summers" stays nine summers. A fact is a detail record `topic: fact`; the
 * newest of a topic wins and an empty fact drops it. A slip is what a reply said against a fact,
 * recorded against that reply, and read by the next turn only. Pure logic over plain inputs.
 */

export const FACT_TOPIC_MAX = 60;
export const FACT_TEXT_MAX = 120;
/** The most facts a Chat keeps: a new topic past it is dropped, a change to one listed is still taken. */
export const FACTS_MAX = 40;
/** The most new or changed facts one judgement may give. */
export const FACTS_PER_TURN = 4;
/** What answering about them adds to the judge's token cap. */
export const FACTS_EXTRA_TOKENS = 160;
/** The heading of the Narrator's block, in the turn's trailing blocks. */
export const FACTS_HEADING = '# Established facts';

export interface ChatFact {
    topic: string;
    fact: string;
}

export interface FactSlip {
    topic: string;
    said: string;
}

/** A detail record as the facts read it. */
export interface FactRecord {
    kind: DetailKind;
    value: string;
    /** Null for a record the user made, which has no Message (.scratch/growing-cards/spec.md); facts and slips always have one. */
    messageId?: number | null;
}

/** The facts and the slips a turn reads. */
export interface PromptFacts {
    facts: ChatFact[];
    /** What the newest AI reply before this turn said against them. */
    slips: FactSlip[];
}

/** How a fact or a slip is stored: `topic: text`. A topic never holds ": ", so the first one splits it. */
export function factValue(topic: string, text: string): string {
    return `${topic}: ${text}`;
}

function splitValue(value: string): { topic: string; text: string } {
    const at = value.indexOf(': ');
    return at < 0 ? { topic: value.trim(), text: '' } : { topic: value.slice(0, at).trim(), text: value.slice(at + 2).trim() };
}

/** A topic compared loosely: case, punctuation and a leading "the" aside. */
export function topicKey(topic: string): string {
    return topic
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
        .replace(/^the /, '');
}

/** The facts as they stand, in the order their topics were first set; a changed fact keeps its place. */
export function currentFacts(records: readonly FactRecord[]): ChatFact[] {
    const facts = new Map<string, ChatFact>();
    for (const record of records) {
        if (record.kind !== DetailKind.Fact) continue;
        const { topic, text } = splitValue(record.value);
        const key = topicKey(topic);
        if (text === '') facts.delete(key);
        else if (facts.has(key)) facts.set(key, { topic: facts.get(key)!.topic, fact: text });
        else facts.set(key, { topic, fact: text });
    }
    return [...facts.values()];
}

/** The slips recorded against one Message; none for no Message. */
export function slipsOf(records: readonly FactRecord[], messageId: number | null): FactSlip[] {
    if (messageId === null) return [];
    return records
        .filter((record) => record.kind === DetailKind.Slip && record.messageId === messageId)
        .map((record) => {
            const { topic, text } = splitValue(record.value);
            return { topic, said: text };
        });
}

/** The facts a turn reads, and the slips of the newest AI Message before it. */
export function promptFacts(records: readonly FactRecord[], newestAiMessageId: number | null): PromptFacts {
    return { facts: currentFacts(records), slips: slipsOf(records, newestAiMessageId) };
}

/** What the Judge answered, read loosely. */
export interface JudgedFacts {
    /** A fact of "" drops its topic. */
    facts: ChatFact[];
    slips: FactSlip[];
}

const text = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** Reads the judgement's `facts` and `slips`: an item without a topic, or with a fact or said that is not a string, is left out. */
export function readJudgedFacts(facts: unknown, slips: unknown): JudgedFacts | null {
    const readFacts = (Array.isArray(facts) ? facts : []).flatMap((item): ChatFact[] => {
        if (!isObject(item) || !text(item.topic)) return [];
        // null or "" drops the topic; anything else not a string is nothing.
        const fact = item.fact === null ? '' : typeof item.fact === 'string' ? item.fact.trim() : null;
        return fact === null ? [] : [{ topic: text(item.topic), fact }];
    });
    const readSlips = (Array.isArray(slips) ? slips : []).flatMap((item): FactSlip[] =>
        isObject(item) && text(item.topic) && text(item.said) ? [{ topic: text(item.topic), said: text(item.said) }] : [],
    );
    return readFacts.length === 0 && readSlips.length === 0 ? null : { facts: readFacts, slips: readSlips };
}

/**
 * The Judge's section: the facts as they stand, then the rule and the JSON fields, so the system
 * message never changes. Read after the latest exchange, like the details section.
 */
export function judgeFactsSection(facts: readonly ChatFact[]): string {
    return [
        FACTS_HEADING,
        facts.length > 0 ? facts.map((entry) => `- ${entry.topic}: ${entry.fact}`).join('\n') : '(none yet)',
        `Facts rule: add "facts": [{"topic": "...", "fact": "..."}] to your JSON for a lasting, checkable fact the latest exchange states that is not listed above yet: a number, an age, how long something has lasted or how long ago it was, a date, a name, or who is related or married to whom ("topic": "Nara's age", "fact": "twenty-six"; "topic": "Nara's years at the stall", "fact": "nine summers"). Only facts a later reply could get wrong: never feelings, plans, events, or what someone is doing or wearing now. Name each topic in a few words, by whose it is, without a colon. Where the story allows, tie a length of time to the event it began with ("married the night of the summer market") rather than to now.`,
        `Change a listed fact, giving its topic exactly as listed, only when the story itself changes it: time moves on (after a night, "three days" becomes "four days"), someone openly corrects it, or the user's own words state it otherwise. "fact": "" drops a listed fact that is no longer true and has nothing in its place.`,
        `Slips: when the latest reply states a listed fact differently and nothing in the story changed it, keep the fact and add "slips": [{"topic": "...", "said": "..."}] with the listed topic and what the reply said instead. When a fact is not listed yet but the story so far or the recent story stated it differently before the latest reply, record what was said first, and a slip for what the reply said. Leave "facts" and "slips" out when there is nothing; at most ${FACTS_PER_TURN} facts a turn.`,
    ].join('\n');
}

/** One line, no stray spaces or colons in a topic, no full stop at the end, and no longer than allowed. */
function tidy(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '').slice(0, max).trim();
}

const same = (a: string, b: string): boolean => tidy(a, FACT_TEXT_MAX).toLowerCase() === tidy(b, FACT_TEXT_MAX).toLowerCase();

/**
 * What one judgement changes. A fact equal to the listed one is not a change; a topic takes one
 * change a turn, at most `FACTS_PER_TURN` in all; a new topic past `FACTS_MAX` is dropped. A slip
 * needs a listed topic, or one first recorded in the same judgement (seeded from an earlier telling),
 * a "said" that differs from the fact, and no change to a listed topic in the same judgement. `rejected` says why what the Judge gave was not taken, for the log.
 */
export function applyFacts(current: readonly ChatFact[], judged: JudgedFacts | null): { changes: NewDetail[]; rejected: string[] } {
    const changes: NewDetail[] = [];
    const rejected: string[] = [];
    if (!judged) return { changes, rejected };
    const listed = new Map(current.map((entry) => [topicKey(entry.topic), entry]));
    let count = listed.size;
    const changed = new Set<string>();
    const added = new Map<string, ChatFact>();
    for (const entry of judged.facts) {
        const topic = tidy(entry.topic.replace(/:/g, ' '), FACT_TOPIC_MAX);
        const key = topicKey(topic);
        if (key === '') continue;
        const now = listed.get(key);
        const fact = entry.fact === '' ? '' : tidy(entry.fact, FACT_TEXT_MAX);
        if (changed.has(key)) {
            rejected.push(`Fact "${topic}": a second change in one turn`);
            continue;
        }
        if (fact === '' ? now === undefined : now !== undefined && same(now.fact, fact)) {
            rejected.push(`Fact "${topic}": unchanged`);
            continue;
        }
        if (changed.size >= FACTS_PER_TURN) {
            rejected.push(`Fact "${topic}": more than ${FACTS_PER_TURN} in one turn`);
            continue;
        }
        if (now === undefined && count >= FACTS_MAX) {
            rejected.push(`Fact "${topic}": the Chat already holds ${FACTS_MAX}`);
            continue;
        }
        changed.add(key);
        if (now === undefined) {
            count++;
            added.set(key, { topic, fact });
        } else if (fact === '') count--;
        // A listed fact keeps its topic's wording.
        changes.push({ kind: DetailKind.Fact, characterId: null, value: factValue(now?.topic ?? topic, fact) });
    }
    for (const slip of judged.slips) {
        const key = topicKey(slip.topic);
        // A fact first recorded this turn from an earlier telling can be slipped on by the same reply.
        const now = listed.get(key) ?? added.get(key);
        const said = tidy(slip.said, FACT_TEXT_MAX);
        if (!now) rejected.push(`Slip on "${slip.topic}": not a listed fact`);
        else if (changed.has(key) && !added.has(key)) rejected.push(`Slip on "${now.topic}": the fact changed this turn`);
        else if (said === '' || same(now.fact, said)) rejected.push(`Slip on "${now.topic}": said the same`);
        else changes.push({ kind: DetailKind.Slip, characterId: null, value: factValue(now.topic, said) });
    }
    return { changes, rejected };
}

/**
 * The Narrator's block (.scratch/story-quality/spec.md, "Where the Narrator reads them"), in the
 * turn's trailing blocks after the Author's note: the facts, which win over anything earlier that
 * disagrees, then what the last reply got wrong. Null with no facts.
 */
export function factsBlock(input: PromptFacts | null | undefined): string | null {
    if (!input || input.facts.length === 0) return null;
    const lines = [
        `${FACTS_HEADING} (true in this Chat; where the Story so far, a Memory or an earlier reply says otherwise, these win)`,
        ...input.facts.map((entry) => `- ${entry.topic}: ${entry.fact}`),
        'Keep every number, age, length of time, name and tie as listed here, in narration and in what the Characters say. A Character still knows only what they have seen or been told.',
    ];
    const slips = input.slips.filter((slip) => input.facts.some((entry) => topicKey(entry.topic) === topicKey(slip.topic)));
    if (slips.length > 0) {
        lines.push(`The last reply got these wrong; keep to the facts above and don't repeat it: ${slips.map((slip) => `${slip.topic} (it said "${slip.said}")`).join('; ')}.`);
    }
    return lines.join('\n');
}

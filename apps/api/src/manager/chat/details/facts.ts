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
    /**
     * Null for a record the user made, which has no Message (.scratch/growing-cards/spec.md): a fact
     * the user set in the Facts panel (.scratch/facts-panel/spec.md). Left out, a Judge's. Slips always have one.
     */
    messageId?: number | null;
}

/** A fact as the Facts panel shows it. */
export interface ShownFact extends ChatFact {
    /** The current telling is the user's own record. */
    byUser: boolean;
}

export interface FactsState {
    /** In the order their topics were first set. */
    facts: ShownFact[];
    /** The topics (as `topicKey`) the user deleted, which nothing has set since. */
    clearedByUser: string[];
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

/**
 * The facts as they stand, in the order their topics were first set (a changed fact keeps its
 * place), with whose telling each is, and the topics the user deleted that nothing has set since.
 */
export function factsState(records: readonly FactRecord[]): FactsState {
    const facts = new Map<string, ShownFact>();
    const cleared = new Set<string>();
    for (const record of records) {
        if (record.kind !== DetailKind.Fact) continue;
        const { topic, text } = splitValue(record.value);
        const key = topicKey(topic);
        const byUser = record.messageId === null;
        cleared.delete(key);
        if (text === '') {
            facts.delete(key);
            if (byUser) cleared.add(key);
        } else if (facts.has(key)) facts.set(key, { topic: facts.get(key)!.topic, fact: text, byUser });
        else facts.set(key, { topic, fact: text, byUser });
    }
    return { facts: [...facts.values()], clearedByUser: [...cleared] };
}

/** The facts as they stand, in the order their topics were first set; a changed fact keeps its place. */
export function currentFacts(records: readonly FactRecord[]): ChatFact[] {
    return factsState(records).facts.map(({ topic, fact }) => ({ topic, fact }));
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
 *
 * Worded after the real-model check of 2026-11-18 (.scratch/story-quality/spec.md, "Real-model check
 * after the merge"). On DeepSeek V4 Flash the Judge finds the facts an exchange states, but does not
 * compare them with the list reliably: it missed slips, and took a reply's wrong number as the new
 * fact. So it is asked only to give what the exchange states, listed topics included; `applyFacts`
 * decides whether a different telling is a change or a slip.
 */
export function judgeFactsSection(facts: readonly ChatFact[]): string {
    return [
        FACTS_HEADING,
        facts.length > 0 ? facts.map((entry) => `- ${entry.topic}: ${entry.fact}`).join('\n') : '(none yet)',
        `Facts rule: add "facts": [{"topic": "...", "fact": "..."}] to your JSON for every lasting, checkable fact the latest exchange says in words: a number, an age, how long something has lasted or how long ago it was, a date, a name, or who is related or married to whom ("topic": "Nara's years at the stall", "fact": "nine summers"). Give a fact that is listed above too when the exchange tells it differently, with its topic exactly as listed and what the exchange said. Write the fact in a few words as the story said it. Never work a fact out from others (no age or date counted from what was said) and never add what the story did not say. Only facts a later reply could get wrong: never feelings, plans, events, or what someone is doing or wearing now. Name each topic in a few words, by whose it is, without a colon. Tie a length of time to the event it began with ("married the night of the summer market"), never to now ("four days ago").`,
        `Slips: where the latest reply tells a listed fact differently, also add "slips": [{"topic": "...", "said": "..."}] with the topic exactly as listed and what the reply said. When a fact is not listed yet but the story so far or the recent story stated it differently before the latest reply, give what was said first as the fact, and a slip for what the reply said.`,
        `Leave "facts" and "slips" out when there is nothing; at most ${FACTS_PER_TURN} facts a turn.`,
    ].join('\n');
}

/** One line, no stray spaces or colons in a topic, no full stop at the end, and no longer than allowed. */
function tidy(value: string, max: number): string {
    return value.replace(/\s+/g, ' ').trim().replace(/[.。]+$/, '').slice(0, max).trim();
}

const same = (a: string, b: string): boolean => tidy(a, FACT_TEXT_MAX).toLowerCase() === tidy(b, FACT_TEXT_MAX).toLowerCase();

/** Joining words that never tell which fact it is. Units ("years", "months") do: three years is not three months. */
const FILLER = new Set(['a', 'an', 'the', 'and', 'of', 'in', 'on', 'at', 'to', 'by', 'as', 'is', 'it', 'for', 'her', 'his', 'their', 'our', 'your', 'its', 'with', 'from', 'was', 'were', 'has', 'had', 'that', 'this']);
/** A "not" just before a word means the user is not saying it: "it was twelve, not eleven" says twelve. */
const NEGATIONS = new Set(['not', 'no', 'never', 'nor', 'isnt', 'wasnt', 'arent', 'werent', 'dont', 'didnt', 'doesnt', 'aint']);
const SMALL = new Map(
    ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'].map((word, n) => [word, n]),
);
const TENS = new Map(['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'].map((word, i) => [word, 20 + 10 * i]));
const THAI = /[฀-๿]/;

/**
 * A text's words, lowercased, with English number words and Thai digits as numerals, so "27",
 * "twenty-seven" and "๒๗" are one word. Thai runs stay whole (Thai has no spaces between words).
 */
function words(text: string): string[] {
    const raw = text
        .toLowerCase()
        .replace(/[’']/g, '')
        .replace(/[๐-๙]/g, (digit) => String(digit.charCodeAt(0) - 0x0e50))
        .split(/[^\p{L}\p{M}\p{N}]+/u)
        .filter((word) => word !== '');
    const out: string[] = [];
    for (let i = 0; i < raw.length; i++) {
        const tens = TENS.get(raw[i]);
        const unit = SMALL.get(raw[i + 1] ?? '');
        if (tens !== undefined && unit !== undefined && unit > 0 && unit < 10) {
            out.push(String(tens + unit));
            i++;
        } else if (tens !== undefined) out.push(String(tens));
        else if (SMALL.has(raw[i])) out.push(String(SMALL.get(raw[i])));
        else out.push(raw[i]);
    }
    return out;
}

/** The words of a telling that say which fact it is: all but the joining words. */
function tellingWords(value: string): string[] {
    return words(value).filter((word) => !FILLER.has(word));
}

/** Where the user last says a word, not just after a "not"; -1 for never. A Thai word may sit inside a longer Thai run. */
function lastSaid(word: string, told: readonly string[]): number {
    for (let i = told.length - 1; i >= 0; i--) {
        if (!(THAI.test(word) ? told[i].includes(word) : told[i] === word)) continue;
        if (NEGATIONS.has(told[i - 1] ?? '') || NEGATIONS.has(told[i - 2] ?? '')) continue;
        return i;
    }
    return -1;
}

/**
 * Whether the user's own words say this telling: every word of it that tells which fact it is (a
 * number, a unit, a name) is in the user's text, and not just after a "not". With `listed`, the
 * telling it would replace: where the user says that one too ("You said twelve? You are twenty-six"),
 * only the one said last counts, by the words the two do not share.
 */
export function saidByUser(value: string, userText: string, listed?: string): boolean {
    const told = words(userText);
    const telling = tellingWords(value);
    if (telling.length === 0 || telling.some((word) => lastSaid(word, told) < 0)) return false;
    if (listed === undefined) return true;
    const old = tellingWords(listed);
    const ownNew = telling.filter((word) => !old.includes(word));
    const ownOld = old.filter((word) => !telling.includes(word));
    if (ownNew.length === 0) return false;
    const oldAt = ownOld.map((word) => lastSaid(word, told));
    if (ownOld.length === 0 || oldAt.some((at) => at < 0)) return true;
    return Math.max(...ownNew.map((word) => lastSaid(word, told))) > Math.max(...oldAt);
}

/**
 * What one judgement changes. A fact equal to the listed one is not a change; a topic takes one
 * change a turn, at most `FACTS_PER_TURN` in all; a new topic past `FACTS_MAX` is dropped.
 *
 * Only the user changes canon. A listed fact told differently changes only when `userText`, the
 * user's own words in the exchange, say the new telling over the listed one (`saidByUser`).
 * Otherwise the listed fact stands and the telling is kept as a slip, so a reply's mistake never
 * becomes canon; a slip the Judge gives in the user's own words is taken as the change instead. The
 * Judge never drops a listed fact. A topic names a listed one when it is the same, or is the listed
 * topic followed by the telling itself ("Nara's mother Ilse" with "Ilse", for "Nara's mother").
 *
 * A slip needs a listed topic, or one first recorded in the same judgement (seeded from an earlier
 * telling), a "said" that differs from the fact, and no change to a listed topic in the same
 * judgement; the same slip twice is kept once. `rejected` says why what the Judge gave was not
 * taken, for the log.
 *
 * A topic the user deleted in the Facts panel (`clearedByUser`, as `topicKey`s) stays deleted: a new
 * fact on it is taken only in the user's own words (.scratch/facts-panel/spec.md).
 */
export function applyFacts(
    current: readonly ChatFact[],
    judged: JudgedFacts | null,
    userText = '',
    clearedByUser: readonly string[] = [],
): { changes: NewDetail[]; rejected: string[] } {
    const cleared = new Set(clearedByUser);
    const changes: NewDetail[] = [];
    const rejected: string[] = [];
    if (!judged) return { changes, rejected };
    const listed = new Map(current.map((entry) => [topicKey(entry.topic), entry]));
    /** The listed topic a given one names: the same, or the listed topic followed by the telling. */
    const listedKey = (key: string, telling: string): string => {
        if (listed.has(key)) return key;
        const tail = topicKey(telling);
        if (tail === '') return key;
        for (const candidate of listed.keys()) if (key === `${candidate} ${tail}`) return candidate;
        return key;
    };
    let count = listed.size;
    const changed = new Map<string, string>();
    const added = new Map<string, ChatFact>();
    const slips: FactSlip[] = [];
    const facts: ChatFact[] = [...judged.facts];
    // A slip in the user's own words is the change, not a slip.
    for (const slip of judged.slips) {
        const now = listed.get(listedKey(topicKey(slip.topic), slip.said));
        if (now && slip.said.trim() !== '' && !same(now.fact, slip.said) && saidByUser(slip.said, userText, now.fact)) {
            facts.push({ topic: now.topic, fact: slip.said });
            rejected.push(`Slip on "${now.topic}": the user's own words, taken as the change`);
        } else slips.push(slip);
    }
    for (const entry of facts) {
        const given = tidy(entry.topic.replace(/:/g, ' '), FACT_TOPIC_MAX);
        const key = listedKey(topicKey(given), entry.fact);
        if (key === '') continue;
        const now = listed.get(key);
        const topic = now?.topic ?? given;
        const fact = entry.fact === '' ? '' : tidy(entry.fact, FACT_TEXT_MAX);
        if (changed.has(key)) {
            // The same change given twice (as a fact and as a slip in the user's words) is one change.
            if (!same(changed.get(key)!, fact)) rejected.push(`Fact "${given}": a second change in one turn`);
            continue;
        }
        if (fact === '' ? now === undefined : now !== undefined && same(now.fact, fact)) {
            rejected.push(`Fact "${given}": unchanged`);
            continue;
        }
        if (now !== undefined && fact === '') {
            rejected.push(`Fact "${given}": only the user changes a listed fact; kept "${now.fact}"`);
            continue;
        }
        if (now === undefined && cleared.has(key) && !saidByUser(fact, userText)) {
            rejected.push(`Fact "${given}": the user deleted it; "${fact}" is not in the user's words`);
            continue;
        }
        if (now !== undefined && !saidByUser(fact, userText, now.fact)) {
            // Told differently, and not by the user: the listed fact stands.
            slips.push({ topic: now.topic, said: fact });
            rejected.push(`Fact "${given}": "${fact}" is not in the user's words; kept "${now.fact}", the telling as a slip`);
            continue;
        }
        if (changed.size >= FACTS_PER_TURN) {
            rejected.push(`Fact "${given}": more than ${FACTS_PER_TURN} in one turn`);
            continue;
        }
        if (now === undefined && count >= FACTS_MAX) {
            rejected.push(`Fact "${given}": the Chat already holds ${FACTS_MAX}`);
            continue;
        }
        changed.set(key, fact);
        if (now === undefined) {
            count++;
            added.set(key, { topic, fact });
        }
        // A listed fact keeps its topic's wording.
        changes.push({ kind: DetailKind.Fact, characterId: null, value: factValue(topic, fact) });
    }
    const slipped = new Set<string>();
    for (const slip of slips) {
        const key = listedKey(topicKey(slip.topic), slip.said);
        // A fact first recorded this turn from an earlier telling can be slipped on by the same reply.
        const now = listed.get(key) ?? added.get(key);
        const said = tidy(slip.said, FACT_TEXT_MAX);
        if (!now) rejected.push(`Slip on "${slip.topic}": not a listed fact`);
        else if (changed.has(key) && !added.has(key)) rejected.push(`Slip on "${now.topic}": the fact changed this turn`);
        else if (said === '' || same(now.fact, said)) rejected.push(`Slip on "${now.topic}": said the same`);
        else if (!slipped.has(`${key}\n${said.toLowerCase()}`)) {
            slipped.add(`${key}\n${said.toLowerCase()}`);
            changes.push({ kind: DetailKind.Slip, characterId: null, value: factValue(now.topic, said) });
        }
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

/** What the user's own edit in the Facts panel comes to (.scratch/facts-panel/spec.md). */
export type UserFactChange =
    /** The record to write: `topic: fact`, or `topic: ` to delete it. */
    | { value: string }
    /** Already so: nothing to write. */
    | 'unchanged'
    /** A topic with no letters or digits. */
    | 'no-topic'
    /** A new topic, and the Chat already holds `FACTS_MAX`. */
    | 'full';

/**
 * The user's own fact for a topic, against the facts as they stand: tidied as the Judge's are, the
 * topic matched loosely, a listed topic keeping its wording; a fact of whitespace only deletes it.
 * Only the exact same telling is unchanged, so the user can fix a capital letter.
 */
export function userFactChange(current: readonly ChatFact[], topic: string, fact: string): UserFactChange {
    const given = tidy(topic.replace(/:/g, ' '), FACT_TOPIC_MAX);
    const key = topicKey(given);
    if (key === '') return 'no-topic';
    const listed = current.find((entry) => topicKey(entry.topic) === key);
    const text = tidy(fact, FACT_TEXT_MAX);
    if (text === '') return listed ? { value: factValue(listed.topic, '') } : 'unchanged';
    if (listed) return listed.fact === text ? 'unchanged' : { value: factValue(listed.topic, text) };
    if (current.length >= FACTS_MAX) return 'full';
    return { value: factValue(given, text) };
}

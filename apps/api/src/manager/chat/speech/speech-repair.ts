import { PromptMessage } from '../../../service/model-gateway/model-gateway.js';
import { repeatedOpenings } from './repeated-openings.js';

/**
 * Line repair (.scratch/natural-speech/line-repair.md), as pure logic: what the model is asked to
 * do with one speech line that has the repeated-sentence habit, and when its answer is taken.
 */

/** Room for one repaired line: a speech line is rarely more than a few sentences. */
export const REPAIR_MAX_TOKENS = 300;

/** A repair slower than this is dropped, and the line is kept as written. */
export const REPAIR_TIMEOUT_MS = 10_000;

/**
 * A play-model repair with no answer by now is also asked of the background model, inside the
 * same REPAIR_TIMEOUT_MS. On live (2026-11-17), a busy play model left one turn's three repairs
 * all timing out at 10 s: the user waited, and nothing was repaired.
 */
export const REPAIR_FALLBACK_AFTER_MS = 6_000;

export type RepairModel = 'play' | 'background';

export interface RepairAnswer {
    /** The first answer that came, or null when none came in time. */
    text: string | null;
    /** Which model gave it. */
    by: RepairModel | null;
    /** Each model that failed or was late, and why ("play model: no answer within 6000 ms"). */
    failures: string[];
}

/**
 * The play model's answer, or the background model's when the play model fails or has not
 * answered after `fallbackAfterMs`, whichever answer comes first, and never later than `timeoutMs`
 * after the start. A play call that is late is still listened to: if it answers before the
 * background model, its answer is taken. The background model is asked at most once.
 */
export function firstRepairAnswer(
    play: () => Promise<string>,
    background: () => Promise<string>,
    { fallbackAfterMs = REPAIR_FALLBACK_AFTER_MS, timeoutMs = REPAIR_TIMEOUT_MS } = {},
): Promise<RepairAnswer> {
    return new Promise((resolve) => {
        const failures = new Map<RepairModel, string>();
        /** Each model still being waited for, and when it was asked. */
        const pending = new Map<RepairModel, number>();
        let settled = false;
        let fallbackStarted = false;
        const list = (): string[] => [...failures].map(([model, why]) => `${model} model: ${why}`);
        const finish = (text: string | null, by: RepairModel | null): void => {
            if (settled) return;
            settled = true;
            if (by !== null) failures.delete(by);
            clearTimeout(fallbackTimer);
            clearTimeout(endTimer);
            resolve({ text, by, failures: list() });
        };
        const ask = (model: RepairModel, call: () => Promise<string>): void => {
            pending.set(model, Date.now());
            let answer: Promise<string>;
            try {
                answer = call();
            } catch (error) {
                answer = Promise.reject(error);
            }
            answer.then(
                (text) => {
                    pending.delete(model);
                    finish(text, model);
                },
                (error: unknown) => {
                    pending.delete(model);
                    failures.set(model, error instanceof Error ? error.message : String(error));
                    if (model === 'play') startFallback();
                    if (pending.size === 0) finish(null, null);
                },
            );
        };
        const startFallback = (): void => {
            if (fallbackStarted || settled) return;
            fallbackStarted = true;
            ask('background', background);
        };
        const fallbackTimer = setTimeout(() => {
            if (!pending.has('play')) return;
            failures.set('play', `no answer within ${fallbackAfterMs} ms`);
            startFallback();
        }, fallbackAfterMs);
        const endTimer = setTimeout(() => {
            for (const [model, askedAt] of pending) failures.set(model, `no answer within ${Date.now() - askedAt} ms`);
            finish(null, null);
        }, timeoutMs);
        ask('play', play);
    });
}

/** "I", "me", "my" and the like; "you", "your" and the like: a repair that loses all of either has turned the line around. */
const FIRST_PERSON = new Set(['i', "i'm", "i've", "i'd", "i'll", 'me', 'my', 'mine', 'myself']);
const SECOND_PERSON = new Set(['you', "you're", "you've", "you'd", "you'll", 'your', 'yours', 'yourself']);

function personCounts(text: string): { first: number; second: number } {
    const words = text.toLowerCase().replace(/[’]/g, "'").match(/[a-z']+/g) ?? [];
    return { first: words.filter((word) => FIRST_PERSON.has(word)).length, second: words.filter((word) => SECOND_PERSON.has(word)).length };
}

/** The terms a Voice quotes as what the Character calls people ("traveller", "my dear"), lower case. */
export function quotedTerms(voice: string): string[] {
    return [...voice.matchAll(/["“]([^"”]{2,30})["”]/g)].map((match) => match[1].toLowerCase().trim());
}

/**
 * A speech line's opening stage direction ("*still not turning* "), kept apart so only spoken words
 * are sent for repair and the direction stays on screen; `spoken` is null when the line has another
 * one further in, and such a line is left as written.
 */
export function spokenPart(text: string): { aside: string; spoken: string | null } {
    const aside = text.match(/^(?:\*[^*\n]+\*\s*)+/)?.[0] ?? '';
    const spoken = text.slice(aside.length);
    return { aside, spoken: spoken.includes('*') || spoken.trim() === '' ? null : spoken };
}

export interface RepairInput {
    /** Who says it, and how they talk (their card's Voice). */
    speakerName: string;
    voice: string;
    /** The line as written. */
    line: string;
    /** Where the habit shows in it (`repeatedOpenings`). */
    found: string[];
}

export interface RepairPrompt {
    messages: PromptMessage[];
    maxTokens: number;
}

export function buildRepairPrompt(input: RepairInput): RepairPrompt {
    const name = input.speakerName;
    const system = `You edit one line of dialogue from an interactive story for adult readers so it sounds like a real person talking, not like a script. Every character is an adult.
Written, then spoken:
Written: "I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg." Spoken: "I had a whole speech ready. Stages and everything. You were going to beg."
Written: "You don't touch, you don't talk, you don't do the forehead thing." Spoken: "No touching. And none of the forehead thing."
Written: "I loved you when you came back. I loved you when you poked me. I loved you at dawn." Spoken: "I think I loved you the second you came back for that hatchet."`;
    const user = [
        `Character: ${name}.${input.voice.trim() ? ` How ${name} talks: ${input.voice.trim()}` : ''}`,
        `The line, as written:\n"${input.line.trim()}"`,
        `What gives it away as written, not spoken: these sentences open the same way:\n${input.found.map((run) => `- "${run}"`).join('\n')}`,
        `Say the line again the way ${name} would actually say it out loud, changing as little as you can.
- Reshape only the sentences that open the same way: say each thing once, with no run of sentences opening with the same words and no list of three. Keep every other sentence word for word.
- Keep who says and does what: "I" stays ${name}, and "you" stays whoever ${name} is talking to. Keep every fact, promise and question.
- Add no names, nicknames or ways of addressing anyone that the line doesn't already use.
- Keep ${name}'s voice and the line's mood. About as long, or shorter.
- Spoken words only: no stage directions, no *asterisks*, no "${name}:" label.
Answer with only the line.`,
    ].join('\n\n');
    return {
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
        maxTokens: REPAIR_MAX_TOKENS,
    };
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Which guard refused a repair's answer, named in the API log so a repair on live can be checked later. */
export type RepairRefusal = 'empty' | "wrote another speaker's line" | 'too long' | 'no better' | 'lost all "I"' | 'lost all "you"' | 'added a quoted Voice term';

/** Why a line was kept as written: a guard refused the answer, no answer came in time, or the call failed. */
export type RepairFailure = RepairRefusal | 'timeout' | 'error';

export type RepairVerdict ={ line: string; refused: null } | { line: null; refused: RepairRefusal };

/**
 * The repaired line to keep, or the guard that refused it (the line is then kept as written): the
 * answer without a fence, a `Name:` label, wrapping quotes or asterisk asides, taken only when it is
 * not empty, not more than a quarter longer (and a few words), has fewer of the habit than the line
 * it replaces, keeps some of its "I" and of its "you", and brings in no term the Voice quotes that
 * the line didn't use. On Chat 2's real lines, unguarded repairs turned "I had a whole speech ready"
 * into "You had a speech ready", and put "traveller", which the card says she calls a stranger, into
 * lines to her husband.
 */
export function judgeRepair(answer: string, input: Pick<RepairInput, 'speakerName' | 'line'> & { voice?: string }): RepairVerdict {
    const refuse = (refused: RepairRefusal): RepairVerdict => ({ line: null, refused });
    let line = answer.trim();
    const fenced = line.match(/^```[^\n]*\n([\s\S]*?)\n?```$/);
    if (fenced) line = fenced[1].trim();
    line = line.replace(new RegExp(`^@?\\*{0,2}${escapeRegExp(input.speakerName)}\\*{0,2}\\s*:\\s*`, 'i'), '');
    line = line.replace(/\*[^*\n]+\*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();
    if (/^["“][\s\S]*["”]$/.test(line)) line = line.slice(1, -1).trim();
    if (line === '') return refuse('empty');
    if (line.includes('\n@')) return refuse("wrote another speaker's line");
    if (line.length > input.line.length * 1.25 + 40) return refuse('too long');
    if (repeatedOpenings(line).length >= repeatedOpenings(input.line).length) return refuse('no better');
    // Turned around: every "I" or every "you" of the line gone ("I had a speech ready" said back as
    // "You had a speech ready"). Fewer is fine: folding "I had stages. I had a sequence." drops some.
    const was = personCounts(input.line);
    const now = personCounts(line);
    if (was.first >= 2 && now.first === 0) return refuse('lost all "I"');
    if (was.second >= 2 && now.second === 0) return refuse('lost all "you"');
    // A way of addressing someone the card quotes, brought in where the line had none ("traveller" to a husband).
    const original = input.line.toLowerCase();
    const lower = line.toLowerCase();
    if (quotedTerms(input.voice ?? '').some((term) => lower.includes(term) && !original.includes(term))) return refuse('added a quoted Voice term');
    return { line, refused: null };
}

/** `judgeRepair`'s line alone: the repaired line to keep, or null to keep the line as written. */
export function acceptRepair(answer: string, input: Pick<RepairInput, 'speakerName' | 'line'> & { voice?: string }): string | null {
    return judgeRepair(answer, input).line;
}

/** Each text in a repair's log line is cut to this many characters. */
export const REPAIR_LOG_TEXT_CAP = 600;

/**
 * One API log line per repair, so a repair on live can be checked later: who said it, the line as
 * written, and either the line kept or the model's raw answer and why it was refused. The texts are
 * JSON-encoded, so a newline in one can't split the line in journalctl.
 */
export function repairLogLine(
    chatId: number,
    entry: { speaker: string; part: number; written: string; repaired: string | null; answer: string | null; reason: RepairFailure | null; error?: string | null },
): string {
    const cap = (text: string | null | undefined): string | null =>
        text === null || text === undefined || text.length <= REPAIR_LOG_TEXT_CAP ? (text ?? null) : `${text.slice(0, REPAIR_LOG_TEXT_CAP)}…(${text.length} chars)`;
    const head = { speaker: entry.speaker, part: entry.part, written: cap(entry.written) };
    if (entry.repaired !== null) return `Chat ${chatId}: Line repair kept ${JSON.stringify({ ...head, repaired: cap(entry.repaired) })}`;
    const fields = { ...head, answer: cap(entry.answer), ...(entry.error ? { error: cap(entry.error) } : {}) };
    return `Chat ${chatId}: Line repair refused (${entry.reason ?? 'unknown'}) ${JSON.stringify(fields)}`;
}

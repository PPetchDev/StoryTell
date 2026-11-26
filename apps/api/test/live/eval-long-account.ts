import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { parseStorySoFar, STORY_SO_FAR_ASK, STORY_SO_FAR_CUT_OFF, STORY_SO_FAR_MAX_TOKENS, storySoFarPromptMessages, storySoFarRejection } from '../../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { partsToText } from '../../src/manager/chat/turn/reply-parser.js';
import { PromptMessage } from '../../src/service/model-gateway/model-gateway.js';
import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import { backgroundSamplers } from '../../src/service/model-gateway/real/model-table.js';
import { OpenRouterClient } from '../../src/service/model-gateway/real/openrouter-client.js';
import { wordCount } from './eval-checks.js';
import { BACKGROUND, BACKGROUND_PRICE_USD_PER_MILLION, EVAL_CAP_USD, EvalRunRefused, EXPECTED, gitState, worstCaseUsd } from './eval-run.js';
import { REPO_ROOT } from './smoke-run.js';

/**
 * The long-input account eval (.scratch/story-so-far-start/spec.md, "Plan: a long-input eval"):
 * the app's Story so far writer on copies of real Chats, as long as live sends, and whether each
 * account starts at the story's start. The copies and the plan of checks live under
 * .data/eval-inputs/ (git-ignored): they are the user's private Chats. It spends real credit, so
 * only the user starts it, with `npm run eval:live -- --memory account-long [now] [c] [d] --spend`.
 */

export const DEFAULT_INPUT_DIR = path.join(REPO_ROOT, '.data', 'eval-inputs');
export const PLAN_FILE = 'long-account.json';
/** Each input and arm is written this many times unless told otherwise: the plan's three. */
export const LONG_ACCOUNT_SAMPLES = 3;
/** A report keeps each account whole (it is the model's summary, under the git-ignored .data/), never the Messages. */

// ---------------------------------------------------------------------------------------------
// The copy of a Chat, as scripts/export-chat.mjs writes it from live.

export interface ExportedPart {
    position: number;
    kind: string;
    speakerName: string | null;
    text: string;
}

export interface ExportedMessage {
    position: number;
    kind: string;
    text: string | null;
    identityName: string | null;
    parts: ExportedPart[];
}

/** One of the Chat's own records of an Item or a Fact, at the Message it came with (scripts/export-chat.mjs). */
export interface ExportedDetail {
    kind: string;
    value: string;
    characterName: string | null;
    position: number | null;
}

export interface ExportedChat {
    chatId: number;
    personaName: string | null;
    roleName: string | null;
    castNames: string[];
    storySoFarThrough: number | null;
    messages: ExportedMessage[];
    /** Missing from copies made before keepers (2026-11-26). */
    details?: ExportedDetail[];
}

export interface WriterInput {
    identityName: string;
    castNames: string[];
    messages: { speaker: string; text: string }[];
}

/**
 * The Messages as the app's Story so far update hands them to the writer: in order, a user Message
 * under the name it was written as, a reply as `Story` with its parts joined as the turn history
 * renders them (`messageText`). The identity worn now is the Persona's, else the newest name a user
 * Message carries, else the Role's: the export cannot fill a Role's placeholders.
 */
export function writerInputFrom(chat: ExportedChat): WriterInput {
    const ordered = [...chat.messages].sort((a, b) => a.position - b.position);
    const stamped = ordered.filter((message) => message.kind === 'user' && message.identityName).at(-1)?.identityName ?? null;
    const identityName = chat.personaName ?? stamped ?? chat.roleName ?? 'the user';
    return {
        identityName,
        castNames: chat.castNames,
        messages: ordered.map((message) => ({
            speaker: message.kind === 'user' ? (message.identityName ?? identityName) : 'Story',
            text:
                message.kind === 'user'
                    ? (message.text ?? '')
                    : partsToText(
                          [...message.parts]
                              .sort((a, b) => a.position - b.position)
                              .map((part) =>
                                  part.kind === 'narration'
                                      ? { kind: 'narration' as const, text: part.text }
                                      : { kind: 'speech' as const, characterId: null, speakerName: part.speakerName ?? '', text: part.text },
                              ),
                      ),
        })),
    };
}

// ---------------------------------------------------------------------------------------------
// The plan: which cut of which Chat, and the telltales written by hand from reading it.

export interface LongInput {
    /** The input's name in the report, e.g. "chat-4-150". */
    name: string;
    chat: number;
    /** The first this many Messages are told; all of them when left out. */
    through?: number;
    /** A pattern (case ignored) of the Chat's first scene, looked for in the account's first two sentences. */
    start: string;
    /** One pattern for each quarter of the Messages told, in order. */
    quarters: [string, string, string, string];
    /**
     * Openings judged by hand: some that start at the start and some that do not, in the words an
     * account actually used. The start pattern must tell them apart before anything is sent: a
     * check shown only to fire on failures has not been shown to stay quiet on successes.
     */
    startExamples: { good: string[]; bad: string[] };
    /**
     * What an account must not lose (spec: "Keepers"), picked by hand from the Chat's own records: an
     * Item still held, a promise, a secret, a cost. Each is shown, before anything is sent, to find an
     * account that keeps it and to stay quiet on one that drops it.
     */
    keepers?: Keeper[];
}

export interface Keeper {
    name: string;
    /** Looked for, case ignored, anywhere in the account. */
    pattern: string;
    /** Accounts, or parts of them, judged by hand to keep it... */
    kept: string[];
    /** ...and to drop it. */
    dropped: string[];
}

export interface LongAccountPlan {
    inputs: LongInput[];
}

export type Arm = 'now' | 'before' | 'c' | 'd' | 'e' | 'f';
export const ARMS: Arm[] = ['now', 'before', 'c', 'd', 'e', 'f'];

const D_ASK = 'Write the account now, from the beginning of the story through to the last of the Messages. Open with one sentence on how the story began.';
const E_ASK = `${D_ASK} Use about 450 to 500 words.`;

/**
 * The last line of the first try's ask, by arm. "now" is the app's own, whatever it is; "before" is
 * the ask the app had until D was chosen (2026-11-26); C and D are the two measured in round 2. The
 * second try after a cut-off is the app's in every arm. E and F ask D for a fuller account, F also to
 * keep held items, promises and secrets: on live, D's accounts of a long Chat ran to about 220 words
 * and lost them (spec: "Seen on live with D").
 */
export const ARM_ASK: Record<Arm, string> = {
    now: STORY_SO_FAR_ASK,
    before: 'Write the account now.',
    c: 'Write the account now, from the beginning of the story through to the last of the Messages.',
    d: D_ASK,
    e: E_ASK,
    f: `${E_ASK} Keep every item someone still holds and who gave it, every promise, and every secret, even if each gets only a few words.`,
};

export function armPrompt(input: WriterInput, arm: Arm, ranLong = false): PromptMessage[] {
    const messages = storySoFarPromptMessages({ ...input, corrections: null, ranLong });
    if (ranLong || arm === 'now') return messages;
    const user = messages[1].content;
    if (!user.endsWith(ARM_ASK.now)) throw new Error('The Story so far prompt no longer ends with its ask: the arms need mending.');
    return [messages[0], { ...messages[1], content: `${user.slice(0, -ARM_ASK.now.length)}${ARM_ASK[arm]}` }];
}

const pattern = (source: string): RegExp => new RegExp(source, 'i');

/** Every problem with the plan and the copies it names, before anything is sent. */
export function planProblems(plan: LongAccountPlan, chats: Map<number, ExportedChat>): string[] {
    const problems: string[] = [];
    if (!Array.isArray(plan.inputs) || plan.inputs.length === 0) return ['The plan names no inputs.'];
    const names = new Set<string>();
    for (const input of plan.inputs) {
        if (names.has(input.name)) problems.push(`Two inputs are named "${input.name}".`);
        names.add(input.name);
        const chat = chats.get(input.chat);
        if (!chat) problems.push(`${input.name}: no copy of Chat ${input.chat}. Export it first (scripts/export-chat.mjs).`);
        else if (input.through !== undefined && (!Number.isInteger(input.through) || input.through < 4 || input.through > chat.messages.length)) {
            problems.push(`${input.name}: "through" is ${input.through}, but Chat ${input.chat} has ${chat.messages.length} Messages.`);
        }
        if (!Array.isArray(input.quarters) || input.quarters.length !== 4) problems.push(`${input.name}: "quarters" needs four patterns.`);
        let startReads = true;
        for (const source of [input.start, ...(input.quarters ?? [])]) {
            try {
                if (typeof source !== 'string' || source.trim() === '') throw new Error('empty');
                // "\b" written once in JSON is a backspace, not a word boundary: round 1's plan had six, and they matched nothing.
                if (/[\u0000-\u001f]/.test(source)) throw new Error('control character');
                pattern(source);
            } catch {
                problems.push(`${input.name}: "${source}" is not a pattern.`);
                if (source === input.start) startReads = false;
            }
        }
        const examples = input.startExamples;
        if (!examples || !Array.isArray(examples.good) || !Array.isArray(examples.bad) || examples.good.length === 0 || examples.bad.length === 0) {
            problems.push(`${input.name}: "startExamples" needs at least one good and one bad opening, judged by hand.`);
        } else if (startReads) {
            for (const good of examples.good) if (!pattern(input.start).test(openingOf(good))) problems.push(`${input.name}: the start pattern misses a good opening: "${good.slice(0, 80)}"`);
            for (const bad of examples.bad) if (pattern(input.start).test(openingOf(bad))) problems.push(`${input.name}: the start pattern passes a bad opening: "${bad.slice(0, 80)}"`);
        }
        for (const keeper of input.keepers ?? []) problems.push(...keeperProblems(input.name, keeper));
    }
    return problems;
}

function readable(source: unknown): boolean {
    try {
        if (typeof source !== 'string' || source.trim() === '' || /[\u0000-\u001f]/.test(source)) return false;
        pattern(source);
        return true;
    } catch {
        return false;
    }
}

function keeperProblems(inputName: string, keeper: Keeper): string[] {
    const named = `${inputName}: keeper "${keeper.name}"`;
    if (!readable(keeper.pattern)) return [`${named}: "${keeper.pattern}" is not a pattern.`];
    if (!Array.isArray(keeper.kept) || !Array.isArray(keeper.dropped) || keeper.kept.length === 0 || keeper.dropped.length === 0) {
        return [`${named} needs at least one account that keeps it and one that drops it, judged by hand.`];
    }
    const test = pattern(keeper.pattern);
    return [
        ...keeper.kept.filter((account) => !test.test(account)).map((account) => `${named} misses an account that keeps it: "${account.slice(0, 80)}"`),
        ...keeper.dropped.filter((account) => test.test(account)).map((account) => `${named} passes an account that drops it: "${account.slice(0, 80)}"`),
    ];
}

function cut(chat: ExportedChat, input: LongInput): WriterInput {
    const whole = writerInputFrom(chat);
    return { ...whole, messages: whole.messages.slice(0, input.through ?? whole.messages.length) };
}

// ---------------------------------------------------------------------------------------------
// The checks: all by code.

/** The first two sentences of an account. */
export function openingOf(account: string): string {
    return account
        .trim()
        .split(/(?<=[.!?…]["”’]?)\s+/)
        .slice(0, 2)
        .join(' ');
}

/** "I" and the other first-person words, outside quotation marks: the account is told in the third person. */
export function firstPersonWords(account: string): number {
    const unquoted = account.replace(/"[^"]*"/g, ' ').replace(/“[^”]*”/g, ' ');
    return (unquoted.match(/\bI\b/g)?.length ?? 0) + (unquoted.match(/\b(me|my|mine|myself|we|us|our|ours|ourselves)\b/gi)?.length ?? 0);
}

export interface LongAccountSample {
    input: string;
    arm: Arm;
    /** The account as the app would store it, whole, so a check can be scored again for free; null when it would not be stored. */
    text: string | null;
    error: string | null;
    secondTry: boolean;
    words: number;
    opensAtStart: boolean;
    /** Whether each quarter's telltale is in the account. */
    quarters: boolean[];
    /** Whether each of the input's keepers is in the account; missing in reports made before keepers. */
    keepers?: boolean[];
    firstPerson: number;
}

export interface LongAccountReport {
    startedAt: string;
    commit: string;
    dirty: boolean;
    samples: number;
    arms: Arm[];
    capUsd: number;
    totalUsd: number;
    stoppedAtCap: boolean;
    /** Each input's size: Messages told and the writer prompt's estimated tokens. */
    inputs: { name: string; messages: number; tokens: number }[];
    results: LongAccountSample[];
}

export function checkAccount(input: LongInput, account: string): Pick<LongAccountSample, 'words' | 'opensAtStart' | 'quarters' | 'keepers' | 'firstPerson'> {
    return {
        words: wordCount(account),
        opensAtStart: pattern(input.start).test(openingOf(account)),
        quarters: input.quarters.map((source) => pattern(source).test(account)),
        keepers: (input.keepers ?? []).map((keeper) => pattern(keeper.pattern).test(account)),
        firstPerson: firstPersonWords(account),
    };
}

const promptTokens = (messages: PromptMessage[]): number => Math.round(worstCaseUsd({ input: 1_000_000, output: 0 }, messages, 0));

export async function runLongAccount(options: {
    plan: LongAccountPlan;
    chats: Map<number, ExportedChat>;
    arms: Arm[];
    samples: number;
    client: OpenRouterClient;
    git: { commit: string; dirty: boolean };
    capUsd?: number;
}): Promise<LongAccountReport> {
    const problems = planProblems(options.plan, options.chats);
    if (problems.length > 0) throw new EvalRunRefused(problems.join('\n'));
    const report: LongAccountReport = {
        startedAt: new Date().toISOString(),
        commit: options.git.commit,
        dirty: options.git.dirty,
        samples: options.samples,
        arms: options.arms,
        capUsd: options.capUsd ?? EVAL_CAP_USD,
        totalUsd: 0,
        stoppedAtCap: false,
        inputs: [],
        results: [],
    };
    const chat = async (messages: PromptMessage[]) => {
        if (report.stoppedAtCap || report.totalUsd + worstCaseUsd(BACKGROUND_PRICE_USD_PER_MILLION, messages, STORY_SO_FAR_MAX_TOKENS) > report.capUsd) {
            report.stoppedAtCap = true;
            return null;
        }
        try {
            // Sent as the app sends it: the Story so far writer's own cap and sampler values.
            const result = await options.client.chat({ model: BACKGROUND, messages, maxTokens: STORY_SO_FAR_MAX_TOKENS, samplers: backgroundSamplers('story_summary') });
            report.totalUsd = Math.round((report.totalUsd + result.costUsd) * 1e9) / 1e9;
            return { text: result.text, completionTokens: result.completionTokens, error: null as string | null };
        } catch (error) {
            return { text: '', completionTokens: 0, error: (error as Error).message };
        }
    };
    for (const input of options.plan.inputs) {
        const writer = cut(options.chats.get(input.chat)!, input);
        const speakers = [...new Set(writer.messages.map((message) => message.speaker))];
        report.inputs.push({ name: input.name, messages: writer.messages.length, tokens: promptTokens(armPrompt(writer, 'now')) });
        for (const arm of options.arms) {
            for (let time = 0; time < options.samples; time++) {
                const write = async (ranLong: boolean) => {
                    const answer = await chat(armPrompt(writer, arm, ranLong));
                    if (!answer) return null;
                    const parsed = answer.error ? null : parseStorySoFar(answer.text);
                    return { parsed, refused: answer.error ?? (parsed === null ? 'The Story so far writer wrote nothing.' : storySoFarRejection(parsed, answer.completionTokens, speakers)) };
                };
                let written = await write(false);
                if (!written) return report;
                // As the app does: an answer cut off at the cap is asked for once more, shorter.
                const secondTry = written.refused === STORY_SO_FAR_CUT_OFF;
                if (secondTry) {
                    written = await write(true);
                    if (!written) return report;
                }
                const account = written.refused ? null : written.parsed;
                report.results.push({
                    input: input.name,
                    arm,
                    text: account,
                    error: written.refused,
                    secondTry,
                    ...(account === null
                        ? { words: 0, opensAtStart: false, quarters: [false, false, false, false], keepers: (input.keepers ?? []).map(() => false), firstPerson: 0 }
                        : checkAccount(input, account)),
                });
            }
        }
    }
    return report;
}

// ---------------------------------------------------------------------------------------------
// The scorecard.

const of = (part: number, whole: number): string => `${part} of ${whole}`;

/** The average share of keepers kept by the stored accounts, or "-" when none had keepers to keep. */
function keptShare(stored: LongAccountSample[]): string {
    const scored = stored.filter((sample) => (sample.keepers ?? []).length > 0);
    if (scored.length === 0) return '-';
    const share = scored.reduce((sum, sample) => sum + sample.keepers!.filter(Boolean).length / sample.keepers!.length, 0) / scored.length;
    return `${Math.round(share * 100)}%`;
}

export function formatLongAccountScorecard(report: LongAccountReport): string {
    const lines = [
        `# Long-input account eval, ${report.startedAt}`,
        '',
        `Commit ${report.commit}${report.dirty ? ' (with uncommitted changes)' : ''}. Arms: ${report.arms.join(', ')}. ${report.samples} samples each.`,
        `Total $${report.totalUsd.toFixed(5)} of a $${report.capUsd.toFixed(2)} cap${report.stoppedAtCap ? ' (stopped at the cap: the scorecard is not complete)' : ''}.`,
        '',
        '| Input | Messages | Tokens | Arm | Stored | Opens at the start | Quarters told (avg of 4) | First person | Words (avg) | Second tries | Keepers kept (avg) |',
        '|---|---|---|---|---|---|---|---|---|---|---|',
    ];
    for (const input of report.inputs) {
        for (const arm of report.arms) {
            const samples = report.results.filter((sample) => sample.input === input.name && sample.arm === arm);
            if (samples.length === 0) continue;
            const stored = samples.filter((sample) => sample.text !== null);
            const avg = (value: (sample: LongAccountSample) => number) => (stored.length === 0 ? '-' : (stored.reduce((sum, sample) => sum + value(sample), 0) / stored.length).toFixed(1));
            lines.push(
                `| ${input.name} | ${input.messages} | ${input.tokens} | ${arm} | ${of(stored.length, samples.length)} | ${of(stored.filter((sample) => sample.opensAtStart).length, stored.length)} | ${avg((sample) => sample.quarters.filter(Boolean).length)} | ${of(stored.filter((sample) => sample.firstPerson > 0).length, stored.length)} | ${avg((sample) => sample.words)} | ${samples.filter((sample) => sample.secondTry).length} | ${keptShare(stored)} |`,
            );
        }
    }
    lines.push('', '## By arm', '', '| Arm | Stored | Opens at the start | Keepers kept (avg) | First person | Second tries | Not stored |', '|---|---|---|---|---|---|---|');
    for (const arm of report.arms) {
        const samples = report.results.filter((sample) => sample.arm === arm);
        if (samples.length === 0) continue;
        const stored = samples.filter((sample) => sample.text !== null);
        lines.push(
            `| ${arm} | ${of(stored.length, samples.length)} | ${of(stored.filter((sample) => sample.opensAtStart).length, stored.length)} | ${keptShare(stored)} | ${of(stored.filter((sample) => sample.firstPerson > 0).length, stored.length)} | ${samples.filter((sample) => sample.secondTry).length} | ${samples.length - stored.length} |`,
        );
    }
    const refused = report.results.filter((sample) => sample.text === null);
    if (refused.length > 0) lines.push('', 'Not stored:', ...refused.map((sample) => `- ${sample.input}, ${sample.arm}: ${sample.error}`));
    return lines.join('\n');
}

// ---------------------------------------------------------------------------------------------
// The gate.

export function readInputs(dir: string): { plan: LongAccountPlan; chats: Map<number, ExportedChat> } {
    const planFile = path.join(dir, PLAN_FILE);
    if (!existsSync(planFile)) throw new EvalRunRefused(`No plan at ${planFile}: write the inputs and their telltales there first.`);
    const plan = JSON.parse(readFileSync(planFile, 'utf8')) as LongAccountPlan;
    const chats = new Map<number, ExportedChat>();
    for (const id of new Set((plan.inputs ?? []).map((input) => input.chat))) {
        const file = path.join(dir, `chat-${id}.json`);
        if (existsSync(file)) chats.set(id, JSON.parse(readFileSync(file, 'utf8')) as ExportedChat);
    }
    const problems = planProblems(plan, chats);
    if (problems.length > 0) throw new EvalRunRefused(problems.join('\n'));
    return { plan, chats };
}

/** What a run would send and cost, from the prompts alone: no key and no network. */
export function longAccountCost(plan: LongAccountPlan, chats: Map<number, ExportedChat>, arms: Arm[], samples: number): string {
    let calls = 0;
    let about = 0;
    let most = 0;
    for (const input of plan.inputs) {
        const writer = cut(chats.get(input.chat)!, input);
        for (const arm of arms) {
            const messages = armPrompt(writer, arm);
            calls += samples;
            // About the 500 words asked for; the worst case runs every call to the cap.
            about += samples * worstCaseUsd(EXPECTED.backgroundPriceUsdPerMillion, messages, 700);
            most += samples * worstCaseUsd(BACKGROUND_PRICE_USD_PER_MILLION, messages, STORY_SO_FAR_MAX_TOKENS);
        }
    }
    const capped = most > EVAL_CAP_USD ? ` The $${EVAL_CAP_USD.toFixed(2)} cap stops it short if every call runs to its limit.` : '';
    return `${plan.inputs.length} inputs, arms ${arms.join(', ')}, ${samples} samples: ${calls} calls (more if a first answer is cut off), about $${about.toFixed(3)}, at most $${most.toFixed(3)}.${capped}`;
}

/** The arms named after "account-long"; "now" alone when none is. */
export function armsAsked(named: string[]): Arm[] {
    const rest = named.filter((name) => name !== 'account-long');
    const unknown = rest.find((name) => !ARMS.includes(name as Arm));
    if (unknown) throw new EvalRunRefused(`Unknown arm "${unknown}". Name any of ${ARMS.join(', ')}.`);
    return rest.length === 0 ? ['now'] : ARMS.filter((arm) => rest.includes(arm));
}

/**
 * A saved report with every stored account checked again by the plan's patterns as they are now:
 * nothing is sent. An input the plan no longer names keeps its old scores.
 */
export function rescoreLongAccount(report: LongAccountReport, plan: LongAccountPlan): LongAccountReport {
    return {
        ...report,
        results: report.results.map((sample) => {
            const input = plan.inputs.find((one) => one.name === sample.input);
            return input && sample.text !== null ? { ...sample, ...checkAccount(input, sample.text) } : sample;
        }),
    };
}

function newestLongAccountReport(dir: string): string | undefined {
    if (!existsSync(dir)) return undefined;
    const newest = readdirSync(dir)
        .filter((file) => /^long-account-.*Z\.json$/.test(file))
        .sort()
        .at(-1);
    return newest ? path.join(dir, newest) : undefined;
}

/**
 * The gate: no spend flag, no call; the refusal says what the run would send and cost. `env`
 * carries EVAL_SPEND ("yes"), EVAL_SCENES ("account-long" and the arms), EVAL_SAMPLES and
 * OPENROUTER_API_KEY.
 */
export async function startLongAccountEval(
    env: Record<string, string | undefined>,
    deps: { fetch: FetchLike; reportDir: string; inputDir?: string; log(line: string): void; git?: () => { commit: string; dirty: boolean } },
): Promise<{ report: LongAccountReport; json: string; scorecard: string }> {
    const named = (env.EVAL_SCENES ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    const arms = armsAsked(named);
    const samples = env.EVAL_SAMPLES ? Number(env.EVAL_SAMPLES) : LONG_ACCOUNT_SAMPLES;
    if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new EvalRunRefused('Samples is a whole number from 1 to 10.');
    const { plan, chats } = readInputs(deps.inputDir ?? DEFAULT_INPUT_DIR);
    if (env.EVAL_RESCORE) {
        // Free: the saved accounts scored again by the plan as it is now.
        const file = env.EVAL_RESCORE === 'last' ? newestLongAccountReport(deps.reportDir) : env.EVAL_RESCORE;
        if (!file || !existsSync(file)) throw new EvalRunRefused(`No long-account report at ${file ?? deps.reportDir}.`);
        const report = rescoreLongAccount(JSON.parse(readFileSync(file, 'utf8')) as LongAccountReport, plan);
        const json = file.replace(/\.json$/, '-rescored.json');
        const scorecard = file.replace(/\.json$/, '-rescored.md');
        writeFileSync(json, `${JSON.stringify(report, null, 4)}\n`);
        writeFileSync(scorecard, `${formatLongAccountScorecard(report)}\n`);
        deps.log(formatLongAccountScorecard(report));
        deps.log(`Scored again, nothing sent: ${json}`);
        return { report, json, scorecard };
    }
    const cost = longAccountCost(plan, chats, arms, samples);
    if (env.EVAL_SPEND !== 'yes') throw new EvalRunRefused(`The long-input account eval spends OpenRouter credit. Start it with --memory account-long --spend. ${cost}`);
    if (!env.OPENROUTER_API_KEY) throw new EvalRunRefused('OPENROUTER_API_KEY is not set: the run reads it from the root .env.');
    deps.log(`Long-input account eval: ${cost}`);
    const report = await runLongAccount({ plan, chats, arms, samples, client: new OpenRouterClient(env.OPENROUTER_API_KEY, deps.fetch), git: (deps.git ?? gitState)() });
    mkdirSync(deps.reportDir, { recursive: true });
    const stem = `long-account-${report.startedAt.replace(/[:.]/g, '-')}`;
    const json = path.join(deps.reportDir, `${stem}.json`);
    const scorecard = path.join(deps.reportDir, `${stem}.md`);
    writeFileSync(json, `${JSON.stringify(report, null, 4)}\n`);
    writeFileSync(scorecard, `${formatLongAccountScorecard(report)}\n`);
    deps.log(formatLongAccountScorecard(report));
    deps.log(`Full report (the accounts whole, never the Messages): ${json}`);
    return { report, json, scorecard };
}

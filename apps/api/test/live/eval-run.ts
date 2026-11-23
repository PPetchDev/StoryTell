import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { buildJudgePrompt, parseJudgement } from '../../src/manager/chat/judge/judge-prompt.js';
import { buildExtractionPrompt, parseExtraction } from '../../src/manager/chat/memory/memory-prompt.js';
import { estimateTokens } from '../../src/manager/chat/turn/prompt-tokens.js';
import { buildTurnPrompt } from '../../src/manager/chat/turn/prompt.js';
import { parseReply, ParsedReply } from '../../src/manager/chat/turn/reply-parser.js';
import { BACKGROUND_MODEL, PLAY_MODEL_CATALOGUE, PLAY_MODELS, PlayModel, PromptMessage, SamplerValues } from '../../src/service/model-gateway/model-gateway.js';
import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import { backgroundSamplers, TEXT_MODELS } from '../../src/service/model-gateway/real/model-table.js';
import { OpenRouterClient } from '../../src/service/model-gateway/real/openrouter-client.js';
import { Check, CheckContext, GradedCheck } from './eval-checks.js';
import { proseOf, SceneProse } from './eval-prose.js';
import { ChatScene, EVAL_SCENES, EvalScene, TurnScene } from './eval-scenes.js';
import { REPO_ROOT } from './smoke-run.js';

/**
 * The prompt eval run (.scratch/prompt-evals/spec.md): plays each eval scene through the app's
 * real prompt for its kind (the turn, the Judge, Memory extraction) and a real model, checks every
 * answer, and writes a scorecard. It spends real credit, so only the user starts it, through
 * eval.live.ts. Everything here takes its OpenRouter client from the caller, so the unit tests
 * drive it with a scripted `fetch`.
 */

/** Under `.data/`, which git ignores, so no played text enters the repository. */
export const DEFAULT_EVAL_DIR = path.join(REPO_ROOT, '.data', 'eval-runs');
/** The run stops before any call that could take its running total past this. */
export const EVAL_CAP_USD = 0.5;
/** A model never writes the same reply twice, so each scene is played this many times. */
export const EVAL_SAMPLES = 5;
/** How many calls are in flight at once, unless told otherwise. */
export const EVAL_PARALLEL = 4;
/** The background model: the app's Judge and Memory extraction run on it, and so does the grader, which never reads its own play. */
export const BACKGROUND = TEXT_MODELS[BACKGROUND_MODEL];
/** Above the background model's list price on purpose: it only sizes the worst case against the cap. */
export const BACKGROUND_PRICE_USD_PER_MILLION = { input: 0.5, output: 2 };
export const GRADER_MAX_TOKENS = 400;
/**
 * What a call is expected to cost, for the figure given before spending: from the first real run
 * (2026-11-22), where a play call wrote 309 tokens of the 900 it could, and the background model
 * billed about $0.1 a million tokens read and $0.2 a million written, writing a ninth of its cap.
 * No cache discount is taken, though that run had one, so the figure errs high.
 */
export const EXPECTED = {
    playWrites: 1 / 3,
    backgroundWrites: 1 / 4,
    backgroundPriceUsdPerMillion: { input: 0.1, output: 0.2 },
};
/**
 * A change is marked only when chance alone would move a check that far less often than this
 * (Fisher's exact test on the two runs' passes, one-sided): about one time in seven.
 */
const CHANCE_BAR = 0.15;

export class EvalRunRefused extends Error {}
/** Thrown inside the run to stop it before a call that could pass the cap. */
class CapReached extends Error {}

export type Outcome = 'pass' | 'fail' | 'not_graded';

export interface EvalResult {
    check: string;
    kind: 'code' | 'graded';
    outcome: Outcome;
    /** A code check's reason; a graded check's quoted words. */
    reason: string;
}

export interface EvalSample {
    /** What the model wrote; null when the call failed. For a played Chat, the whole of it: each turn and its reply. */
    text: string | null;
    /** A played Chat's replies, in turn order. */
    replies?: string[];
    /** The typed error's message when the call failed. */
    error: string | null;
    results: EvalResult[];
}

export interface EvalCall {
    scene: string;
    /** `play`: the play model on a turn. `background`: the Judge or Memory extraction. `grader`: a graded check. */
    role: 'play' | 'background' | 'grader';
    model: string;
    finishReason: string | null;
    promptTokens: number;
    completionTokens: number;
    /** Of the prompt tokens, those the host read from its cache; null when it reported nothing about its cache. */
    cachedTokens: number | null;
    costUsd: number;
    error: string | null;
}

export interface EvalReport {
    startedAt: string;
    /** The commit the prompt was read from, and whether the working tree had changes on top. */
    commit: string;
    dirty: boolean;
    model: PlayModel;
    samples: number;
    capUsd: number;
    totalUsd: number;
    /** True when the run stopped short because the next call could have passed the cap. */
    stoppedAtCap: boolean;
    /** `names`: a turn scene's own people, whose names are no fault in its prose; reports from before the prose table have none. */
    scenes: { name: string; about: string; kind: EvalScene['kind']; names?: string[]; samples: EvalSample[] }[];
    calls: EvalCall[];
}

/** One line of the scorecard: a check's passes out of the samples that could be scored. */
export interface Score {
    scene: string;
    check: string;
    kind: 'code' | 'graded';
    pass: number;
    scored: number;
    /** Samples whose call failed or whose answer could not be read. */
    notScored: number;
}

export type Change = 'better' | 'worse' | 'slipped' | 'unchanged' | 'new';

type Price = { input: number; output: number };
type ModelRequest = { messages: PromptMessage[]; maxTokens: number; stop?: string[]; json?: boolean; samplers?: SamplerValues };

function promptTokens(messages: PromptMessage[]): number {
    return messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
}

export function worstCaseUsd(price: Price, messages: PromptMessage[], maxTokens: number): number {
    return (promptTokens(messages) * price.input + maxTokens * price.output) / 1_000_000;
}

/** A Character's speech lines in a reply, as the app's reply parser reads them. */
function speechLines(parsed: ParsedReply, name: string): string[] {
    return parsed.parts.flatMap((part) => (part.kind === 'speech' && part.speakerName === name ? [part.text] : []));
}

/**
 * What the grader is asked: the turn, the reply and the criteria, answered as JSON. A criterion
 * about one Character's speech is shown that Character's speech lines apart, and told to read only those.
 */
export function buildGraderPrompt(scene: Pick<TurnScene, 'input' | 'userText' | 'graded'>, reply: string, checks: GradedCheck[] = scene.graded, parsed?: ParsedReply): PromptMessage[] {
    const speakers = parsed ? [...new Set(checks.flatMap((check) => (check.speechOf ? [check.speechOf] : [])))] : [];
    const speech = speakers
        .map(
            (name) =>
                `${name}’s speech lines, the only words that count for a criterion about what ${name} says:\n${speechLines(parsed!, name)
                    .map((line) => `- ${line}`)
                    .join('\n')}\n\n`,
        )
        .join('');
    const criteria = checks
        .map((check, index) => {
            const only = check.speechOf && parsed ? ` Judge this one only on ${check.speechOf}’s speech lines, listed above, and quote from them: words quoted in the narration do not count.` : '';
            return `${index + 1}. "${check.name}": ${check.criterion}${only}`;
        })
        .join('\n');
    return [
        {
            role: 'system',
            content:
                'You check one reply from a piece of interactive fiction against written criteria. Judge only what is written in the reply. ' +
                // The words first, then the verdict, and what each verdict means: asked for the verdict first, the grader
                // now and then quoted the very sentence that broke a criterion and answered true (the grader check, 2026-11-23).
                'Answer with JSON only: {"checks":[{"name":"<the criterion\'s name>","quote":"<the words of the reply you judged on, at most 25 words>","pass":true or false}]}, one entry per criterion, in order. ' +
                'For each, first find the words that decide it, then give the verdict: "pass" is true only when the reply meets the criterion, and false when the words you quoted break it.',
        },
        {
            role: 'user',
            content: `The user plays ${scene.input.identity.name}. The user wrote:\n${scene.userText}\n\nThe reply:\n${reply}\n\n${speech}Criteria:\n${criteria}`,
        },
    ];
}

/** The grader's verdicts by check name; a check it did not answer readably is left out. */
export function parseGrades(text: string, checks: GradedCheck[]): Map<string, { pass: boolean; quote: string }> {
    const grades = new Map<string, { pass: boolean; quote: string }>();
    const body = /\{[\s\S]*\}/.exec(text)?.[0];
    if (!body) return grades;
    let parsed: unknown;
    try {
        parsed = JSON.parse(body);
    } catch {
        return grades;
    }
    const entries = (parsed as { checks?: unknown }).checks;
    if (!Array.isArray(entries)) return grades;
    for (const [index, entry] of entries.entries()) {
        const { name, pass, quote } = (entry ?? {}) as { name?: unknown; pass?: unknown; quote?: unknown };
        if (typeof pass !== 'boolean') continue;
        // By name where the grader kept it, else by position.
        const check = checks.find((one) => one.name === name) ?? checks[index];
        if (check && !grades.has(check.name)) grades.set(check.name, { pass, quote: typeof quote === 'string' ? quote : '' });
    }
    return grades;
}

/** What one answer of a scene comes to before any grader is asked. */
interface Checked {
    /** The code checks' results. */
    results: EvalResult[];
    /** The graded checks the grader is asked, and what it is sent. */
    ask: { checks: GradedCheck[]; messages: PromptMessage[] } | null;
    /** Graded checks with nothing to judge, by name, with why. */
    skipped: Map<string, string>;
}

/** A scene as the run plays it: what is sent, to which model, and how an answer is checked. */
interface Prepared {
    on: 'play' | 'background';
    request: ModelRequest;
    graded: GradedCheck[];
    check(text: string): Checked;
}

const codeResult = (check: string, pass: boolean, reason: string): EvalResult => ({ check, kind: 'code', outcome: pass ? 'pass' : 'fail', reason });

/** A scene of the background model: built by the app's builder, read by the app's parser, checked on what the parser gave. */
function background<T>(request: ModelRequest, readable: string, parse: (text: string) => T, checks: Check<T>[]): Prepared {
    return {
        on: 'background',
        request,
        graded: [],
        check: (text) => {
            let read: T;
            try {
                read = parse(text);
            } catch (error) {
                // One check carries the failure; the rest have nothing to read, which is neither a pass nor a fail.
                return {
                    results: [
                        codeResult(readable, false, (error as Error).message),
                        ...checks.map((check): EvalResult => ({ check: check.name, kind: 'code', outcome: 'not_graded', reason: 'the answer could not be read' })),
                    ],
                    ask: null,
                    skipped: new Map(),
                };
            }
            return {
                results: [
                    codeResult(readable, true, 'read'),
                    ...checks.map((check) => {
                        const verdict = check.run(read);
                        return codeResult(check.name, verdict.pass, verdict.reason);
                    }),
                ],
                ask: null,
                skipped: new Map(),
            };
        },
    };
}

/** One turn of a played Chat after `history`: sent as a turn is; its checks are the whole Chat's, made once every turn is played. */
function chatTurn(scene: ChatScene, history: TurnScene['input']['history'], userText: string): Prepared {
    const prompt = buildTurnPrompt({ ...scene.input, history, userText });
    return {
        on: 'play',
        request: { messages: prompt.messages, maxTokens: prompt.maxTokens, stop: prompt.stop },
        graded: scene.graded,
        check: () => ({ results: [], ask: null, skipped: new Map() }),
    };
}

/** A reply of about `tokens` tokens, to size a later turn's prompt before anything is played (about five characters a word). */
const fillerReply = (tokens: number): string => 'word '.repeat(Math.round(tokens * 0.8)).trim();

/** Every turn's request of a played Chat, with earlier replies taken at `replyShare` of what a reply may run to. */
function chatRequests(scene: ChatScene, replyShare: number): ModelRequest[] {
    const history = [...scene.input.history];
    return scene.turns.map((userText) => {
        const { request } = chatTurn(scene, [...history], userText);
        history.push({ role: 'user', text: userText }, { role: 'assistant', text: fillerReply(request.maxTokens * replyShare) });
        return request;
    });
}

/** How many times a scene is played in a run of `samples`. */
const samplesOf = (scene: EvalScene, samples: number): number => (scene.kind === 'chat' ? Math.min(samples, scene.mostSamples) : samples);

/** The prompt a scene is played with, by the app's own builder for its kind, sent as the app sends it. */
function prepare(scene: EvalScene): Prepared {
    if (scene.kind === 'judge') {
        const prompt = buildJudgePrompt(scene.input);
        return background({ ...prompt, json: true, samplers: backgroundSamplers('judge') }, 'reads as a judgement', parseJudgement, scene.checks);
    }
    if (scene.kind === 'memory') {
        return background({ ...buildExtractionPrompt(scene.input), json: true }, 'reads as an extraction', parseExtraction, scene.checks);
    }
    // A played Chat is prepared as its first turn: what its prompt must hold is read there; the run plays it turn by turn.
    if (scene.kind === 'chat') return chatTurn(scene, scene.input.history, scene.turns[0]);
    const prompt = buildTurnPrompt({ ...scene.input, userText: scene.userText });
    const cast = scene.input.story.characters.map((character, index) => ({ id: index + 1, name: character.name }));
    const identityName = scene.input.identity.name;
    return {
        on: 'play',
        request: { messages: prompt.messages, maxTokens: prompt.maxTokens, stop: prompt.stop },
        graded: scene.graded,
        check: (text) => {
            const parsed = parseReply(text, cast, identityName);
            const results = scene.checks.map((check) => {
                const verdict = check.run({ text, parsed, identityName });
                return codeResult(check.name, verdict.pass, verdict.reason);
            });
            const skipped = new Map<string, string>();
            for (const check of scene.graded) {
                if (check.speechOf && speechLines(parsed, check.speechOf).length === 0) skipped.set(check.name, `${check.speechOf} has no speech line to judge`);
            }
            const asked = scene.graded.filter((check) => !skipped.has(check.name));
            return { results, skipped, ask: asked.length > 0 ? { checks: asked, messages: buildGraderPrompt(scene, text, asked, parsed) } : null };
        },
    };
}

/**
 * What is wrong with scenes whose built prompt has lost the words they name: such a scene would
 * still be played and paid for, and would pass or fail for a reason that is not its own.
 */
export function scenePromptProblems(scenes: EvalScene[]): string[] {
    return scenes.flatMap((scene) => {
        const prompt = prepare(scene)
            .request.messages.map((message) => message.content)
            .join('\n');
        return scene.expects.filter((words) => !prompt.includes(words)).map((words) => `Scene "${scene.name}" no longer tests what it claims: its prompt does not hold "${words}".`);
    });
}

/**
 * What a run would send and cost, from the prompts alone: no key and no network. `expectedUsd`
 * is what the first real run's calls came to (`EXPECTED`); `worstUsd` is every call at its cap, as
 * the cap counts them.
 */
export function estimateEval(scenes: EvalScene[], model: PlayModel, samples: number): { calls: number; expectedUsd: number; worstUsd: number } {
    const estimate = { calls: 0, expectedUsd: 0, worstUsd: 0 };
    const playPrice = PLAY_MODEL_CATALOGUE[model].priceUsdPerMillion;
    const add = (on: 'play' | 'background', messages: PromptMessage[], maxTokens: number, times = samples, expectedFrom: PromptMessage[] = messages) => {
        estimate.calls += times;
        estimate.expectedUsd +=
            times *
            (on === 'play'
                ? worstCaseUsd(playPrice, expectedFrom, maxTokens * EXPECTED.playWrites)
                : worstCaseUsd(EXPECTED.backgroundPriceUsdPerMillion, expectedFrom, maxTokens * EXPECTED.backgroundWrites));
        estimate.worstUsd += times * worstCaseUsd(on === 'play' ? playPrice : BACKGROUND_PRICE_USD_PER_MILLION, messages, maxTokens);
    };
    for (const scene of scenes) {
        if (scene.kind === 'chat') {
            // Each turn's prompt holds the replies before it: at their expected length for the expected figure, at their cap for the worst.
            const times = samplesOf(scene, samples);
            const expected = chatRequests(scene, EXPECTED.playWrites);
            chatRequests(scene, 1).forEach((request, turn) => add('play', request.messages, request.maxTokens, times, expected[turn].messages));
            if (scene.graded.length > 0) {
                const last = expected.at(-1)!;
                add('background', buildGraderPrompt({ ...scene, userText: scene.turns.at(-1)! }, fillerReply(last.maxTokens * EXPECTED.playWrites)), GRADER_MAX_TOKENS, times);
            }
            continue;
        }
        const prepared = prepare(scene);
        add(prepared.on, prepared.request.messages, prepared.request.maxTokens);
        if (scene.kind === 'turn' && scene.graded.length > 0) {
            // The grader reads the reply, taken at the length a play call is expected to write (about five characters a word).
            const reply = 'word '.repeat(Math.round(prepared.request.maxTokens * EXPECTED.playWrites * 0.8));
            add('background', buildGraderPrompt(scene, reply), GRADER_MAX_TOKENS);
        }
    }
    return estimate;
}

/** Runs the jobs, at most `limit` at once, each started in order. */
async function inParallel(limit: number, jobs: (() => Promise<void>)[]): Promise<void> {
    let next = 0;
    const worker = async () => {
        while (next < jobs.length) await jobs[next++]();
    };
    await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, jobs.length)) }, worker));
}

export async function runEval(options: {
    scenes: EvalScene[];
    model: PlayModel;
    client: OpenRouterClient;
    samples?: number;
    capUsd?: number;
    /** How many calls may be in flight at once; one at a time unless given. */
    concurrency?: number;
    /** What the same command already spent on another model: it counts toward the cap, not this report's total. */
    spentUsd?: number;
    git?: { commit: string; dirty: boolean };
}): Promise<EvalReport> {
    const problems = scenePromptProblems(options.scenes);
    if (problems.length > 0) throw new EvalRunRefused(problems.join('\n'));
    const report: EvalReport = {
        startedAt: new Date().toISOString(),
        commit: options.git?.commit ?? 'unknown',
        dirty: options.git?.dirty ?? false,
        model: options.model,
        samples: options.samples ?? EVAL_SAMPLES,
        capUsd: options.capUsd ?? EVAL_CAP_USD,
        totalUsd: 0,
        stoppedAtCap: false,
        scenes: [],
        calls: [],
    };
    const playPrice = PLAY_MODEL_CATALOGUE[options.model].priceUsdPerMillion;
    const spentBefore = options.spentUsd ?? 0;
    /** The worst case of the calls now in flight: they have not billed yet, and could each cost this. */
    let inFlightUsd = 0;

    const send = async (scene: string, role: EvalCall['role'], request: ModelRequest): Promise<{ text: string | null; error: string | null }> => {
        const worst = worstCaseUsd(role === 'play' ? playPrice : BACKGROUND_PRICE_USD_PER_MILLION, request.messages, request.maxTokens);
        // Once one call would not fit, the run is over: nothing later is sent, so a parallel run stops as a sequential one does.
        if (report.stoppedAtCap || spentBefore + report.totalUsd + inFlightUsd + worst > report.capUsd) {
            report.stoppedAtCap = true;
            throw new CapReached();
        }
        const spec = role === 'play' ? TEXT_MODELS[options.model] : BACKGROUND;
        const call: EvalCall = { scene, role, model: spec.id, finishReason: null, promptTokens: 0, completionTokens: 0, cachedTokens: null, costUsd: 0, error: null };
        let text: string | null = null;
        inFlightUsd += worst;
        try {
            const result = await options.client.chat({ model: spec, ...request });
            text = result.text;
            Object.assign(call, {
                finishReason: result.finishReason ?? null,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                cachedTokens: result.cachedTokens ?? null,
                costUsd: result.costUsd,
            });
        } catch (error) {
            call.error = (error as Error).message;
        } finally {
            inFlightUsd -= worst;
        }
        report.totalUsd = Math.round((report.totalUsd + call.costUsd) * 1e9) / 1e9;
        report.calls.push(call);
        return { text, error: call.error };
    };

    /** One sample of a scene: the call, the code checks, then one grader call for its graded checks. */
    const playOnce = async (scene: EvalScene, prepared: Prepared, keep: (sample: EvalSample) => void): Promise<void> => {
        const answer = await send(scene.name, prepared.on === 'play' ? 'play' : 'background', prepared.request);
        if (answer.text === null) return keep({ text: null, error: answer.error, results: [] });
        const checked = prepared.check(answer.text);
        const sample: EvalSample = { text: answer.text, error: null, results: checked.results };
        keep(sample);
        await grade(scene.name, prepared.graded, checked, sample);
    };

    /** Asks the grader about one reply's graded checks, and adds their results to the sample. */
    const grade = async (name: string, checks: GradedCheck[], checked: Checked, sample: EvalSample): Promise<void> => {
        if (checks.length === 0) return;
        // One grader call covers all of this reply's graded checks that have something to judge.
        const graded = checked.ask ? await send(name, 'grader', { messages: checked.ask.messages, maxTokens: GRADER_MAX_TOKENS, json: true }) : null;
        const grades = graded?.text ? parseGrades(graded.text, checked.ask!.checks) : new Map<string, { pass: boolean; quote: string }>();
        for (const check of checks) {
            const grade = grades.get(check.name);
            const unread = checked.skipped.get(check.name) ?? (graded?.text === null ? 'the grader call failed' : 'the grader answer could not be read');
            sample.results.push(
                grade
                    ? { check: check.name, kind: 'graded', outcome: grade.pass ? 'pass' : 'fail', reason: grade.quote }
                    : { check: check.name, kind: 'graded', outcome: 'not_graded', reason: unread },
            );
        }
    };

    /** One sample of a played Chat: a call a turn, each with the replies so far as its history, then the checks over all of it. */
    const playChat = async (scene: ChatScene, keep: (sample: EvalSample) => void): Promise<void> => {
        const cast = scene.input.story.characters.map((character, index) => ({ id: index + 1, name: character.name }));
        const identityName = scene.input.identity.name;
        const history = [...scene.input.history];
        const replies: CheckContext[] = [];
        for (const userText of scene.turns) {
            const answer = await send(scene.name, 'play', chatTurn(scene, [...history], userText).request);
            // A Chat with a turn missing cannot be scored as a whole: it is a failed sample, and stops here.
            if (answer.text === null) return keep({ text: null, error: answer.error, results: [] });
            replies.push({ text: answer.text, parsed: parseReply(answer.text, cast, identityName), identityName });
            history.push({ role: 'user', text: userText }, { role: 'assistant', text: answer.text });
        }
        const sample: EvalSample = {
            text: scene.turns.map((userText, turn) => `> ${userText}\n\n${replies[turn].text}`).join('\n\n'),
            replies: replies.map((reply) => reply.text),
            error: null,
            results: scene.checks.map((check) => {
                const verdict = check.run({ replies });
                return codeResult(check.name, verdict.pass, verdict.reason);
            }),
        };
        keep(sample);
        // The graded checks read the reply to the last turn: what a long Chat has come to.
        const last = replies.at(-1)!;
        const skipped = new Map<string, string>();
        for (const check of scene.graded) {
            if (check.speechOf && speechLines(last.parsed, check.speechOf).length === 0) skipped.set(check.name, `${check.speechOf} has no speech line to judge`);
        }
        const asked = scene.graded.filter((check) => !skipped.has(check.name));
        const ask = asked.length > 0 ? { checks: asked, messages: buildGraderPrompt({ ...scene, userText: scene.turns.at(-1)! }, last.text, asked, last.parsed) } : null;
        await grade(scene.name, scene.graded, { results: [], ask, skipped }, sample);
    };

    const played = options.scenes.map((scene) => ({ scene, prepared: prepare(scene), samples: new Array<EvalSample | undefined>(samplesOf(scene, report.samples)).fill(undefined) }));
    const jobs = played.flatMap(({ scene, prepared, samples }) =>
        samples.map((_, index) => async () => {
            try {
                const keep = (sample: EvalSample) => (samples[index] = sample);
                await (scene.kind === 'chat' ? playChat(scene, keep) : playOnce(scene, prepared, keep));
            } catch (error) {
                if (!(error instanceof CapReached)) throw error;
            }
        }),
    );
    await inParallel(options.concurrency ?? 1, jobs);
    // Each scene's samples in the order they were started; a scene the cap left with none is left out.
    report.scenes = played
        .map(({ scene, samples }) => ({
            name: scene.name,
            about: scene.about,
            kind: scene.kind,
            ...(scene.kind === 'turn' || scene.kind === 'chat' ? { names: [...scene.input.story.characters.map((character) => character.name), scene.input.identity.name] } : {}),
            samples: samples.filter((sample): sample is EvalSample => sample !== undefined),
        }))
        .filter((scene) => scene.samples.length > 0);
    return report;
}

/** Every check's passes out of its scored samples, in scene order. */
export function scores(report: EvalReport): Score[] {
    const rows: Score[] = [];
    for (const scene of report.scenes) {
        const byCheck = new Map<string, Score>();
        for (const sample of scene.samples) {
            for (const result of sample.results) {
                const row = byCheck.get(result.check) ?? { scene: scene.name, check: result.check, kind: result.kind, pass: 0, scored: 0, notScored: 0 };
                byCheck.set(result.check, row);
                if (result.outcome === 'not_graded') row.notScored++;
                else {
                    row.scored++;
                    if (result.outcome === 'pass') row.pass++;
                }
            }
        }
        const failedCalls = scene.samples.filter((sample) => sample.text === null).length;
        for (const row of byCheck.values()) rows.push({ ...row, notScored: row.notScored + failedCalls });
    }
    return rows;
}

function choose(n: number, k: number): number {
    if (k < 0 || k > n) return 0;
    let result = 1;
    for (let i = 1; i <= k; i++) result = (result * (n - k + i)) / i;
    return result;
}

/**
 * How often chance alone, with nothing changed, would leave the lower run with this few passes or
 * fewer, given the passes of both runs together (Fisher's exact test, one-sided).
 */
function chanceOfSoFew(lower: Score, higher: Score): number {
    const passes = lower.pass + higher.pass;
    const samples = lower.scored + higher.scored;
    let ways = 0;
    for (let k = 0; k <= lower.pass; k++) ways += choose(passes, k) * choose(samples - passes, lower.scored - k);
    return ways / choose(samples, lower.scored);
}

/**
 * What moved since an earlier run. A handful of samples is thin, so a check is better or worse
 * only when chance alone would rarely move it that far (`CHANCE_BAR`); the rule holds for any number
 * of samples, and for runs of different sizes. A check that passed every sample before and fails
 * some now, within chance, is "slipped": worth another look with more samples, not yet a finding.
 */
export function compare(now: Score, then: Score | undefined): Change {
    if (!then || then.scored === 0 || now.scored === 0) return then ? 'unchanged' : 'new';
    const before = then.pass / then.scored;
    const after = now.pass / now.scored;
    if (after < before && chanceOfSoFew(now, then) < CHANCE_BAR) return 'worse';
    if (after > before && chanceOfSoFew(then, now) < CHANCE_BAR) return 'better';
    if (before === 1 && after < 1) return 'slipped';
    return 'unchanged';
}

/** What share of the prompt tokens the host read from its cache, over the calls that reported one; null when none did. */
function cacheLine(calls: EvalCall[]): string | null {
    const reported = calls.filter((call) => call.cachedTokens !== null && call.cachedTokens !== undefined);
    const sent = reported.reduce((sum, call) => sum + call.promptTokens, 0);
    if (sent === 0) return null;
    const cached = reported.reduce((sum, call) => sum + (call.cachedTokens ?? 0), 0);
    return `The host read ${cached.toLocaleString('en-US')} of ${sent.toLocaleString('en-US')} prompt tokens from its cache (${Math.round((cached / sent) * 100)}%).`;
}

/** How worn each turn scene's replies read, from the played text: so an earlier report, written before this was counted, is read the same way. */
export function prose(report: EvalReport): { scene: string; prose: SceneProse }[] {
    return report.scenes
        .filter((scene) => (scene.kind ?? 'turn') === 'turn' || scene.kind === 'chat')
        .map((scene) => ({ scene: scene.name, replies: scene.samples.flatMap((sample) => (sample.text === null ? [] : (sample.replies ?? [sample.text]))), names: scene.names ?? [] }))
        .filter((scene) => scene.replies.length > 0)
        .map((scene) => ({ scene: scene.scene, prose: proseOf(scene.replies, scene.names) }));
}

/** The prose table: a number to watch from run to run, never a pass or a fail. */
function proseLines(report: EvalReport, earlier?: EvalReport): string[] {
    const rows = prose(report);
    if (rows.length === 0) return [];
    const before = earlier ? prose(earlier) : [];
    return [
        '',
        '## Prose',
        '',
        'Overused words and phrases a thousand words, over all of a scene’s samples (sam-paech/slop-score’s lists), and phrases two or more samples share. Not a check: a number to compare between runs.',
        '',
        `| Scene | Words | Overused a thousand |${earlier ? ' Before |' : ''} Most found | Shared between samples |`,
        `|---|---|---|${earlier ? '---|' : ''}---|---|`,
        ...rows.map(({ scene, prose: now }) => {
            const then = before.find((one) => one.scene === scene)?.prose;
            const versus = earlier ? ` ${then ? then.slopPerThousand.toFixed(1) : '-'} |` : '';
            const found = now.hits.map((hit) => `${hit.phrase} (${hit.count})`).join(', ') || '-';
            const shared = now.shared.map((phrase) => `"${phrase}"`).join('; ') || '-';
            return `| ${scene} | ${now.words} | ${now.slopPerThousand.toFixed(1)} |${versus} ${found} | ${shared} |`;
        }),
    ];
}

/**
 * The checks of `report` that have passed every scored sample of every saved run, this one
 * included, with how many of those runs scored them. A check nobody has seen fail on a real reply
 * has not yet shown it can catch what it was written for (.scratch/prompt-evals/spec.md,
 * "What a clean sheet does not say").
 */
export function neverFailed(report: EvalReport, saved: EvalReport[]): { scene: string; check: string; runs: number }[] {
    const all = [report, ...saved.filter((one) => one.startedAt !== report.startedAt)].map((one) => scores(one));
    return scores(report).flatMap((row) => {
        const rows = all.flatMap((one) => one.filter((other) => other.scene === row.scene && other.check === row.check && other.scored > 0));
        return rows.length > 0 && rows.every((one) => one.pass === one.scored) ? [{ scene: row.scene, check: row.check, runs: rows.length }] : [];
    });
}

/** Every report saved in `dir`, whatever its model. */
export function savedReports(dir: string): EvalReport[] {
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
        .filter((file) => file.startsWith('eval-') && file.endsWith('.json'))
        .map((file) => JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as EvalReport);
}

const passed = (row: Score): string => `${row.pass} of ${row.scored}${row.notScored ? ` (${row.notScored} not scored)` : ''}`;

/** The scorecard: what the user reads. The played text stays in the JSON report. */
export function formatScorecard(report: EvalReport, earlier?: EvalReport, saved?: EvalReport[]): string {
    const before = earlier ? scores(earlier) : [];
    const rows = scores(report);
    const cache = cacheLine(report.calls);
    const lines = [
        `# Prompt eval run: ${PLAY_MODEL_CATALOGUE[report.model].name}`,
        '',
        `Commit ${report.commit}${report.dirty ? ' with uncommitted changes' : ''}, ${report.samples} samples a scene, ${report.startedAt}.`,
        report.scenes.some((scene) => scene.kind === 'judge' || scene.kind === 'memory') ? `Judge and Memory scenes are played on the background model (${BACKGROUND.id}), whatever the play model.` : '',
        earlier ? `Compared with the run of ${earlier.startedAt} (commit ${earlier.commit}${earlier.dirty ? ', with uncommitted changes' : ''}).` : '',
        '',
        `| Scene | Check | Kind | Passed |${earlier ? ' Before | Change |' : ''}`,
        `|---|---|---|---|${earlier ? '---|---|' : ''}`,
        ...rows.map((row) => {
            const then = before.find((one) => one.scene === row.scene && one.check === row.check);
            const versus = earlier ? ` ${then ? `${then.pass} of ${then.scored}` : '-'} | ${compare(row, then)} |` : '';
            return `| ${row.scene} | ${row.check} | ${row.kind} | ${passed(row)} |${versus}`;
        }),
        '',
        `Total $${report.totalUsd.toFixed(5)} of a $${report.capUsd.toFixed(2)} cap, in ${report.calls.length} calls${report.stoppedAtCap ? ' (stopped at the cap: the scorecard is not complete)' : ''}.`,
        ...(cache ? [cache] : []),
        ...proseLines(report, earlier),
    ];
    const failures = report.scenes.flatMap((scene) =>
        scene.samples.flatMap((sample, index) =>
            sample.text === null
                ? [`- ${scene.name}, sample ${index + 1}: the call failed: ${sample.error}`]
                : sample.results.filter((result) => result.outcome !== 'pass').map((result) => `- ${scene.name}, sample ${index + 1}, ${result.check}: ${result.outcome === 'fail' ? '' : 'not graded: '}${result.reason}`),
        ),
    );
    if (failures.length > 0) lines.push('', '## What did not pass', '', ...failures);
    const never = saved ? neverFailed(report, saved) : [];
    if (never.length > 0) {
        lines.push(
            '',
            '## Never failed yet',
            '',
            'These checks have passed every sample of every saved run, this one included. Nothing yet shows they catch what they were written for: a scene earns its place the first time it fails.',
            '',
            ...never.map((one) => `- ${one.scene}: ${one.check} (${one.runs} ${one.runs === 1 ? 'run' : 'runs'})`),
        );
    }
    return lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n');
}

/** One scorecard for the same scenes on several play models: a column a model. */
export function formatSideBySide(reports: EvalReport[]): string {
    const columns = reports.map((report) => scores(report));
    const rows: Score[] = [];
    for (const row of columns.flat()) {
        if (!rows.some((one) => one.scene === row.scene && one.check === row.check)) rows.push(row);
    }
    const first = reports[0];
    const total = reports.reduce((sum, report) => sum + report.totalUsd, 0);
    const calls = reports.reduce((sum, report) => sum + report.calls.length, 0);
    return [
        `# Prompt eval run: ${reports.map((report) => PLAY_MODEL_CATALOGUE[report.model].name).join(' beside ')}`,
        '',
        `Commit ${first.commit}${first.dirty ? ' with uncommitted changes' : ''}, ${first.samples} samples a scene, ${first.startedAt}.`,
        `Judge and Memory scenes never use the play model, so they are played once, under ${PLAY_MODEL_CATALOGUE[first.model].name}.`,
        '',
        `| Scene | Check | Kind | ${reports.map((report) => PLAY_MODEL_CATALOGUE[report.model].name).join(' | ')} |`,
        `|---|---|---|${reports.map(() => '---|').join('')}`,
        ...rows.map((row) => {
            const cells = columns.map((column) => {
                const own = column.find((one) => one.scene === row.scene && one.check === row.check);
                return own ? passed(own) : '-';
            });
            return `| ${row.scene} | ${row.check} | ${row.kind} | ${cells.join(' | ')} |`;
        }),
        '',
        `Total $${total.toFixed(5)} of a $${first.capUsd.toFixed(2)} cap, in ${calls} calls${reports.some((report) => report.stoppedAtCap) ? ' (stopped at the cap: the scorecard is not complete)' : ''}.`,
    ].join('\n');
}

function stem(report: EvalReport): string {
    return `eval-${report.startedAt.replace(/[:.]/g, '-')}-${report.model}`;
}

/** Writes the full report as JSON and the scorecard as Markdown in `dir`, and answers their paths. */
export function writeEvalReport(report: EvalReport, dir: string, earlier?: EvalReport, saved?: EvalReport[]): { json: string; scorecard: string } {
    mkdirSync(dir, { recursive: true });
    const json = path.join(dir, `${stem(report)}.json`);
    const scorecard = path.join(dir, `${stem(report)}.md`);
    writeFileSync(json, `${JSON.stringify(report, null, 4)}\n`);
    writeFileSync(scorecard, `${formatScorecard(report, earlier, saved)}\n`);
    return { json, scorecard };
}

/** The report to compare against: a named file, or with "last" the newest earlier one for the same model. */
export function earlierReport(against: string | undefined, dir: string, model: PlayModel): EvalReport | undefined {
    if (!against) return undefined;
    if (against !== 'last') {
        if (!existsSync(against)) throw new EvalRunRefused(`No report at ${against}.`);
        return JSON.parse(readFileSync(against, 'utf8')) as EvalReport;
    }
    if (!existsSync(dir)) return undefined;
    const newest = readdirSync(dir)
        .filter((file) => file.startsWith('eval-') && file.endsWith(`-${model}.json`))
        .sort()
        .at(-1);
    return newest ? (JSON.parse(readFileSync(path.join(dir, newest), 'utf8')) as EvalReport) : undefined;
}

/** The commit the prompt is read from, and whether the working tree has changes on top of it. */
export function gitState(): { commit: string; dirty: boolean } {
    try {
        const run = (args: string[]) => execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
        return { commit: run(['rev-parse', '--short', 'HEAD']), dirty: run(['status', '--porcelain', '--untracked-files=no']) !== '' };
    } catch {
        return { commit: 'unknown', dirty: false };
    }
}

/** What the command asked for, read from `env` alone: no key, no network. Refuses what it cannot read. */
function asked(env: Record<string, string | undefined>): { scenes: EvalScene[]; models: PlayModel[]; samples: number; parallel: number } {
    const all = EVAL_SCENES.map((scene) => scene.name);
    const named = (env.EVAL_SCENES ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    if (named.length === 0) throw new EvalRunRefused(`Name a scene: one of ${all.join(', ')}, or all.`);
    const unknown = named.find((name) => name !== 'all' && !all.includes(name));
    if (unknown) throw new EvalRunRefused(`Unknown scene "${unknown}". Name one of ${all.join(', ')}, or all.`);
    const model = env.EVAL_MODEL || PLAY_MODELS[0];
    if (model !== 'all' && !PLAY_MODELS.includes(model as PlayModel)) throw new EvalRunRefused(`Unknown model "${model}". Name one of ${PLAY_MODELS.join(', ')}, or all.`);
    const samples = env.EVAL_SAMPLES ? Number(env.EVAL_SAMPLES) : EVAL_SAMPLES;
    if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new EvalRunRefused('Samples is a whole number from 1 to 10.');
    const parallel = env.EVAL_PARALLEL ? Number(env.EVAL_PARALLEL) : EVAL_PARALLEL;
    if (!Number.isInteger(parallel) || parallel < 1 || parallel > 8) throw new EvalRunRefused('Parallel calls is a whole number from 1 to 8.');
    return {
        scenes: named.includes('all') ? EVAL_SCENES : EVAL_SCENES.filter((scene) => named.includes(scene.name)),
        models: model === 'all' ? [...PLAY_MODELS] : [model as PlayModel],
        samples,
        parallel,
    };
}

/** The scenes a model of the command plays: every scene on the first, and only the turns on the rest, as nothing else uses the play model. */
function scenesFor(scenes: EvalScene[], index: number): EvalScene[] {
    return index === 0 ? scenes : scenes.filter((scene) => scene.kind === 'turn' || scene.kind === 'chat');
}

/** What the command would send and cost, in a sentence: said when it refuses for the spend flag. */
function costSentence(request: ReturnType<typeof asked>): string {
    const totals = request.models.map((model, index) => estimateEval(scenesFor(request.scenes, index), model, request.samples));
    const sum = (pick: (one: (typeof totals)[number]) => number) => totals.reduce((total, one) => total + pick(one), 0);
    const worst = sum((one) => one.worstUsd);
    const names = request.models.map((model) => PLAY_MODEL_CATALOGUE[model].name).join(' and ');
    const capped = worst > EVAL_CAP_USD ? ` The $${EVAL_CAP_USD.toFixed(2)} cap stops it short if every call runs to its limit.` : '';
    return `The named scenes would send ${sum((one) => one.calls)} calls on ${names}: about $${sum((one) => one.expectedUsd).toFixed(3)}, at most $${worst.toFixed(3)}.${capped}`;
}

/**
 * The gate: no spend flag, no run. Then the scenes, the model and the key, and only then the
 * network. `env` carries EVAL_SPEND ("yes"), EVAL_SCENES (names, comma-separated, or "all"),
 * EVAL_MODEL (a play model, or "all" for each of them side by side; GLM-5.3 when unset),
 * EVAL_SAMPLES, EVAL_PARALLEL, EVAL_AGAINST ("last" or a report's path) and OPENROUTER_API_KEY.
 */
export async function startEvalRun(
    env: Record<string, string | undefined>,
    deps: { fetch: FetchLike; reportDir: string; log(line: string): void; git?: () => { commit: string; dirty: boolean } },
): Promise<{ report: EvalReport; json: string; scorecard: string; runs: { report: EvalReport; json: string; scorecard: string }[]; sideBySide: string | null }> {
    if (env.EVAL_SPEND !== 'yes') {
        // What it would cost is worked out from the prompts alone; a request it cannot read is refused for the flag all the same.
        let cost = '';
        try {
            cost = ` ${costSentence(asked(env))}`;
        } catch {
            cost = '';
        }
        throw new EvalRunRefused(`The prompt eval run spends OpenRouter credit. Start it with --spend.${cost}`);
    }
    const request = asked(env);
    if (!env.OPENROUTER_API_KEY) {
        throw new EvalRunRefused('OPENROUTER_API_KEY is not set: the run reads it from the root .env.');
    }
    const problems = scenePromptProblems(request.scenes);
    if (problems.length > 0) throw new EvalRunRefused(problems.join('\n'));
    const earlier = request.models.map((model) => earlierReport(env.EVAL_AGAINST || undefined, deps.reportDir, model));
    const names = request.models.map((model) => PLAY_MODEL_CATALOGUE[model].name).join(' and ');

    deps.log(`Prompt eval run on ${names}, ${request.scenes.length} scenes: at most $${EVAL_CAP_USD.toFixed(2)} of OpenRouter credit.`);
    const client = new OpenRouterClient(env.OPENROUTER_API_KEY, deps.fetch);
    const git = (deps.git ?? gitState)();
    const runs: { report: EvalReport; json: string; scorecard: string }[] = [];
    // One cap for the whole command, however many models it plays.
    let spentUsd = 0;
    for (const [index, model] of request.models.entries()) {
        const scenes = scenesFor(request.scenes, index);
        if (scenes.length === 0) continue;
        const report = await runEval({ scenes, model, samples: request.samples, concurrency: request.parallel, spentUsd, client, git });
        spentUsd += report.totalUsd;
        const saved = savedReports(deps.reportDir);
        const files = writeEvalReport(report, deps.reportDir, earlier[index], saved);
        deps.log(formatScorecard(report, earlier[index], saved));
        deps.log(`Full report (with the played text): ${files.json}`);
        runs.push({ report, ...files });
    }
    let sideBySide: string | null = null;
    if (runs.length > 1) {
        sideBySide = path.join(deps.reportDir, `eval-${runs[0].report.startedAt.replace(/[:.]/g, '-')}-side-by-side.md`);
        const card = formatSideBySide(runs.map((run) => run.report));
        writeFileSync(sideBySide, `${card}\n`);
        deps.log(card);
    }
    return { ...runs[0], runs, sideBySide };
}

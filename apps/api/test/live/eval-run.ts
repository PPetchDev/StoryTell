import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import { estimateTokens } from '../../src/manager/chat/turn/prompt-tokens.js';
import { buildTurnPrompt } from '../../src/manager/chat/turn/prompt.js';
import { parseReply } from '../../src/manager/chat/turn/reply-parser.js';
import { BACKGROUND_MODEL, PLAY_MODEL_CATALOGUE, PLAY_MODELS, PlayModel, PromptMessage } from '../../src/service/model-gateway/model-gateway.js';
import { FetchLike } from '../../src/service/model-gateway/real/http.js';
import { TEXT_MODELS } from '../../src/service/model-gateway/real/model-table.js';
import { OpenRouterClient } from '../../src/service/model-gateway/real/openrouter-client.js';
import { GradedCheck } from './eval-checks.js';
import { EVAL_SCENES, EvalScene } from './eval-scenes.js';
import { REPO_ROOT } from './smoke-run.js';

/**
 * The prompt eval run (.scratch/prompt-evals/spec.md): plays each eval scene through the app's
 * real turn prompt and a real play model, checks every reply, and writes a scorecard. It spends
 * real credit, so only the user starts it, through eval.live.ts. Everything here takes its
 * OpenRouter client from the caller, so the unit tests drive it with a scripted `fetch`.
 */

/** Under `.data/`, which git ignores, so no played text enters the repository. */
export const DEFAULT_EVAL_DIR = path.join(REPO_ROOT, '.data', 'eval-runs');
/** The run stops before any call that could take its running total past this. */
export const EVAL_CAP_USD = 0.5;
/** A model never writes the same reply twice, so each scene is played this many times. */
export const EVAL_SAMPLES = 3;
/** The grader: the background model, cheap, and not the model whose reply it reads. */
const GRADER = TEXT_MODELS[BACKGROUND_MODEL];
/** Above the grader's list price on purpose: it only sizes the worst case against the cap. */
const GRADER_PRICE_USD_PER_MILLION = { input: 0.5, output: 2 };
const GRADER_MAX_TOKENS = 400;

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
    /** What the play model wrote; null when the call failed. */
    text: string | null;
    /** The typed error's message when the play call failed. */
    error: string | null;
    results: EvalResult[];
}

export interface EvalCall {
    scene: string;
    role: 'play' | 'grader';
    model: string;
    finishReason: string | null;
    promptTokens: number;
    completionTokens: number;
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
    scenes: { name: string; about: string; samples: EvalSample[] }[];
    calls: EvalCall[];
}

/** One line of the scorecard: a check's passes out of the samples that could be scored. */
export interface Score {
    scene: string;
    check: string;
    kind: 'code' | 'graded';
    pass: number;
    scored: number;
    /** Samples whose play call failed or whose grader answer could not be read. */
    notScored: number;
}

export type Change = 'better' | 'worse' | 'unchanged' | 'new';

function worstCaseUsd(price: { input: number; output: number }, messages: PromptMessage[], maxTokens: number): number {
    const promptTokens = messages.reduce((sum, message) => sum + estimateTokens(message.content) + 4, 0);
    return (promptTokens * price.input + maxTokens * price.output) / 1_000_000;
}

/** What the grader is asked: the turn, the reply and the criteria, answered as JSON. */
export function buildGraderPrompt(scene: EvalScene, reply: string): PromptMessage[] {
    const criteria = scene.graded.map((check, index) => `${index + 1}. "${check.name}": ${check.criterion}`).join('\n');
    return [
        {
            role: 'system',
            content:
                'You check one reply from a piece of interactive fiction against written criteria. Judge only what is written in the reply. ' +
                'Answer with JSON only: {"checks":[{"name":"<the criterion\'s name>","pass":true or false,"quote":"<the words of the reply you judged on, at most 25 words>"}]}, one entry per criterion, in order.',
        },
        {
            role: 'user',
            content: `The user plays ${scene.input.identity.name}. The user wrote:\n${scene.userText}\n\nThe reply:\n${reply}\n\nCriteria:\n${criteria}`,
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

export async function runEval(options: {
    scenes: EvalScene[];
    model: PlayModel;
    client: OpenRouterClient;
    samples?: number;
    capUsd?: number;
    git?: { commit: string; dirty: boolean };
}): Promise<EvalReport> {
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

    const send = async (
        scene: string,
        role: EvalCall['role'],
        request: { messages: PromptMessage[]; maxTokens: number; stop?: string[]; json?: boolean },
    ): Promise<string | null> => {
        const price = role === 'play' ? playPrice : GRADER_PRICE_USD_PER_MILLION;
        if (report.totalUsd + worstCaseUsd(price, request.messages, request.maxTokens) > report.capUsd) throw new CapReached();
        const spec = role === 'play' ? TEXT_MODELS[options.model] : GRADER;
        const call: EvalCall = { scene, role, model: spec.id, finishReason: null, promptTokens: 0, completionTokens: 0, costUsd: 0, error: null };
        let text: string | null = null;
        try {
            const result = await options.client.chat({ model: spec, ...request });
            text = result.text;
            Object.assign(call, {
                finishReason: result.finishReason ?? null,
                promptTokens: result.promptTokens,
                completionTokens: result.completionTokens,
                costUsd: result.costUsd,
            });
        } catch (error) {
            call.error = (error as Error).message;
        }
        report.totalUsd = Math.round((report.totalUsd + call.costUsd) * 1e9) / 1e9;
        report.calls.push(call);
        return text;
    };

    try {
        for (const scene of options.scenes) {
            const played: EvalSample[] = [];
            report.scenes.push({ name: scene.name, about: scene.about, samples: played });
            const prompt = buildTurnPrompt({ ...scene.input, userText: scene.userText });
            const cast = scene.input.story.characters.map((character, index) => ({ id: index + 1, name: character.name }));
            for (let sample = 0; sample < report.samples; sample++) {
                const text = await send(scene.name, 'play', { messages: prompt.messages, maxTokens: prompt.maxTokens, stop: prompt.stop });
                if (text === null) {
                    played.push({ text: null, error: report.calls.at(-1)!.error, results: [] });
                    continue;
                }
                const context = { text, parsed: parseReply(text, cast, scene.input.identity.name), identityName: scene.input.identity.name };
                const results: EvalResult[] = scene.checks.map((check) => {
                    const verdict = check.run(context);
                    return { check: check.name, kind: 'code', outcome: verdict.pass ? 'pass' : 'fail', reason: verdict.reason };
                });
                const entry: EvalSample = { text, error: null, results };
                played.push(entry);
                if (scene.graded.length === 0) continue;
                // One grader call covers all of this reply's graded checks.
                const answer = await send(scene.name, 'grader', { messages: buildGraderPrompt(scene, text), maxTokens: GRADER_MAX_TOKENS, json: true });
                const grades = answer === null ? new Map<string, { pass: boolean; quote: string }>() : parseGrades(answer, scene.graded);
                for (const check of scene.graded) {
                    const grade = grades.get(check.name);
                    results.push(
                        grade
                            ? { check: check.name, kind: 'graded', outcome: grade.pass ? 'pass' : 'fail', reason: grade.quote }
                            : { check: check.name, kind: 'graded', outcome: 'not_graded', reason: answer === null ? 'the grader call failed' : 'the grader answer could not be read' },
                    );
                }
            }
        }
    } catch (error) {
        if (!(error instanceof CapReached)) throw error;
        report.stoppedAtCap = true;
    }
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

/**
 * What moved since an earlier run. Three samples are thin, so a check is better or worse only
 * when its pass rate moved by two samples in three, or it went from every sample passing to any
 * failing; anything smaller is noise and reads as unchanged.
 */
export function compare(now: Score, then: Score | undefined): Change {
    if (!then || then.scored === 0 || now.scored === 0) return then ? 'unchanged' : 'new';
    const before = then.pass / then.scored;
    const after = now.pass / now.scored;
    if ((before === 1 && after < 1) || after - before <= -0.6) return 'worse';
    if (after - before >= 0.6) return 'better';
    return 'unchanged';
}

/** The scorecard: what the user reads. The played text stays in the JSON report. */
export function formatScorecard(report: EvalReport, earlier?: EvalReport): string {
    const before = earlier ? scores(earlier) : [];
    const rows = scores(report);
    const lines = [
        `# Prompt eval run: ${PLAY_MODEL_CATALOGUE[report.model].name}`,
        '',
        `Commit ${report.commit}${report.dirty ? ' with uncommitted changes' : ''}, ${report.samples} samples a scene, ${report.startedAt}.`,
        earlier ? `Compared with the run of ${earlier.startedAt} (commit ${earlier.commit}${earlier.dirty ? ', with uncommitted changes' : ''}).` : '',
        '',
        `| Scene | Check | Kind | Passed |${earlier ? ' Before | Change |' : ''}`,
        `|---|---|---|---|${earlier ? '---|---|' : ''}`,
        ...rows.map((row) => {
            const then = before.find((one) => one.scene === row.scene && one.check === row.check);
            const passed = `${row.pass} of ${row.scored}${row.notScored ? ` (${row.notScored} not scored)` : ''}`;
            const versus = earlier ? ` ${then ? `${then.pass} of ${then.scored}` : '-'} | ${compare(row, then)} |` : '';
            return `| ${row.scene} | ${row.check} | ${row.kind} | ${passed} |${versus}`;
        }),
        '',
        `Total $${report.totalUsd.toFixed(5)} of a $${report.capUsd.toFixed(2)} cap, in ${report.calls.length} calls${report.stoppedAtCap ? ' (stopped at the cap: the scorecard is not complete)' : ''}.`,
    ];
    const failures = report.scenes.flatMap((scene) =>
        scene.samples.flatMap((sample, index) =>
            sample.text === null
                ? [`- ${scene.name}, sample ${index + 1}: the call failed: ${sample.error}`]
                : sample.results.filter((result) => result.outcome !== 'pass').map((result) => `- ${scene.name}, sample ${index + 1}, ${result.check}: ${result.outcome === 'fail' ? '' : 'not graded: '}${result.reason}`),
        ),
    );
    if (failures.length > 0) lines.push('', '## What did not pass', '', ...failures);
    return lines.filter((line, index) => line !== '' || lines[index - 1] !== '').join('\n');
}

function stem(report: EvalReport): string {
    return `eval-${report.startedAt.replace(/[:.]/g, '-')}-${report.model}`;
}

/** Writes the full report as JSON and the scorecard as Markdown in `dir`, and answers their paths. */
export function writeEvalReport(report: EvalReport, dir: string, earlier?: EvalReport): { json: string; scorecard: string } {
    mkdirSync(dir, { recursive: true });
    const json = path.join(dir, `${stem(report)}.json`);
    const scorecard = path.join(dir, `${stem(report)}.md`);
    writeFileSync(json, `${JSON.stringify(report, null, 4)}\n`);
    writeFileSync(scorecard, `${formatScorecard(report, earlier)}\n`);
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

/**
 * The gate: no spend flag, no run. Then the scenes, the model and the key, and only then the
 * network. `env` carries EVAL_SPEND ("yes"), EVAL_SCENES (names, comma-separated, or "all"),
 * EVAL_MODEL (a play model; GLM-5.3 when unset), EVAL_SAMPLES, EVAL_AGAINST ("last" or a report's
 * path) and OPENROUTER_API_KEY.
 */
export async function startEvalRun(
    env: Record<string, string | undefined>,
    deps: { fetch: FetchLike; reportDir: string; log(line: string): void; git?: () => { commit: string; dirty: boolean } },
): Promise<{ report: EvalReport; json: string; scorecard: string }> {
    if (env.EVAL_SPEND !== 'yes') {
        throw new EvalRunRefused('The prompt eval run spends OpenRouter credit. Start it with --spend.');
    }
    const all = EVAL_SCENES.map((scene) => scene.name);
    const named = (env.EVAL_SCENES ?? '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
    if (named.length === 0) throw new EvalRunRefused(`Name a scene: one of ${all.join(', ')}, or all.`);
    const unknown = named.find((name) => name !== 'all' && !all.includes(name));
    if (unknown) throw new EvalRunRefused(`Unknown scene "${unknown}". Name one of ${all.join(', ')}, or all.`);
    const model = (env.EVAL_MODEL || PLAY_MODELS[0]) as PlayModel;
    if (!PLAY_MODELS.includes(model)) throw new EvalRunRefused(`Unknown model "${model}". Name one of ${PLAY_MODELS.join(', ')}.`);
    const samples = env.EVAL_SAMPLES ? Number(env.EVAL_SAMPLES) : EVAL_SAMPLES;
    if (!Number.isInteger(samples) || samples < 1 || samples > 10) throw new EvalRunRefused('Samples is a whole number from 1 to 10.');
    if (!env.OPENROUTER_API_KEY) {
        throw new EvalRunRefused('OPENROUTER_API_KEY is not set: the run reads it from the root .env.');
    }
    const earlier = earlierReport(env.EVAL_AGAINST || undefined, deps.reportDir, model);
    const scenes = named.includes('all') ? EVAL_SCENES : EVAL_SCENES.filter((scene) => named.includes(scene.name));

    deps.log(`Prompt eval run on ${PLAY_MODEL_CATALOGUE[model].name}, ${scenes.length} scenes: at most $${EVAL_CAP_USD.toFixed(2)} of OpenRouter credit.`);
    const report = await runEval({ scenes, model, samples, client: new OpenRouterClient(env.OPENROUTER_API_KEY, deps.fetch), git: (deps.git ?? gitState)() });
    const files = writeEvalReport(report, deps.reportDir, earlier);
    deps.log(formatScorecard(report, earlier));
    deps.log(`Full report (with the played text): ${files.json}`);
    return { report, ...files };
}

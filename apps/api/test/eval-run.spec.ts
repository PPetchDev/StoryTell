import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildTurnPrompt } from '../src/manager/chat/turn/prompt.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { OpenRouterClient } from '../src/service/model-gateway/real/openrouter-client.js';
import vitestConfig from '../vitest.config.js';
import { RecordedRequest } from './harness/recorded-fetch.js';
import { EvalReport, formatScorecard, runEval, scores, startEvalRun, writeEvalReport } from './live/eval-run.js';
import { EVAL_SCENES, EvalScene, REPEATED_PHRASE } from './live/eval-scenes.js';

const GRADER_MODEL = 'deepseek/deepseek-v4-flash';
const GIT = { commit: 'abc1234', dirty: false };

/** A reply that passes the `format` scene: narration, one line by Mira, a finished sentence. */
const GOOD = 'Mira looked up from the ledger and smiled.\n\n@Mira Vance: You came back. I was hoping you would.';

interface Answer {
    text?: string;
    cost?: number;
    status?: number;
}

/** A scripted OpenRouter: play calls and grader calls each answered by their own function. */
function scriptedOpenRouter(answer: { play?: (index: number) => Answer; grader?: (index: number) => Answer } = {}) {
    const requests: (RecordedRequest & { role: 'play' | 'grader' })[] = [];
    const counts = { play: 0, grader: 0 };
    const fetchImpl: FetchLike = async (url, init) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        const role = body?.model === GRADER_MODEL ? 'grader' : 'play';
        requests.push({ url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body, role });
        const fallback: Answer = role === 'play' ? { text: GOOD } : { text: '{"checks":[{"name":"x","pass":true,"quote":"a quote"}]}' };
        const { text = fallback.text, cost = 0.001, status = 200 } = { ...fallback, ...(answer[role]?.(counts[role]++) ?? {}) };
        if (status !== 200) return new Response(JSON.stringify({ error: { message: 'Provider returned error', code: status } }), { status });
        const json = {
            id: `gen-${requests.length}`,
            choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 20, cost },
        };
        return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { requests, fetchImpl, client: new OpenRouterClient('sk-or-test-not-a-real-key', fetchImpl, async () => {}) };
}

function scene(name: string): EvalScene {
    return EVAL_SCENES.find((one) => one.name === name)!;
}

function run(names: string[], script: Parameters<typeof scriptedOpenRouter>[0] = {}, options: { samples?: number; capUsd?: number } = {}) {
    const router = scriptedOpenRouter(script);
    return runEval({ scenes: names.map(scene), model: 'glm-5.3', client: router.client, git: GIT, ...options }).then((report) => ({ report, ...router }));
}

/** A check's passes out of its scored samples, from a report. */
function score(report: EvalReport, sceneName: string, check: string) {
    const row = scores(report).find((one) => one.scene === sceneName && one.check === check)!;
    return `${row.pass}/${row.scored}`;
}

// Spec (prompt-evals): every answer here is scripted; nothing reaches OpenRouter.
describe('The prompt eval run', () => {
    describe('starting', () => {
        const dir = () => mkdtempSync(path.join(tmpdir(), 'eval-'));
        const start = (env: Record<string, string | undefined>, router = scriptedOpenRouter(), reportDir = dir()) => {
            const lines: string[] = [];
            return { router, lines, reportDir, started: startEvalRun(env, { fetch: router.fetchImpl, reportDir, log: (line) => lines.push(line), git: () => GIT }) };
        };

        it('is not collected by the normal test run', () => {
            expect(vitestConfig.test?.include).toEqual(['test/**/*.spec.ts']);
        });

        it('refuses to start without the spend flag, before reading a key or touching the network', async () => {
            const { router, started } = start({ EVAL_SCENES: 'all', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' });

            await expect(started).rejects.toThrow('Start it with --spend');
            expect(router.requests).toEqual([]);
        });

        it('refuses no scene, an unknown scene, an unknown model, bad samples and a missing key, naming what it knows', async () => {
            const env = { EVAL_SPEND: 'yes', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };

            await expect(start({ ...env }).started).rejects.toThrow('Name a scene: one of format, user, facts, repeats, voice, length, adult, or all.');
            await expect(start({ ...env, EVAL_SCENES: 'weather' }).started).rejects.toThrow('Unknown scene "weather"');
            await expect(start({ ...env, EVAL_SCENES: 'all', EVAL_MODEL: 'gpt-9' }).started).rejects.toThrow('Unknown model "gpt-9". Name one of glm-5.3, deepseek-v4-pro.');
            await expect(start({ ...env, EVAL_SCENES: 'all', EVAL_SAMPLES: '0' }).started).rejects.toThrow('Samples is a whole number from 1 to 10.');
            await expect(start({ EVAL_SPEND: 'yes', EVAL_SCENES: 'all' }).started).rejects.toThrow('OPENROUTER_API_KEY is not set');
        });

        it('plays the named scenes on the named model, writes the report and the scorecard, and logs the scorecard without the played text', async () => {
            const { router, lines, reportDir, started } = start({
                EVAL_SPEND: 'yes',
                EVAL_SCENES: 'format',
                EVAL_MODEL: 'deepseek-v4-pro',
                EVAL_SAMPLES: '2',
                OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key',
            });

            const { report, json, scorecard } = await started;

            expect(router.requests.map((request) => (request.body as { model: string }).model)).toEqual(['deepseek/deepseek-v4-pro', 'deepseek/deepseek-v4-pro']);
            expect(report).toMatchObject({ model: 'deepseek-v4-pro', samples: 2, commit: 'abc1234', dirty: false, capUsd: 0.5, totalUsd: 0.002 });
            expect(path.dirname(json)).toBe(reportDir);
            expect(JSON.parse(readFileSync(json, 'utf8')).scenes[0].samples[0].text).toBe(GOOD);
            expect(readFileSync(scorecard, 'utf8')).toContain('| format | parses | code | 2 of 2 |');
            expect(lines.join('\n')).toContain('Prompt eval run on DeepSeek V4 Pro, 1 scenes: at most $0.50');
            expect(lines.join('\n')).not.toContain('I was hoping you would');
            // The key is in no file the run writes.
            expect(readFileSync(json, 'utf8') + readFileSync(scorecard, 'utf8')).not.toContain('sk-or-test');
        });

        it('compares with the newest earlier report for the same model when asked for the last', async () => {
            const reportDir = dir();
            const env = { EVAL_SPEND: 'yes', EVAL_SCENES: 'format', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };
            await start(env, scriptedOpenRouter(), reportDir).started;
            await new Promise((resolve) => setTimeout(resolve, 5));
            // Now every reply breaks the format: an unknown speaker.
            const worse = scriptedOpenRouter({ play: () => ({ text: '@Stranger: Who are you?' }) });

            const { scorecard } = await start({ ...env, EVAL_AGAINST: 'last' }, worse, reportDir).started;

            const card = readFileSync(scorecard, 'utf8');
            expect(card).toContain('Compared with the run of');
            expect(card).toContain('| format | parses | code | 0 of 3 | 3 of 3 | worse |');
        });

        it('refuses a named earlier report that is not there', async () => {
            const env = { EVAL_SPEND: 'yes', EVAL_SCENES: 'format', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key', EVAL_AGAINST: path.join(tmpdir(), 'no-such-report.json') };

            await expect(start(env).started).rejects.toThrow('No report at');
        });
    });

    it('builds each scene’s prompt with the real turn prompt builder and plays it three times, pinned to DeepInfra', async () => {
        const { requests } = await run(['format', 'length']);

        expect(requests).toHaveLength(6);
        for (const [index, name] of ['format', 'format', 'format', 'length', 'length', 'length'].entries()) {
            const one = scene(name);
            const prompt = buildTurnPrompt({ ...one.input, userText: one.userText });
            expect(requests[index].body).toMatchObject({ model: 'z-ai/glm-5.3', messages: prompt.messages, max_tokens: prompt.maxTokens, stop: prompt.stop });
            expect((requests[index].body as { provider: unknown }).provider).toMatchObject({ only: ['deepinfra'], allow_fallbacks: false });
        }
    });

    it('the repeats scene’s prompt names the phrase the replies share, and the facts scene’s prompt lists the fact', () => {
        const text = (name: string) =>
            buildTurnPrompt({ ...scene(name).input, userText: scene(name).userText })
                .messages.map((message) => message.content)
                .join('\n');

        expect(text('repeats')).toContain(`Already used in recent replies, so not again in this one: "${REPEATED_PHRASE}"`);
        expect(text('facts')).toContain('# Established facts');
        expect(text('facts')).toContain('nine years');
    });

    describe('code checks', () => {
        const cases: { scene: string; check: string; good: string; bad: string }[] = [
            { scene: 'format', check: 'parses', good: GOOD, bad: '@Stranger: Who are you?' },
            { scene: 'format', check: 'Mira Vance speaks', good: GOOD, bad: 'Mira said nothing at all.' },
            { scene: 'format', check: 'ends cleanly', good: GOOD, bad: '@Mira Vance: You came back and I was' },
            { scene: 'user', check: 'no line as the user', good: GOOD, bad: '@Mira Vance: Well?\n\n@Ash: I came to ask you out.' },
            { scene: 'facts', check: 'says nine', good: '@Mira Vance: Nine years, give or take a flood.', bad: '@Mira Vance: Long enough.' },
            { scene: 'facts', check: 'no other number of years', good: '@Mira Vance: Nine years.', bad: '@Mira Vance: Nine years. Or twenty years, some days.' },
            { scene: 'repeats', check: 'drops the phrase', good: GOOD, bad: `She thought about it, and ${REPEATED_PHRASE}.\n\n@Mira Vance: Not yet.` },
            { scene: 'length', check: 'medium length', good: `${'The rain kept on against the glass. '.repeat(30)}\n\n@Mira Vance: Stay, then.`, bad: GOOD },
            { scene: 'adult', check: 'no refusal', good: GOOD, bad: 'I’m sorry, but I can’t write that scene.' },
        ];

        it.each(cases)('$scene: "$check" passes a reply that does it and fails one that does not', async ({ scene: name, check, good, bad }) => {
            const passed = await run([name], { play: () => ({ text: good }) }, { samples: 1 });
            const failed = await run([name], { play: () => ({ text: bad }) }, { samples: 1 });

            expect(score(passed.report, name, check)).toBe('1/1');
            expect(score(failed.report, name, check)).toBe('0/1');
            expect(failed.report.scenes[0].samples[0].results.find((result) => result.check === check)!.reason).not.toBe('');
        });
    });

    describe('graded checks', () => {
        it('sends one grader call per reply, to the background model as JSON, with the turn, the reply and the criterion, and reads its answer', async () => {
            const { report, requests } = await run(['voice'], {
                grader: (index) => ({ text: JSON.stringify({ checks: [{ name: 'sounds like Mira', pass: index !== 1, quote: 'You came back.' }] }) }),
            });

            const graders = requests.filter((request) => request.role === 'grader');
            expect(graders).toHaveLength(3);
            const body = graders[0].body as { model: string; response_format: unknown; messages: { content: string }[] };
            expect(body.model).toBe(GRADER_MODEL);
            expect(body.response_format).toEqual({ type: 'json_object' });
            const asked = body.messages.map((message) => message.content).join('\n');
            expect(asked).toContain(scene('voice').userText);
            expect(asked).toContain(GOOD);
            expect(asked).toContain(scene('voice').graded[0].criterion);
            expect(score(report, 'voice', 'sounds like Mira')).toBe('2/3');
            expect(report.scenes[0].samples[0].results.at(-1)).toEqual({ check: 'sounds like Mira', kind: 'graded', outcome: 'pass', reason: 'You came back.' });
        });

        it('a scene with no graded checks sends no grader call', async () => {
            const { requests } = await run(['format']);

            expect(requests.every((request) => request.role === 'play')).toBe(true);
        });

        it('an unreadable grader answer, or a failed grader call, is "not graded": never a pass or a fail', async () => {
            const { report } = await run(['voice'], { grader: (index) => (index === 0 ? { text: 'I think it is fine.' } : index === 1 ? { status: 400 } : {}) });

            const graded = report.scenes[0].samples.map((sample) => sample.results.at(-1)!);
            expect(graded.map((result) => result.outcome)).toEqual(['not_graded', 'not_graded', 'pass']);
            expect(graded[0].reason).toBe('the grader answer could not be read');
            expect(graded[1].reason).toBe('the grader call failed');
            expect(scores(report).find((row) => row.check === 'sounds like Mira')).toMatchObject({ pass: 1, scored: 1, notScored: 2 });
        });
    });

    it('a failed play call is a failed sample with its error, apart from the score, and the run carries on', async () => {
        const { report } = await run(['format'], { play: (index) => (index === 1 ? { status: 400 } : {}) });

        expect(report.scenes[0].samples.map((sample) => sample.text === null)).toEqual([false, true, false]);
        expect(report.scenes[0].samples[1].error).toEqual(expect.any(String));
        expect(scores(report).find((row) => row.check === 'parses')).toMatchObject({ pass: 2, scored: 2, notScored: 1 });
        expect(formatScorecard(report)).toContain('- format, sample 2: the call failed:');
    });

    it('stops before a call that would take the running total past the cap, and says so', async () => {
        // Each call is billed $0.004; a turn's worst case is under a cent, so the cap is reached mid-run.
        const { report, requests } = await run(['format', 'length'], { play: () => ({ cost: 0.004 }) }, { capUsd: 0.012 });

        expect(report.stoppedAtCap).toBe(true);
        expect(requests.length).toBeLessThan(6);
        expect(report.totalUsd).toBeLessThanOrEqual(0.012);
        expect(formatScorecard(report)).toContain('stopped at the cap: the scorecard is not complete');
    });

    it('records the commit, each call’s model, tokens and cost, each reply and each result, and names its files by time and model', async () => {
        const { report } = await run(['voice'], {}, { samples: 1 });
        const dir = mkdtempSync(path.join(tmpdir(), 'eval-'));

        const files = writeEvalReport(report, dir);

        expect(path.basename(files.json)).toMatch(/^eval-\d{4}-\d{2}-\d{2}T[\d-]+Z-glm-5\.3\.json$/);
        expect(existsSync(files.scorecard)).toBe(true);
        const written = JSON.parse(readFileSync(files.json, 'utf8')) as EvalReport;
        expect(written).toMatchObject({ commit: 'abc1234', dirty: false, model: 'glm-5.3', totalUsd: 0.002 });
        expect(written.calls).toEqual([
            { scene: 'voice', role: 'play', model: 'z-ai/glm-5.3', finishReason: 'stop', promptTokens: 100, completionTokens: 20, costUsd: 0.001, error: null },
            { scene: 'voice', role: 'grader', model: GRADER_MODEL, finishReason: 'stop', promptTokens: 100, completionTokens: 20, costUsd: 0.001, error: null },
        ]);
        expect(written.scenes[0].samples[0].text).toBe(GOOD);
    });

    it('marks a check better or worse only when it moved by two samples in three, or fell from every sample passing', async () => {
        const replies = (bad: number) => ({ play: (index: number) => ({ text: index < bad ? '@Stranger: Who are you?' : GOOD }) });
        const card = async (before: number, after: number) => {
            const earlier = (await run(['format'], replies(before))).report;
            const now = (await run(['format'], replies(after))).report;
            return formatScorecard(now, earlier).split('\n').find((line) => line.startsWith('| format | parses'))!;
        };

        expect(await card(0, 0)).toContain('| 3 of 3 | 3 of 3 | unchanged |');
        expect(await card(0, 1)).toContain('| 2 of 3 | 3 of 3 | worse |');
        expect(await card(1, 2)).toContain('| 1 of 3 | 2 of 3 | unchanged |');
        expect(await card(1, 3)).toContain('| 0 of 3 | 2 of 3 | worse |');
        expect(await card(3, 1)).toContain('| 2 of 3 | 0 of 3 | better |');
        expect(await card(2, 1)).toContain('| 2 of 3 | 1 of 3 | unchanged |');
    });
});

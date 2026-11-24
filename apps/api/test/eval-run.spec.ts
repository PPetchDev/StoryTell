import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { buildJudgePrompt } from '../src/manager/chat/judge/judge-prompt.js';
import { buildExtractionPrompt } from '../src/manager/chat/memory/memory-prompt.js';
import { buildTurnPrompt } from '../src/manager/chat/turn/prompt.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { OpenRouterClient } from '../src/service/model-gateway/real/openrouter-client.js';
import vitestConfig from '../vitest.config.js';
import { RecordedRequest } from './harness/recorded-fetch.js';
import { compare, EvalReport, formatScorecard, runEval, scenePromptProblems, Score, scores, startEvalRun, writeEvalReport } from './live/eval-run.js';
import { dropsRepeatedPhrases, everyReply, parsesAsAReply } from './live/eval-checks.js';
import { ChatScene, EVAL_SCENES, EvalScene, JudgeScene, MemoryScene, REPEATED_PHRASE, TurnScene } from './live/eval-scenes.js';

const GRADER_MODEL = 'deepseek/deepseek-v4-flash';
const GIT = { commit: 'abc1234', dirty: false };

/** A reply that passes the `format` scene: narration, one line by Mira, a finished sentence. */
const GOOD = 'Mira looked up from the ledger and smiled.\n\n@Mira Vance: You came back. I was hoping you would.';
/** An answer both the Judge's parser and the extraction's read, saying nothing changed. */
const QUIET = '{"bond_changes":[],"arc_steps":[],"scene":{"reason":"nothing yet","move_on":false},"operations":[]}';

type Role = 'play' | 'background' | 'grader';

interface Answer {
    text?: string;
    cost?: number;
    status?: number;
    /** Prompt tokens the host says it read from its cache. */
    cached?: number;
}

/**
 * A scripted OpenRouter: play calls, background calls (the Judge, Memory extraction) and grader
 * calls each answered by their own function. `delayMs` holds every answer back, so calls overlap.
 */
function scriptedOpenRouter(answer: Partial<Record<Role, (index: number) => Answer>> & { delayMs?: number } = {}) {
    const requests: (RecordedRequest & { role: Role })[] = [];
    const counts: Record<Role, number> = { play: 0, background: 0, grader: 0 };
    const flight = { now: 0, peak: 0 };
    const fetchImpl: FetchLike = async (url, init) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined;
        const system: string = body?.messages?.[0]?.content ?? '';
        const role: Role = body?.model !== GRADER_MODEL ? 'play' : system.startsWith('You check ') ? 'grader' : 'background';
        requests.push({ url, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body, role });
        const fallback: Answer = role === 'play' ? { text: GOOD } : role === 'grader' ? { text: '{"checks":[{"name":"x","pass":true,"quote":"a quote"}]}' } : { text: QUIET };
        const { text = fallback.text, cost = 0.001, status = 200, cached } = { ...fallback, ...(answer[role]?.(counts[role]++) ?? {}) };
        flight.peak = Math.max(flight.peak, ++flight.now);
        if (answer.delayMs) await new Promise((resolve) => setTimeout(resolve, answer.delayMs));
        flight.now--;
        if (status !== 200) return new Response(JSON.stringify({ error: { message: 'Provider returned error', code: status } }), { status });
        const json = {
            id: `gen-${requests.length}`,
            choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 20, cost, ...(cached === undefined ? {} : { prompt_tokens_details: { cached_tokens: cached } }) },
        };
        return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { requests, flight, fetchImpl, client: new OpenRouterClient('sk-or-test-not-a-real-key', fetchImpl, async () => {}) };
}

function scene(name: string): EvalScene {
    return EVAL_SCENES.find((one) => one.name === name)!;
}

function turnScene(name: string): TurnScene {
    return scene(name) as TurnScene;
}

function run(
    names: (string | EvalScene)[],
    script: Parameters<typeof scriptedOpenRouter>[0] = {},
    options: { samples?: number; capUsd?: number; concurrency?: number; spentUsd?: number } = {},
) {
    const router = scriptedOpenRouter(script);
    const scenes = names.map((one) => (typeof one === 'string' ? scene(one) : one));
    return runEval({ scenes, model: 'glm-5.3', client: router.client, git: GIT, samples: 3, ...options }).then((report) => ({ report, ...router }));
}

/** A check's passes out of its scored samples, from a report. */
function score(report: EvalReport, sceneName: string, check: string) {
    const row = scores(report).find((one) => one.scene === sceneName && one.check === check)!;
    return `${row.pass}/${row.scored}`;
}

const allNames = EVAL_SCENES.map((one) => one.name).join(', ');

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

        it('says, when it refuses for the spend flag, how many calls the named scenes would send and what they would cost', async () => {
            // format: 2 play calls. voice: 2 play calls and 2 grader calls. No key is needed to say so.
            const { router, started } = start({ EVAL_SCENES: 'format,voice', EVAL_SAMPLES: '2' });

            await expect(started).rejects.toThrow(/Start it with --spend\. The named scenes would send 6 calls on GLM-5\.3: about \$0\.\d+, at most \$0\.\d+\./);
            expect(router.requests).toEqual([]);
        });

        it('refuses no scene, an unknown scene, an unknown model, bad samples, bad parallel calls and a missing key, naming what it knows', async () => {
            const env = { EVAL_SPEND: 'yes', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };

            await expect(start({ ...env }).started).rejects.toThrow(`Name a scene: one of ${allNames}, or all.`);
            await expect(start({ ...env, EVAL_SCENES: 'weather' }).started).rejects.toThrow('Unknown scene "weather"');
            await expect(start({ ...env, EVAL_SCENES: 'all', EVAL_MODEL: 'gpt-9' }).started).rejects.toThrow('Unknown model "gpt-9". Name one of glm-5.3, deepseek-v4-pro, or all.');
            await expect(start({ ...env, EVAL_SCENES: 'all', EVAL_SAMPLES: '0' }).started).rejects.toThrow('Samples is a whole number from 1 to 10.');
            await expect(start({ ...env, EVAL_SCENES: 'all', EVAL_PARALLEL: '9' }).started).rejects.toThrow('Parallel calls is a whole number from 1 to 8.');
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

        it('plays five samples a scene, four calls at a time, unless told otherwise', async () => {
            const router = scriptedOpenRouter({ delayMs: 5 });

            const { report } = await start({ EVAL_SPEND: 'yes', EVAL_SCENES: 'format,length', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' }, router).started;

            expect(report.samples).toBe(5);
            expect(router.requests).toHaveLength(10);
            expect(router.flight.peak).toBe(4);
        });

        it('compares with the newest earlier report for the same model when asked for the last', async () => {
            const reportDir = dir();
            const env = { EVAL_SPEND: 'yes', EVAL_SCENES: 'format', EVAL_SAMPLES: '3', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };
            await start(env, scriptedOpenRouter(), reportDir).started;
            await new Promise((resolve) => setTimeout(resolve, 5));
            // Now every reply breaks the format: an unknown speaker.
            const worse = scriptedOpenRouter({ play: () => ({ text: '@Stranger: Who are you?' }) });

            const { scorecard } = await start({ ...env, EVAL_AGAINST: 'last' }, worse, reportDir).started;

            const card = readFileSync(scorecard, 'utf8');
            expect(card).toContain('Compared with the run of');
            expect(card).toContain('| format | parses | code | 0 of 3 | 3 of 3 | worse |');
        });

        it('lists the checks that have never failed in any saved run, this one included, with how many runs each has had', async () => {
            const env = { EVAL_SPEND: 'yes', EVAL_SAMPLES: '1', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };
            // An earlier run in which the format scene's reply had no line by Mira: "parses" and "Mira Vance speaks" failed, "ends cleanly" passed.
            const first = start({ ...env, EVAL_SCENES: 'format' }, scriptedOpenRouter({ play: () => ({ text: '@Stranger: Who are you?' }) }));
            await first.started;

            const { scorecard } = await start({ ...env, EVAL_SCENES: 'format,length' }, scriptedOpenRouter(), first.reportDir).started;

            const card = readFileSync(scorecard, 'utf8');
            const never = card.slice(card.indexOf('## Never failed yet'));
            expect(never).toContain('- format: ends cleanly (2 runs)');
            expect(never).toContain('- length: ends cleanly (1 run)');
            expect(never).not.toContain('format: parses');
            expect(never).not.toContain('format: Mira Vance speaks');
            // GOOD is too short for the length scene, so its length check failed in this very run.
            expect(never).not.toContain('medium length');
        });

        it('refuses a named earlier report that is not there', async () => {
            const env = { EVAL_SPEND: 'yes', EVAL_SCENES: 'format', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key', EVAL_AGAINST: path.join(tmpdir(), 'no-such-report.json') };

            await expect(start(env).started).rejects.toThrow('No report at');
        });

        it('with every play model asked for, plays the turn scenes on each, the Judge scenes once, and writes one scorecard with a column a model', async () => {
            const router = scriptedOpenRouter({ play: (index) => (index < 2 ? {} : { text: '@Stranger: Who are you?' }) });
            const env = { EVAL_SPEND: 'yes', EVAL_SCENES: 'format,judge-waits', EVAL_MODEL: 'all', EVAL_SAMPLES: '2', EVAL_PARALLEL: '1', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };

            const { runs, sideBySide, report } = await start(env, router).started;

            expect(router.requests.map((request) => `${request.role} ${(request.body as { model: string }).model}`)).toEqual([
                'play z-ai/glm-5.3',
                'play z-ai/glm-5.3',
                `background ${GRADER_MODEL}`,
                `background ${GRADER_MODEL}`,
                'play deepseek/deepseek-v4-pro',
                'play deepseek/deepseek-v4-pro',
            ]);
            expect(runs.map((one) => one.report.model)).toEqual(['glm-5.3', 'deepseek-v4-pro']);
            expect(report).toBe(runs[0].report);
            expect(runs.every((one) => existsSync(one.json) && existsSync(one.scorecard))).toBe(true);
            const card = readFileSync(sideBySide!, 'utf8');
            expect(card).toContain('| Scene | Check | Kind | GLM-5.3 | DeepSeek V4 Pro |');
            expect(card).toContain('| format | parses | code | 2 of 2 | 0 of 2 |');
            expect(card).toContain('| judge-waits | does not move on | code | 2 of 2 | - |');
            expect(card).toContain('Total $0.00600');
        });
    });

    it('builds each scene’s prompt with the real turn prompt builder and plays it three times, pinned to DeepInfra', async () => {
        const { requests } = await run(['format', 'length']);

        expect(requests).toHaveLength(6);
        for (const [index, name] of ['format', 'format', 'format', 'length', 'length', 'length'].entries()) {
            const one = turnScene(name);
            const prompt = buildTurnPrompt({ ...one.input, userText: one.userText });
            expect(requests[index].body).toMatchObject({ model: 'z-ai/glm-5.3', messages: prompt.messages, max_tokens: prompt.maxTokens, stop: prompt.stop });
            expect((requests[index].body as { provider: unknown }).provider).toMatchObject({ only: ['deepinfra'], allow_fallbacks: false });
        }
    });

    describe('what a scene’s prompt must hold', () => {
        it('every scene names words of the block it tests, and its built prompt holds them', () => {
            expect(EVAL_SCENES.filter((one) => one.expects.length === 0).map((one) => one.name)).toEqual([]);
            expect(scenePromptProblems(EVAL_SCENES)).toEqual([]);
        });

        it('the repeats scene’s prompt names the phrase the replies share, and the facts scene’s prompt lists the fact', () => {
            expect(scene('repeats').expects).toContain(`Already used in recent replies, so not again in this one: "${REPEATED_PHRASE}"`);
            expect(scene('facts').expects).toEqual(expect.arrayContaining(['# Established facts', 'nine years']));
        });

        it('refuses, before any call, a scene whose prompt no longer holds what it names', async () => {
            const router = scriptedOpenRouter();
            const stale: EvalScene = { ...scene('facts'), expects: ['# Established facts', 'eleven winters'] };

            const refused = runEval({ scenes: [scene('format'), stale], model: 'glm-5.3', client: router.client, git: GIT });

            await expect(refused).rejects.toThrow('Scene "facts" no longer tests what it claims: its prompt does not hold "eleven winters".');
            expect(router.requests).toEqual([]);
        });
    });

    describe('code checks', () => {
        const LONG = `${'The rain kept on against the glass. '.repeat(30)}\n\n@Mira Vance: Stay, then.`;
        /**
         * For every code check, a reply it passes and a reply it must fail, by the check's name; a
         * scene whose check needs its own replies names it as "scene: check". A check with no
         * reply here is a check nobody has seen fail.
         */
        const pairs: Record<string, { good: string; bad: string }[]> = {
            parses: [{ good: GOOD, bad: '@Stranger: Who are you?' }],
            'Mira Vance speaks': [{ good: GOOD, bad: 'Mira said nothing at all.' }],
            'ends cleanly': [{ good: GOOD, bad: '@Mira Vance: You came back and I was' }],
            'no line as the user': [{ good: GOOD, bad: '@Mira Vance: Well?\n\n@Ash: I came to ask you out.' }],
            'says nine': [{ good: '@Mira Vance: Nine years, give or take a flood.', bad: '@Mira Vance: Long enough.' }],
            'no other number of years': [{ good: '@Mira Vance: Nine years.', bad: '@Mira Vance: Nine years. Or twenty years, some days.' }],
            'drops the phrase': [{ good: GOOD, bad: `She thought about it, and ${REPEATED_PHRASE}.\n\n@Mira Vance: Not yet.` }],
            'medium length': [{ good: LONG, bad: GOOD }],
            'no refusal': [{ good: GOOD, bad: 'I’m sorry, but I can’t write that scene.' }],
            'keeps the secret': [{ good: '@Mira Vance: Spring? Ask me in spring.', bad: '@Mira Vance: I have a ticket to Lisbon, if you must know.' }],
            'no stage directions in speech': [
                { good: 'Mira leaned on the counter.\n\n@Mira Vance: You are *very* late. Sit.', bad: '@Mira Vance: You are late. *leans on the counter* Sit.' },
                { good: GOOD, bad: '@Mira Vance: (smiling) You are late.' },
            ],
            'Tobias Hale stays silent': [{ good: GOOD, bad: `${GOOD}\n\n@Tobias Hale: I would not presume to say.` }],
            'the catchphrase in at most one line': [
                { good: '@Mira Vance: For the record, no.\n\n@Mira Vance: Sit down, then.', bad: '@Mira Vance: For the record, no.\n\n@Mira Vance: Sit down, for the record.' },
            ],
            'at most one "something"': [{ good: GOOD, bad: 'Something moved in the back room. Something in her face changed.\n\n@Mira Vance: Well?' }],
            'at most one comparison': [{ good: GOOD, bad: 'She watched him like a cat, as if he owed her money.\n\n@Mira Vance: Well?' }],
            'written in English': [{ good: GOOD, bad: '@Mira Vance: คืนนี้ว่างค่ะ' }],
        };
        const turnChecks = EVAL_SCENES.flatMap((one) => (one.kind === 'turn' ? one.checks.map((check) => ({ scene: one.name, check: check.name })) : []));
        const cases = turnChecks.flatMap(({ scene: name, check }) => (pairs[`${name}: ${check}`] ?? pairs[check] ?? []).map((pair) => ({ scene: name, check, ...pair })));

        it('every code check of every turn scene has a reply it passes and a reply it must fail', () => {
            const without = turnChecks.filter(({ scene: name, check }) => !cases.some((one) => one.scene === name && one.check === check));

            expect(without).toEqual([]);
        });

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
            expect(asked).toContain(turnScene('voice').userText);
            expect(asked).toContain(GOOD);
            expect(asked).toContain(turnScene('voice').graded[0].criterion);
            expect(score(report, 'voice', 'sounds like Mira')).toBe('2/3');
            expect(report.scenes[0].samples[0].results.at(-1)).toEqual({ check: 'sounds like Mira', kind: 'graded', outcome: 'pass', reason: 'You came back.' });
        });

        it('a check about one Character’s speech shows the grader that Character’s speech lines apart, and tells it to judge only those', async () => {
            const reply = 'Tobias cleared his throat. "Hardly my place to say," he murmured.\n\n@Mira Vance: You brought bread. Bold.\n\n@Mira Vance: Is any of it for me?';
            const { requests } = await run(['voice'], { play: () => ({ text: reply }) }, { samples: 1 });

            const asked = (requests.find((request) => request.role === 'grader')!.body as { messages: { content: string }[] }).messages.at(-1)!.content;
            expect(asked).toContain('Mira Vance’s speech lines, the only words that count for a criterion about what Mira Vance says:\n- You brought bread. Bold.\n- Is any of it for me?');
            expect(asked).toContain('Judge this one only on Mira Vance’s speech lines');
        });

        it('a check about a Character’s speech is "not graded", with no grader call, when that Character has no speech line', async () => {
            // The first runs passed "sounds like Mira" on a reply like this: her words only quoted in the narration.
            const { report, requests } = await run(['voice'], { play: () => ({ text: 'Mira laughed. "You brought bread. Bold," she said.' }) }, { samples: 1 });

            expect(requests.filter((request) => request.role === 'grader')).toEqual([]);
            expect(report.scenes[0].samples[0].results.at(-1)).toEqual({
                check: 'sounds like Mira',
                kind: 'graded',
                outcome: 'not_graded',
                reason: 'Mira Vance has no speech line to judge',
            });
            expect(score(report, 'voice', 'Mira Vance speaks')).toBe('0/1');
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

    describe('Judge and Memory scenes', () => {
        it('a Judge scene is built with the app’s Judge prompt builder and sent to the background model as the app sends it', async () => {
            const { requests, report } = await run(['judge-waits'], {}, { samples: 2 });

            const one = scene('judge-waits') as JudgeScene;
            const prompt = buildJudgePrompt(one.input);
            expect(requests.map((request) => request.role)).toEqual(['background', 'background']);
            expect(requests[0].body).toMatchObject({
                model: GRADER_MODEL,
                messages: prompt.messages,
                max_tokens: prompt.maxTokens,
                response_format: { type: 'json_object' },
                // The Judge's own temperature (the app's background samplers).
                temperature: 0.3,
            });
            expect(report.calls.map((call) => call.role)).toEqual(['background', 'background']);
            expect(report.scenes[0]).toMatchObject({ name: 'judge-waits', kind: 'judge' });
        });

        it('a Memory scene is built with the app’s extraction prompt builder, as JSON, with no sampler value', async () => {
            const { requests } = await run(['memory-promise'], {}, { samples: 1 });

            const prompt = buildExtractionPrompt((scene('memory-promise') as MemoryScene).input);
            expect(requests[0].body).toMatchObject({ model: GRADER_MODEL, messages: prompt.messages, max_tokens: prompt.maxTokens, response_format: { type: 'json_object' } });
            expect(requests[0].body).not.toHaveProperty('temperature');
        });

        const add = (text: string, knownBy: string[] = ['Mira Vance']) => JSON.stringify({ operations: [{ op: 'add', text, known_by: knownBy, cause: 'the promise' }] });
        const promise = add('{user} promised Mira Vance to come by on Sunday and fix the shop door.');
        const cases: { scene: string; check: string; good: string; bad: string }[] = [
            { scene: 'judge-waits', check: 'does not move on', good: QUIET, bad: '{"scene":{"reason":"he asked","move_on":true}}' },
            { scene: 'judge-moves', check: 'moves on', good: '{"scene":{"reason":"he asked her to dinner","move_on":true}}', bad: QUIET },
            { scene: 'judge-quiet', check: 'no Arc step', good: QUIET, bad: '{"arc_steps":[{"character":"Mira Vance","step":"Lets her guard down","cause":"the rain"}]}' },
            {
                scene: 'judge-quiet',
                check: 'keeps the Bond’s label',
                good: '{"bond_changes":[{"from":"Mira Vance","to":"user","label":"Curious warmth","description":"A little warmer.","cause":"the tea"}]}',
                bad: '{"bond_changes":[{"from":"Mira Vance","to":"user","label":"deep love","description":"She adores him.","cause":"the tea"}]}',
            },
            { scene: 'judge-facts', check: 'gives the nine years', good: '{"facts":[{"topic":"Mira’s years with the shop","fact":"nine years"}]}', bad: QUIET },
            { scene: 'judge-pressing', check: 'notes the pressing', good: '{"pressing":[{"character":"Mira Vance","for":"to ask what he came to ask"}]}', bad: QUIET },
            { scene: 'judge-quiet', check: 'notes no pressing', good: QUIET, bad: '{"pressing":[{"character":"Mira Vance","for":"to drink the tea"}]}' },
            { scene: 'judge-secret', check: 'reveals nothing', good: '{"secrets_revealed":[]}', bad: '{"secrets_revealed":[1]}' },
            { scene: 'memory-quiet', check: 'adds nothing', good: QUIET, bad: add('It rained harder than the day before.') },
            { scene: 'memory-promise', check: 'adds the promise', good: promise, bad: QUIET },
            { scene: 'memory-promise', check: 'writes {user}, never the name', good: promise, bad: add('Ash promised to fix the shop door on Sunday.') },
            { scene: 'memory-promise', check: 'known only by those present', good: promise, bad: add('{user} promised to fix the shop door on Sunday.', ['Mira Vance', 'Tobias Hale']) },
        ];

        it('every check of every Judge and Memory scene has an answer it passes and an answer it must fail', () => {
            const without = EVAL_SCENES.flatMap((one) => (one.kind === 'judge' || one.kind === 'memory' ? one.checks.map((check) => ({ scene: one.name, check: check.name })) : [])).filter(
                ({ scene: name, check }) => !cases.some((one) => one.scene === name && one.check === check),
            );

            expect(without).toEqual([]);
        });

        it.each(cases)('$scene: "$check" passes an answer that does it and fails one that does not', async ({ scene: name, check, good, bad }) => {
            const passed = await run([name], { background: () => ({ text: good }) }, { samples: 1 });
            const failed = await run([name], { background: () => ({ text: bad }) }, { samples: 1 });

            expect(score(passed.report, name, check)).toBe('1/1');
            expect(score(failed.report, name, check)).toBe('0/1');
            expect(failed.report.scenes[0].samples[0].results.find((result) => result.check === check)!.reason).not.toBe('');
        });

        it.each([
            ['judge-waits', 'reads as a judgement', 'does not move on'],
            ['memory-promise', 'reads as an extraction', 'adds the promise'],
        ])('%s: an answer the app’s parser cannot read fails "%s" and leaves the other checks not graded', async (name, readable, other) => {
            const { report } = await run([name], { background: (index) => (index === 0 ? { text: 'Nothing changed, I think.' } : {}) }, { samples: 2 });

            expect(score(report, name, readable)).toBe('1/2');
            expect(scores(report).find((row) => row.check === other)).toMatchObject({ scored: 1, notScored: 1 });
            expect(report.scenes[0].samples[0].results.find((result) => result.check === other)).toMatchObject({ outcome: 'not_graded', reason: 'the answer could not be read' });
        });
    });

    describe('a played Chat', () => {
        const evening = scene('evening') as ChatScene;
        /** Three turns of the evening, with only the check a test names. */
        const mini = (checks: ChatScene['checks'], graded: ChatScene['graded'] = []): ChatScene => ({ ...evening, name: 'mini', turns: evening.turns.slice(0, 3), checks, graded, gradedChat: [], gradedReplies: [] });
        const numbered = (index: number) => ({ text: `Mira set down cup ${index}.\n\n@Mira Vance: Reply ${index}.` });
        const sent = (request: RecordedRequest) => (request.body as { messages: { content: string }[] }).messages;

        it('plays the user’s turns in order through the turn prompt, each with the replies so far as its history, and keeps every reply', async () => {
            const { report, requests } = await run([mini([everyReply(parsesAsAReply)])], { play: numbered }, { samples: 1 });

            expect(requests.map((request) => request.role)).toEqual(['play', 'play', 'play']);
            expect(sent(requests[0]).at(-1)!.content).toContain(evening.turns[0]);
            expect(JSON.stringify(sent(requests[0]))).not.toContain('Reply 0.');
            const third = JSON.stringify(sent(requests[2]));
            expect(third).toContain('Reply 0.');
            expect(third).toContain(evening.turns[1]);
            expect(third).toContain('Reply 1.');
            expect(sent(requests[2]).at(-1)!.content).toContain(evening.turns[2]);
            expect(report.scenes[0]).toMatchObject({ name: 'mini', kind: 'chat' });
            expect(report.scenes[0].samples[0].replies).toEqual([0, 1, 2].map((index) => numbered(index).text));
            expect(report.scenes[0].samples[0].text).toContain(evening.turns[1]);
            expect(score(report, 'mini', 'every reply: parses')).toBe('1/1');
        });

        it('a check every reply must hold fails on one reply, and says which turn', async () => {
            const { report } = await run([mini([everyReply(parsesAsAReply)])], { play: (index) => (index === 1 ? { text: '@Stranger: Who are you?' } : numbered(index)) }, { samples: 1 });

            expect(score(report, 'mini', 'every reply: parses')).toBe('0/1');
            expect(report.scenes[0].samples[0].results[0].reason).toBe('turn 2: unknown speaker: Stranger');
        });

        it('a phrase the first replies shared fails the Chat when a later reply writes it again, and not when it is dropped', async () => {
            const openings = ['The rain kept on.', 'A cart rattled past outside.', 'Somewhere a clock struck nine.'];
            const stock = (index: number) => `${openings[index]} Her fingers drummed the worn oak counter.\n\n@Mira Vance: Reply ${index}.`;
            const check = dropsRepeatedPhrases(['Mira Vance', 'Ash']);

            const again = await run([mini([check])], { play: (index) => ({ text: stock(index) }) }, { samples: 1 });
            const dropped = await run([mini([check])], { play: (index) => (index === 2 ? numbered(index) : { text: stock(index) }) }, { samples: 1 });

            expect(score(again.report, 'mini', check.name)).toBe('0/1');
            expect(again.report.scenes[0].samples[0].results[0].reason).toBe('turn 3: "Her fingers drummed the worn oak counter"');
            expect(score(dropped.report, 'mini', check.name)).toBe('1/1');
        });

        it('sends one grader call a played Chat, about the reply to its last turn', async () => {
            const { report, requests } = await run([mini([], evening.graded)], { play: numbered }, { samples: 1 });

            const graders = requests.filter((request) => request.role === 'grader');
            expect(graders).toHaveLength(1);
            const asked = sent(graders[0]).at(-1)!.content;
            expect(asked).toContain(evening.turns[2]);
            expect(asked).toContain('- Reply 2.');
            expect(asked).not.toContain('Reply 1.');
            expect(score(report, 'mini', 'sounds like Mira')).toBe('1/1');
        });

        it('a check about the whole Chat sends one more grader call, with every turn and its reply in order, and reads its answer', async () => {
            const whole = { name: 'keeps to the weather', criterion: 'Nobody speaks of anything but the weather.' };
            const { report, requests } = await run([{ ...mini([]), gradedChat: [whole] }], { play: numbered, grader: () => ({ text: '{"checks":[{"name":"keeps to the weather","quote":"Reply 1.","pass":false}]}' }) }, { samples: 1 });

            const graders = requests.filter((request) => request.role === 'grader');
            expect(graders).toHaveLength(1);
            const asked = sent(graders[0]).at(-1)!.content;
            expect(asked.indexOf(evening.turns[0])).toBeLessThan(asked.indexOf('Reply 0.'));
            expect(asked.indexOf('Reply 0.')).toBeLessThan(asked.indexOf(evening.turns[1]));
            expect(asked).toContain(evening.turns[2]);
            expect(asked).toContain('Reply 2.');
            expect(asked).toContain(whole.criterion);
            expect(score(report, 'mini', whole.name)).toBe('0/1');
            expect(report.scenes[0].samples[0].results.at(-1)).toEqual({ check: whole.name, kind: 'graded', outcome: 'fail', reason: 'Reply 1.' });
        });

        it('the slow scene is played under the slow-burn pacing line', () => {
            const slow = scene('slow') as ChatScene;

            expect(buildTurnPrompt({ ...slow.input, userText: slow.turns[0] }).messages.map((message) => message.content).join('\n')).toContain('Pacing: slow burn.');
        });

        it('a call that fails part way is a failed sample with its error, and the Chat stops there', async () => {
            const { report, requests } = await run([mini([everyReply(parsesAsAReply)])], { play: (index) => (index === 1 ? { status: 400 } : numbered(index)) }, { samples: 1 });

            expect(requests).toHaveLength(2);
            expect(report.scenes[0].samples[0]).toMatchObject({ text: null, results: [] });
            expect(report.scenes[0].samples[0].error).not.toBeNull();
        });

        it('is played at most its own number of times, whatever the run’s samples', async () => {
            const { report, requests } = await run([{ ...mini([everyReply(parsesAsAReply)]), mostSamples: 2 }], { play: numbered }, { samples: 3 });

            expect(requests).toHaveLength(6);
            expect(report.scenes[0].samples).toHaveLength(2);
        });

        it('is in the prose table, read over all its replies', async () => {
            // Three replies of 13 words, each with one listed phrase.
            const { report } = await run([mini([])], { play: () => ({ text: 'Mira took a deep breath.\n\n@Mira Vance: You came back. I was hoping you would.' }) }, { samples: 1 });

            const card = formatScorecard(report);
            expect(card.slice(card.indexOf('## Prose'))).toContain('| mini | 39 | 76.9 |');
        });

        it('says what it would send before spending: a call a turn, and one grader call, for each time it is played', async () => {
            const router = scriptedOpenRouter();
            const started = startEvalRun({ EVAL_SCENES: 'evening', EVAL_SAMPLES: '5' }, { fetch: router.fetchImpl, reportDir: mkdtempSync(path.join(tmpdir(), 'eval-')), log: () => {}, git: () => GIT });

            // Ten turns and two grader calls (the last reply, and a verdict a reply), played twice at most.
            await expect(started).rejects.toThrow('would send 24 calls');
        });

        it('with every play model asked for, is played on each', async () => {
            const router = scriptedOpenRouter();
            const env = { EVAL_SPEND: 'yes', EVAL_SCENES: 'evening', EVAL_MODEL: 'all', EVAL_SAMPLES: '1', OPENROUTER_API_KEY: 'sk-or-test-not-a-real-key' };

            await startEvalRun(env, { fetch: router.fetchImpl, reportDir: mkdtempSync(path.join(tmpdir(), 'eval-')), log: () => {}, git: () => GIT });

            const models = router.requests.filter((request) => request.role === 'play').map((request) => (request.body as { model: string }).model);
            expect(models.filter((model) => model === 'z-ai/glm-5.3')).toHaveLength(10);
            expect(models.filter((model) => model === 'deepseek/deepseek-v4-pro')).toHaveLength(10);
        });

        /** Ten replies that pass every check of the evening: each its own words, nine years said to turns 2 and 9. */
        const fine = [
            'Mira unlocked the door.\n\n@Mira Vance: You are dripping. Come in.',
            'She glanced at the shelf he touched.\n\n@Mira Vance: Nine years. Counting, are we?',
            'She eyed the bag.\n\n@Mira Vance: Too much? Tragic. Hand it over.',
            'She tilted the cover toward him.\n\n@Mira Vance: Poems. Bad ones.',
            'She shut the book.\n\n@Mira Vance: Worse. Want to hear it?',
            'She raised her mug.\n\n@Mira Vance: Three weeks of swearing. Did it help?',
            'She looked round the shop.\n\n@Mira Vance: And do what, exactly?',
            'Rain ran down the window.\n\n@Mira Vance: Mind? I was going to charge rent.',
            'She followed his eyes to the sign.\n\n@Mira Vance: Nine. You asked already, you know.',
            'She took his cup.\n\n@Mira Vance: Tomorrow? Bring more bread.',
        ];
        const but = (changes: Record<number, string>) => (index: number) => ({ text: changes[index] ?? fine[index] });
        const stock = 'Her fingers drummed the worn oak counter.';
        const cases: { check: string; bad: Record<number, string> }[] = [
            { check: 'every reply: parses', bad: { 3: '@Stranger: Who are you?' } },
            { check: 'every reply: no line as the user', bad: { 3: '@Mira Vance: Well?\n\n@Ash: I came to ask you out.' } },
            { check: 'every reply: Mira Vance speaks', bad: { 4: 'Mira said nothing at all.' } },
            { check: 'turn 2: says nine', bad: { 1: '@Mira Vance: Long enough.' } },
            { check: 'turn 9: says nine', bad: { 8: '@Mira Vance: Long enough. You asked already.' } },
            { check: 'drops phrases the earlier replies shared', bad: { 4: `${stock}\n\n@Mira Vance: Worse.`, 5: `${stock}\n\n@Mira Vance: Did it help?`, 6: `${stock}\n\n@Mira Vance: And do what?` } },
        ];

        describe('a check asked of each reply', () => {
            const pressing = evening.gradedReplies[0];
            /** A grader answer that serves both of the evening's grader calls: the last reply's checks, and a verdict a reply. */
            const verdicts = (yes: boolean[]) => ({
                text: JSON.stringify({ checks: [{ name: 'x', quote: 'q', pass: true }], replies: yes.map((one, index) => ({ reply: index + 1, quote: `close ${index + 1}`, yes: one })) }),
            });
            const pressedAt = (...turns: number[]) => verdicts(evening.turns.map((_, index) => turns.includes(index + 1)));

            it('sends one grader call a played Chat, with every turn and its reply and the one question, and reads a verdict a reply', async () => {
                const { report, requests } = await run([{ ...mini([]), gradedReplies: [pressing] }], { play: numbered, grader: () => verdicts([false, true, false]) }, { samples: 1 });

                const graders = requests.filter((request) => request.role === 'grader');
                expect(graders).toHaveLength(1);
                const asked = sent(graders[0]).at(-1)!.content;
                expect(asked.indexOf(evening.turns[0])).toBeLessThan(asked.indexOf('Reply 0.'));
                expect(asked).toContain(evening.turns[2]);
                expect(asked).toContain('Reply 2.');
                expect(asked).toContain(pressing.question);
                expect(score(report, 'mini', pressing.name)).toBe('1/1');
                expect(report.scenes[0].samples[0].results.at(-1)).toEqual({ check: pressing.name, kind: 'graded', outcome: 'pass', reason: 'turn 2 of 3: "close 2"' });
            });

            it('the grader only answers reply by reply; code counts: three replies in a row fail the Chat, and so does half of them', async () => {
                const play = (grader: ReturnType<typeof verdicts>) => run(['evening'], { play: but({}), grader: () => grader }, { samples: 1 });

                const inARow = await play(pressedAt(5, 6, 7));
                const half = await play(pressedAt(1, 3, 5, 7, 9));
                const apart = await play(pressedAt(2, 5, 9));
                const twoInARow = await play(pressedAt(5, 6));

                expect(score(inARow.report, 'evening', pressing.name)).toBe('0/1');
                expect(inARow.report.scenes[0].samples[0].results.at(-1)!.reason).toBe('turns 5, 6, 7 of 10: "close 5"; "close 6"; "close 7"');
                expect(score(half.report, 'evening', pressing.name)).toBe('0/1');
                expect(score(apart.report, 'evening', pressing.name)).toBe('1/1');
                expect(score(twoInARow.report, 'evening', pressing.name)).toBe('1/1');
            });

            it('is not graded when the grader left a reply out or could not be read: never a pass or a fail', async () => {
                const short = await run([{ ...mini([]), gradedReplies: [pressing] }], { play: numbered, grader: () => verdicts([false, true]) }, { samples: 1 });
                const unread = await run([{ ...mini([]), gradedReplies: [pressing] }], { play: numbered, grader: () => ({ text: 'They all seem fine.' }) }, { samples: 1 });

                expect(short.report.scenes[0].samples[0].results.at(-1)).toEqual({ check: pressing.name, kind: 'graded', outcome: 'not_graded', reason: 'the grader gave 2 verdicts for 3 replies' });
                expect(unread.report.scenes[0].samples[0].results.at(-1)).toMatchObject({ outcome: 'not_graded' });
            });

            it('the evening asks it in place of the whole-Chat check, and a second evening has a Character with no asking line on her card', () => {
                expect(evening.gradedChat).toEqual([]);
                expect(evening.gradedReplies.map((check) => check.name)).toEqual(['does not keep pressing']);
                const unasked = scene('unasked') as ChatScene;
                expect(unasked.turns).toEqual(evening.turns);
                expect(unasked.gradedReplies).toEqual(evening.gradedReplies);
                const prompt = (one: ChatScene) => buildTurnPrompt({ ...one.input, userText: one.turns[0] }).messages.map((message) => message.content).join(' ');
                expect(prompt(evening)).toContain('Ask me properly');
                expect(prompt(unasked)).not.toMatch(/ask me|asks questions|ask mira out/i);
            });
        });

        it('every check of the evening has a Chat it must fail', () => {
            expect(evening.checks.map((check) => check.name).filter((name) => !cases.some((one) => one.check === name))).toEqual([]);
        });

        it.each(cases)('evening: "$check" passes a Chat that does it and fails one that does not', async ({ check, bad }) => {
            const passed = await run(['evening'], { play: but({}) }, { samples: 1 });
            const failed = await run(['evening'], { play: but(bad) }, { samples: 1 });

            expect(score(passed.report, 'evening', check)).toBe('1/1');
            expect(score(failed.report, 'evening', check)).toBe('0/1');
        });
    });

    it('a failed play call is a failed sample with its error, apart from the score, and the run carries on', async () => {
        const { report } = await run(['format'], { play: (index) => (index === 1 ? { status: 400 } : {}) });

        expect(report.scenes[0].samples.map((sample) => sample.text === null)).toEqual([false, true, false]);
        expect(report.scenes[0].samples[1].error).toEqual(expect.any(String));
        expect(scores(report).find((row) => row.check === 'parses')).toMatchObject({ pass: 2, scored: 2, notScored: 1 });
        expect(formatScorecard(report)).toContain('- format, sample 2: the call failed:');
    });

    describe('the cap', () => {
        it('stops before a call that would take the running total past the cap, and says so', async () => {
            // Each call is billed $0.004; a turn's worst case is under a cent, so the cap is reached mid-run.
            const { report, requests } = await run(['format', 'length'], { play: () => ({ cost: 0.004 }) }, { capUsd: 0.012 });

            expect(report.stoppedAtCap).toBe(true);
            expect(requests.length).toBeLessThan(6);
            expect(report.totalUsd).toBeLessThanOrEqual(0.012);
            expect(formatScorecard(report)).toContain('stopped at the cap: the scorecard is not complete');
        });

        it('counts calls in flight at their worst case, so parallel calls cannot pass it together', async () => {
            const { report, requests, flight } = await run(['format', 'length'], { play: () => ({ cost: 0.004 }), delayMs: 5 }, { capUsd: 0.012, concurrency: 4 });

            expect(report.stoppedAtCap).toBe(true);
            expect(report.totalUsd).toBeLessThanOrEqual(0.012);
            // A turn's worst case is about $0.003: four in flight would need the whole cap at once.
            expect(flight.peak).toBeLessThan(4);
            expect(requests.length).toBeLessThan(6);
        });

        it('counts what the command already spent on another model', async () => {
            const { report, requests } = await run(['format'], {}, { capUsd: 0.5, spentUsd: 0.4999 });

            expect(requests).toEqual([]);
            expect(report).toMatchObject({ stoppedAtCap: true, totalUsd: 0 });
        });
    });

    it('plays calls in parallel up to the number asked, and keeps each scene’s samples in order', async () => {
        const texts = ['@Mira Vance: One.', '@Mira Vance: Two.', '@Mira Vance: Three.', '@Mira Vance: Four.', '@Mira Vance: Five.', '@Mira Vance: Six.'];
        const { report, flight } = await run(['format', 'length'], { play: (index) => ({ text: texts[index] }), delayMs: 5 }, { concurrency: 3 });

        expect(flight.peak).toBe(3);
        expect(report.scenes.map((one) => one.samples.map((sample) => sample.text))).toEqual([texts.slice(0, 3), texts.slice(3)]);
    });

    it('records the commit, each call’s model, tokens, cached tokens and cost, each reply and each result, and names its files by time and model', async () => {
        const { report } = await run(['voice'], { play: () => ({ cached: 60 }) }, { samples: 1 });
        const dir = mkdtempSync(path.join(tmpdir(), 'eval-'));

        const files = writeEvalReport(report, dir);

        expect(path.basename(files.json)).toMatch(/^eval-\d{4}-\d{2}-\d{2}T[\d-]+Z-glm-5\.3\.json$/);
        expect(existsSync(files.scorecard)).toBe(true);
        const written = JSON.parse(readFileSync(files.json, 'utf8')) as EvalReport;
        expect(written).toMatchObject({ commit: 'abc1234', dirty: false, model: 'glm-5.3', totalUsd: 0.002 });
        expect(written.calls).toEqual([
            { scene: 'voice', role: 'play', model: 'z-ai/glm-5.3', finishReason: 'stop', promptTokens: 100, completionTokens: 20, cachedTokens: 60, costUsd: 0.001, error: null },
            { scene: 'voice', role: 'grader', model: GRADER_MODEL, finishReason: 'stop', promptTokens: 100, completionTokens: 20, cachedTokens: null, costUsd: 0.001, error: null },
        ]);
        expect(written.scenes[0].samples[0].text).toBe(GOOD);
    });

    it('the scorecard says what share of the prompt tokens the host read from its cache, counting only calls that reported one', async () => {
        const cached = await run(['format'], { play: (index) => ({ cached: index === 0 ? 0 : 80 }) });
        const silent = await run(['format']);

        expect(formatScorecard(cached.report)).toContain('The host read 160 of 300 prompt tokens from its cache (53%).');
        expect(formatScorecard(silent.report)).not.toContain('from its cache');
    });

    describe('prose', () => {
        /** The line of the scorecard's prose table for a scene. */
        const proseLine = (card: string, sceneName: string) =>
            card
                .slice(card.indexOf('## Prose'))
                .split('\n')
                .find((line) => line.startsWith(`| ${sceneName} |`));

        it('scores each turn scene’s replies for overused words and phrases, a thousand words, and names the ones found', async () => {
            // 13 words once the "@Mira Vance:" prefix is off; "took (a) deep breath" is one listed phrase: 1 in 13 is 76.9 a thousand.
            const worn = 'Mira took a deep breath.\n\n@Mira Vance: You came back. I was hoping you would.';
            const { report } = await run(['format'], { play: () => ({ text: worn }) });

            const line = proseLine(formatScorecard(report), 'format');

            expect(line).toContain('| 76.9 |');
            expect(line).toContain('took deep breath (3)');
        });

        it('a reply with no listed word or phrase scores nothing', async () => {
            const { report } = await run(['format']);

            expect(proseLine(formatScorecard(report), 'format')).toContain('| 0.0 |');
        });

        it('a listed name is counted when the model chose it, and not when the scene’s own Character bears it', async () => {
            // "elara" is on the list. 16 words once the prefix is off: 1 in 16 is 62.5 a thousand.
            const reply = 'Elara looked up from the ledger and smiled.\n\n@Elara Voss: You came back. I was hoping you would.';
            const format = turnScene('format');
            const hers: TurnScene = {
                ...format,
                name: 'hers',
                expects: [],
                input: { ...format.input, story: { ...format.input.story, characters: format.input.story.characters.map((character) => ({ ...character, name: 'Elara Voss' })) } },
            };

            const { report } = await run(['format', hers], { play: () => ({ text: reply }) });
            const card = formatScorecard(report);

            expect(proseLine(card, 'format')).toContain('| 62.5 |');
            expect(proseLine(card, 'format')).toContain('elara (3)');
            expect(proseLine(card, 'hers')).toContain('| 0.0 |');
        });

        it('names a phrase that several samples of a scene share, and none when each sample says its own', async () => {
            const openings = ['The rain kept on.', 'A cart rattled past outside.', 'Somewhere a clock struck nine.'];
            const stock = (index: number) => ({ text: `${openings[index]} Her fingers drummed the worn oak counter.\n\n@Mira Vance: You came back.` });
            const fresh = (index: number) => ({ text: `${openings[index]}\n\n@Mira Vance: ${['Sit.', 'Tea?', 'Late again.'][index]}` });

            const shared = proseLine(formatScorecard((await run(['format'], { play: stock })).report), 'format');
            const own = proseLine(formatScorecard((await run(['format'], { play: fresh })).report), 'format');

            expect(shared).toContain('"Her fingers drummed the worn oak counter"');
            expect(own).toMatch(/\| - \|$/);
        });

        it('shows the earlier run’s number beside this one’s, read from the earlier run’s played text', async () => {
            const worn = 'Mira took a deep breath.\n\n@Mira Vance: You came back. I was hoping you would.';
            const earlier = (await run(['format'], { play: () => ({ text: worn }) })).report;
            // A report written before the prose table has no names on its scenes.
            for (const one of earlier.scenes) delete one.names;
            const now = (await run(['format'])).report;

            expect(proseLine(formatScorecard(now, earlier), 'format')).toContain('| 0.0 | 76.9 |');
        });

        it('leaves Judge and Memory scenes out, and a scene whose every call failed', async () => {
            const { report } = await run(['judge-quiet', 'format'], { play: () => ({ status: 500 }) });

            expect(formatScorecard(report)).not.toContain('## Prose');
        });
    });

    describe('what moved since an earlier run', () => {
        const row = (pass: number, scored: number): Score => ({ scene: 'format', check: 'parses', kind: 'code', pass, scored, notScored: 0 });

        it('marks a check better or worse only when chance alone would rarely move it that far', () => {
            // Five samples each: three samples' difference clears the bar, two do not.
            expect(compare(row(2, 5), row(5, 5))).toBe('worse');
            expect(compare(row(1, 5), row(4, 5))).toBe('worse');
            expect(compare(row(5, 5), row(2, 5))).toBe('better');
            expect(compare(row(2, 5), row(4, 5))).toBe('unchanged');
            expect(compare(row(4, 5), row(4, 5))).toBe('unchanged');
            // Three samples each: only all against none.
            expect(compare(row(0, 3), row(3, 3))).toBe('worse');
            expect(compare(row(3, 3), row(0, 3))).toBe('better');
            expect(compare(row(0, 3), row(2, 3))).toBe('unchanged');
            // Runs of different sizes compare by the same rule.
            expect(compare(row(4, 10), row(3, 3))).toBe('worse');
            expect(compare(row(9, 10), row(3, 3))).toBe('slipped');
        });

        it('marks a check that passed every sample and now fails some as slipped, when that is within chance', () => {
            expect(compare(row(4, 5), row(5, 5))).toBe('slipped');
            expect(compare(row(3, 5), row(5, 5))).toBe('slipped');
            expect(compare(row(2, 3), row(3, 3))).toBe('slipped');
        });

        it('a check the earlier run did not have is new, and one either run could not score is unchanged', () => {
            expect(compare(row(3, 3), undefined)).toBe('new');
            expect(compare(row(0, 0), row(3, 3))).toBe('unchanged');
        });

        it('shows the earlier score and the change on the scorecard', async () => {
            const replies = (bad: number) => ({ play: (index: number) => ({ text: index < bad ? '@Stranger: Who are you?' : GOOD }) });
            const card = async (before: number, after: number) => {
                const earlier = (await run(['format'], replies(before))).report;
                const now = (await run(['format'], replies(after))).report;
                return formatScorecard(now, earlier).split('\n').find((line) => line.startsWith('| format | parses'))!;
            };

            expect(await card(0, 0)).toContain('| 3 of 3 | 3 of 3 | unchanged |');
            expect(await card(0, 1)).toContain('| 2 of 3 | 3 of 3 | slipped |');
            expect(await card(0, 3)).toContain('| 0 of 3 | 3 of 3 | worse |');
            expect(await card(3, 0)).toContain('| 3 of 3 | 0 of 3 | better |');
        });
    });
});

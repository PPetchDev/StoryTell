import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildTurnPrompt, stopStrings } from '../src/manager/chat/turn/prompt.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { CANDIDATE_MODELS, CandidateModel } from '../src/service/model-gateway/real/model-table.js';
import { OpenRouterClient } from '../src/service/model-gateway/real/openrouter-client.js';
import vitestConfig from '../vitest.config.js';
import { RecordedRequest } from './harness/recorded-fetch.js';
import { DEFAULT_REPORT_DIR, runSmoke, startSmokeRun, writeReport } from './live/smoke-run.js';
import { SMOKE_STORY, smokeTurnInput, SMOKE_USER_TURNS } from './live/smoke-story.js';

const API_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SAMPLER_KEYS = ['temperature', 'min_p', 'top_p', 'repetition_penalty'];

/** A scripted OpenRouter: each answer a synthetic chat completion, with the usage `bill` gives it. */
function scriptedOpenRouter(bill: (request: RecordedRequest, index: number) => { cost?: number; reasoning?: number; text?: string } = () => ({})) {
    const requests: RecordedRequest[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
        const request: RecordedRequest = {
            url,
            method: init.method ?? 'GET',
            headers: (init.headers ?? {}) as Record<string, string>,
            body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        };
        requests.push(request);
        const { cost = 0.001, reasoning = 0, text = '@Mira: A synthetic line.' } = bill(request, requests.length - 1);
        const json = {
            id: `gen-${requests.length}`,
            choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
            usage: { prompt_tokens: 100, completion_tokens: 20, cost, completion_tokens_details: { reasoning_tokens: reasoning } },
        };
        return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
    return { requests, client: new OpenRouterClient('sk-or-test-not-a-real-key', fetchImpl, async () => {}) };
}

const CANDIDATES = Object.keys(CANDIDATE_MODELS) as CandidateModel[];

// Spec (models-and-samplers): "The live smoke run". Every answer here is scripted; nothing
// reaches OpenRouter, and nothing is played.
describe('The live smoke run', () => {
    describe('starting', () => {
        it('is not collected by the normal test run', () => {
            const live = path.join(API_ROOT, 'test/live/smoke.live.ts');
            expect(existsSync(live)).toBe(true);
            const include = vitestConfig.test?.include ?? [];
            expect(include.length).toBeGreaterThan(0);
            for (const pattern of include) {
                expect(path.matchesGlob('test/live/smoke.live.ts', pattern)).toBe(false);
                expect(path.matchesGlob('test/live/smoke-run.ts', pattern)).toBe(false);
            }
        });

        it('refuses to start without the spend flag, before reading a key or touching the network', async () => {
            const network = vi.fn<FetchLike>();

            await expect(startSmokeRun({ SMOKE_CANDIDATES: 'all' }, { fetch: network, reportDir: tmpdir(), log: () => {} })).rejects.toThrow(
                'The live smoke run spends OpenRouter credit. Start it with --spend.',
            );
            await expect(
                startSmokeRun({ SMOKE_CANDIDATES: 'all', SMOKE_SPEND: 'no' }, { fetch: network, reportDir: tmpdir(), log: () => {} }),
            ).rejects.toThrow('--spend');
            expect(network).not.toHaveBeenCalled();
        });

        it('refuses without a key or with an unknown candidate', async () => {
            const network = vi.fn<FetchLike>();
            const deps = { fetch: network, reportDir: tmpdir(), log: () => {} };

            await expect(startSmokeRun({ SMOKE_SPEND: 'yes', SMOKE_CANDIDATES: 'all' }, deps)).rejects.toThrow('OPENROUTER_API_KEY');
            await expect(
                startSmokeRun({ SMOKE_SPEND: 'yes', SMOKE_CANDIDATES: 'gpt-9', OPENROUTER_API_KEY: 'sk-or-test' }, deps),
            ).rejects.toThrow('Unknown candidate "gpt-9". Name one of kimi-k3.1-pro, kimi-k2.6, qwen3.5-397b, or all.');
            await expect(startSmokeRun({ SMOKE_SPEND: 'yes', OPENROUTER_API_KEY: 'sk-or-test' }, deps)).rejects.toThrow('Name a candidate');
            expect(network).not.toHaveBeenCalled();
        });
    });

    describe.each(CANDIDATES)('the calls for %s', (candidate) => {
        const spec = CANDIDATE_MODELS[candidate];
        const tries = spec.reasoningToTry.length;

        it('pins every call to DeepInfra with no fallback, and tries each reasoning setting in order on a tiny prompt', async () => {
            const net = scriptedOpenRouter();

            await runSmoke({ candidates: [candidate], client: net.client });

            expect(net.requests).toHaveLength(tries + 5);
            for (const request of net.requests) {
                expect(request.url).toBe('https://openrouter.ai/api/v1/chat/completions');
                expect(request.body.model).toBe(spec.id);
                expect(request.body.provider).toMatchObject({ only: ['deepinfra'], allow_fallbacks: false });
            }
            expect(net.requests.slice(0, tries).map((request) => request.body.reasoning)).toEqual(spec.reasoningToTry);
            for (const request of net.requests.slice(0, tries)) {
                expect(Object.keys(request.body).filter((key) => SAMPLER_KEYS.includes(key))).toEqual([]);
                expect(request.body.messages.map((m: { content: string }) => m.content).join(' ').length).toBeLessThan(400);
            }
        });

        it('probes the stop strings the turn uses', async () => {
            const net = scriptedOpenRouter();

            await runSmoke({ candidates: [candidate], client: net.client });

            const probe = net.requests[tries].body;
            expect(probe.stop).toEqual(stopStrings('Ash'));
            // The text it is asked to copy runs past the marker.
            expect(probe.messages.at(-1).content).toContain('\n@Ash: ');
        });

        it('sends every offered sampler value on a short turn, and requires them', async () => {
            const net = scriptedOpenRouter();

            await runSmoke({ candidates: [candidate], client: net.client });

            const body = net.requests[tries + 1].body;
            expect(Object.keys(body).filter((key) => SAMPLER_KEYS.includes(key)).sort()).toEqual([...SAMPLER_KEYS].sort());
            const suggested = spec.facts.suggested as { temperature?: number; topP?: number };
            expect(body).toMatchObject({
                temperature: suggested.temperature ?? 0.8,
                min_p: 0.05,
                top_p: suggested.topP ?? 0.95,
                repetition_penalty: 1.05,
                provider: { only: ['deepinfra'], allow_fallbacks: false, require_parameters: true },
            });
        });

        it('plays two turns of the synthetic adult Story through the real turn prompt builder, then asks for Suggested replies', async () => {
            const net = scriptedOpenRouter((_, index) => ({ text: index === tries + 2 ? '@Mira: First synthetic reply.' : undefined }));

            await runSmoke({ candidates: [candidate], client: net.client });

            const [first, second, suggestions] = net.requests.slice(tries + 2).map((request) => request.body);
            const firstPrompt = buildTurnPrompt(smokeTurnInput([], SMOKE_USER_TURNS[0]));
            expect(first.messages).toEqual(firstPrompt.messages);
            expect(first.max_tokens).toBe(firstPrompt.maxTokens);
            expect(first.stop).toEqual(firstPrompt.stop);
            // The second turn carries the first exchange as history.
            const secondPrompt = buildTurnPrompt(
                smokeTurnInput(
                    [
                        { role: 'user', text: SMOKE_USER_TURNS[0] },
                        { role: 'assistant', text: '@Mira: First synthetic reply.' },
                    ],
                    SMOKE_USER_TURNS[1],
                ),
            );
            expect(second.messages).toEqual(secondPrompt.messages);
            expect(suggestions.messages.at(-1).role).toBe('user');
            expect(suggestions.messages.at(-1).content).toContain('Suggest three short options');
            for (const body of [first, second, suggestions]) {
                expect(Object.keys(body).filter((key) => SAMPLER_KEYS.includes(key))).toEqual([]);
            }
        });
    });

    it('plays on the reasoning setting that used the fewest reasoning tokens', async () => {
        const reasoningBy: Record<string, number> = { none: 40, minimal: 0, disabled: 12 };
        const net = scriptedOpenRouter((request) => {
            const reasoning = request.body.reasoning;
            const key = 'effort' in reasoning ? reasoning.effort : 'disabled';
            return { reasoning: reasoningBy[key] };
        });

        const report = await runSmoke({ candidates: ['kimi-k3.1-pro'], client: net.client });

        for (const request of net.requests.slice(3)) expect(request.body.reasoning).toEqual({ effort: 'minimal' });
        expect(report.calls.slice(0, 3).map((call) => call.reasoningTokens)).toEqual([40, 0, 12]);
    });

    it('stops before a call that would take the running total past the cap', async () => {
        const net = scriptedOpenRouter(() => ({ cost: 0.2499 }));

        const report = await runSmoke({ candidates: ['kimi-k2.6', 'qwen3.5-397b'], client: net.client });

        // $0.4998 after two calls: the third, however small, would pass $0.50.
        expect(net.requests).toHaveLength(2);
        expect(report.totalUsd).toBeCloseTo(0.4998, 6);
        expect(report.stoppedAtCap).toBe(true);
        expect(report.capUsd).toBe(0.5);
        expect(report.calls).toHaveLength(2);
    });

    it('records each call’s model, reasoning, text, finish reason, tokens, cost and error in the report', async () => {
        const net = scriptedOpenRouter((_, index) => ({ cost: 0.002, reasoning: index === 0 ? 7 : 0, text: `Synthetic answer ${index}.` }));

        const report = await runSmoke({ candidates: ['qwen3.5-397b'], client: net.client });

        expect(report.calls[0]).toEqual({
            candidate: 'qwen3.5-397b',
            model: 'qwen/qwen3.5-397b-a17b',
            step: 'reasoning',
            reasoning: { enabled: false },
            samplers: null,
            text: 'Synthetic answer 0.',
            finishReason: 'stop',
            promptTokens: 100,
            completionTokens: 20,
            reasoningTokens: 7,
            costUsd: 0.002,
            error: null,
            check: '7 reasoning tokens',
        });
        expect(report.calls.map((call) => call.step)).toEqual([
            'reasoning',
            'reasoning',
            'stop_probe',
            'samplers',
            'adult_turn_1',
            'adult_turn_2',
            'suggested_replies',
        ]);
        expect(report.totalUsd).toBeCloseTo(0.014, 6);
    });

    it('records a failed call’s error and carries on', async () => {
        let calls = 0;
        const failing: FetchLike = async () => {
            calls += 1;
            if (calls === 1) {
                return new Response(JSON.stringify({ error: { code: 400, message: 'Reasoning is mandatory for this endpoint' } }), {
                    status: 400,
                    headers: { 'content-type': 'application/json' },
                });
            }
            const json = { choices: [{ message: { content: 'ok' }, finish_reason: 'stop' }], usage: { prompt_tokens: 1, completion_tokens: 1, cost: 0.0001 } };
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };

        const report = await runSmoke({ candidates: ['kimi-k2.6'], client: new OpenRouterClient('sk-or-test', failing, async () => {}) });

        expect(report.calls[0]).toMatchObject({ step: 'reasoning', error: 'OpenRouter: Reasoning is mandatory for this endpoint', text: null, costUsd: 0 });
        expect(report.calls).toHaveLength(7);
        // The setting that failed is not the one played on.
        expect(report.calls[2].reasoning).toEqual({ effort: 'none' });
    });

    it('writes the report under .data, which git ignores', () => {
        const repoRoot = path.resolve(API_ROOT, '../..');
        expect(DEFAULT_REPORT_DIR).toBe(path.join(repoRoot, '.data', 'smoke-runs'));
        expect(readFileSync(path.join(repoRoot, '.gitignore'), 'utf8').split(/\r?\n/)).toContain('.data/');

        const dir = mkdtempSync(path.join(tmpdir(), 'smoke-report-'));
        const file = writeReport(
            { startedAt: '2026-11-09T00:00:00.000Z', candidates: ['kimi-k2.6'], capUsd: 0.5, totalUsd: 0, stoppedAtCap: false, calls: [] },
            dir,
        );
        expect(path.dirname(file)).toBe(dir);
        expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ candidates: ['kimi-k2.6'] });
    });

    it('plays a synthetic Story of its own, whose Characters are all adults', () => {
        const people = [SMOKE_STORY.identity, ...SMOKE_STORY.story.characters.map((c) => ({ name: c.name, description: c.background }))];
        for (const person of people) {
            const age = Number(person.description.match(/\b(\d{2}) years old\b/)?.[1]);
            expect(age, person.name).toBeGreaterThanOrEqual(21);
        }
    });
});

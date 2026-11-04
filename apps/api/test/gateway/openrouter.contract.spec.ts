import {
    ModelRefusalError,
    OutOfCreditError,
    ProviderOutageError,
    UnparseableOutputError,
} from '../../src/errors/model-gateway.errors.js';
import { MAX_RETRIES } from '../../src/service/model-gateway/real/http.js';
import { gatewayUnderTest } from '../harness/gateway-under-test.js';
import { recordedFetch, unreachableFetch } from '../harness/recorded-fetch.js';

const CHAT_URL = 'https://openrouter.ai/api/v1/chat/completions';

const messages = [
    { role: 'system' as const, content: 'You narrate a synthetic test scene.' },
    { role: 'user' as const, content: 'Hello?' },
];

// Spec: Testing Decisions, "Model Gateway contract tests". Every response here is a recorded,
// synthetic fixture under test/fixtures/openrouter; none is played text.
describe('OpenRouter contract', () => {
    describe('request shape per model', () => {
        it('plays turns on GLM-5.3 pinned to DeepInfra, with minimal reasoning and stop strings', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'glm-5.3' } });

            await gateway.completeText({ kind: 'turn', messages, maxTokens: 600, stop: ['\n@You:'] });

            expect(net.requests[0].url).toBe(CHAT_URL);
            expect(net.requests[0].headers.Authorization).toMatch(/^Bearer /);
            expect(net.requests[0].body).toMatchObject({
                model: 'z-ai/glm-5.3',
                provider: { only: ['deepinfra'], allow_fallbacks: false },
                reasoning: { effort: 'minimal' },
                stop: ['\n@You:'],
                max_tokens: 600,
                messages,
            });
            expect(net.requests[0].body).not.toHaveProperty('response_format');
        });

        it('plays turns on DeepSeek V4 Pro pinned to GMICloud, reasoning off, and never sends stop strings', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'deepseek-v4-pro' } });

            const result = await gateway.completeText({ kind: 'turn', messages, stop: ['\n@You:'] });

            expect(net.requests[0].body).toMatchObject({
                model: 'deepseek/deepseek-v4-pro',
                provider: { only: ['gmicloud'], allow_fallbacks: false },
                reasoning: { enabled: false },
            });
            expect(net.requests[0].body).not.toHaveProperty('stop');
            expect(result.model).toBe('deepseek-v4-pro');
        });

        it.each(['judge', 'memory_extraction', 'snapshot_prompt'] as const)(
            'sends %s to DeepSeek V4 Flash on DeepInfra, reasoning off, in JSON mode',
            async (kind) => {
                const net = recordedFetch([{ fixture: 'openrouter/chat-json.json' }]);
                // The play model setting must not leak into background calls.
                const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'deepseek-v4-pro' } });

                const result = await gateway.completeText({ kind, messages, json: true, stop: ['```'] });

                expect(net.requests[0].body).toMatchObject({
                    model: 'deepseek/deepseek-v4-flash',
                    provider: { only: ['deepinfra'], allow_fallbacks: false },
                    reasoning: { enabled: false },
                    response_format: { type: 'json_object' },
                    stop: ['```'],
                });
                expect(result.model).toBe('deepseek-v4-flash');
                expect(JSON.parse(result.text)).toEqual({
                    bond_changes: [],
                    arc_steps: [],
                    scene: { move_on: false },
                });
            },
        );

        it.each(['story_draft', 'field_rewrite', 'story_assistant'] as const)(
            'sends %s to the play model',
            async (kind) => {
                const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
                const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'glm-5.3' } });

                await gateway.completeText({ kind, messages });

                expect(net.requests[0].body.model).toBe('z-ai/glm-5.3');
            },
        );
    });

    it('reads usage and cost from the response and writes one UsageRecord', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const result = await gateway.completeText({
            kind: 'turn',
            messages,
            servedFor: { storyId: 7, chatId: 3 },
        });

        expect(result).toEqual({
            text: 'The lighthouse keeper nods once and goes back to polishing the lens.',
            model: 'glm-5.3',
            usage: { promptTokens: 1234, completionTokens: 56 },
            costUsd: 0.000987,
        });
        expect(records).toEqual([
            {
                kind: 'turn',
                pool: 'text',
                model: 'glm-5.3',
                host: 'deepinfra',
                promptTokens: 1234,
                completionTokens: 56,
                images: null,
                costUsd: 0.000987,
                storyId: 7,
                chatId: 3,
            },
        ]);
    });

    describe('error mapping', () => {
        it.each([
            ['openrouter/error-credits.json', 402],
            ['openrouter/error-credits-reservation.json', 402],
            // A key with its own credit limit (spec: Credit cap) is refused with a 403 budget block.
            ['openrouter/error-key-limit.json', 403],
        ])('maps a credit failure (%s) to out of text credit', async (name, status) => {
            const net = recordedFetch([{ status, fixture: name }]);
            const { gateway, records } = gatewayUnderTest(net.fetch);

            const failure = gateway.completeText({ kind: 'turn', messages });

            await expect(failure).rejects.toBeInstanceOf(OutOfCreditError);
            await expect(failure).rejects.toMatchObject({ code: '402.001.003', pool: 'text' });
            expect(records).toEqual([]);
        });

        it('maps the credit-reservation message to out of text credit whatever the status', async () => {
            const net = recordedFetch([
                { status: 400, json: { error: { code: 400, message: 'This request would exceed your available credits.' } } },
            ]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toMatchObject({
                code: '402.001.003',
            });
        });

        it('maps a moderation flag to a refusal', async () => {
            const net = recordedFetch([{ status: 403, fixture: 'openrouter/error-moderation.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toBeInstanceOf(
                ModelRefusalError,
            );
        });

        it('maps a content_filter finish to a refusal', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-content-filter.json' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toBeInstanceOf(
                ModelRefusalError,
            );
            expect(records).toEqual([]);
        });

        it('maps a provider error to an outage', async () => {
            const net = recordedFetch([{ status: 502, fixture: 'openrouter/error-provider.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toMatchObject({
                code: '502.001.001',
                message: 'OpenRouter: Provider returned error (DeepInfra: upstream connect error)',
            });
        });

        it('maps an error delivered with HTTP 200 the same way', async () => {
            const net = recordedFetch([{ status: 200, fixture: 'openrouter/error-provider.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toBeInstanceOf(
                ProviderOutageError,
            );
        });

        it('maps a network failure to an outage', async () => {
            const { gateway } = gatewayUnderTest(unreachableFetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toBeInstanceOf(
                ProviderOutageError,
            );
        });

        it('maps a reply without text to unparseable output', async () => {
            const net = recordedFetch([{ json: { choices: [{ finish_reason: 'stop', message: {} }] } }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toBeInstanceOf(
                UnparseableOutputError,
            );
        });
    });

    describe('retry on the same host', () => {
        it('retries a 429 with backoff on the pinned host, never another', async () => {
            const net = recordedFetch([
                { status: 429, fixture: 'openrouter/error-overloaded.json' },
                { status: 429, headers: { 'retry-after': '3' }, fixture: 'openrouter/error-overloaded.json' },
                { fixture: 'openrouter/chat-json.json' },
            ]);
            const { gateway, sleeps, records } = gatewayUnderTest(net.fetch);

            await gateway.completeText({ kind: 'judge', messages, json: true });

            expect(net.requests).toHaveLength(3);
            for (const request of net.requests) {
                expect(request.body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false });
            }
            expect(sleeps).toEqual([1000, 3000]);
            expect(records).toHaveLength(1);
        });

        it('plays on after a relayed host overload that clears on retry', async () => {
            const net = recordedFetch([
                { status: 429, fixture: 'openrouter/error-overloaded-relayed.json' },
                { fixture: 'openrouter/chat-success.json' },
            ]);
            const { gateway, sleeps, records } = gatewayUnderTest(net.fetch);

            const result = await gateway.completeText({ kind: 'turn', messages });

            expect(result.text).toBe(
                'The lighthouse keeper nods once and goes back to polishing the lens.',
            );
            expect(net.requests).toHaveLength(2);
            expect(sleeps).toEqual([1000]);
            expect(records).toHaveLength(1);
        });

        // Seen for real on 2026-11-04 (ticket 28): DeepInfra's engine_overloaded, relayed by
        // OpenRouter as a 429 whose metadata carries a `limit_source`, outlasted the retries and
        // was reported as out of credit, which blocked sending as if the key were empty. A 429
        // is a rate limit whatever its metadata says; only a 402 or a budget 403 means credit.
        it.each([
            [
                'openrouter/error-overloaded-relayed.json',
                'OpenRouter: Provider returned error (DeepInfra: engine_overloaded)',
            ],
            [
                'openrouter/error-overloaded.json',
                'OpenRouter: Rate limit exceeded (DeepInfra: engine_overloaded)',
            ],
        ])(
            'reports a 429 that outlasts the retries (%s) as an outage, never as credit',
            async (name, message) => {
                const net = recordedFetch(
                    Array.from({ length: MAX_RETRIES + 1 }, () => ({ status: 429, fixture: name })),
                );
                const { gateway, sleeps, records } = gatewayUnderTest(net.fetch);

                const failure = gateway.completeText({ kind: 'turn', messages });

                await expect(failure).rejects.toBeInstanceOf(ProviderOutageError);
                await expect(failure).rejects.not.toBeInstanceOf(OutOfCreditError);
                await expect(failure).rejects.toMatchObject({ code: '502.001.001', message });
                expect(net.requests).toHaveLength(MAX_RETRIES + 1);
                expect(sleeps).toHaveLength(MAX_RETRIES);
                expect(records).toEqual([]);
            },
        );

        it('still reports a 402 credit refusal as out of credit, without retrying it', async () => {
            const net = recordedFetch([
                {
                    status: 402,
                    headers: { 'retry-after': '5' },
                    fixture: 'openrouter/error-credits-reservation.json',
                },
            ]);
            const { gateway, sleeps } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toMatchObject({
                code: '402.001.003',
            });
            expect(net.requests).toHaveLength(1);
            expect(sleeps).toEqual([]);
        });

        it('gives up after the retries and reports an outage', async () => {
            const net = recordedFetch(
                Array.from({ length: MAX_RETRIES + 1 }, () => ({
                    status: 503,
                    json: { error: { code: 503, message: 'No available provider' } },
                })),
            );
            const { gateway, sleeps } = gatewayUnderTest(net.fetch);

            await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toBeInstanceOf(
                ProviderOutageError,
            );
            expect(net.requests).toHaveLength(MAX_RETRIES + 1);
            expect(sleeps).toHaveLength(MAX_RETRIES);
            expect(net.pending()).toBe(0);
        });
    });

    describe('remaining credit', () => {
        it('reads it from the credits endpoint', async () => {
            const net = recordedFetch([
                { fixture: 'openrouter/credits.json' },
                { json: { balances: { usd: 1 } } },
            ]);
            const { gateway } = gatewayUnderTest(net.fetch);

            const credit = await gateway.remainingCredit();

            expect(net.requests[0].url).toBe('https://openrouter.ai/api/v1/credits');
            expect(credit.text).toEqual({ remainingUsd: 4.5, limitUsd: 10 });
        });

        it("falls back to the key's own limit when the credits endpoint is refused", async () => {
            // Both pools are read at once, so answer by URL rather than in order.
            const net = recordedFetch([
                (request) =>
                    request.url.endsWith('/credits')
                        ? { status: 403, fixture: 'openrouter/credits-forbidden.json' }
                        : { json: { balances: { usd: 1 } } },
                (request) =>
                    request.url.endsWith('/credits')
                        ? { status: 403, fixture: 'openrouter/credits-forbidden.json' }
                        : { json: { balances: { usd: 1 } } },
                { fixture: 'openrouter/key.json' },
            ]);
            const { gateway } = gatewayUnderTest(net.fetch);

            const credit = await gateway.remainingCredit();

            expect(net.requests[2].url).toBe('https://openrouter.ai/api/v1/key');
            expect(credit.text).toEqual({ remainingUsd: 18.25, limitUsd: 22 });
        });

        it('reports the text pool as unknown when OpenRouter cannot be read', async () => {
            const net = recordedFetch([
                { status: 500, json: { error: { code: 500, message: 'boom' } } },
                { json: { balances: { usd: 1 } } },
            ]);
            const { gateway } = gatewayUnderTest(net.fetch);

            const credit = await gateway.remainingCredit();

            expect(credit.text).toEqual({ remainingUsd: null, limitUsd: null });
            expect(credit.image).toEqual({ remainingUsd: 1, limitUsd: null });
        });
    });
});

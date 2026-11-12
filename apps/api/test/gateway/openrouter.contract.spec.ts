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

        it('plays turns on DeepSeek V4 Pro pinned to DeepInfra, reasoning off, with stop strings', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'deepseek-v4-pro' } });

            const result = await gateway.completeText({ kind: 'turn', messages, stop: ['\n@You:'] });

            expect(net.requests[0].body).toMatchObject({
                model: 'deepseek/deepseek-v4-pro',
                provider: { only: ['deepinfra'], allow_fallbacks: false },
                reasoning: { enabled: false },
                stop: ['\n@You:'],
            });
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
                // The Judge requires its fixed temperature (.scratch/scene-flow/spec.md, "Judge temperature").
                expect(request.body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false, require_parameters: true });
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

        describe('a background call whose host stays busy', () => {
            const busy = () =>
                Array.from({ length: MAX_RETRIES + 1 }, () => ({
                    status: 429,
                    fixture: 'openrouter/error-overloaded-relayed.json',
                }));

            it('goes once more to DeepSeek V4 Pro on the same host, and records that model', async () => {
                const net = recordedFetch([...busy(), { fixture: 'openrouter/chat-json.json' }]);
                const { gateway, records } = gatewayUnderTest(net.fetch);

                const result = await gateway.completeText({ kind: 'judge', messages, json: true });

                expect(net.requests).toHaveLength(MAX_RETRIES + 2);
                for (const request of net.requests.slice(0, MAX_RETRIES + 1)) {
                    expect(request.body.model).toBe('deepseek/deepseek-v4-flash');
                }
                expect(net.requests[MAX_RETRIES + 1].body).toMatchObject({
                    model: 'deepseek/deepseek-v4-pro',
                    provider: { only: ['deepinfra'], allow_fallbacks: false },
                    reasoning: { enabled: false },
                    response_format: { type: 'json_object' },
                });
                expect(result.model).toBe('deepseek-v4-pro');
                expect(records).toEqual([
                    expect.objectContaining({ kind: 'judge', model: 'deepseek-v4-pro', host: 'deepinfra' }),
                ]);
            });

            it('fails as an outage when the fallback stays busy too', async () => {
                const net = recordedFetch([...busy(), ...busy()]);
                const { gateway, records } = gatewayUnderTest(net.fetch);

                await expect(gateway.completeText({ kind: 'memory_extraction', messages, json: true })).rejects.toMatchObject({
                    code: '502.001.001',
                });
                expect(net.requests).toHaveLength(2 * (MAX_RETRIES + 1));
                expect(records).toEqual([]);
            });

            it('does not switch model for any other failure', async () => {
                const net = recordedFetch([
                    { status: 500, json: { error: { code: 500, message: 'Internal error' } } },
                ]);
                const { gateway } = gatewayUnderTest(net.fetch);

                await expect(gateway.completeText({ kind: 'judge', messages, json: true })).rejects.toBeInstanceOf(
                    ProviderOutageError,
                );
                expect(net.requests).toHaveLength(1);
            });

            it('never switches a play call: the turn fails on its own model', async () => {
                const net = recordedFetch(busy());
                const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'glm-5.3' } });

                await expect(gateway.completeText({ kind: 'turn', messages })).rejects.toBeInstanceOf(ProviderOutageError);
                expect(net.requests).toHaveLength(MAX_RETRIES + 1);
                expect(net.pending()).toBe(0);
            });
        });

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

    // Spec: streaming replies. Recorded, synthetic streams in the shape
    // https://openrouter.ai/docs/api-reference/streaming documents: comment lines, one chunk
    // per piece, a last chunk carrying `usage`, then [DONE].
    describe('streamed turns', () => {
        const open = () => new AbortController().signal;

        async function eventually(check: () => boolean): Promise<void> {
            const deadline = Date.now() + 2_000;
            while (!check()) {
                if (Date.now() > deadline) throw new Error('Never happened');
                await new Promise((resolve) => setTimeout(resolve, 5));
            }
        }

        it('asks for a stream, hands each piece over in order, and records the usage from the last chunk', async () => {
            const net = recordedFetch([{ sse: 'openrouter/stream-turn.sse' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch, { settings: { playModel: 'glm-5.3' } });
            const pieces: string[] = [];

            const result = await gateway.streamText(
                { kind: 'turn', messages, maxTokens: 600, stop: ['\n@You:'], servedFor: { storyId: 3, chatId: 4 } },
                { onText: (piece) => pieces.push(piece), signal: open() },
            );

            expect(net.requests[0].url).toBe(CHAT_URL);
            expect(net.requests[0].body).toMatchObject({
                model: 'z-ai/glm-5.3',
                provider: { only: ['deepinfra'], allow_fallbacks: false },
                stop: ['\n@You:'],
                stream: true,
            });
            expect(pieces).toEqual(['The keeper', ' nods once', ' and goes back', ' to the lens.']);
            expect(result).toEqual({
                text: 'The keeper nods once and goes back to the lens.',
                model: 'glm-5.3',
                usage: { promptTokens: 1234, completionTokens: 14 },
                costUsd: 0.000432,
                stopped: false,
            });
            expect(records).toEqual([
                {
                    kind: 'turn',
                    pool: 'text',
                    model: 'glm-5.3',
                    host: 'deepinfra',
                    promptTokens: 1234,
                    completionTokens: 14,
                    images: null,
                    costUsd: 0.000432,
                    storyId: 3,
                    chatId: 4,
                },
            ]);
        });

        it('retries a 429 before the first piece, on the pinned host', async () => {
            const net = recordedFetch([
                { status: 429, fixture: 'openrouter/error-overloaded.json' },
                { sse: 'openrouter/stream-turn.sse' },
            ]);
            const { gateway, sleeps } = gatewayUnderTest(net.fetch);

            const result = await gateway.streamText({ kind: 'turn', messages }, { onText: () => {}, signal: open() });

            expect(net.requests).toHaveLength(2);
            expect(net.requests[1].body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false });
            expect(sleeps).toHaveLength(1);
            expect(result.text).toBe('The keeper nods once and goes back to the lens.');
        });

        it('maps an error chunk after some pieces to its typed error, and records nothing', async () => {
            const net = recordedFetch([{ sse: 'openrouter/stream-error.sse' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch);
            const pieces: string[] = [];

            await expect(
                gateway.streamText({ kind: 'turn', messages }, { onText: (piece) => pieces.push(piece), signal: open() }),
            ).rejects.toThrow(ProviderOutageError);
            expect(pieces).toEqual(['The keeper', ' nods']);
            expect(records).toEqual([]);
        });

        it('maps a content_filter finish to a refusal', async () => {
            const net = recordedFetch([{ sse: 'openrouter/stream-content-filter.sse' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.streamText({ kind: 'turn', messages }, { onText: () => {}, signal: open() })).rejects.toThrow(
                ModelRefusalError,
            );
        });

        it('maps an error status before the stream as a whole call does', async () => {
            const net = recordedFetch([{ status: 402, fixture: 'openrouter/error-credits.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.streamText({ kind: 'turn', messages }, { onText: () => {}, signal: open() })).rejects.toThrow(
                OutOfCreditError,
            );
        });

        it('stops when aborted, with the text so far, then records what the generation billed once OpenRouter reports it', async () => {
            const net = recordedFetch([
                { sse: 'openrouter/stream-turn.sse', hangAfter: 3 },
                { status: 404, fixture: 'openrouter/generation-not-found.json' },
                { fixture: 'openrouter/generation-stopped.json' },
            ]);
            const { gateway, records } = gatewayUnderTest(net.fetch);
            const stop = new AbortController();
            const pieces: string[] = [];

            const result = await gateway.streamText(
                { kind: 'turn', messages, servedFor: { storyId: 3, chatId: 4 } },
                {
                    onText: (piece) => {
                        pieces.push(piece);
                        if (pieces.length === 2) stop.abort();
                    },
                    signal: stop.signal,
                },
            );

            expect(result).toMatchObject({ text: 'The keeper nods once', stopped: true, costUsd: 0 });
            await eventually(() => records.length > 0);
            // A cancelled stream stops billing on hosts that support it (DeepInfra does), and
            // sends no usage chunk: the generation endpoint reports what was billed.
            expect(net.requests.slice(1).map((request) => request.url)).toEqual([
                'https://openrouter.ai/api/v1/generation?id=gen-synthetic-stream-0001',
                'https://openrouter.ai/api/v1/generation?id=gen-synthetic-stream-0001',
            ]);
            expect(records).toEqual([
                {
                    kind: 'turn',
                    pool: 'text',
                    model: 'glm-5.3',
                    host: 'deepinfra',
                    promptTokens: 1234,
                    completionTokens: 3,
                    images: null,
                    costUsd: 0.000187,
                    storyId: 3,
                    chatId: 4,
                },
            ]);
        });

        it('makes no call and records nothing when already aborted', async () => {
            const net = recordedFetch([]);
            const { gateway, records } = gatewayUnderTest(net.fetch);
            const stop = new AbortController();
            stop.abort();

            const result = await gateway.streamText({ kind: 'turn', messages }, { onText: () => {}, signal: stop.signal });

            expect(result).toMatchObject({ text: '', stopped: true });
            expect(net.requests).toHaveLength(0);
            expect(records).toEqual([]);
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

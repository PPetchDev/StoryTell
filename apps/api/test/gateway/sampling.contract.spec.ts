import { ProviderOutageError } from '../../src/errors/model-gateway.errors.js';
import { TextCallKind } from '../../src/service/model-gateway/model-gateway.js';
import { gatewayUnderTest } from '../harness/gateway-under-test.js';
import { recordedFetch } from '../harness/recorded-fetch.js';

const messages = [
    { role: 'system' as const, content: 'You narrate a synthetic test scene.' },
    { role: 'user' as const, content: 'Hello?' },
];

const SAMPLER_KEYS = ['temperature', 'min_p', 'top_p', 'repetition_penalty'];

// Spec (models-and-samplers): "Sampling", Gateway. Callers never pass sampler values; the
// gateway reads them for the current play model and sends them only on sampled kinds.
describe('Sampling through the real gateway', () => {
    it('sends a turn exactly as before when no Sampling is set', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
        const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'glm-5.3', samplers: {} } });

        await gateway.completeText({ kind: 'turn', messages, maxTokens: 600, stop: ['\n@You:'] });

        expect(net.requests[0].body).toEqual({
            model: 'z-ai/glm-5.3',
            messages,
            provider: { only: ['deepinfra'], allow_fallbacks: false },
            reasoning: { effort: 'minimal' },
            usage: { include: true },
            max_tokens: 600,
            stop: ['\n@You:'],
        });
    });

    it.each(['turn', 'suggested_replies', 'write_for_me'] as const)(
        'sends the play model’s values on %s under OpenRouter’s names, and requires them',
        async (kind) => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, {
                settings: {
                    playModel: 'deepseek-v4-pro',
                    samplers: { 'deepseek-v4-pro': { temperature: 0.85, minP: 0.05, topP: 0.9, repetitionPenalty: 1.08 } },
                },
            });

            await gateway.completeText({ kind, messages, maxTokens: 600 });

            expect(net.requests[0].body).toMatchObject({
                model: 'deepseek/deepseek-v4-pro',
                temperature: 0.85,
                min_p: 0.05,
                top_p: 0.9,
                repetition_penalty: 1.08,
                provider: { only: ['deepinfra'], allow_fallbacks: false, require_parameters: true },
                reasoning: { enabled: false },
            });
        },
    );

    it('sends only the values that are set', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
        const { gateway } = gatewayUnderTest(net.fetch, {
            settings: { playModel: 'glm-5.3', samplers: { 'glm-5.3': { temperature: 1.2 } } },
        });

        await gateway.completeText({ kind: 'turn', messages });

        const body = net.requests[0].body;
        expect(body.temperature).toBe(1.2);
        expect(Object.keys(body).filter((key) => SAMPLER_KEYS.includes(key))).toEqual(['temperature']);
        expect(body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false, require_parameters: true });
    });

    it('sends the values on a streamed turn too', async () => {
        const net = recordedFetch([{ sse: 'openrouter/stream-turn.sse' }]);
        const { gateway } = gatewayUnderTest(net.fetch, {
            settings: { playModel: 'glm-5.3', samplers: { 'glm-5.3': { minP: 0.03 } } },
        });

        await gateway.streamText({ kind: 'turn', messages }, { onText: () => {}, signal: new AbortController().signal });

        expect(net.requests[0].body).toMatchObject({
            min_p: 0.03,
            stream: true,
            provider: { only: ['deepinfra'], allow_fallbacks: false, require_parameters: true },
        });
    });

    // The Judge left this list for a fixed temperature (.scratch/scene-flow/spec.md, "Judge temperature").
    it.each<TextCallKind>(['story_draft', 'story_assistant', 'field_rewrite', 'memory_extraction', 'story_summary'])(
        'keeps %s on the host defaults',
        async (kind) => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-json.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, {
                settings: { playModel: 'glm-5.3', samplers: { 'glm-5.3': { temperature: 0.7, topP: 0.9 } } },
            });

            await gateway.completeText({ kind, messages, json: true });

            const body = net.requests[0].body;
            expect(Object.keys(body).filter((key) => SAMPLER_KEYS.includes(key))).toEqual([]);
            expect(body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false });
        },
    );

    // .scratch/scene-flow/spec.md, "Judge temperature": a fixed 0.3, never the user's Sampling.
    describe('the Judge', () => {
        it('sends temperature 0.3 alone, whatever Sampling is set, and requires it', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-json.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, {
                settings: { playModel: 'glm-5.3', samplers: { 'glm-5.3': { temperature: 1.4, topP: 0.9 } } },
            });

            await gateway.completeText({ kind: 'judge', messages, json: true });

            const body = net.requests[0].body;
            expect(body.model).toBe('deepseek/deepseek-v4-flash');
            expect(body.temperature).toBe(0.3);
            expect(Object.keys(body).filter((key) => SAMPLER_KEYS.includes(key))).toEqual(['temperature']);
            expect(body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false, require_parameters: true });
        });

        it('sends the same with no Sampling set at all', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/chat-json.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'deepseek-v4-pro', samplers: {} } });

            await gateway.completeText({ kind: 'judge', messages, json: true });

            expect(net.requests[0].body).toMatchObject({ temperature: 0.3 });
        });

        it('a host refusing it is a plain outage that never tells the user to reset Sampling', async () => {
            const net = recordedFetch([{ status: 404, fixture: 'openrouter/error-no-endpoints.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'glm-5.3', samplers: {} } });

            const failure = gateway.completeText({ kind: 'judge', messages, json: true });

            await expect(failure).rejects.toBeInstanceOf(ProviderOutageError);
            await expect(failure).rejects.not.toMatchObject({ message: expect.stringContaining('Sampling') });
        });
    });

    it('never sends another play model’s values', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/chat-success.json' }]);
        const { gateway } = gatewayUnderTest(net.fetch, {
            settings: { playModel: 'glm-5.3', samplers: { 'deepseek-v4-pro': { temperature: 0.4 } } },
        });

        await gateway.completeText({ kind: 'turn', messages });

        const body = net.requests[0].body;
        expect(Object.keys(body).filter((key) => SAMPLER_KEYS.includes(key))).toEqual([]);
        expect(body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false });
    });

    describe('a host that no longer takes a value', () => {
        it('fails the turn as an outage that says to reset Sampling', async () => {
            const net = recordedFetch([{ status: 404, fixture: 'openrouter/error-no-endpoints.json' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch, {
                settings: { playModel: 'deepseek-v4-pro', samplers: { 'deepseek-v4-pro': { repetitionPenalty: 1.1 } } },
            });

            const failure = gateway.completeText({ kind: 'turn', messages });

            await expect(failure).rejects.toBeInstanceOf(ProviderOutageError);
            await expect(failure).rejects.toMatchObject({
                code: '502.001.001',
                message: 'DeepInfra no longer takes one of the Sampling values for DeepSeek V4 Pro. Reset Sampling for it in Settings.',
            });
            expect(records).toEqual([]);
        });

        it('says the same on a streamed turn', async () => {
            const net = recordedFetch([{ status: 404, fixture: 'openrouter/error-no-endpoints.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, {
                settings: { playModel: 'glm-5.3', samplers: { 'glm-5.3': { temperature: 0.9 } } },
            });

            await expect(
                gateway.streamText({ kind: 'turn', messages }, { onText: () => {}, signal: new AbortController().signal }),
            ).rejects.toMatchObject({
                code: '502.001.001',
                message: 'DeepInfra no longer takes one of the Sampling values for GLM-5.3. Reset Sampling for it in Settings.',
            });
        });

        it('stays a plain outage when no values were sent', async () => {
            const net = recordedFetch([{ status: 404, fixture: 'openrouter/error-no-endpoints.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch, { settings: { playModel: 'glm-5.3', samplers: {} } });

            const failure = gateway.completeText({ kind: 'turn', messages });

            await expect(failure).rejects.toBeInstanceOf(ProviderOutageError);
            await expect(failure).rejects.not.toMatchObject({ message: expect.stringContaining('Sampling') });
        });
    });
});

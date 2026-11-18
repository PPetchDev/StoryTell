import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { NewUsageRecord } from '../src/service/model-gateway/real/real-model-gateway.js';
import { gatewayUnderTest } from './harness/gateway-under-test.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/prompt-cache/spec.md, "Seeing the cache": the gateway reads how many prompt tokens the
 * host read from its cache (`usage.prompt_tokens_details.cached_tokens`, on OpenRouter and Venice
 * alike), keeps it on the call's usage record, and the Usage API sums it per pool for the month.
 */

function answering(answers: Array<{ json?: unknown; sse?: string[] }>): FetchLike {
    return async () => {
        const answer = answers.shift();
        if (!answer) throw new Error('No scripted answer');
        if (answer.sse) {
            return new Response(answer.sse.map((data) => `data: ${data}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }
        return new Response(JSON.stringify(answer.json), { status: 200, headers: { 'content-type': 'application/json' } });
    };
}

const reply = (usage: Record<string, unknown>) => ({
    id: 'gen-1',
    model: 'z-ai/glm-5.3',
    choices: [{ message: { content: '@Mira: Mm.' }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1000, completion_tokens: 50, cost: 0.001, ...usage },
});

const turn = { kind: 'turn' as const, messages: [{ role: 'user' as const, content: 'Hi.' }], maxTokens: 100 };

describe('Cached prompt tokens (contract)', () => {
    it('records the cached tokens OpenRouter reports for a whole call', async () => {
        const { gateway, records } = gatewayUnderTest(answering([{ json: reply({ prompt_tokens_details: { cached_tokens: 700 } }) }]));
        await gateway.completeText(turn);
        expect(records).toEqual([expect.objectContaining({ kind: 'turn', promptTokens: 1000, cachedTokens: 700 })]);
    });

    it('records 0 when the details come without a count, and nothing when the host sent no details', async () => {
        const { gateway, records } = gatewayUnderTest(answering([{ json: reply({ prompt_tokens_details: {} }) }, { json: reply({}) }]));
        await gateway.completeText(turn);
        await gateway.completeText(turn);
        expect(records.map((record) => record.cachedTokens)).toEqual([0, null]);
    });

    it("reads the stream's usage chunk the same way", async () => {
        const chunk = (content: string, usage?: Record<string, unknown>) =>
            JSON.stringify({ id: 'gen-2', choices: [{ index: 0, delta: { content }, finish_reason: usage ? 'stop' : null }], ...(usage ? { usage } : {}) });
        const { gateway, records } = gatewayUnderTest(
            answering([{ sse: [chunk('@Mira: '), chunk('Mm.', { prompt_tokens: 2000, completion_tokens: 5, cost: 0.0004, prompt_tokens_details: { cached_tokens: 1536 } }), '[DONE]'] }]),
        );
        await gateway.streamText(turn, { onText: () => undefined, signal: new AbortController().signal });
        expect(records).toEqual([expect.objectContaining({ promptTokens: 2000, cachedTokens: 1536 })]);
    });

    it('reads it from Venice, which answers in the same shape', async () => {
        const { gateway, records } = gatewayUnderTest(
            answering([{ json: { ...reply({ prompt_tokens_details: { cached_tokens: 128 } }), model: 'deepseek-v4-pro' } }]),
            { settings: { playModel: 'deepseek-v4-pro' }, textOnVenice: true },
        );
        await gateway.completeText(turn);
        expect(records).toEqual([expect.objectContaining({ host: 'venice', cachedTokens: 128 })]);
    });
});

describe('Cached prompt tokens on the Usage API', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    const text = (promptTokens: number, cachedTokens: number | null | undefined): NewUsageRecord => ({
        kind: 'turn',
        pool: 'text',
        model: 'glm-5.3',
        host: 'openrouter',
        promptTokens,
        completionTokens: 10,
        ...(cachedTokens === undefined ? {} : { cachedTokens }),
        images: null,
        costUsd: 0.001,
        storyId: null,
        chatId: null,
    });

    it('has no cache figure while no call reported one', async () => {
        const { body } = await t.http.get('/api/usage').expect(200);
        expect(body.pools.text.cache).toBeNull();
        expect(body.pools.image.cache).toBeNull();
    });

    it("sums the month's prompt and cached tokens of the text pool, over the calls that reported their cache only", async () => {
        const usage = t.app.get(UsageRecordModelService);
        await usage.record(text(10_000, 6_000));
        await usage.record({ ...text(2_000, 0), kind: 'judge' });
        // From before the column, or from a host that says nothing: not counted as a miss.
        await usage.record(text(50_000, null));
        await usage.record(text(50_000, undefined));

        const { body } = await t.http.get('/api/usage').expect(200);
        expect(body.pools.text.cache).toEqual({ promptTokens: 12_000, cachedTokens: 6_000 });
        expect(body.pools.text.calls).toBe(4);
        expect(body.pools.image.cache).toBeNull();
    });
});

import { OutOfCreditError } from '../src/errors/model-gateway.errors.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { gatewayUnderTest, TEST_KEYS } from './harness/gateway-under-test.js';

/**
 * Text on Venice (.scratch/venice-text/spec.md): with TEXT_HOST=venice the real gateway sends
 * text and embeddings to Venice's OpenAI-shaped API, by Venice's model ids, and records them as
 * Venice's. Driven through the gateway with a scripted fetch, as the OpenRouter contract tests are.
 */

interface Sent {
    url: string;
    body: Record<string, any>;
    authorization: string | null;
}

function scripted(answers: Array<{ status?: number; json?: unknown; sse?: string[] }>): { fetchImpl: FetchLike; sent: Sent[] } {
    const sent: Sent[] = [];
    const fetchImpl: FetchLike = async (url, init) => {
        const headers = new Headers(init?.headers as HeadersInit);
        sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {}, authorization: headers.get('authorization') });
        const answer = answers.shift();
        if (!answer) throw new Error(`No scripted answer for ${url}`);
        if (answer.sse) {
            return new Response(answer.sse.map((data) => `data: ${data}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }
        return new Response(JSON.stringify(answer.json ?? {}), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
    };
    return { fetchImpl, sent };
}

const reply = (text: string, cost?: number) => ({
    model: 'deepseek-v4-pro',
    choices: [{ message: { content: text }, finish_reason: 'stop' }],
    usage: { prompt_tokens: 1000, completion_tokens: 100 },
    ...(cost === undefined ? {} : { cost: { usd: cost } }),
});

describe('Text on Venice (contract)', () => {
    it('sends a turn to Venice by its model id, without its system prompt or thinking, and records the cost it reports as Venice', async () => {
        const { fetchImpl, sent } = scripted([{ json: reply('@Mira: The lamp.', 0.0021) }]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { settings: { playModel: 'deepseek-v4-pro' }, textOnVenice: true });
        const result = await gateway.completeText({ kind: 'turn', messages: [{ role: 'user', content: 'Hi.' }], maxTokens: 900, stop: ['\nAsh:'], servedFor: { storyId: 1, chatId: 2 } });

        expect(result).toMatchObject({ text: '@Mira: The lamp.', model: 'deepseek-v4-pro', costUsd: 0.0021 });
        expect(sent[0].url).toBe('https://api.venice.ai/api/v1/chat/completions');
        expect(sent[0].authorization).toBe(`Bearer ${TEST_KEYS.venice}`);
        expect(sent[0].body).toEqual({
            model: 'deepseek-v4-pro',
            messages: [{ role: 'user', content: 'Hi.' }],
            venice_parameters: { include_venice_system_prompt: false, disable_thinking: true },
            max_tokens: 900,
            stop: ['\nAsh:'],
        });
        expect(records).toEqual([expect.objectContaining({ kind: 'turn', pool: 'text', model: 'deepseek-v4-pro', host: 'venice', promptTokens: 1000, completionTokens: 100, costUsd: 0.0021 })]);
    });

    it('sends background calls to Venice V4 Flash, and records the list price when no cost comes back', async () => {
        const { fetchImpl, sent } = scripted([{ json: { ...reply('{"ok":true}'), model: 'deepseek-v4-flash' } }]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textOnVenice: true });
        await gateway.completeText({ kind: 'judge', messages: [{ role: 'user', content: 'Judge.' }], json: true });
        expect(sent[0].body).toMatchObject({ model: 'deepseek-v4-flash', response_format: { type: 'json_object' } });
        // 1000 x $0.138/M + 100 x $0.275/M.
        expect(records[0]).toMatchObject({ host: 'venice', costUsd: 0.0001655 });
    });

    it('streams a turn with usage asked for, and reads the cost from the last chunk', async () => {
        const { fetchImpl, sent } = scripted([
            {
                sse: [
                    JSON.stringify({ id: 'chatcmpl-1', choices: [{ delta: { content: 'The lamp ' } }] }),
                    JSON.stringify({ id: 'chatcmpl-1', choices: [{ delta: { content: 'is lit.' }, finish_reason: 'stop' }] }),
                    JSON.stringify({ id: 'chatcmpl-1', choices: [], usage: { prompt_tokens: 50, completion_tokens: 5 }, cost: { usd: 0.0001 } }),
                    '[DONE]',
                ],
            },
        ]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { settings: { playModel: 'deepseek-v4-pro' }, textOnVenice: true });
        const pieces: string[] = [];
        const result = await gateway.streamText({ kind: 'turn', messages: [{ role: 'user', content: 'Hi.' }] }, { onText: (piece) => pieces.push(piece), signal: new AbortController().signal });
        expect(pieces.join('')).toBe('The lamp is lit.');
        expect(result).toMatchObject({ text: 'The lamp is lit.', stopped: false, costUsd: 0.0001 });
        expect(sent[0].body).toMatchObject({ stream: true, stream_options: { include_usage: true } });
        expect(records[0]).toMatchObject({ host: 'venice', promptTokens: 50, completionTokens: 5, costUsd: 0.0001 });
    });

    it('embeds with bge-m3 on Venice, the same model, so stored vectors still match', async () => {
        const vector = Array.from({ length: 1024 }, (_, i) => i / 1024);
        const { fetchImpl, sent } = scripted([{ json: { model: 'text-embedding-bge-m3', data: [{ index: 0, embedding: vector }], usage: { prompt_tokens: 10 } } }]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textOnVenice: true });
        const result = await gateway.embedTexts({ kind: 'context_search', inputs: ['The lamp.'] });
        expect(result.vectors).toEqual([vector]);
        expect(sent[0]).toMatchObject({ url: 'https://api.venice.ai/api/v1/embeddings', body: { model: 'text-embedding-bge-m3', input: ['The lamp.'], encoding_format: 'float' } });
        expect(records[0]).toMatchObject({ host: 'venice', costUsd: 0.0000015 });
    });

    it("words Venice's own errors: a balance it can't cover is out of credit", async () => {
        const { fetchImpl } = scripted([{ status: 402, json: { error: 'Insufficient balance' } }]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textOnVenice: true });
        await expect(gateway.completeText({ kind: 'judge', messages: [{ role: 'user', content: 'Judge.' }] })).rejects.toBeInstanceOf(OutOfCreditError);
    });
});

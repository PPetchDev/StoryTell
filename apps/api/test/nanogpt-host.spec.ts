import { Logger } from '@nestjs/common';

import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { gatewayUnderTest } from './harness/gateway-under-test.js';

/**
 * NanoGPT as the first text host (.scratch/nanogpt-provider/spec.md): every text call goes to it
 * first with ZDR required; a busy NanoGPT, or one whose Weekly allowance reads used up, gives way
 * to the next host; embeddings never go to it. Driven through the real gateway with a scripted
 * fetch, as the other contract tests are.
 */

interface Sent {
    url: string;
    body: Record<string, any>;
}

interface Answer {
    match?: (url: string) => boolean;
    status?: number;
    json?: unknown;
    sse?: string[];
}

const NANOGPT_CHAT = 'https://nano-gpt.com/api/v1/chat/completions';
const NANOGPT_ALLOWANCE = 'https://nano-gpt.com/api/subscription/v1/usage';
const OPENROUTER_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_EMBED = 'https://openrouter.ai/api/v1/embeddings';

const isBalanceRead = (url: string): boolean => /\/(credits|key|billing\/balance|api_keys\/rate_limits|subscription\/v1\/usage)$/.test(url);

const RESET_AT = Date.UTC(2026, 10, 30, 0, 0, 0);

/** NanoGPT's subscription reading: active, with `used` of 60M spent this week. */
function allowance(used: number, recommendedMode = 'subscription', active = true): Answer {
    return {
        match: (url) => url === NANOGPT_ALLOWANCE,
        json: {
            active,
            state: active ? 'active' : 'inactive',
            limits: { weeklyInputTokens: 60_000_000 },
            weeklyInputTokens: { used, remaining: 60_000_000 - used, percentUsed: used / 600_000, resetAt: RESET_AT },
            routing: { recommendedMode },
        },
    };
}

/** What a balance read gets when no answer matches it: plenty left everywhere. */
function plentyLeft(url: string): Answer {
    if (url === NANOGPT_ALLOWANCE) return allowance(1_000_000);
    return { json: { data: { total_credits: 30, total_usage: 20 } } };
}

function scripted(answers: Answer[]): { fetchImpl: FetchLike; sent: Sent[]; balanceReads: string[] } {
    const sent: Sent[] = [];
    const balanceReads: string[] = [];
    const left = [...answers];
    const fetchImpl: FetchLike = async (url, init) => {
        const balance = isBalanceRead(String(url));
        if (balance) balanceReads.push(String(url));
        else sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
        const at = left.findIndex((answer) => (answer.match ? answer.match(String(url)) : !balance));
        if (at < 0 && !balance) throw new Error(`No scripted answer for ${url}`);
        const [answer] = at < 0 ? [plentyLeft(String(url))] : left.splice(at, 1);
        if (answer.sse) {
            return new Response(answer.sse.map((data) => `data: ${data}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }
        return new Response(JSON.stringify(answer.json ?? {}), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
    };
    return { fetchImpl, sent, balanceReads };
}

const nanoReply = (text: string): Answer => ({
    json: { model: 'z-ai/glm-5.3', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 8494, completion_tokens: 900, prompt_tokens_details: { cached_tokens: 8448 } } },
});
const openRouterReply = (text: string): Answer => ({
    json: { choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100, cost: 0.002 } },
});
const BUSY: Answer = { status: 429, json: { error: { message: 'Too many requests', type: 'rate_limit_error' } } };
/** Every try a 429: the first ask and MAX_RETRIES more. */
const busyThroughRetries = (): Answer[] => [BUSY, BUSY, BUSY, BUSY];

const TURN = { kind: 'turn' as const, messages: [{ role: 'user' as const, content: 'I wait.' }], maxTokens: 900, stop: ['\nAsh:'], servedFor: { storyId: 1, chatId: 2 } };
const JUDGE = { kind: 'judge' as const, messages: [{ role: 'user' as const, content: 'Judge.' }], json: true };

function warnings(): () => string[] {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    return () => warn.mock.calls.map(([message]) => String(message));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('NanoGPT host (contract)', () => {
    it('plays a turn on NanoGPT: GLM-5.3 at minimal effort, ZDR required, samplers and stop, recorded as nanogpt at $0', async () => {
        const { fetchImpl, sent } = scripted([nanoReply('@Mira: Fine.')]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, {
            textHosts: ['nanogpt', 'openrouter', 'free'],
            settings: { playModel: 'glm-5.3', samplers: { 'glm-5.3': { temperature: 0.9, minP: 0.05, topP: 0.95, repetitionPenalty: 1.05 } } },
        });

        const result = await gateway.completeText(TURN);

        expect(result).toMatchObject({ text: '@Mira: Fine.', model: 'glm-5.3', costUsd: 0 });
        expect(sent.map((request) => request.url)).toEqual([NANOGPT_CHAT]);
        expect(sent[0].body).toEqual({
            model: 'z-ai/glm-5.3',
            messages: TURN.messages,
            reasoning_effort: 'minimal',
            provider: { zdr: true },
            max_tokens: 900,
            stop: ['\nAsh:'],
            temperature: 0.9,
            min_p: 0.05,
            top_p: 0.95,
            repetition_penalty: 1.05,
        });
        expect(records).toEqual([
            expect.objectContaining({ kind: 'turn', model: 'glm-5.3', host: 'nanogpt', costUsd: 0, promptTokens: 8494, completionTokens: 900, storyId: 1, chatId: 2 }),
        ]);
    });

    it('sends a background call on DeepSeek V4 Flash with reasoning off and JSON asked for', async () => {
        const { fetchImpl, sent } = scripted([nanoReply('{"bond_changes":[]}')]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        await gateway.completeText(JUDGE);

        expect(sent[0].body).toEqual({
            model: 'deepseek/deepseek-v4-flash',
            messages: JUDGE.messages,
            reasoning_effort: 'none',
            provider: { zdr: true },
            response_format: { type: 'json_object' },
            temperature: 0.3,
        });
        expect(records).toEqual([expect.objectContaining({ kind: 'judge', model: 'deepseek-v4-flash', host: 'nanogpt', costUsd: 0 })]);
    });

    it('moves a call NanoGPT keeps answering 429 to OpenRouter, and says why', async () => {
        const logged = warnings();
        const { fetchImpl, sent } = scripted([...busyThroughRetries(), openRouterReply('@Mira: Fine.')]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter', 'free'] });

        const result = await gateway.completeText(TURN);

        expect(result.text).toBe('@Mira: Fine.');
        expect(sent.map((request) => request.url)).toEqual([NANOGPT_CHAT, NANOGPT_CHAT, NANOGPT_CHAT, NANOGPT_CHAT, OPENROUTER_CHAT]);
        expect(sent[4].body.messages).toEqual(sent[0].body.messages);
        expect(records).toEqual([expect.objectContaining({ kind: 'turn', host: 'deepinfra', costUsd: 0.002 })]);
        expect(logged()).toContainEqual(expect.stringMatching(/^turn: skipped nanogpt, busy \(NanoGPT: Too many requests\); sending it to openrouter\.$/));
    });

    it('moves a busy background call on, rather than to the priority endpoint on NanoGPT', async () => {
        const { fetchImpl, sent } = scripted([...busyThroughRetries(), openRouterReply('{}')]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        await gateway.completeText(JUDGE);

        expect(sent.map((request) => request.url).filter((url) => url === OPENROUTER_CHAT)).toHaveLength(1);
        expect(sent.at(-1)!.body.provider).toMatchObject({ only: ['deepinfra'] });
    });

    it('moves an answer with no text on to OpenRouter, as busy', async () => {
        const logged = warnings();
        const empty: Answer = { json: { choices: [{ message: { content: '' }, finish_reason: 'stop' }], usage: { prompt_tokens: 2235, completion_tokens: 324 } } };
        const { fetchImpl, sent } = scripted([empty, openRouterReply('@Mira: Fine.')]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        const result = await gateway.completeText(TURN);

        expect(result.text).toBe('@Mira: Fine.');
        expect(sent.map((request) => request.url)).toEqual([NANOGPT_CHAT, OPENROUTER_CHAT]);
        expect(records).toEqual([expect.objectContaining({ host: 'deepinfra' })]);
        expect(logged()).toContainEqual(expect.stringContaining('skipped nanogpt, busy (NanoGPT: an answer with no text (324 completion tokens'));
    });

    it('moves a stream that ends with no text on to OpenRouter', async () => {
        const { fetchImpl, sent } = scripted([
            { sse: [JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 300 } }), '[DONE]'] },
            { sse: [JSON.stringify({ choices: [{ delta: { content: '@Mira: Fine.' } }] }), JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, cost: 0.001 } }), '[DONE]'] },
        ]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        const result = await gateway.streamText(TURN, { onText: () => {}, signal: new AbortController().signal });

        expect(result.text).toBe('@Mira: Fine.');
        expect(sent.map((request) => request.url)).toEqual([NANOGPT_CHAT, OPENROUTER_CHAT]);
    });

    it('still fails a busy call when NanoGPT is the last host', async () => {
        const { fetchImpl } = scripted(busyThroughRetries());
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt'] });

        await expect(gateway.completeText(JUDGE)).rejects.toThrow(/NanoGPT: Too many requests/);
    });

    it('passes NanoGPT over up front once its Weekly allowance reads used up', async () => {
        const logged = warnings();
        const { fetchImpl, sent } = scripted([allowance(60_000_000, 'unavailable'), openRouterReply('{}')]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        await gateway.completeText(JUDGE);

        expect(sent.map((request) => request.url)).toEqual([OPENROUTER_CHAT]);
        expect(records).toEqual([expect.objectContaining({ host: 'deepinfra' })]);
        expect(logged()).toContainEqual(expect.stringContaining('passing nanogpt over'));
    });

    it('passes NanoGPT over when the subscription is not active', async () => {
        const { fetchImpl, sent } = scripted([allowance(0, 'paygo', false), openRouterReply('{}')]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        await gateway.completeText(JUDGE);

        expect(sent.map((request) => request.url)).toEqual([OPENROUTER_CHAT]);
    });

    it('reads the text pool as NanoGPT with its Weekly allowance while tokens are left', async () => {
        const { fetchImpl } = scripted([allowance(18_800_000)]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        const credit = await gateway.remainingCredit();

        expect(credit.text).toEqual({
            remainingUsd: null,
            limitUsd: null,
            host: 'nanogpt',
            weeklyAllowance: { host: 'nanogpt', usedTokens: 18_800_000, limitTokens: 60_000_000, resetAt: new Date(RESET_AT).toISOString(), usedUp: false },
        });
    });

    it('reads the text pool as OpenRouter once the allowance is used up, and still says the allowance is used up', async () => {
        const { fetchImpl } = scripted([allowance(60_000_000, 'unavailable')]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        const credit = await gateway.remainingCredit();

        expect(credit.text).toMatchObject({
            remainingUsd: 10,
            host: 'openrouter',
            weeklyAllowance: { host: 'nanogpt', usedTokens: 60_000_000, limitTokens: 60_000_000, usedUp: true },
        });
    });

    it('never sends embeddings to NanoGPT', async () => {
        const { fetchImpl, sent } = scripted([{ json: { data: [{ index: 0, embedding: new Array(1024).fill(0.01) }], usage: { prompt_tokens: 5, cost: 0.000001 } } }]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        await gateway.embedTexts({ kind: 'context_search', inputs: ['the pipe'] });

        expect(sent.map((request) => request.url)).toEqual([OPENROUTER_EMBED]);
    });

    it('moves a stream NanoGPT keeps answering 429 to OpenRouter before any text has streamed', async () => {
        const { fetchImpl, sent } = scripted([
            ...busyThroughRetries(),
            { sse: [JSON.stringify({ choices: [{ delta: { content: '@Mira: Fine.' } }] }), JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 3, cost: 0.001 } }), '[DONE]'] },
        ]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });
        const pieces: string[] = [];

        const result = await gateway.streamText(TURN, { onText: (piece) => pieces.push(piece), signal: new AbortController().signal });

        expect(pieces.join('')).toBe('@Mira: Fine.');
        expect(result.text).toBe('@Mira: Fine.');
        expect(sent.at(-1)!.url).toBe(OPENROUTER_CHAT);
        expect(sent.at(-1)!.body.stream).toBe(true);
        expect(records).toEqual([expect.objectContaining({ host: 'deepinfra' })]);
    });

    it('asks NanoGPT for usage in the last chunk of a stream', async () => {
        const { fetchImpl, sent } = scripted([
            { sse: [JSON.stringify({ choices: [{ delta: { content: 'Hi.' } }] }), JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 2 } }), '[DONE]'] },
        ]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'openrouter'] });

        await gateway.streamText(TURN, { onText: () => {}, signal: new AbortController().signal });

        expect(sent[0].body).toMatchObject({ stream: true, stream_options: { include_usage: true }, provider: { zdr: true } });
        expect(records).toEqual([expect.objectContaining({ host: 'nanogpt', costUsd: 0, promptTokens: 10 })]);
    });
});

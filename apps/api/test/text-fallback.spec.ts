import { Logger } from '@nestjs/common';

import { NoEmbeddingCreditError, OutOfCreditError, ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { OUT_OF_CREDIT_SKIP_MS } from '../src/service/model-gateway/real/real-model-gateway.js';
import { FREE_TEXT_MODEL } from '../src/service/model-gateway/real/text-hosts.js';
import { gatewayUnderTest } from './harness/gateway-under-test.js';

/**
 * The text chain (.scratch/text-fallback/spec.md): with TEXT_HOSTS=openrouter,venice,free a call a
 * host refuses for credit goes once to the next host, with the same messages; a host that ran out
 * is passed over for a while; the text pool reads out only when every host is. Driven through the
 * real gateway with a scripted fetch, as the other contract tests are.
 */

interface Sent {
    url: string;
    body: Record<string, any>;
}

interface Answer {
    /** Which request this answer is for; any, when left out. Answers are used once, in order. */
    match?: (url: string) => boolean;
    status?: number;
    json?: unknown;
    sse?: string[];
}

function scripted(answers: Answer[]): { fetchImpl: FetchLike; sent: Sent[] } {
    const sent: Sent[] = [];
    const left = [...answers];
    const fetchImpl: FetchLike = async (url, init) => {
        sent.push({ url: String(url), body: init?.body ? JSON.parse(String(init.body)) : {} });
        const at = left.findIndex((answer) => !answer.match || answer.match(String(url)));
        if (at < 0) throw new Error(`No scripted answer for ${url}`);
        const [answer] = left.splice(at, 1);
        if (answer.sse) {
            return new Response(answer.sse.map((data) => `data: ${data}\n\n`).join(''), { status: 200, headers: { 'content-type': 'text/event-stream' } });
        }
        return new Response(JSON.stringify(answer.json ?? {}), { status: answer.status ?? 200, headers: { 'content-type': 'application/json' } });
    };
    return { fetchImpl, sent };
}

const OPENROUTER_CHAT = 'https://openrouter.ai/api/v1/chat/completions';
const VENICE_CHAT = 'https://api.venice.ai/api/v1/chat/completions';

/** OpenRouter's refusal on an account below zero. */
const OPENROUTER_OUT: Answer = { status: 402, json: { error: { code: 402, message: 'Insufficient credits. Add more using https://openrouter.ai/settings/credits' } } };
const VENICE_OUT: Answer = { status: 402, json: { error: 'Insufficient balance' } };

const openRouterReply = (text: string): Answer => ({
    json: { choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100, cost: 0.002 } },
});
const veniceReply = (text: string): Answer => ({
    json: { model: 'deepseek-v4-pro', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 1000, completion_tokens: 100 }, cost: { usd: 0.0021 } },
});
const freeReply = (text: string): Answer => ({
    json: { model: FREE_TEXT_MODEL.id, provider: 'Nvidia', choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 2550, completion_tokens: 122, cost: 0 } },
});

const TURN = { kind: 'turn' as const, messages: [{ role: 'user' as const, content: 'I wait.' }], maxTokens: 900, stop: ['\nAsh:'], servedFor: { storyId: 1, chatId: 2 } };
const JUDGE = { kind: 'judge' as const, messages: [{ role: 'user' as const, content: 'Judge.' }], json: true };

function warnings(): () => string[] {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    return () => warn.mock.calls.map(([message]) => String(message));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Text chain (contract)', () => {
    it('sends a turn OpenRouter refuses for credit to Venice, with the same messages, records Venice, and says why', async () => {
        const logged = warnings();
        const { fetchImpl, sent } = scripted([OPENROUTER_OUT, veniceReply('@Mira: Fine.')]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { settings: { playModel: 'deepseek-v4-pro' }, textHosts: ['openrouter', 'venice', 'free'] });

        const result = await gateway.completeText(TURN);

        expect(result).toMatchObject({ text: '@Mira: Fine.', model: 'deepseek-v4-pro', costUsd: 0.0021 });
        expect(sent.map((request) => request.url)).toEqual([OPENROUTER_CHAT, VENICE_CHAT]);
        expect(sent[1].body.messages).toEqual(sent[0].body.messages);
        expect(sent[1].body).toMatchObject({ model: 'deepseek-v4-pro', max_tokens: 900, stop: ['\nAsh:'] });
        expect(records).toEqual([expect.objectContaining({ kind: 'turn', model: 'deepseek-v4-pro', host: 'venice', costUsd: 0.0021, storyId: 1, chatId: 2 })]);
        expect(logged()).toContainEqual(expect.stringMatching(/^turn: skipped openrouter, out of credit \(OpenRouter: Insufficient credits.*\); sending it to venice, and passing openrouter over for 10 min\.$/));
    });

    it('goes on to the free model when Venice is out too: no pinned host, reasoning off, and $0 recorded as the free host', async () => {
        const logged = warnings();
        const { fetchImpl, sent } = scripted([OPENROUTER_OUT, VENICE_OUT, freeReply('{"bond_changes":[]}')]);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });

        const result = await gateway.completeText(JUDGE);

        expect(result).toMatchObject({ text: '{"bond_changes":[]}', costUsd: 0 });
        expect(sent.map((request) => request.url)).toEqual([OPENROUTER_CHAT, VENICE_CHAT, OPENROUTER_CHAT]);
        expect(sent[2].body).toEqual({
            model: FREE_TEXT_MODEL.id,
            messages: [{ role: 'user', content: 'Judge.' }],
            reasoning: { enabled: false },
            usage: { include: true },
            response_format: { type: 'json_object' },
            temperature: 0.3,
        });
        expect(records).toEqual([expect.objectContaining({ kind: 'judge', model: 'nemotron-3-ultra-free', host: 'openrouter-free', costUsd: 0, promptTokens: 2550, completionTokens: 122 })]);
        expect(logged().filter((line) => line.startsWith('judge: skipped'))).toEqual([
            expect.stringContaining('skipped openrouter, out of credit'),
            expect.stringContaining('skipped venice, out of credit'),
        ]);
    });

    it('plays a turn on the free model with only the samplers it takes, and the stop strings', async () => {
        const { fetchImpl, sent } = scripted([freeReply('@Mira: Fine.')]);
        const { gateway } = gatewayUnderTest(fetchImpl, {
            textHosts: ['free'],
            settings: { playModel: 'glm-5.3', samplers: { 'glm-5.3': { temperature: 0.9, minP: 0.05, topP: 0.95, repetitionPenalty: 1.05 } } },
        });

        await gateway.completeText(TURN);

        expect(sent[0].body).toEqual({
            model: FREE_TEXT_MODEL.id,
            messages: TURN.messages,
            reasoning: { enabled: false },
            usage: { include: true },
            max_tokens: 900,
            stop: ['\nAsh:'],
            temperature: 0.9,
            top_p: 0.95,
        });
    });

    it('passes over a host that ran out of credit for ten minutes, then tries it again', async () => {
        const { fetchImpl, sent } = scripted([OPENROUTER_OUT, veniceReply('One.'), veniceReply('Two.'), openRouterReply('Three.')]);
        const { gateway, records, clock } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });

        await gateway.completeText(JUDGE);
        await gateway.completeText(JUDGE);
        expect(sent.map((request) => request.url)).toEqual([OPENROUTER_CHAT, VENICE_CHAT, VENICE_CHAT]);

        clock.now += OUT_OF_CREDIT_SKIP_MS;
        const third = await gateway.completeText(JUDGE);

        expect(third.text).toBe('Three.');
        expect(sent.at(-1)!.url).toBe(OPENROUTER_CHAT);
        expect(records.map((record) => record.host)).toEqual(['venice', 'venice', 'deepinfra']);
    });

    it('keeps a chain of one as before: OpenRouter is asked again on the next call, and its refusal is the answer', async () => {
        const { fetchImpl, sent } = scripted([OPENROUTER_OUT, OPENROUTER_OUT]);
        const { gateway, records } = gatewayUnderTest(fetchImpl);

        await expect(gateway.completeText(JUDGE)).rejects.toBeInstanceOf(OutOfCreditError);
        await expect(gateway.completeText(JUDGE)).rejects.toBeInstanceOf(OutOfCreditError);

        expect(sent.map((request) => request.url)).toEqual([OPENROUTER_CHAT, OPENROUTER_CHAT]);
        expect(records).toEqual([]);
    });

    it('refuses for credit when the last host is out too', async () => {
        const { fetchImpl, sent } = scripted([OPENROUTER_OUT, VENICE_OUT]);
        const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice'] });

        await expect(gateway.completeText(JUDGE)).rejects.toBeInstanceOf(OutOfCreditError);
        expect(sent).toHaveLength(2);
    });

    describe('a streamed turn', () => {
        it('streams from Venice when OpenRouter refuses before any text', async () => {
            const { fetchImpl, sent } = scripted([
                OPENROUTER_OUT,
                {
                    sse: [
                        JSON.stringify({ id: 'chatcmpl-1', choices: [{ delta: { content: 'The lamp ' } }] }),
                        JSON.stringify({ id: 'chatcmpl-1', choices: [{ delta: { content: 'is lit.' }, finish_reason: 'stop' }] }),
                        JSON.stringify({ id: 'chatcmpl-1', choices: [], usage: { prompt_tokens: 50, completion_tokens: 5 }, cost: { usd: 0.0001 } }),
                        '[DONE]',
                    ],
                },
            ]);
            const { gateway, records } = gatewayUnderTest(fetchImpl, { settings: { playModel: 'deepseek-v4-pro' }, textHosts: ['openrouter', 'venice', 'free'] });
            const pieces: string[] = [];

            const result = await gateway.streamText(TURN, { onText: (piece) => pieces.push(piece), signal: new AbortController().signal });

            expect(pieces.join('')).toBe('The lamp is lit.');
            expect(result).toMatchObject({ text: 'The lamp is lit.', stopped: false });
            expect(sent.map((request) => request.url)).toEqual([OPENROUTER_CHAT, VENICE_CHAT]);
            expect(sent[1].body).toMatchObject({ stream: true, messages: sent[0].body.messages });
            expect(records).toEqual([expect.objectContaining({ kind: 'turn', host: 'venice', costUsd: 0.0001 })]);
        });

        it('is never sent elsewhere once text has streamed: a refusal for credit mid-stream is the answer', async () => {
            const { fetchImpl, sent } = scripted([
                {
                    sse: [
                        JSON.stringify({ id: 'gen-1', choices: [{ delta: { content: 'The lamp ' } }] }),
                        JSON.stringify({ id: 'gen-1', error: { code: 402, message: 'Insufficient credits' }, choices: [{ delta: {}, finish_reason: 'error' }] }),
                    ],
                },
            ]);
            const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });
            const pieces: string[] = [];

            await expect(gateway.streamText(TURN, { onText: (piece) => pieces.push(piece), signal: new AbortController().signal })).rejects.toBeInstanceOf(OutOfCreditError);

            expect(pieces).toEqual(['The lamp ']);
            expect(sent).toHaveLength(1);
            expect(records).toEqual([]);
        });
    });

    describe('embeddings', () => {
        const vector = Array.from({ length: 1024 }, (_, i) => i / 1024);
        const OPENROUTER_EMBED = 'https://openrouter.ai/api/v1/embeddings';
        const VENICE_EMBED = 'https://api.venice.ai/api/v1/embeddings';

        it('go on to Venice when OpenRouter is out, and never to the free host', async () => {
            const { fetchImpl, sent } = scripted([OPENROUTER_OUT, { json: { model: 'text-embedding-bge-m3', data: [{ index: 0, embedding: vector }], usage: { prompt_tokens: 10 } } }]);
            const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });

            const result = await gateway.embedTexts({ kind: 'context_search', inputs: ['The lamp.'] });

            expect(result.vectors).toEqual([vector]);
            expect(sent.map((request) => request.url)).toEqual([OPENROUTER_EMBED, VENICE_EMBED]);
            expect(records).toEqual([expect.objectContaining({ kind: 'context_search', host: 'venice', model: 'bge-m3' })]);
        });

        it('fail as an outage, not out of credit, when every embedding host is out but the free model can still play', async () => {
            const { fetchImpl, sent } = scripted([OPENROUTER_OUT, VENICE_OUT]);
            const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });

            const failure = await gateway.embedTexts({ kind: 'context_search', inputs: ['The lamp.'] }).catch((error: unknown) => error);

            // A turn's search fails softly on an outage (the newest Memories, no Documents) but fails the turn on credit.
            expect(failure).toBeInstanceOf(NoEmbeddingCreditError);
            expect(failure).toBeInstanceOf(ProviderOutageError);
            expect(failure).not.toBeInstanceOf(OutOfCreditError);
            expect(sent.map((request) => request.url)).toEqual([OPENROUTER_EMBED, VENICE_EMBED]);
        });

        it('still fail as out of credit without a free host, as before', async () => {
            const { fetchImpl } = scripted([OPENROUTER_OUT, VENICE_OUT]);
            const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice'] });

            await expect(gateway.embedTexts({ kind: 'context_search', inputs: ['The lamp.'] })).rejects.toBeInstanceOf(OutOfCreditError);
        });
    });

    // The up-front checks (a send, a Document's Add, Suggestions...) refuse when `credit.text.remainingUsd <= 0`.
    describe('the text pool the up-front checks read', () => {
        const openRouterBelowZero: Answer = { match: (url) => url.endsWith('/credits'), json: { data: { total_credits: 30, total_usage: 30.01 } } };
        const veniceBalance = (usd: number): Answer[] => [0, 1].map(() => ({ match: (url: string) => url.endsWith('/billing/balance'), json: { balances: { usd } } }));

        it('reads the next host while OpenRouter is below zero, so a turn is not refused up front', async () => {
            const { fetchImpl } = scripted([openRouterBelowZero, ...veniceBalance(2.1)]);
            const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });

            const credit = await gateway.remainingCredit();

            expect(credit.text).toEqual({ remainingUsd: 2.1, limitUsd: null, host: 'venice' });
            expect(credit.image).toEqual({ remainingUsd: 2.1, limitUsd: null });
        });

        it('reads unknown on the free model when both paid hosts are out, which never refuses', async () => {
            const { fetchImpl } = scripted([openRouterBelowZero, ...veniceBalance(0)]);
            const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });

            expect((await gateway.remainingCredit()).text).toEqual({ remainingUsd: null, limitUsd: null, host: 'free' });
        });

        it('reads out only when the last host is out too', async () => {
            const { fetchImpl } = scripted([openRouterBelowZero, ...veniceBalance(0)]);
            const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice'] });

            expect((await gateway.remainingCredit()).text).toEqual({ remainingUsd: 0, limitUsd: null, host: 'venice' });
        });

        it("passes over a host remembered out of credit without reading its balance", async () => {
            const { fetchImpl, sent } = scripted([OPENROUTER_OUT, veniceReply('Fine.'), ...veniceBalance(2.1)]);
            const { gateway } = gatewayUnderTest(fetchImpl, { textHosts: ['openrouter', 'venice', 'free'] });
            await gateway.completeText(JUDGE);

            const credit = await gateway.remainingCredit();

            expect(credit.text).toMatchObject({ remainingUsd: 2.1, host: 'venice' });
            expect(sent.some((request) => request.url.endsWith('/credits'))).toBe(false);
        });
    });
});

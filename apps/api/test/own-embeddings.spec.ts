import { Logger } from '@nestjs/common';

import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { OWN_EMBEDDING_MAX_TOKENS, OwnEmbedder } from '../src/service/model-gateway/real/own-embedding.js';
import { gatewayUnderTest } from './harness/gateway-under-test.js';

/**
 * Embeddings on the VM, as a backup (.scratch/own-embeddings/spec.md): bge-m3 run by the app itself
 * answers an embedding call only when no host that embeds can, at $0 and recorded as host `local`.
 */

const OPENROUTER_EMBED = 'https://openrouter.ai/api/v1/embeddings';
const isBalanceRead = (url: string): boolean => /\/(credits|key|billing\/balance|api_keys\/rate_limits|subscription\/v1\/usage)$/.test(url);

type Answer = { status: number; json: unknown } | 'network-down';

/** OpenRouter answers the embedding calls in order; balance reads say plenty is left. */
function scripted(answers: Answer[]): { fetchImpl: FetchLike; sent: string[] } {
    const sent: string[] = [];
    const left = [...answers];
    const fetchImpl: FetchLike = async (url) => {
        if (isBalanceRead(String(url))) return Response.json({ data: { total_credits: 30, total_usage: 20 } });
        sent.push(String(url));
        const answer = left.shift();
        if (!answer) throw new Error(`No scripted answer for ${url}`);
        if (answer === 'network-down') throw new TypeError('fetch failed');
        return new Response(JSON.stringify(answer.json), { status: answer.status, headers: { 'content-type': 'application/json' } });
    };
    return { fetchImpl, sent };
}

const DEEPINFRA_VECTORS: Answer = { status: 200, json: { data: [{ index: 0, embedding: new Array(1024).fill(0.01) }], usage: { prompt_tokens: 5, cost: 0.000001 } } };
const NO_CREDIT: Answer = { status: 402, json: { error: { code: 402, message: 'Insufficient credits' } } };
const BUSY: Answer = { status: 429, json: { error: { message: 'Too many requests' } } };

/** A backup that answers one vector per input, and remembers what it was asked. */
function fakeOwn(available = true) {
    const asked: string[][] = [];
    return {
        asked,
        own: {
            available: () => available,
            embed: async (inputs: string[]) => {
                asked.push(inputs);
                return { vectors: inputs.map(() => new Array(1024).fill(0.02)), promptTokens: 7 * inputs.length };
            },
        },
    };
}

const SEARCH = { kind: 'context_search' as const, inputs: ['Who keeps the lighthouse?'], servedFor: { storyId: 1, chatId: 4, messageId: 9 } };

function warnings(): () => string[] {
    const warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    return () => warn.mock.calls.map(([message]) => String(message));
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe('Embeddings on the VM, as a backup (contract)', () => {
    it('leaves the backup alone while DeepInfra answers', async () => {
        const { fetchImpl, sent } = scripted([DEEPINFRA_VECTORS]);
        const { own, asked } = fakeOwn();
        const { gateway, records } = gatewayUnderTest(fetchImpl, { ownEmbedder: own });

        const result = await gateway.embedTexts(SEARCH);

        expect(sent).toEqual([OPENROUTER_EMBED]);
        expect(asked).toEqual([]);
        expect(result.vectors[0][0]).toBe(0.01);
        expect(records).toEqual([expect.objectContaining({ kind: 'context_search', host: 'deepinfra' })]);
    });

    it('answers on the backup when OpenRouter is out of credit, at $0, recorded as local', async () => {
        const warned = warnings();
        const { fetchImpl } = scripted([NO_CREDIT]);
        const { own, asked } = fakeOwn();
        const { gateway, records } = gatewayUnderTest(fetchImpl, { ownEmbedder: own });

        const result = await gateway.embedTexts(SEARCH);

        expect(asked).toEqual([SEARCH.inputs]);
        expect(result).toMatchObject({ model: 'bge-m3', costUsd: 0, usage: { promptTokens: 7 } });
        expect(result.vectors[0][0]).toBe(0.02);
        expect(records).toEqual([
            {
                kind: 'context_search',
                pool: 'text',
                model: 'bge-m3',
                host: 'local',
                promptTokens: 7,
                completionTokens: 0,
                images: null,
                costUsd: 0,
                storyId: 1,
                chatId: 4,
                messageId: 9,
            },
        ]);
        expect(warned().some((line) => line.includes('context_search') && line.includes('own bge-m3'))).toBe(true);
    });

    it('answers on the backup when OpenRouter stays busy through every retry', async () => {
        const { fetchImpl } = scripted([BUSY, BUSY, BUSY, BUSY]);
        const { own, asked } = fakeOwn();
        const { gateway, records } = gatewayUnderTest(fetchImpl, { ownEmbedder: own });

        await gateway.embedTexts({ kind: 'memory_embedding', inputs: ['Mira owes Ash a favour.'] });

        expect(asked).toHaveLength(1);
        expect(records).toEqual([expect.objectContaining({ kind: 'memory_embedding', host: 'local', costUsd: 0 })]);
    });

    it('answers on the backup when OpenRouter cannot be reached', async () => {
        const { fetchImpl } = scripted(['network-down', 'network-down', 'network-down', 'network-down']);
        const { own, asked } = fakeOwn();
        const { gateway } = gatewayUnderTest(fetchImpl, { ownEmbedder: own });

        await gateway.embedTexts(SEARCH);

        expect(asked).toHaveLength(1);
    });

    it('answers on the backup when no host in the chain embeds', async () => {
        const { fetchImpl, sent } = scripted([]);
        const { own, asked } = fakeOwn();
        const { gateway, records } = gatewayUnderTest(fetchImpl, { textHosts: ['nanogpt', 'free'], ownEmbedder: own });

        await gateway.embedTexts(SEARCH);

        expect(sent).toEqual([]);
        expect(asked).toHaveLength(1);
        expect(records).toEqual([expect.objectContaining({ host: 'local' })]);
    });

    it('fails as before when the backup is not there', async () => {
        const { fetchImpl } = scripted([NO_CREDIT]);
        const { own, asked } = fakeOwn(false);
        const { gateway, records } = gatewayUnderTest(fetchImpl, { ownEmbedder: own });

        await expect(gateway.embedTexts(SEARCH)).rejects.toMatchObject({ code: '402.001.003' });
        expect(asked).toEqual([]);
        expect(records).toEqual([]);
    });

    it('still refuses a call with no inputs', async () => {
        const { fetchImpl } = scripted([]);
        const { own } = fakeOwn();
        const { gateway } = gatewayUnderTest(fetchImpl, { ownEmbedder: own });

        await expect(gateway.embedTexts({ kind: 'context_search', inputs: [] })).rejects.toThrow(RangeError);
    });
});

describe('OwnEmbedder', () => {
    /** A model whose CLS state is the ids it was given, padded to 1024. */
    function fakeModel(options: { failFirstLoad?: boolean } = {}) {
        const seen: number[][] = [];
        let running = 0;
        let mostAtOnce = 0;
        let loads = 0;
        const load = async () => {
            loads++;
            if (options.failFirstLoad && loads === 1) throw new Error('model file unreadable');
            return {
                tokenizer: { encode: (text: string) => ({ ids: [0, ...Array.from(text, (char) => char.charCodeAt(0)), 2] }) },
                run: async (ids: number[]) => {
                    seen.push(ids);
                    running++;
                    mostAtOnce = Math.max(mostAtOnce, running);
                    await new Promise((resolve) => setTimeout(resolve, 5));
                    running--;
                    const state = new Float32Array(1024);
                    state[0] = 3;
                    state[1] = 4;
                    return state;
                },
            };
        };
        return { load, seen, mostAtOnce: () => mostAtOnce, loads: () => loads };
    }

    it('answers each input with its CLS state, normalised to length 1, and counts the tokens', async () => {
        const model = fakeModel();
        const embedder = new OwnEmbedder('/models/bge-m3', model.load, () => true);

        const result = await embedder.embed(['ab', 'c']);

        expect(result.vectors).toHaveLength(2);
        expect(result.vectors[0].slice(0, 3)).toEqual([0.6, 0.8, 0]);
        expect(result.vectors[0]).toHaveLength(1024);
        expect(result.promptTokens).toBe(4 + 3);
        expect(model.seen).toEqual([
            [0, 97, 98, 2],
            [0, 99, 2],
        ]);
    });

    it(`cuts an input to ${OWN_EMBEDDING_MAX_TOKENS} tokens, keeping the closing token`, async () => {
        const model = fakeModel();
        const embedder = new OwnEmbedder('/models/bge-m3', model.load, () => true);

        const result = await embedder.embed(['x'.repeat(OWN_EMBEDDING_MAX_TOKENS + 50)]);

        expect(model.seen[0]).toHaveLength(OWN_EMBEDDING_MAX_TOKENS);
        expect(model.seen[0][0]).toBe(0);
        expect(model.seen[0].at(-1)).toBe(2);
        expect(result.promptTokens).toBe(OWN_EMBEDDING_MAX_TOKENS);
    });

    it('runs one input at a time, across calls', async () => {
        const model = fakeModel();
        const embedder = new OwnEmbedder('/models/bge-m3', model.load, () => true);

        await Promise.all([embedder.embed(['a', 'b']), embedder.embed(['c'])]);

        expect(model.seen).toHaveLength(3);
        expect(model.mostAtOnce()).toBe(1);
        expect(model.loads()).toBe(1);
    });

    it('loads again on the next call after a load fails', async () => {
        const model = fakeModel({ failFirstLoad: true });
        const embedder = new OwnEmbedder('/models/bge-m3', model.load, () => true);

        await expect(embedder.embed(['a'])).rejects.toThrow('model file unreadable');
        await expect(embedder.embed(['a'])).resolves.toMatchObject({ promptTokens: 3 });
    });

    it('is there only when the model, its weights, the tokenizer and its config are all in the folder', () => {
        const present = new Set(['/models/bge-m3/model.onnx', '/models/bge-m3/model.onnx_data', '/models/bge-m3/tokenizer.json', '/models/bge-m3/tokenizer_config.json']);
        const everything = new OwnEmbedder('/models/bge-m3', fakeModel().load, (file) => present.has(file.replaceAll('\\', '/')));
        present.delete('/models/bge-m3/model.onnx_data');
        const noWeights = new OwnEmbedder('/models/bge-m3', fakeModel().load, (file) => present.has(file.replaceAll('\\', '/')));

        expect(noWeights.available()).toBe(false);
        present.add('/models/bge-m3/model.onnx_data');
        expect(everything.available()).toBe(true);
    });
});

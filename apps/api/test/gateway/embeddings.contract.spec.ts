import {
    ModelRefusalError,
    OutOfCreditError,
    ProviderOutageError,
    UnparseableOutputError,
} from '../../src/errors/model-gateway.errors.js';
import { EMBEDDING_MODELS } from '../../src/service/model-gateway/real/model-table.js';
import { gatewayUnderTest } from '../harness/gateway-under-test.js';
import { recordedFetch, unreachableFetch } from '../harness/recorded-fetch.js';

const EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';
const inputs = ['The lighthouse stands on the cliff.', 'Salt wind over the harbour.', 'A synthetic third passage.'];

/** The fixtures answer the unit vector along axis `k` for input `k`, listed out of order. */
const axis = (k: number) => Array.from({ length: 1024 }, (_, at) => (at === k ? 1 : 0));

// Spec: Documents, "Testing Decisions", contract tests. Every response is a synthetic fixture
// under test/fixtures/openrouter.
describe('OpenRouter embeddings contract', () => {
    it('sends bge-m3 pinned to DeepInfra without fallbacks, as floats', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/embeddings.json' }]);
        const { gateway } = gatewayUnderTest(net.fetch);

        await gateway.embedTexts({ kind: 'document_embedding', inputs, servedFor: { storyId: 7 } });

        expect(net.requests).toHaveLength(1);
        expect(net.requests[0].url).toBe(EMBEDDINGS_URL);
        expect(net.requests[0].method).toBe('POST');
        expect(net.requests[0].headers.Authorization).toMatch(/^Bearer /);
        expect(net.requests[0].body).toEqual({
            model: 'baai/bge-m3',
            input: inputs,
            encoding_format: 'float',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
        });
    });

    it('has bge-m3 in the model table with its dimensions and list price', () => {
        expect(EMBEDDING_MODELS['bge-m3']).toEqual({
            id: 'baai/bge-m3',
            host: 'deepinfra',
            dimensions: 1024,
            priceUsdPerMillion: 0.01,
        });
    });

    it('answers the vectors in input order, whatever order the data comes in', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/embeddings.json' }]);
        const { gateway } = gatewayUnderTest(net.fetch);

        const result = await gateway.embedTexts({ kind: 'document_search', inputs });

        expect(result.vectors).toEqual([axis(0), axis(1), axis(2)]);
        expect(result.model).toBe('bge-m3');
        expect(result.usage).toEqual({ promptTokens: 42 });
        expect(result.costUsd).toBe(0.00000042);
    });

    it('writes one text-pool UsageRecord under its kind with the reported cost', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/embeddings.json' }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        await gateway.embedTexts({ kind: 'document_search', inputs, servedFor: { storyId: 3, chatId: 9 } });

        expect(records).toEqual([
            {
                kind: 'document_search',
                pool: 'text',
                model: 'bge-m3',
                host: 'deepinfra',
                promptTokens: 42,
                completionTokens: 0,
                images: null,
                costUsd: 0.00000042,
                storyId: 3,
                chatId: 9,
            },
        ]);
    });

    it('records the list price times the prompt tokens when OpenRouter reports no cost', async () => {
        const net = recordedFetch([{ fixture: 'openrouter/embeddings-no-cost.json' }]);
        const { gateway, records } = gatewayUnderTest(net.fetch);

        const result = await gateway.embedTexts({ kind: 'document_embedding', inputs });

        // 1,200 tokens at $0.01 per million.
        expect(result.costUsd).toBe(0.000012);
        expect(records).toHaveLength(1);
        expect(records[0]).toMatchObject({ kind: 'document_embedding', promptTokens: 1200, costUsd: 0.000012 });
    });

    describe('errors, mapped as for chat', () => {
        it('a 402 is out of text credit, and nothing is recorded', async () => {
            const net = recordedFetch([{ status: 402, fixture: 'openrouter/error-credits.json' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch);

            const failure = gateway.embedTexts({ kind: 'document_search', inputs });

            await expect(failure).rejects.toBeInstanceOf(OutOfCreditError);
            await expect(failure).rejects.toMatchObject({ pool: 'text' });
            expect(records).toEqual([]);
        });

        it('a moderation refusal is a refusal', async () => {
            const net = recordedFetch([{ status: 403, fixture: 'openrouter/error-moderation.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.embedTexts({ kind: 'document_embedding', inputs })).rejects.toBeInstanceOf(ModelRefusalError);
        });

        it('a provider error is an outage', async () => {
            const net = recordedFetch([{ status: 502, fixture: 'openrouter/error-provider.json' }]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.embedTexts({ kind: 'document_embedding', inputs })).rejects.toBeInstanceOf(ProviderOutageError);
        });

        it('an unreachable network is an outage', async () => {
            const { gateway } = gatewayUnderTest(unreachableFetch);

            await expect(gateway.embedTexts({ kind: 'document_search', inputs })).rejects.toBeInstanceOf(ProviderOutageError);
        });

        it('a 429 is retried on the same host, then answered', async () => {
            const net = recordedFetch([{ status: 429, fixture: 'openrouter/error-overloaded.json' }, { fixture: 'openrouter/embeddings.json' }]);
            const { gateway, sleeps } = gatewayUnderTest(net.fetch);

            const result = await gateway.embedTexts({ kind: 'document_search', inputs });

            expect(result.vectors).toHaveLength(3);
            expect(sleeps).toHaveLength(1);
            expect(net.requests.map((request) => request.body.provider)).toEqual([
                { only: ['deepinfra'], allow_fallbacks: false },
                { only: ['deepinfra'], allow_fallbacks: false },
            ]);
        });

        it('a vector count that does not match the inputs is unreadable, and nothing is recorded', async () => {
            const net = recordedFetch([{ fixture: 'openrouter/embeddings.json' }]);
            const { gateway, records } = gatewayUnderTest(net.fetch);

            await expect(gateway.embedTexts({ kind: 'document_search', inputs: inputs.slice(0, 2) })).rejects.toBeInstanceOf(
                UnparseableOutputError,
            );
            expect(records).toEqual([]);
        });

        it('a vector of the wrong size is unreadable', async () => {
            const net = recordedFetch([
                { json: { data: [{ index: 0, embedding: [0.1, 0.2] }], usage: { prompt_tokens: 3, cost: 0 } } },
            ]);
            const { gateway } = gatewayUnderTest(net.fetch);

            await expect(gateway.embedTexts({ kind: 'document_search', inputs: ['one'] })).rejects.toBeInstanceOf(
                UnparseableOutputError,
            );
        });
    });
});

import { ModelRefusalError, OutOfCreditError, ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { fakeEmbedding } from '../src/service/model-gateway/fake-embedding.js';
import { FAKE_EMBEDDING_MODEL, FakeModelGateway } from '../src/service/model-gateway/fake-model-gateway.js';
import { ModelGateway } from '../src/service/model-gateway/model-gateway.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { recordedFetch } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

const dot = (a: number[], b: number[]) => a.reduce((sum, value, at) => sum + value * b[at], 0);

// Spec: Documents, "The Model Gateway learns embeddings".
describe('Embeddings', () => {
    describe('the Usage API, after embedding calls through the real gateway', () => {
        let t: TestApp;

        beforeAll(async () => {
            const net = recordedFetch([
                { fixture: 'openrouter/embeddings.json' },
                { fixture: 'openrouter/embeddings-no-cost.json' },
                { fixture: 'openrouter/chat-success.json' },
                { fixture: 'openrouter/credits.json' },
                { fixture: 'venice/balance.json' },
            ]);
            t = await startTestApp({ modelGateway: 'real', fetch: net.fetch, providerKeys: TEST_KEYS });
        });

        afterAll(async () => {
            await t.close();
        });

        it('counts each kind in the text pool', async () => {
            const gateway = t.app.get(ModelGateway);
            const inputs = ['one', 'two', 'three'];
            await gateway.embedTexts({ kind: 'document_search', inputs, servedFor: { storyId: 1, chatId: 2 } });
            await gateway.embedTexts({ kind: 'document_embedding', inputs, servedFor: { storyId: 1 } });
            await gateway.completeText({ kind: 'turn', messages: [{ role: 'user', content: 'hi' }] });

            const { body } = await t.http.get('/api/usage').expect(200);

            expect(body.pools.text.calls).toBe(3);
            expect(body.pools.text.byKind).toEqual([
                { kind: 'turn', spentUsd: 0.000987, calls: 1 },
                // The list price: 1,200 tokens at $0.01 per million.
                { kind: 'document_embedding', spentUsd: 0.000012, calls: 1 },
                // $0.00000042, kept to the column's millionths.
                { kind: 'document_search', spentUsd: 0, calls: 1 },
            ]);
            expect(body.pools.image.calls).toBe(0);
        });
    });

    describe('the fake gateway', () => {
        it('answers unit vectors under its own model, the same for the same text', async () => {
            const fake = new FakeModelGateway();

            const first = await fake.embedTexts({ kind: 'document_search', inputs: ['The lighthouse keeper', ''] });
            const again = await fake.embedTexts({ kind: 'document_search', inputs: ['The lighthouse keeper'] });

            expect(first.model).toBe(FAKE_EMBEDDING_MODEL);
            expect(first.vectors).toHaveLength(2);
            for (const vector of first.vectors) expect(Math.hypot(...vector)).toBeCloseTo(1, 10);
            expect(again.vectors[0]).toEqual(first.vectors[0]);
        });

        it('scores texts that share words higher than texts that do not', () => {
            const query = fakeEmbedding('Who keeps the lighthouse on the northern cliff?');
            const related = fakeEmbedding('The lighthouse on the northern cliff has a keeper named Oren.');
            const unrelated = fakeEmbedding('Bakers in the valley sell rye bread at dawn.');

            expect(dot(query, related)).toBeGreaterThan(0.45);
            expect(dot(query, unrelated)).toBeLessThan(0.2);
        });

        it('scores Thai texts that share words higher, though Thai has no spaces', () => {
            const query = fakeEmbedding('ประภาคารบนหน้าผา');
            const related = fakeEmbedding('ผู้ดูแลประภาคารอาศัยอยู่บนหน้าผาทางเหนือ');
            const unrelated = fakeEmbedding('ขนมปังร้อนๆ ขายในตลาดเช้า');

            expect(dot(query, related)).toBeGreaterThan(0.45);
            expect(dot(query, unrelated)).toBeLessThan(0.2);
        });

        it('records each call with its kind and what it served', async () => {
            const fake = new FakeModelGateway();

            await fake.embedTexts({ kind: 'document_embedding', inputs: ['a passage'], servedFor: { storyId: 4 } });
            await fake.embedTexts({ kind: 'document_search', inputs: ['a query'], servedFor: { storyId: 4, chatId: 5 } });

            expect(fake.embeddingCalls('document_embedding')).toEqual([
                { kind: 'document_embedding', inputs: ['a passage'], servedFor: { storyId: 4 } },
            ]);
            expect(fake.embeddingCalls('document_search')).toEqual([
                { kind: 'document_search', inputs: ['a query'], servedFor: { storyId: 4, chatId: 5 } },
            ]);
            expect(fake.embeddingCalls()).toHaveLength(2);
        });

        it('fails the scripted calls of a kind, in order, and answers the rest', async () => {
            const fake = new FakeModelGateway();
            fake.scriptEmbedding('document_search', new ProviderOutageError(), 'answer', new OutOfCreditError('text'));

            await expect(fake.embedTexts({ kind: 'document_embedding', inputs: ['x'] })).resolves.toBeDefined();
            await expect(fake.embedTexts({ kind: 'document_search', inputs: ['x'] })).rejects.toBeInstanceOf(ProviderOutageError);
            expect(fake.pendingReplies()).toEqual({ document_search: 2 });
            await expect(fake.embedTexts({ kind: 'document_search', inputs: ['x'] })).resolves.toBeDefined();
            await expect(fake.embedTexts({ kind: 'document_search', inputs: ['x'] })).rejects.toBeInstanceOf(OutOfCreditError);
            await expect(fake.embedTexts({ kind: 'document_search', inputs: ['x'] })).resolves.toBeDefined();

            fake.scriptEmbedding('document_search', new ModelRefusalError());
            fake.reset();
            await expect(fake.embedTexts({ kind: 'document_search', inputs: ['x'] })).resolves.toBeDefined();
        });

        describe('through the testing controls', () => {
            let t: TestApp;

            beforeAll(async () => {
                t = await startTestApp();
            });

            afterAll(async () => {
                await t.close();
            });

            it('scripts an outage, a refusal and out of text credit for a kind', async () => {
                await t.http
                    .post('/api/testing/fake-gateway/embedding')
                    .send({
                        kind: 'document_search',
                        replies: [{ error: 'outage' }, { error: 'refusal' }, { error: 'out_of_credit', pool: 'text' }],
                    })
                    .expect(204);

                const search = () => t.gateway.embedTexts({ kind: 'document_search', inputs: ['x'] });
                await expect(search()).rejects.toBeInstanceOf(ProviderOutageError);
                await expect(search()).rejects.toBeInstanceOf(ModelRefusalError);
                await expect(search()).rejects.toMatchObject({ pool: 'text', code: '402.001.003' });
                await expect(search()).resolves.toMatchObject({ model: FAKE_EMBEDDING_MODEL });

                const { body } = await t.http.get('/api/testing/fake-gateway/calls').expect(200);
                expect(body.calls.filter((call: { method: string }) => call.method === 'embedTexts')).toHaveLength(4);
            });
        });
    });
});

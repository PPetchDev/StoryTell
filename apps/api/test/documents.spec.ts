import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { splitPassages } from '../src/manager/document/split-passages.js';
import { FAKE_EMBEDDING_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface DocumentSummary {
    id: number;
    title: string;
    source: 'pasted' | 'file' | 'web';
    sourceName: string | null;
    characters: number;
    passages: number;
    createdAt: string;
}

interface Story {
    id: number;
    documents: DocumentSummary[];
    lore: unknown[];
    playable: boolean;
}

/** A paragraph of about 100 estimated tokens, unique by `n`. */
const paragraph = (n: number) =>
    Array.from({ length: 5 }, (_, at) => `Record ${n}.${at} tells of the harbour wardens and the tide ledgers kept there.`).join(' ');
/** A text of `count` paragraphs: about one passage per four paragraphs. */
const longText = (count: number, from = 0) => Array.from({ length: count }, (_, at) => paragraph(from + at)).join('\n\n');

// Spec: Documents, "A Document and its passages" and "Adding".
describe('Documents', () => {
    let t: TestApp;
    let db: pg.Client;

    beforeAll(async () => {
        t = await startTestApp();
        db = new pg.Client({ connectionString: t.databaseUrl });
        await db.connect();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await db.end();
        await t.close();
    });

    async function newStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Harbour' }).expect(201);
        return created.body.id as number;
    }

    async function getStory(storyId: number): Promise<Story> {
        return (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
    }

    async function storedPassages(storyId: number): Promise<Array<{ document_id: number; position: number; text: string; embedding: number[] }>> {
        const { rows } = await db.query(
            `SELECT document_id, position, text, embedding FROM document_passage WHERE story_id = $1 ORDER BY document_id, position`,
            [storyId],
        );
        return rows;
    }

    describe('adding a pasted Document', () => {
        it('splits, embeds in batches of 32, stores the passages with the model, and answers the Story', async () => {
            const storyId = await newStory();
            const text = `  ${longText(160)}\n\n`;
            const expected = splitPassages(text);
            expect(expected.length).toBeGreaterThan(32);

            const { body } = await t.http
                .post(`/api/stories/${storyId}/documents`)
                .send({ title: ' Harbour records ', text, source: 'pasted', sourceName: 'ignored.txt' })
                .expect(201);
            const story = body as Story;

            expect(story.documents).toEqual([
                {
                    id: expect.any(Number),
                    title: 'Harbour records',
                    source: 'pasted',
                    sourceName: null,
                    characters: text.trim().length,
                    passages: expected.length,
                    createdAt: expect.any(String),
                },
            ]);
            // The Story answers no text and no vectors.
            expect(JSON.stringify(story.documents)).not.toContain('Record 0.0');

            const calls = t.gateway.embeddingCalls('document_embedding');
            expect(calls.map((call) => call.inputs.length)).toEqual(
                Array.from({ length: Math.ceil(expected.length / 32) }, (_, at) => Math.min(32, expected.length - at * 32)),
            );
            expect(calls.flatMap((call) => call.inputs)).toEqual(expected);
            for (const call of calls) expect(call.servedFor).toEqual({ storyId });
            expect(t.gateway.embeddingCalls('document_search')).toEqual([]);

            const { rows } = await db.query(`SELECT text, embedding_model, characters FROM story_document WHERE story_id = $1`, [storyId]);
            expect(rows).toEqual([{ text: text.trim(), embedding_model: FAKE_EMBEDDING_MODEL, characters: text.trim().length }]);
            const passages = await storedPassages(storyId);
            expect(passages.map((passage) => passage.text)).toEqual(expected);
            expect(passages.map((passage) => passage.position)).toEqual(expected.map((_, at) => at));
            for (const passage of passages) expect(Math.hypot(...passage.embedding)).toBeCloseTo(1, 5);

            // Kept on a fresh read.
            expect((await getStory(storyId)).documents).toEqual(story.documents);
        });

        it("keeps a file's name as its source, and answers it on the Story", async () => {
            const storyId = await newStory();

            const { body } = await t.http
                .post(`/api/stories/${storyId}/documents`)
                .send({ title: 'harbour-notes', text: '# Notes\n\nThe tide turns at noon.', source: 'file', sourceName: ' harbour-notes.md ' })
                .expect(201);

            expect((body as Story).documents).toEqual([expect.objectContaining({ title: 'harbour-notes', source: 'file', sourceName: 'harbour-notes.md' })]);
            expect((await getStory(storyId)).documents[0]).toMatchObject({ source: 'file', sourceName: 'harbour-notes.md' });
        });

        it('lists Documents in add order and leaves playability alone', async () => {
            const storyId = await newStory();
            const before = await getStory(storyId);
            await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'First', text: 'Tide tables.', source: 'pasted' }).expect(201);
            const { body } = await t.http
                .post(`/api/stories/${storyId}/documents`)
                .send({ title: '', text: '# Wardens of the Harbour\n\nThey keep the ledgers.', source: 'pasted' })
                .expect(201);

            expect((body as Story).documents.map((document) => [document.title, document.passages])).toEqual([
                ['First', 1],
                // A blank title takes the text's first line.
                ['Wardens of the Harbour', 1],
            ]);
            expect((body as Story).playable).toBe(before.playable);
        });
    });

    describe('refused before any call', () => {
        it('refuses text that is nothing but whitespace', async () => {
            const storyId = await newStory();
            const { body } = await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Blank', text: ' \n\t \n', source: 'pasted' }).expect(422);

            expect(body.error.code).toBe('422.003.015');
            expect(t.gateway.calls).toEqual([]);
            expect((await getStory(storyId)).documents).toEqual([]);
        });

        it('refuses a text over 200,000 characters after trimming, and takes one of exactly 200,000', async () => {
            const storyId = await newStory();
            const over = await t.http
                .post(`/api/stories/${storyId}/documents`)
                .send({ title: 'Too long', text: `  ${'a'.repeat(200_001)}  `, source: 'pasted' })
                .expect(413);

            expect(over.body.error.code).toBe('413.003.016');
            expect(over.body.error.message).toContain('200,000');
            expect(t.gateway.embeddingCalls()).toEqual([]);

            await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Just fits', text: ` ${'a '.repeat(100_000)} `, source: 'pasted' }).expect(201);
        });

        it('refuses a 21st Document', async () => {
            const storyId = await newStory();
            for (let n = 0; n < 20; n++) {
                await t.http.post(`/api/stories/${storyId}/documents`).send({ title: `Doc ${n}`, text: `Note ${n}.`, source: 'pasted' }).expect(201);
            }
            t.gateway.reset();

            const { body } = await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'One more', text: 'Too many.', source: 'pasted' }).expect(422);

            expect(body.error.code).toBe('422.003.017');
            expect(t.gateway.embeddingCalls()).toEqual([]);
            expect((await getStory(storyId)).documents).toHaveLength(20);
        });

        it('refuses a Document that would take the Story past 1,000 passages', async () => {
            const storyId = await newStory();
            // About 160 passages each: add them while they fit.
            const big = (n: number) => longText(580, n * 1000).slice(0, 199_000);
            let held = 0;
            let n = 0;
            for (; held + splitPassages(big(n)).length <= 1000; n++) {
                const { body } = await t.http.post(`/api/stories/${storyId}/documents`).send({ title: `Part ${n}`, text: big(n), source: 'pasted' }).expect(201);
                held = (body as Story).documents.reduce((sum, document) => sum + document.passages, 0);
            }
            expect(n).toBeGreaterThanOrEqual(5);
            expect(held).toBeGreaterThan(800);
            t.gateway.reset();

            const { body } = await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'One more', text: big(n), source: 'pasted' }).expect(422);

            expect(body.error.code).toBe('422.003.017');
            expect(body.error.message).toContain('1000');
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });
    });

    it('stores nothing when a batch fails, and answers the gateway error as it is', async () => {
        const storyId = await newStory();
        t.gateway.scriptEmbedding('document_embedding', 'answer', new ProviderOutageError('DeepInfra is down.'));

        const { body } = await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Records', text: longText(160), source: 'pasted' }).expect(502);

        expect(body.error.code).toBe('502.001.001');
        // The first batch answered (and was billed); the second failed.
        expect(t.gateway.embeddingCalls('document_embedding')).toHaveLength(2);
        expect((await getStory(storyId)).documents).toEqual([]);
        expect(await storedPassages(storyId)).toEqual([]);

        // Trying again just works.
        await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Records', text: longText(160), source: 'pasted' }).expect(201);
    });

    it('refuses an Add when text credit is known to be used up, before any call', async () => {
        const storyId = await newStory();
        t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });

        const { body } = await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Records', text: 'Tide tables.', source: 'pasted' }).expect(402);

        expect(body.error.code).toBe('402.001.003');
        expect(t.gateway.embeddingCalls()).toEqual([]);
    });

    describe('rename, read and remove', () => {
        async function withDocument(): Promise<{ storyId: number; documentId: number; story: Story }> {
            const storyId = await newStory();
            const { body } = await t.http
                .post(`/api/stories/${storyId}/documents`)
                .send({ title: 'Tide ledger', text: 'Ships logged at dusk.\n\nThe harbour wardens keep it.', source: 'web', sourceName: 'https://example.org/ledger' })
                .expect(201);
            return { storyId, documentId: (body as Story).documents[0].id, story: body as Story };
        }

        it('renames only the title and answers the Story', async () => {
            const { storyId, documentId, story } = await withDocument();
            t.gateway.reset();

            const { body } = await t.http.patch(`/api/stories/${storyId}/documents/${documentId}`).send({ title: '  Harbour ledger ' }).expect(200);

            expect((body as Story).documents).toEqual([{ ...story.documents[0], title: 'Harbour ledger' }]);
            // Only the title: the text, and the passages with it, are as added.
            const read = await t.http.get(`/api/stories/${storyId}/documents/${documentId}`).expect(200);
            expect(read.body.text).toBe('Ships logged at dusk.\n\nThe harbour wardens keep it.');
            await t.http
                .patch(`/api/stories/${storyId}/documents/${documentId}`)
                .send({ title: 'x', text: 'A new text' })
                .expect(200);
            expect((await t.http.get(`/api/stories/${storyId}/documents/${documentId}`).expect(200)).body.text).toBe(
                'Ships logged at dusk.\n\nThe harbour wardens keep it.',
            );
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });

        it('reads a Document with its text', async () => {
            const { storyId, documentId } = await withDocument();

            const { body } = await t.http.get(`/api/stories/${storyId}/documents/${documentId}`).expect(200);

            expect(body).toEqual({
                id: documentId,
                title: 'Tide ledger',
                source: 'web',
                sourceName: 'https://example.org/ledger',
                text: 'Ships logged at dusk.\n\nThe harbour wardens keep it.',
            });
        });

        it('removes a Document and its passages, and answers the Story without it', async () => {
            const { storyId, documentId } = await withDocument();
            await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Second', text: 'Gull Point light.', source: 'pasted' }).expect(201);

            const { body } = await t.http.delete(`/api/stories/${storyId}/documents/${documentId}`).expect(200);

            expect((body as Story).documents.map((document) => document.title)).toEqual(['Second']);
            expect((await storedPassages(storyId)).map((passage) => passage.text)).toEqual(['Gull Point light.']);
        });

        it('answers DocumentNotFoundError for an unknown id, or one of another Story', async () => {
            const { storyId, documentId } = await withDocument();
            const other = await newStory();

            for (const [method, path] of [
                ['get', `/api/stories/${other}/documents/${documentId}`],
                ['patch', `/api/stories/${other}/documents/${documentId}`],
                ['delete', `/api/stories/${other}/documents/${documentId}`],
                ['get', `/api/stories/${storyId}/documents/999999`],
                ['patch', `/api/stories/${storyId}/documents/999999`],
                ['delete', `/api/stories/${storyId}/documents/999999`],
            ] as const) {
                const { body } = await t.http[method](path).send({ title: 'x' }).expect(404);
                expect(body.error.code).toBe('404.003.018');
            }
            // Still there, untouched.
            expect((await getStory(storyId)).documents.map((document) => document.title)).toEqual(['Tide ledger']);
        });
    });

    describe('travelling with the Story', () => {
        it('Duplicate copies Documents and passages, vectors included, with no call', async () => {
            const storyId = await newStory();
            await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Records', text: longText(40), source: 'pasted' }).expect(201);
            await t.http
                .post(`/api/stories/${storyId}/documents`)
                .send({ title: 'Ledger', text: 'Ships logged at dusk.', source: 'file', sourceName: 'ledger.md' })
                .expect(201);
            const source = await getStory(storyId);
            t.gateway.reset();

            const { body } = await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201);
            const copy = body as Story;

            expect(t.gateway.embeddingCalls()).toEqual([]);
            const strip = ({ id: _id, createdAt: _at, ...rest }: DocumentSummary) => rest;
            expect(copy.documents.map(strip)).toEqual(source.documents.map(strip));
            expect(copy.documents.map((document) => document.id)).not.toEqual(source.documents.map((document) => document.id));
            const original = await storedPassages(storyId);
            const copied = await storedPassages(copy.id);
            expect(copied.map(({ position, text, embedding }) => ({ position, text, embedding }))).toEqual(
                original.map(({ position, text, embedding }) => ({ position, text, embedding })),
            );
            expect(new Set(copied.map((passage) => passage.document_id))).toEqual(new Set(copy.documents.map((document) => document.id)));
            const read = await t.http.get(`/api/stories/${copy.id}/documents/${copy.documents[1].id}`).expect(200);
            expect(read.body).toMatchObject({ title: 'Ledger', source: 'file', sourceName: 'ledger.md', text: 'Ships logged at dusk.' });

            // Removing the copy's Document leaves the original's.
            await t.http.delete(`/api/stories/${copy.id}/documents/${copy.documents[0].id}`).expect(200);
            expect(await storedPassages(storyId)).toEqual(original);
        });

        it('deleting the Story removes its Documents and passages', async () => {
            const storyId = await newStory();
            await t.http.post(`/api/stories/${storyId}/documents`).send({ title: 'Records', text: longText(20), source: 'pasted' }).expect(201);
            expect((await storedPassages(storyId)).length).toBeGreaterThan(0);

            await t.http.delete(`/api/stories/${storyId}`).expect(204);

            expect(await storedPassages(storyId)).toEqual([]);
            const { rows } = await db.query(`SELECT id FROM story_document WHERE story_id = $1`, [storyId]);
            expect(rows).toEqual([]);
        });
    });

    it('answers 404 for a Story that does not exist', async () => {
        const { body } = await t.http.post('/api/stories/999999/documents').send({ title: 'x', text: 'x', source: 'pasted' }).expect(404);
        expect(body.error.code).toBe('404.003.001');
    });
});

import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { MemoryEmbeddingManagerService } from '../src/manager/chat/memory/memory-embedding.service.js';
import { fakeEmbedding } from '../src/service/model-gateway/fake-embedding.js';
import { FAKE_EMBEDDING_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/memory-by-meaning/spec.md, "Embedding Memories" (ticket 01): every Memory gets a
 * vector, as a Document passage has one, through the fake gateway, whose vectors come from the
 * words. Nothing here chooses Memories by meaning yet.
 */

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';

const extraction = (operations: object[]) => JSON.stringify({ operations });
const add = (text: string) => ({ op: 'add', text, known_by: ['Mira'], cause: 'said so' });

interface MemoryRow {
    id: number;
    text: string;
    embedding: number[] | null;
    embedding_model: string | null;
}

describe('Memory embeddings', () => {
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

    async function playableChat(): Promise<{ storyId: number; chatId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        return { storyId, chatId };
    }

    /** A turn whose extraction answers `extracted`, waited for until its background work (embedding included) is over. */
    async function play(storyId: number, chatId: number, extracted: string): Promise<void> {
        t.gateway.scriptText('turn', '@Mira: The oil is in the cellar.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', extracted);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Where is the oil?' }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
    }

    async function rows(chatId: number): Promise<MemoryRow[]> {
        const { rows: found } = await db.query(`SELECT id, text, embedding, embedding_model FROM memory WHERE chat_id = $1 ORDER BY id`, [chatId]);
        return found as MemoryRow[];
    }

    const close = (a: number[], b: number[]) => a.length === b.length && a.every((value, index) => Math.abs(value - b[index]) < 1e-5);

    it("embeds an extraction's new Memories together in one memory_embedding call, at unit length, with the model", async () => {
        const { storyId, chatId } = await playableChat();
        t.gateway.reset();

        await play(storyId, chatId, extraction([add('The oil is kept in the cellar.'), add('Mira lost the cellar key.')]));

        expect(t.gateway.embeddingCalls('memory_embedding')).toEqual([
            {
                kind: 'memory_embedding',
                inputs: ['The oil is kept in the cellar.', 'Mira lost the cellar key.'],
                servedFor: { storyId, chatId },
            },
        ]);
        const stored = await rows(chatId);
        expect(stored).toHaveLength(2);
        for (const row of stored) {
            expect(row.embedding_model).toBe(FAKE_EMBEDDING_MODEL);
            expect(close(row.embedding!, fakeEmbedding(row.text))).toBe(true);
            expect(Math.hypot(...row.embedding!)).toBeCloseTo(1, 4);
        }
    });

    it('makes no embedding call for an extraction that changes nothing', async () => {
        const { storyId, chatId } = await playableChat();
        t.gateway.reset();

        await play(storyId, chatId, extraction([]));

        expect(t.gateway.embeddingCalls('memory_embedding')).toEqual([]);
    });

    it("re-embeds a Memory the extraction rewords, in the same call as that extraction's adds", async () => {
        const { storyId, chatId } = await playableChat();
        await play(storyId, chatId, extraction([add('The oil is kept in the cellar.')]));
        const [memory] = await rows(chatId);
        t.gateway.reset();

        await play(
            storyId,
            chatId,
            extraction([{ op: 'update', id: memory.id, text: 'The oil was moved to the boathouse.', cause: 'moved it' }, add('Mira mended the net.')]),
        );

        expect(t.gateway.embeddingCalls('memory_embedding')).toHaveLength(1);
        expect(t.gateway.embeddingCalls('memory_embedding')[0].inputs).toEqual(['The oil was moved to the boathouse.', 'Mira mended the net.']);
        const [reworded] = await rows(chatId);
        expect(close(reworded.embedding!, fakeEmbedding('The oil was moved to the boathouse.'))).toBe(true);
    });

    it('keeps the extraction recorded and the vector null when the embedding fails', async () => {
        const { storyId, chatId } = await playableChat();
        t.gateway.scriptEmbedding('memory_embedding', new ProviderOutageError('DeepInfra is down.'));

        await play(storyId, chatId, extraction([add('The oil is kept in the cellar.')]));

        const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        expect(chat.messages.at(-1).memory.status).toBe('done');
        const stored = await rows(chatId);
        expect(stored.map((row) => row.text)).toEqual(['The oil is kept in the cellar.']);
        expect(stored[0].embedding).toBeNull();
        expect(stored[0].embedding_model).toBeNull();
    });

    it('embeds a Memory the user adds when it is saved, and again when its text is edited', async () => {
        const { storyId, chatId } = await playableChat();
        t.gateway.reset();

        const added = (
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/memories`).send({ text: '{user} promised to fix the lamp.' }).expect(201)
        ).body;

        expect(t.gateway.embeddingCalls('memory_embedding')).toEqual([
            { kind: 'memory_embedding', inputs: ['{user} promised to fix the lamp.'], servedFor: { storyId, chatId } },
        ]);
        expect(close((await rows(chatId))[0].embedding!, fakeEmbedding('{user} promised to fix the lamp.'))).toBe(true);
        // The vector is never part of the answer.
        expect(added).not.toHaveProperty('embedding');

        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/memories/${added.id}`).send({ text: '{user} promised to paint the tower.' }).expect(200);

        expect(t.gateway.embeddingCalls('memory_embedding').map((call) => call.inputs)).toEqual([
            ['{user} promised to fix the lamp.'],
            ['{user} promised to paint the tower.'],
        ]);
        expect(close((await rows(chatId))[0].embedding!, fakeEmbedding('{user} promised to paint the tower.'))).toBe(true);
    });

    it('makes no call when an edit changes only who knows the Memory', async () => {
        const { storyId, chatId } = await playableChat();
        const added = (await t.http.post(`/api/stories/${storyId}/chats/${chatId}/memories`).send({ text: 'The bell is cracked.' }).expect(201)).body;
        t.gateway.reset();

        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/memories/${added.id}`).send({ knownBy: [] }).expect(200);

        expect(t.gateway.embeddingCalls()).toEqual([]);
        expect((await rows(chatId))[0].embedding).not.toBeNull();
    });

    it('saves the user\'s Memory with a null vector when the embedding fails, and an edit that fails to embed drops the old vector', async () => {
        const { storyId, chatId } = await playableChat();
        t.gateway.scriptEmbedding('memory_embedding', new ProviderOutageError('Down.'));
        const added = (await t.http.post(`/api/stories/${storyId}/chats/${chatId}/memories`).send({ text: 'The bell is cracked.' }).expect(201)).body;
        expect((await rows(chatId))[0].embedding).toBeNull();

        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/memories/${added.id}`).send({ text: 'The bell is mended.' }).expect(200);
        expect(close((await rows(chatId))[0].embedding!, fakeEmbedding('The bell is mended.'))).toBe(true);

        t.gateway.scriptEmbedding('memory_embedding', new ProviderOutageError('Down.'));
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/memories/${added.id}`).send({ text: 'The bell rang at noon.' }).expect(200);
        const [row] = await rows(chatId);
        expect(row.text).toBe('The bell rang at noon.');
        // The vector of the old text is never kept for the new one.
        expect(row.embedding).toBeNull();
        expect(row.embedding_model).toBeNull();
    });

    describe('the backfill', () => {
        it('embeds, per Chat, the Memories with no vector or with another model\'s, and leaves current ones alone', async () => {
            const first = await playableChat();
            const second = await playableChat();
            const current = (await t.http.post(`/api/stories/${first.storyId}/chats/${first.chatId}/memories`).send({ text: 'Already embedded.' }).expect(201)).body;
            const insert = async (chatId: number, text: string, embedding: number[] | null, model: string | null) =>
                (
                    await db.query(
                        `INSERT INTO memory (chat_id, text, written_by, locked, archived, message_id, embedding, embedding_model)
                         VALUES ($1, $2, 'ai', false, false, NULL, $3, $4) RETURNING id`,
                        [chatId, text, embedding, model],
                    )
                ).rows[0].id as number;
            await insert(first.chatId, 'Never embedded.', null, null);
            await insert(first.chatId, 'Embedded by an old model.', [1, 0, 0], 'old/model');
            await insert(second.chatId, 'An archived one, never embedded.', null, null);
            await db.query(`UPDATE memory SET archived = true WHERE text = 'An archived one, never embedded.'`);
            t.gateway.reset();

            await t.app.get(MemoryEmbeddingManagerService).backfill();

            // Earlier tests in this file left Memories of their own; only these two Chats are looked at.
            const calls = t.gateway
                .embeddingCalls('memory_embedding')
                .filter((call) => [first.chatId, second.chatId].includes(call.servedFor!.chatId!));
            expect(calls).toEqual([
                { kind: 'memory_embedding', inputs: ['Never embedded.', 'Embedded by an old model.'], servedFor: { storyId: first.storyId, chatId: first.chatId } },
                { kind: 'memory_embedding', inputs: ['An archived one, never embedded.'], servedFor: { storyId: second.storyId, chatId: second.chatId } },
            ]);
            for (const row of [...(await rows(first.chatId)), ...(await rows(second.chatId))]) {
                expect(row.embedding_model).toBe(FAKE_EMBEDDING_MODEL);
                expect(close(row.embedding!, fakeEmbedding(row.text))).toBe(true);
            }
            expect((await rows(first.chatId)).find((row) => row.id === current.id)!.text).toBe('Already embedded.');

            // Run again, it finds nothing left to do.
            t.gateway.reset();
            await t.app.get(MemoryEmbeddingManagerService).backfill();
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });

        it('embeds in batches of 32 and goes on past a failed batch, leaving it to the next run', async () => {
            const { chatId } = await playableChat();
            for (let n = 0; n < 40; n++) {
                await db.query(
                    `INSERT INTO memory (chat_id, text, written_by, locked, archived, message_id) VALUES ($1, $2, 'ai', false, false, NULL)`,
                    [chatId, `Memory number ${n}.`],
                );
            }
            t.gateway.reset();
            t.gateway.scriptEmbedding('memory_embedding', new ProviderOutageError('Down.'));

            await t.app.get(MemoryEmbeddingManagerService).backfill();

            const ofChat = () => t.gateway.embeddingCalls('memory_embedding').filter((call) => call.servedFor!.chatId === chatId);
            expect(ofChat().map((call) => call.inputs.length)).toEqual([32, 8]);
            const stored = await rows(chatId);
            expect(stored.filter((row) => row.embedding === null)).toHaveLength(32);

            t.gateway.reset();
            await t.app.get(MemoryEmbeddingManagerService).backfill();
            expect(ofChat().map((call) => call.inputs.length)).toEqual([32]);
            expect((await rows(chatId)).every((row) => row.embedding !== null)).toBe(true);
        });
    });
});

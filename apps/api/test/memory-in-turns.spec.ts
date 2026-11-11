import { Logger } from '@nestjs/common';
import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { DOCUMENTS_HEADING } from '../src/manager/document/document-search.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/memory-by-meaning/spec.md, "Choosing Memories for a turn" (ticket 02), through the
 * HTTP API and the fake gateway, whose vectors come from the words: one `context_search` per turn
 * serves Memories and Documents, and the turn, Suggested replies, Write for me and Snapshots all
 * get the Memories the choice picked.
 */

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

/** The old Memory a question about the compass should bring back. */
const COMPASS = 'Mira promised {user} the silver compass salvaged from the Albatross wreck.';
const QUESTION = 'Ash asks Mira about the silver compass salvaged from the Albatross wreck.';
/** Newer Memories about Mira, unrelated to the compass: together far past the 4k budget. */
const FILLER_COUNT = 200;
const filler = (n: number) => `Mira logged gull count ${n} beside lantern ${n} during watch ${n}, noting wind ${n}.`;

describe('Memory in turns', () => {
    let t: TestApp;
    let db: pg.Client;

    beforeAll(async () => {
        t = await startTestApp();
        db = new pg.Client({ connectionString: t.databaseUrl });
        await db.connect();
    });

    afterEach(() => {
        t.gateway.reset();
        vi.restoreAllMocks();
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

    async function play(storyId: number, chatId: number, text: string, extracted = NO_OPS, reply = '@Mira: Mm.'): Promise<void> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', extracted);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
    }

    /** A Chat whose first extraction made the compass Memory, then 200 newer ones about Mira, all embedded. */
    async function longChat(): Promise<{ storyId: number; chatId: number }> {
        const ids = await playableChat();
        const adds = [COMPASS, ...Array.from({ length: FILLER_COUNT }, (_, n) => filler(n))].map((text) => ({
            op: 'add',
            text,
            known_by: ['Mira'],
            cause: 'it happened',
        }));
        await play(ids.storyId, ids.chatId, 'I take the first watch.', JSON.stringify({ operations: adds }));
        const { rows } = await db.query(`SELECT count(*)::int AS n FROM memory WHERE chat_id = $1 AND embedding IS NOT NULL`, [ids.chatId]);
        expect(rows[0].n).toBe(FILLER_COUNT + 1);
        return ids;
    }

    const memoryLayerOf = (system: string) => system.slice(system.indexOf('# Memory'));
    const lastTurnSystem = () => t.gateway.textCalls('turn').at(-1)!.messages[0].content;
    const rendered = (text: string) => text.split('{user}').join('Ash');

    async function memoryId(chatId: number, text: string): Promise<number> {
        return (await db.query(`SELECT id FROM memory WHERE chat_id = $1 AND text = $2`, [chatId, text])).rows[0].id;
    }

    it('makes one context_search call a turn and sends the Memory closest to the moment over older unrelated ones, under 4k', async () => {
        const { storyId, chatId } = await longChat();
        t.gateway.reset();

        await play(storyId, chatId, QUESTION);

        expect(t.gateway.embeddingCalls('context_search')).toEqual([
            { kind: 'context_search', inputs: [expect.stringContaining(QUESTION)], servedFor: { storyId, chatId } },
        ]);
        expect(t.gateway.embeddingCalls('document_search')).toEqual([]);
        const layer = memoryLayerOf(lastTurnSystem());
        expect(layer).toContain(rendered(COMPASS));
        // The newest unrelated ones fill the rest of the room; the oldest are left out.
        expect(layer).toContain(filler(FILLER_COUNT - 1));
        expect(layer).not.toContain(filler(0));
        const sent = layer.split('\n').filter((line) => line.startsWith('- [known by'));
        expect(sent.length).toBeLessThan(FILLER_COUNT + 1);
        expect(Math.ceil(sent.join('\n').length / 4)).toBeLessThanOrEqual(4_000);
        // The choice is written in story order: the compass, the oldest, comes first.
        expect(sent[0]).toContain(rendered(COMPASS));
    });

    it('searches before the turn, and on a Story with no Documents and no embedded Memory makes no search', async () => {
        const { storyId, chatId } = await playableChat();
        t.gateway.reset();
        await play(storyId, chatId, QUESTION);
        expect(t.gateway.embeddingCalls()).toEqual([]);

        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/memories`).send({ text: COMPASS }).expect(201);
        t.gateway.reset();
        await play(storyId, chatId, QUESTION);
        const order = t.gateway.calls.map((call) => (call.method === 'embedTexts' ? call.request.kind : call.method === 'completeText' ? call.request.kind : null));
        expect(order.filter((kind) => kind === 'context_search')).toHaveLength(1);
        expect(order.indexOf('context_search')).toBeLessThan(order.indexOf('turn'));
    });

    it('makes one search for a Story with Documents and Memories, and the vector serves both', async () => {
        const { storyId, chatId } = await longChat();
        await t.http
            .post(`/api/stories/${storyId}/documents`)
            .send({ title: 'Albatross wreck', text: 'Mira salvaged the silver compass from the Albatross wreck.', source: 'pasted' })
            .expect(201);
        t.gateway.reset();

        await play(storyId, chatId, QUESTION);

        expect(t.gateway.embeddingCalls()).toEqual([{ kind: 'context_search', inputs: [expect.stringContaining(QUESTION)], servedFor: { storyId, chatId } }]);
        const turn = t.gateway.textCalls('turn').at(-1)!.messages;
        expect(turn.at(-1)!.content).toContain(`${DOCUMENTS_HEADING} (`);
        expect(turn.at(-1)!.content).toContain('## Albatross wreck');
        expect(memoryLayerOf(turn[0].content)).toContain(rendered(COMPASS));
    });

    it('writes the turn with the newest Memories when the search fails, and says so in the log', async () => {
        const { storyId, chatId } = await longChat();
        const warn = vi.spyOn(Logger.prototype, 'warn');
        t.gateway.reset();
        t.gateway.scriptEmbedding('context_search', new ProviderOutageError('DeepInfra is down.'));

        await play(storyId, chatId, QUESTION);

        expect(t.gateway.textCalls('turn')).toHaveLength(1);
        const layer = memoryLayerOf(lastTurnSystem());
        expect(layer).not.toContain(rendered(COMPASS));
        expect(layer).toContain(filler(FILLER_COUNT - 1));
        expect(warn.mock.calls.map(([message]) => String(message))).toContainEqual(expect.stringContaining('the Memory search failed'));
    });

    it('logs one Memory search debug line with the floor and top scores, without Memory or query text', async () => {
        const { storyId, chatId } = await longChat();
        const debug = vi.spyOn(Logger.prototype, 'debug');

        await play(storyId, chatId, QUESTION);

        const lines = debug.mock.calls.map(([message]) => String(message)).filter((message) => message.includes('Memory search'));
        expect(lines).toHaveLength(1);
        const compass = await memoryId(chatId, COMPASS);
        expect(lines[0]).toMatch(new RegExp(`^Story ${storyId}, Chat ${chatId}: Memory search, floor 0\\.35; top scores: \\d\\.\\d{3} #${compass} \\(sent\\)`));
        expect(lines[0]).not.toContain('compass');
    });

    it("marks the Memories the last turn used, on the Chat and in the Memory list, with no call", async () => {
        const { storyId, chatId } = await longChat();
        await play(storyId, chatId, QUESTION);
        t.gateway.reset();

        const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        const list = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body;

        const compass = await memoryId(chatId, COMPASS);
        const oldest = await memoryId(chatId, filler(0));
        expect(chat.memoriesInPlay.memoryIds).toContain(compass);
        expect(chat.memoriesInPlay.memoryIds).not.toContain(oldest);
        expect(chat.memoriesInPlay.beliefIds).toEqual([]);
        expect(list.inPlay).toEqual(chat.memoriesInPlay);
        // Reading the Chat asks for the remaining credit, as ever, and makes no model call.
        expect(t.gateway.calls.filter((call) => call.method !== 'remainingCredit')).toEqual([]);
    });

    it("carries the Memories' vectors and the in-play marks into a Branch, on the Branch's own ids, and its readers make the same choice", async () => {
        const { storyId, chatId } = await longChat();
        await play(storyId, chatId, QUESTION);
        const source = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;

        const branch = (await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${source.messages.at(-1).id}/branch`).expect(201)).body;

        const { rows } = await db.query(`SELECT count(*)::int AS n, count(embedding)::int AS embedded FROM memory WHERE chat_id = $1`, [branch.id]);
        expect(rows[0]).toEqual({ n: FILLER_COUNT + 1, embedded: FILLER_COUNT + 1 });
        const compass = await memoryId(branch.id, COMPASS);
        expect(compass).not.toBe(await memoryId(chatId, COMPASS));
        expect(branch.memoriesInPlay.memoryIds).toContain(compass);
        expect(branch.memoriesInPlay.memoryIds).toHaveLength(source.memoriesInPlay.memoryIds.length);

        t.gateway.reset();
        t.gateway.scriptText('write_for_me', 'I ask about the compass.');
        await t.http.post(`/api/stories/${storyId}/chats/${branch.id}/write-for-me`).send({ draft: '' }).expect(200);
        expect(memoryLayerOf(t.gateway.textCalls('write_for_me')[0].messages[0].content)).toContain(rendered(COMPASS));
    });

    it('marks nothing in play before any turn chose', async () => {
        const { storyId, chatId } = await playableChat();
        const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        expect(chat.memoriesInPlay).toEqual({ memoryIds: [], beliefIds: [] });
        expect((await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body.inPlay).toEqual({ memoryIds: [], beliefIds: [] });
    });

    describe('every reader uses the same choice', () => {
        it('Suggested replies, with the last turn\'s query and no call of their own', async () => {
            const { storyId, chatId } = await longChat();
            await play(storyId, chatId, QUESTION);
            t.gateway.reset();
            t.gateway.scriptText(
                'suggested_replies',
                JSON.stringify({ suggestions: [{ kind: 'action', text: 'I wait.' }, { kind: 'speech', text: '"Well?"' }, { kind: 'move', text: 'I leave.' }] }),
            );

            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/suggestions`).expect(200);

            const layer = memoryLayerOf(t.gateway.textCalls('suggested_replies')[0].messages[0].content);
            expect(layer).toContain(rendered(COMPASS));
            expect(layer).not.toContain(filler(0));
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });

        it('Write for me, with the last turn\'s query and no call of its own', async () => {
            const { storyId, chatId } = await longChat();
            await play(storyId, chatId, QUESTION);
            t.gateway.reset();
            t.gateway.scriptText('write_for_me', 'I ask about the compass.');

            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/write-for-me`).send({ draft: '' }).expect(200);

            const layer = memoryLayerOf(t.gateway.textCalls('write_for_me')[0].messages[0].content);
            expect(layer).toContain(rendered(COMPASS));
            expect(layer).not.toContain(filler(0));
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });

        it('the Snapshot prompt, which no longer gets every Memory', async () => {
            const { storyId, chatId } = await longChat();
            await play(storyId, chatId, QUESTION);
            t.gateway.reset();
            t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: ['Mira'], scene: 'Mira holds a compass.' }));
            t.gateway.scriptImage('snapshot_image', { image: { bytes: Buffer.from('jpeg'), mimeType: 'image/jpeg' }, model: 'seedream-v4-edit', costUsd: 0 });

            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshots`).send({}).expect(202);
            const deadline = Date.now() + 5_000;
            while (t.gateway.textCalls('snapshot_prompt').length === 0 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 20));

            const asked = t.gateway.textCalls('snapshot_prompt')[0].messages.map((message) => message.content).join('\n');
            // Let the job finish before the next test resets the gateway.
            while (Date.now() < deadline) {
                const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/snapshots`).expect(200);
                if (body.jobs.every((job: { status: string }) => job.status !== 'pending')) break;
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
            expect(asked).toContain(rendered(COMPASS));
            expect(asked).toContain(filler(FILLER_COUNT - 1));
            expect(asked).not.toContain(filler(0));
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });
    });

    describe('the locked warning', () => {
        const longLocked = (n: number) => `Ash swore oath ${n} at the lamp: ${'never to let the light go dark, '.repeat(6)}`.trim();

        it('is off while the locked Memories take half the budget or less, and on once they take more', async () => {
            const { storyId, chatId } = await playableChat();
            const list = async () => (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body;
            expect((await list()).lockedWarning).toBe(false);

            // About 60 tokens each: 30 of them are under half of 4,000, 40 are over.
            for (let n = 0; n < 30; n++) await t.http.post(`/api/stories/${storyId}/chats/${chatId}/memories`).send({ text: longLocked(n) }).expect(201);
            expect((await list()).lockedWarning).toBe(false);

            for (let n = 30; n < 40; n++) await t.http.post(`/api/stories/${storyId}/chats/${chatId}/memories`).send({ text: longLocked(n) }).expect(201);
            expect((await list()).lockedWarning).toBe(true);
        });
    });
});

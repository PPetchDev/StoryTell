import { Logger } from '@nestjs/common';
import pg from 'pg';

import { ModelRefusalError, OutOfCreditError, ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { DOCUMENTS_HEADING } from '../src/manager/document/document-search.js';
import { startTestApp, TestApp } from './harness/test-app.js';

const OPENING = 'Fog lies on the harbour.\n\n@Oren: The lamp is lit, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

/** Shares most of its words with the question below, so the fake gateway scores it high. */
const LIGHTHOUSE = 'The Gull Point lighthouse keeper trims the brass wick at dusk.';
const QUESTION = 'I ask Oren how the Gull Point lighthouse keeper trims the brass wick at dusk.';
/** Shares nothing with it. */
const BREAD = 'Bakers in the valley sell rye bread at dawn.';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    position: number;
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

// Spec: Documents, "Each turn: the search".
describe('Documents in turns', () => {
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

    async function playableStory(title = 'The Harbour'): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A foggy harbour town.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Oren', appearance: 'Weathered.', personality: 'Gruff.', voice: 'Short words.' })
            .expect(201);
        return storyId;
    }

    async function addDocument(storyId: number, title: string, text: string): Promise<number> {
        const { body } = await t.http.post(`/api/stories/${storyId}/documents`).send({ title, text, source: 'pasted' }).expect(201);
        return body.documents.find((document: { title: string }) => document.title === title).id;
    }

    async function newChat(storyId: number): Promise<number> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id;
    }

    function scriptTurn(reply = '@Oren: Dusk, every night.') {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function settle(storyId: number, chatId: number): Promise<Message[]> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const last: Message = body.messages.at(-1);
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return body.messages;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function send(storyId: number, chatId: number, text: string): Promise<Message[]> {
        scriptTurn();
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settle(storyId, chatId);
    }

    /** The trailing system message of the newest turn call. */
    const lastTrailing = () => t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content;

    async function recordOf(messageId: number): Promise<unknown> {
        const { rows } = await db.query(`SELECT document_passages FROM message WHERE id = $1`, [messageId]);
        return rows[0].document_passages;
    }

    async function passageIds(storyId: number, documentId: number): Promise<number[]> {
        const { rows } = await db.query(`SELECT id FROM document_passage WHERE story_id = $1 AND document_id = $2 ORDER BY position`, [storyId, documentId]);
        return rows.map((row) => row.id);
    }

    it('carries a passage that shares words with the turn, leaves an unrelated one out, and records what it used', async () => {
        const storyId = await playableStory();
        const lighthouse = await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
        await addDocument(storyId, 'Valley bakers', BREAD);
        const chatId = await newChat(storyId);
        t.gateway.reset();

        const messages = await send(storyId, chatId, QUESTION);

        const trailing = lastTrailing();
        expect(trailing).toContain(`${DOCUMENTS_HEADING} (`);
        expect(trailing).toContain(`## Gull Point light\n${LIGHTHOUSE}`);
        expect(trailing).not.toContain(BREAD);
        expect(t.gateway.textCalls('turn')[0].messages[0].content).not.toContain(LIGHTHOUSE);
        // One search, for this Story and Chat, made before the turn.
        expect(t.gateway.embeddingCalls('context_search')).toEqual([
            { kind: 'context_search', inputs: [expect.stringContaining(QUESTION)], servedFor: { storyId, chatId } },
        ]);
        const order = t.gateway.calls.map((call) => (call.method === 'embedTexts' ? 'search' : call.method === 'completeText' || call.method === 'streamText' ? call.request.kind : null));
        expect(order.indexOf('search')).toBeLessThan(order.indexOf('turn'));
        expect(await recordOf(messages.at(-1)!.id)).toEqual({ status: 'found', passageIds: await passageIds(storyId, lighthouse) });
    });

    it('searches once on every turn path, for the Story and Chat: send, Retry, Continue, Regenerate and a User Message edit', async () => {
        const storyId = await playableStory();
        await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
        const chatId = await newChat(storyId);
        t.gateway.reset();
        const searches = () => t.gateway.embeddingCalls('context_search');

        // A send whose turn fails, then Retry.
        t.gateway.scriptText('turn', new ProviderOutageError('Down.'));
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: QUESTION }).expect(502);
        expect(searches()).toHaveLength(1);
        scriptTurn();
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/retry`).expect(200);
        let messages = await settle(storyId, chatId);
        expect(searches()).toHaveLength(2);
        expect(lastTrailing()).toContain(LIGHTHOUSE);

        scriptTurn('@Oren: And the ledger.');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/continue`).expect(200);
        messages = await settle(storyId, chatId);
        expect(searches()).toHaveLength(3);

        scriptTurn('@Oren: Once more.');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${messages.at(-1)!.id}/regenerate`).expect(200);
        messages = await settle(storyId, chatId);
        expect(searches()).toHaveLength(4);

        const userMessage = messages.find((message) => message.kind === 'user')!;
        scriptTurn('@Oren: Edited.');
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${userMessage.id}`).send({ text: `${QUESTION} Again.` }).expect(200);
        await settle(storyId, chatId);
        expect(searches()).toHaveLength(5);

        for (const search of searches()) expect(search.servedFor).toEqual({ storyId, chatId });
    });

    it('makes no search for a Story without Documents and sends the same prompt as one whose Documents bring nothing up', async () => {
        const plain = await playableStory('Twin');
        const withDocuments = await playableStory('Twin');
        await addDocument(withDocuments, 'Valley bakers', BREAD);
        const plainChat = await newChat(plain);
        const documentsChat = await newChat(withDocuments);
        t.gateway.reset();

        const plainMessages = await send(plain, plainChat, QUESTION);
        expect(t.gateway.embeddingCalls()).toEqual([]);
        expect(await recordOf(plainMessages.at(-1)!.id)).toBeNull();
        const plainPrompt = t.gateway.textCalls('turn')[0].messages;

        const documentsMessages = await send(withDocuments, documentsChat, QUESTION);
        expect(t.gateway.embeddingCalls('context_search')).toHaveLength(1);
        expect(t.gateway.textCalls('turn')[1].messages).toEqual(plainPrompt);
        expect(await recordOf(documentsMessages.at(-1)!.id)).toEqual({ status: 'found', passageIds: [] });
    });

    it('finds a Document added after a turn on the next turn, and no longer one that was removed', async () => {
        const storyId = await playableStory();
        await addDocument(storyId, 'Valley bakers', BREAD);
        const chatId = await newChat(storyId);
        await send(storyId, chatId, QUESTION);
        expect(lastTrailing()).not.toContain(LIGHTHOUSE);

        const lighthouse = await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
        await send(storyId, chatId, QUESTION);
        expect(lastTrailing()).toContain(LIGHTHOUSE);

        await t.http.delete(`/api/stories/${storyId}/documents/${lighthouse}`).expect(200);
        await send(storyId, chatId, QUESTION);
        expect(lastTrailing()).not.toContain(LIGHTHOUSE);
        expect(lastTrailing()).not.toContain(DOCUMENTS_HEADING);
    });

    it.each([
        ['an outage', new ProviderOutageError('DeepInfra is down.')],
        ['a refusal', new ModelRefusalError('Refused.')],
    ])('plays the turn without Documents after %s at the embedding host, logs a warning and records failed', async (_, error) => {
        const storyId = await playableStory();
        await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
        const chatId = await newChat(storyId);
        const warn = vi.spyOn(Logger.prototype, 'warn');
        t.gateway.scriptEmbedding('context_search', error);

        const messages = await send(storyId, chatId, QUESTION);

        expect(lastTrailing()).not.toContain(DOCUMENTS_HEADING);
        expect(t.gateway.textCalls('turn')).toHaveLength(1);
        expect(await recordOf(messages.at(-1)!.id)).toEqual({ status: 'failed', passageIds: [] });
        expect(warn.mock.calls.map(([message]) => String(message))).toContainEqual(expect.stringContaining('the Document search failed'));
    });

    it('fails the turn as out of text credit when the search is refused for credit, storing no reply and making no turn call', async () => {
        const storyId = await playableStory();
        await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
        const chatId = await newChat(storyId);
        t.gateway.reset();
        t.gateway.scriptEmbedding('context_search', new OutOfCreditError('text'));

        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: QUESTION }).expect(402);

        expect(body.error.code).toBe('402.001.003');
        expect(t.gateway.textCalls('turn')).toEqual([]);
        const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
        expect(chat.messages.filter((message: Message) => message.kind === 'ai')).toHaveLength(1);

        // Credit back: the waiting message's turn plays normally.
        scriptTurn();
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/retry`).expect(200);
        await settle(storyId, chatId);
        expect(lastTrailing()).toContain(LIGHTHOUSE);
    });

    it('logs one debug line per search with the floor and top scores, without passage or query text', async () => {
        const storyId = await playableStory();
        await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
        await addDocument(storyId, 'Valley bakers', BREAD);
        const chatId = await newChat(storyId);
        const debug = vi.spyOn(Logger.prototype, 'debug');

        await send(storyId, chatId, QUESTION);

        const lines = debug.mock.calls.map(([message]) => String(message)).filter((message) => message.includes('Document search'));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toMatch(
            new RegExp(`^Story ${storyId}, Chat ${chatId}: Document search, floor 0\\.45; top scores: \\d\\.\\d{3} "Gull Point light" #0 \\(sent\\), \\d\\.\\d{3} "Valley bakers" #0$`),
        );
        expect(lines[0]).not.toContain('wick');
        expect(lines[0]).not.toContain('Oren how');
    });

    it("carries each copied Message's record into a Branch", async () => {
        const storyId = await playableStory();
        const lighthouse = await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
        const chatId = await newChat(storyId);
        const messages = await send(storyId, chatId, QUESTION);
        const reply = messages.at(-1)!;

        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${reply.id}/branch`).expect(201);

        const copied = body.messages.at(-1) as Message;
        expect(copied.id).not.toBe(reply.id);
        expect(await recordOf(copied.id)).toEqual({ status: 'found', passageIds: await passageIds(storyId, lighthouse) });
        // The Opening, which no turn wrote, has none.
        expect(await recordOf(body.messages[0].id)).toBeNull();
    });

    // Spec: Documents, "Documents in play".
    describe('Documents in play', () => {
        const inPlay = async (storyId: number, chatId: number) =>
            (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/documents`).expect(200)).body;

        it('says a Story without Documents has none, with no call', async () => {
            const storyId = await playableStory();
            const chatId = await newChat(storyId);
            await send(storyId, chatId, QUESTION);
            t.gateway.reset();

            expect(await inPlay(storyId, chatId)).toEqual({ hasDocuments: false, status: 'none', passages: [] });
            expect(t.gateway.calls).toEqual([]);
        });

        it('is none before any turn has searched, then lists the passages sent in order, with no call', async () => {
            const storyId = await playableStory();
            const long = `${LIGHTHOUSE} ${'It is a long and careful job that takes the whole of the evening. '.repeat(4)}`;
            await addDocument(storyId, 'Gull Point light', long);
            await addDocument(storyId, 'Valley bakers', BREAD);
            const chatId = await newChat(storyId);
            expect(await inPlay(storyId, chatId)).toEqual({ hasDocuments: true, status: 'none', passages: [] });

            await send(storyId, chatId, QUESTION);
            t.gateway.reset();
            const found = await inPlay(storyId, chatId);

            expect(t.gateway.calls).toEqual([]);
            expect(found).toEqual({
                hasDocuments: true,
                status: 'found',
                passages: [{ documentId: expect.any(Number), documentTitle: 'Gull Point light', position: 0, excerpt: expect.any(String) }],
            });
            const excerpt: string = found.passages[0].excerpt;
            expect(excerpt.startsWith(LIGHTHOUSE)).toBe(true);
            expect(excerpt.length).toBeLessThanOrEqual(160);
            expect(excerpt.endsWith('…')).toBe(true);
        });

        it('says failed after a failed search', async () => {
            const storyId = await playableStory();
            await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            const chatId = await newChat(storyId);
            t.gateway.scriptEmbedding('context_search', new ProviderOutageError('Down.'));
            await send(storyId, chatId, QUESTION);

            expect(await inPlay(storyId, chatId)).toEqual({ hasDocuments: true, status: 'failed', passages: [] });
        });

        it("drops a removed Document's passages", async () => {
            const storyId = await playableStory();
            const lighthouse = await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            await addDocument(storyId, 'Valley bakers', BREAD);
            const chatId = await newChat(storyId);
            await send(storyId, chatId, QUESTION);
            expect((await inPlay(storyId, chatId)).passages).toHaveLength(1);

            await t.http.delete(`/api/stories/${storyId}/documents/${lighthouse}`).expect(200);

            expect(await inPlay(storyId, chatId)).toEqual({ hasDocuments: true, status: 'found', passages: [] });
        });

        it('answers 404 for a Chat of another Story', async () => {
            const storyId = await playableStory();
            const other = await playableStory();
            const chatId = await newChat(other);
            await t.http.get(`/api/stories/${storyId}/chats/${chatId}/documents`).expect(404);
        });
    });

    // Spec: Documents, "Suggested replies and Write for me".
    describe('Suggested replies', () => {
        const SUGGESTED = JSON.stringify({
            suggestions: [
                { kind: 'action', text: 'I climb the stairs.' },
                { kind: 'speech', text: '"Show me the wick."' },
                { kind: 'move', text: 'I take the lamp.' },
            ],
        });

        async function suggest(storyId: number, chatId: number): Promise<string> {
            t.gateway.scriptText('suggested_replies', SUGGESTED);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/suggestions`).expect(200);
            return t.gateway.textCalls('suggested_replies').at(-1)!.messages.at(-1)!.content;
        }

        it("carry the newest AI Message's passages with no search call", async () => {
            const storyId = await playableStory();
            await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            await addDocument(storyId, 'Valley bakers', BREAD);
            const chatId = await newChat(storyId);
            await send(storyId, chatId, QUESTION);
            t.gateway.reset();

            const instruction = await suggest(storyId, chatId);

            expect(instruction).toContain(`## Gull Point light
${LIGHTHOUSE}`);
            expect(instruction).not.toContain(BREAD);
            expect(instruction.indexOf(DOCUMENTS_HEADING)).toBeLessThan(instruction.indexOf('Step outside the story'));
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });

        it("drop a removed Document's passages", async () => {
            const storyId = await playableStory();
            const lighthouse = await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            const chatId = await newChat(storyId);
            await send(storyId, chatId, QUESTION);
            await t.http.delete(`/api/stories/${storyId}/documents/${lighthouse}`).expect(200);

            const instruction = await suggest(storyId, chatId);

            expect(instruction).not.toContain(DOCUMENTS_HEADING);
            expect(t.gateway.embeddingCalls('context_search')).toHaveLength(1);
        });

        it('have no block after a failed search, or before any turn searched', async () => {
            const storyId = await playableStory();
            await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            const chatId = await newChat(storyId);
            // The Opening has no record.
            expect(await suggest(storyId, chatId)).not.toContain(DOCUMENTS_HEADING);

            t.gateway.scriptEmbedding('context_search', new ProviderOutageError('Down.'));
            await send(storyId, chatId, QUESTION);
            expect(await suggest(storyId, chatId)).not.toContain(DOCUMENTS_HEADING);
        });

        it('send the same prompt as before for a Story without Documents', async () => {
            const plain = await playableStory('Twin');
            const withDocuments = await playableStory('Twin');
            await addDocument(withDocuments, 'Valley bakers', BREAD);
            const plainChat = await newChat(plain);
            const documentsChat = await newChat(withDocuments);
            await send(plain, plainChat, QUESTION);
            await send(withDocuments, documentsChat, QUESTION);
            t.gateway.reset();

            await suggest(plain, plainChat);
            await suggest(withDocuments, documentsChat);

            const [first, second] = t.gateway.textCalls('suggested_replies');
            expect(second.messages).toEqual(first.messages);
            expect(first.messages.at(-1)!.content).not.toContain(DOCUMENTS_HEADING);
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });
    });

    // Spec: Documents, "Suggested replies and Write for me"; .scratch/sillytavern-gaps/integration.md, "Write for me's inputs".
    describe('Write for me', () => {
        async function writeForMe(storyId: number, chatId: number): Promise<string> {
            t.gateway.scriptText('write_for_me', '"Show me the wick."');
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/write-for-me`).send({ draft: 'ขอดูไส้ตะเกียง' }).expect(200);
            return t.gateway.textCalls('write_for_me').at(-1)!.messages.at(-1)!.content;
        }

        it("carries the newest AI Message's passages before its instruction, with no search call", async () => {
            const storyId = await playableStory();
            await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            await addDocument(storyId, 'Valley bakers', BREAD);
            const chatId = await newChat(storyId);
            await send(storyId, chatId, QUESTION);
            t.gateway.reset();

            const closing = await writeForMe(storyId, chatId);

            expect(closing).toContain(`## Gull Point light
${LIGHTHOUSE}`);
            expect(closing).not.toContain(BREAD);
            expect(closing.indexOf(DOCUMENTS_HEADING)).toBeLessThan(closing.indexOf('Step outside the story'));
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });

        it("drops a removed Document's passages, and has no block before any turn searched", async () => {
            const storyId = await playableStory();
            const lighthouse = await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            const chatId = await newChat(storyId);
            expect(await writeForMe(storyId, chatId)).not.toContain(DOCUMENTS_HEADING);

            await send(storyId, chatId, QUESTION);
            expect(await writeForMe(storyId, chatId)).toContain(DOCUMENTS_HEADING);
            await t.http.delete(`/api/stories/${storyId}/documents/${lighthouse}`).expect(200);

            expect(await writeForMe(storyId, chatId)).not.toContain(DOCUMENTS_HEADING);
            expect(t.gateway.embeddingCalls('context_search')).toHaveLength(1);
        });

        it('has no block after a failed search, and searches nothing itself', async () => {
            const storyId = await playableStory();
            await addDocument(storyId, 'Gull Point light', LIGHTHOUSE);
            const chatId = await newChat(storyId);
            t.gateway.scriptEmbedding('context_search', new ProviderOutageError('Down.'));
            await send(storyId, chatId, QUESTION);
            const searches = t.gateway.embeddingCalls('context_search').length;

            expect(await writeForMe(storyId, chatId)).not.toContain(DOCUMENTS_HEADING);
            expect(t.gateway.embeddingCalls('context_search')).toHaveLength(searches);
        });

        it('sends the same prompt as before for a Story without Documents', async () => {
            const plain = await playableStory('Twin');
            const withDocuments = await playableStory('Twin');
            await addDocument(withDocuments, 'Valley bakers', BREAD);
            const plainChat = await newChat(plain);
            const documentsChat = await newChat(withDocuments);
            await send(plain, plainChat, QUESTION);
            await send(withDocuments, documentsChat, QUESTION);
            t.gateway.reset();

            await writeForMe(plain, plainChat);
            await writeForMe(withDocuments, documentsChat);

            const [first, second] = t.gateway.textCalls('write_for_me');
            expect(second.messages).toEqual(first.messages);
            expect(first.messages.at(-1)!.content).not.toContain(DOCUMENTS_HEADING);
            expect(t.gateway.embeddingCalls()).toEqual([]);
        });
    });
});

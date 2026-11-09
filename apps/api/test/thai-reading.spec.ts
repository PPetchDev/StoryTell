import pg from 'pg';

import { buildThaiReadingPrompt, sourceFingerprint, thaiReadingSource } from '../src/manager/chat/thai-reading/thai-reading.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { fixture, RecordedRequest } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

import type { MessagePartResponse } from '../src/model/chat/entities/message-part.entity.js';

const createdAt = '2026-11-09T00:00:00.000Z';
const ai = (parts: MessagePartResponse[]) =>
    ({ id: 1, kind: 'ai', model: 'glm-5.3', parts, judge: null, memory: null, versions: null, createdAt }) as const;

describe('Thai reading: the source text (pure)', () => {
    it("is a User Message's stored text as it is", () => {
        expect(thaiReadingSource({ id: 1, kind: 'user', text: '*I sit.* "Thanks."', identityName: 'Ash', personaId: null, createdAt })).toBe(
            '*I sit.* "Thanks."',
        );
    });

    it("is an AI Message's parts in the Transcript's layout: narration as is, speech as Name: text, blank lines between", () => {
        const source = thaiReadingSource(
            ai([
                { kind: 'narration', text: 'Rain hammers the glass. ' },
                { kind: 'speech', characterId: 4, speakerName: 'Mira', text: ' Boots off, keeper.' },
                { kind: 'narration', text: '*She turns away.*' },
            ]),
        );
        expect(source).toBe('Rain hammers the glass.\n\nMira: Boots off, keeper.\n\n*She turns away.*');
    });

    it('reads the Opening the same way, speech kept under its stamped name', () => {
        expect(thaiReadingSource({ ...ai([{ kind: 'speech', characterId: null, speakerName: 'Old Tom', text: 'Lamp is out.' }]), model: 'author' })).toBe(
            'Old Tom: Lamp is out.',
        );
    });

    it('has a fingerprint that changes with the stored text and only with it', () => {
        const one = sourceFingerprint('Mira: Boots off.');
        expect(one).toMatch(/^[0-9a-f]{64}$/);
        expect(sourceFingerprint('Mira: Boots off.')).toBe(one);
        expect(sourceFingerprint('Mira: Boots off!')).not.toBe(one);
    });
});

describe('Thai reading: the prompt (pure)', () => {
    it('is a short background instruction outside the story, then the source, with names to keep as written', () => {
        const prompt = buildThaiReadingPrompt({ source: 'Mira: Boots off, keeper.', names: ['Mira', 'Ash', 'Mira', ' '] });

        expect(prompt.maxTokens).toBe(4_000);
        expect(prompt.messages).toHaveLength(2);
        const [system, user] = prompt.messages;
        expect(system.role).toBe('system');
        expect(system.content).toContain('natural, faithful Thai for an adult Thai reader');
        expect(system.content).toContain('no softening, no notes');
        expect(system.content).toContain('Keep every line\'s "Name:" label exactly as written');
        expect(system.content).toContain('Keep these names in their original spelling: Mira, Ash.');
        expect(system.content).toContain('*asterisks*');
        expect(user).toEqual({ role: 'user', content: 'Mira: Boots off, keeper.' });
    });
});

interface Part {
    kind: 'narration' | 'speech';
    text: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    parts?: Part[];
    thaiReading: string | null;
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

interface Chat {
    id: number;
    messages: Message[];
}

const OPENING = `The lamp went out an hour ago.

@Mira: You're late. Boots off, keeper.`;
const MIRA = { name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' };
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const OPENING_THAI = 'ตะเกียงดับไปเมื่อชั่วโมงก่อน\n\nMira: มาสายนะ ถอดรองเท้าซะ ผู้ดูแล';

describe('Thai reading: the API', () => {
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

    async function createStory(): Promise<number> {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
        return storyId;
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function scriptTurn(reply: string): void {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function send(storyId: number, chatId: number, text: string, reply: string): Promise<Chat> {
        scriptTurn(reply);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function ask(storyId: number, chatId: number, messageId: number) {
        return t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/thai-reading`);
    }

    async function read(storyId: number, chatId: number, messageId: number, thai: string): Promise<void> {
        t.gateway.scriptText('thai_reading', thai);
        const { body } = await ask(storyId, chatId, messageId).expect(200);
        expect(body).toEqual({ messageId, text: thai });
    }

    async function readingOf(storyId: number, chatId: number, messageId: number): Promise<string | null> {
        return (await getChat(storyId, chatId)).messages.find((message) => message.id === messageId)!.thaiReading;
    }

    async function rowsOf(messageIds: number[]): Promise<number> {
        const { rows } = await db.query('SELECT count(*)::int AS n FROM thai_reading WHERE message_id = ANY($1)', [messageIds]);
        return rows[0].n;
    }

    it('is made once from the stored text with the names to keep, shown on the Chat, and answered again with no second call', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const opening = chat.messages[0];
        expect(opening.thaiReading).toBeNull();
        t.gateway.scriptText('thai_reading', `  ${OPENING_THAI}\n`);

        const { body } = await ask(storyId, chat.id, opening.id).expect(200);

        expect(body).toEqual({ messageId: opening.id, text: OPENING_THAI });
        const [call] = t.gateway.textCalls('thai_reading');
        expect(call.messages.at(-1)).toEqual({ role: 'user', content: "The lamp went out an hour ago.\n\nMira: You're late. Boots off, keeper." });
        expect(call.messages[0].content).toContain('Keep these names in their original spelling: Mira, Ash.');
        expect(call.servedFor).toEqual({ storyId, chatId: chat.id });
        expect(await readingOf(storyId, chat.id, opening.id)).toBe(OPENING_THAI);

        // A second tap, or a double tap: the kept reading, no call.
        const again = await ask(storyId, chat.id, opening.id).expect(200);
        expect(again.body).toEqual({ messageId: opening.id, text: OPENING_THAI });
        expect(t.gateway.textCalls('thai_reading')).toHaveLength(1);
        expect(t.gateway.textCalls().map((c) => c.kind)).toEqual(['thai_reading']);
    });

    it('reads a User Message, and an edit of it makes the reading not current', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const played = await send(storyId, chat.id, 'I hang my coat by the stove.', '@Mira: Not there.');
        const line = played.messages[1];
        await read(storyId, chat.id, line.id, 'ฉันแขวนเสื้อโค้ทไว้ข้างเตา');

        expect(t.gateway.textCalls('thai_reading')[0].messages.at(-1)!.content).toBe('I hang my coat by the stove.');
        scriptTurn('@Mira: Better.');
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${line.id}`).send({ text: 'I hang my coat on the hook.' }).expect(200);
        await settled(storyId, chat.id);

        expect(await readingOf(storyId, chat.id, line.id)).toBeNull();
    });

    it("keeps each Reply version's reading: choosing a version back shows its reading again with no call", async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const played = await send(storyId, chat.id, 'Hello?', '@Mira: First take.');
        const reply = played.messages[2];
        await read(storyId, chat.id, reply.id, 'Mira: เทคแรก');
        scriptTurn('@Mira: Second take.');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${reply.id}/regenerate`).expect(200);
        await settled(storyId, chat.id);
        expect(await readingOf(storyId, chat.id, reply.id)).toBeNull();
        await read(storyId, chat.id, reply.id, 'Mira: เทคที่สอง');
        t.gateway.reset();

        await t.http.put(`/api/stories/${storyId}/chats/${chat.id}/messages/${reply.id}/version`).send({ version: 1 }).expect(200);
        expect(await readingOf(storyId, chat.id, reply.id)).toBe('Mira: เทคแรก');
        await t.http.put(`/api/stories/${storyId}/chats/${chat.id}/messages/${reply.id}/version`).send({ version: 2 }).expect(200);
        expect(await readingOf(storyId, chat.id, reply.id)).toBe('Mira: เทคที่สอง');
        expect(t.gateway.textCalls('thai_reading')).toHaveLength(0);
    });

    it('keeps at most five readings of one Message, dropping the oldest', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const opening = chat.messages[0].id;
        const edit = (text: string) => t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${opening}`).send({ text }).expect(200);
        for (let n = 1; n <= 6; n++) {
            await edit(`Take ${n}.`);
            await read(storyId, chat.id, opening, `เทค ${n}`);
        }

        expect(await rowsOf([opening])).toBe(5);
        await edit('Take 1.');
        expect(await readingOf(storyId, chat.id, opening)).toBeNull();
        await edit('Take 2.');
        expect(await readingOf(storyId, chat.id, opening)).toBe('เทค 2');
    });

    it('goes with its Message: a Reset and deleting the Chat remove the readings', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const played = await send(storyId, chat.id, 'Hello?', '@Mira: Hm.');
        const ids = played.messages.map((message) => message.id);
        await read(storyId, chat.id, ids[0], OPENING_THAI);
        await read(storyId, chat.id, ids[2], 'Mira: อืม');

        const reset = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200)).body as Chat;
        expect(reset.messages.map((message) => message.thaiReading)).toEqual([null]);
        expect(await rowsOf(ids)).toBe(0);

        await read(storyId, chat.id, reset.messages[0].id, OPENING_THAI);
        await t.http.delete(`/api/stories/${storyId}/chats/${chat.id}`).expect(204);
        expect(await rowsOf([reset.messages[0].id])).toBe(0);
    });

    it('is never part of the Chat: the next turn, Suggested replies, Write for me and the Transcript hold no Thai', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const played = await send(storyId, chat.id, 'Hello?', '@Mira: Hm.');
        for (const message of played.messages) await read(storyId, chat.id, message.id, `ไทย ${message.id}`);
        t.gateway.reset();

        await send(storyId, chat.id, 'Where is the key?', '@Mira: Pocket.');
        t.gateway.scriptText('suggested_replies', JSON.stringify({ action: 'I sit.', speech: '"Hi."', move: 'I go.' }));
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/suggestions`).expect(200);
        t.gateway.scriptText('write_for_me', '"Hi."');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/write-for-me`).send({ draft: '' }).expect(200);
        const transcript = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/transcript`).expect(200);

        const sent = t.gateway.textCalls().flatMap((call) => call.messages.map((message) => message.content));
        expect(t.gateway.textCalls().map((call) => call.kind).sort()).toEqual(['judge', 'memory_extraction', 'suggested_replies', 'turn', 'write_for_me']);
        expect(sent.filter((content) => content.includes('ไทย'))).toEqual([]);
        expect(transcript.text).not.toContain('ไทย');
    });

    it('carries the readings into a Branch, on the copied Messages, and none past the branch point', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await send(storyId, chat.id, 'Hello?', '@Mira: Hm.');
        const played = await send(storyId, chat.id, 'Where is the key?', '@Mira: Pocket.');
        for (const message of played.messages) await read(storyId, chat.id, message.id, `ไทย ${message.id}`);
        const shown = (await getChat(storyId, chat.id)).messages.map((message) => message.thaiReading);
        expect(shown).toEqual(played.messages.map((message) => `ไทย ${message.id}`));

        const branch = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages[2].id}/branch`).expect(201)).body as Chat;

        expect(branch.messages.map((message) => message.id)).not.toContain(played.messages[0].id);
        expect(branch.messages.map((message) => message.thaiReading)).toEqual(shown.slice(0, 3));
        const { rows } = await db.query('SELECT count(*)::int AS n FROM thai_reading r JOIN message m ON m.id = r.message_id WHERE m.chat_id = $1', [branch.id]);
        expect(rows[0].n).toBe(3);
    });

    it('is refused with text credit out and no call, while a kept reading is still answered', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const played = await send(storyId, chat.id, 'Hello?', '@Mira: Hm.');
        await read(storyId, chat.id, played.messages[0].id, OPENING_THAI);
        t.gateway.reset();
        t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });

        const { body } = await ask(storyId, chat.id, played.messages[2].id).expect(402);
        expect(body.error.code).toBe('402.001.003');
        await ask(storyId, chat.id, played.messages[0].id).expect(200);

        expect(t.gateway.textCalls()).toHaveLength(0);
    });

    it('answers 404 when the Message goes while its reading is made (a Reset meanwhile), storing nothing', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        let finish: (text: string) => void = () => {};
        const slow = new Promise<string>((resolve) => (finish = resolve));
        const original = t.gateway.completeText;
        t.gateway.completeText = async (request) => {
            t.gateway.calls.push({ method: 'completeText', request });
            return { text: await slow, model: FAKE_TEXT_MODEL, usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0 };
        };
        try {
            const asked = ask(storyId, chat.id, chat.messages[0].id).then((response) => response);
            await new Promise((resolve) => setTimeout(resolve, 200));
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
            finish(OPENING_THAI);

            const answered = await asked;
            expect(answered.status).toBe(404);
            expect(answered.body.error.code).toBe('404.004.006');
            expect(await rowsOf([chat.messages[0].id])).toBe(0);
        } finally {
            t.gateway.completeText = original;
        }
    });

    it("answers 404 for a Message of another Chat, and 502.004.020 for an empty answer, storing nothing", async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const other = await createChat(storyId);

        const missing = await ask(storyId, chat.id, other.messages[0].id).expect(404);
        expect(missing.body.error.code).toBe('404.004.006');

        t.gateway.scriptText('thai_reading', '   ');
        const empty = await ask(storyId, chat.id, chat.messages[0].id).expect(502);
        expect(empty.body.error.code).toBe('502.004.020');
        expect(await rowsOf([chat.messages[0].id])).toBe(0);
    });
});

describe('Thai reading through the real gateway', () => {
    let t: TestApp;
    let requests: RecordedRequest[];

    beforeAll(async () => {
        requests = [];
        const routed: FetchLike = async (url, init) => {
            requests.push({
                url,
                method: init.method ?? 'GET',
                headers: (init.headers ?? {}) as Record<string, string>,
                body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
            });
            const json = url.endsWith('/credits')
                ? fixture('openrouter/credits.json')
                : url.endsWith('/billing/balance')
                  ? fixture('venice/balance.json')
                  : fixture('openrouter/chat-thai-reading.json');
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        t = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('asks the background model under thai_reading and records the spend in the text pool', async () => {
        const storyId = (await t.http.post('/api/stories').send({ title: 'Real' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;

        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${chat.messages[0].id}/thai-reading`).expect(200);

        expect(body.text).toBe('Mira: ถอดรองเท้าซะ ผู้ดูแล');
        const [call] = requests.filter((request) => request.url.endsWith('/chat/completions'));
        expect(call.body).toMatchObject({
            model: 'deepseek/deepseek-v4-flash',
            provider: { only: ['deepinfra'] },
            max_tokens: 4000,
            messages: [{ role: 'system' }, { role: 'user', content: 'Mira: Boots off, keeper.' }],
        });
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        const { rows } = await client.query('SELECT kind, pool, model, story_id, chat_id FROM usage_record');
        await client.end();
        expect(rows).toEqual([{ kind: 'thai_reading', pool: 'text', model: 'deepseek-v4-flash', story_id: storyId, chat_id: chat.id }]);
    });
});

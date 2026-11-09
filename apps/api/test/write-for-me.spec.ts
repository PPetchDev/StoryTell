import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { LORE_HEADING } from '../src/manager/chat/lore/lore-select.js';
import { DRAFT_CLOSE, DRAFT_OPEN } from '../src/manager/chat/write-for-me/write-for-me-prompt.js';
import { FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { fixture, RecordedRequest } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: 'pending' | 'done' | 'failed' } | null;
    memory?: { status: 'pending' | 'done' | 'failed' } | null;
}

interface Chat {
    id: number;
    lastPlayedAt: string;
    messages: Message[];
}

const OPENING = `The lamp went out an hour ago. Rain hammers the gallery windows.

@Mira: You're late. Boots off, keeper.`;

const MIRA = {
    name: 'Mira',
    appearance: 'Tall, grey eyes, a scar across one eyebrow.',
    personality: 'Guarded and dry, warms slowly.',
    voice: 'Short sentences. Never says please.',
};

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

/** A Thai draft: "ask her about the key, sound suspicious". */
const THAI_DRAFT = 'ถามเธอเรื่องกุญแจ ทำเสียงสงสัย';
const WRITTEN = '*I narrow my eyes.* "Where did you put the key, Mira?"';

describe('Write for me', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper, arrived this morning.' }).expect(200);
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

    async function send(storyId: number, chatId: number, text: string, reply: string): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function write(storyId: number, chatId: number, draft: string) {
        return t.http.post(`/api/stories/${storyId}/chats/${chatId}/write-for-me`).send({ draft });
    }

    const closing = () => t.gateway.textCalls('write_for_me').at(-1)!.messages.at(-1)!;

    describe('the answer', () => {
        it('is the written Message, cleaned of its label and any Character line, and nothing is stored or started', async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            t.gateway.scriptText('write_for_me', `Ash: ${WRITTEN}\n@Mira: In my pocket.`);

            const { body } = await write(storyId, chat.id, THAI_DRAFT).expect(200);

            expect(body).toEqual({ text: WRITTEN });
            const after = await getChat(storyId, chat.id);
            expect(after.messages).toEqual(chat.messages);
            expect(after.lastPlayedAt).toBe(chat.lastPlayedAt);
            expect(t.gateway.textCalls().map((call) => call.kind)).toEqual(['write_for_me']);
        });

        it('writes from nothing for an empty draft', async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            t.gateway.scriptText('write_for_me', WRITTEN);

            const { body } = await write(storyId, chat.id, '').expect(200);

            expect(body.text).toBe(WRITTEN);
            expect(closing().content).toContain('The user has written nothing for it.');
            expect(closing().content).not.toContain(DRAFT_OPEN);
        });

        it('refuses an answer with nothing left as its own error, storing nothing', async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            t.gateway.scriptText('write_for_me', '@Mira: I answer for him.');

            const { body } = await write(storyId, chat.id, THAI_DRAFT).expect(502);

            expect(body.error.code).toBe('502.004.019');
            expect((await getChat(storyId, chat.id)).messages).toEqual(chat.messages);
        });

        it('passes a gateway error through', async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            t.gateway.scriptText('write_for_me', new ProviderOutageError('DeepInfra answered 503.'));

            const { body } = await write(storyId, chat.id, THAI_DRAFT).expect(502);

            expect(body.error.code).toBe('502.001.001');
        });

        it('refuses a draft over 4,000 characters, or none, with no call', async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);

            await write(storyId, chat.id, 'ก'.repeat(4_001)).expect(400);
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/write-for-me`).send({}).expect(400);

            expect(t.gateway.textCalls()).toHaveLength(0);
        });
    });

    describe('the gate', () => {
        it('is refused with text credit out, with no call', async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });

            const { body } = await write(storyId, chat.id, THAI_DRAFT).expect(402);

            expect(body.error.code).toBe('402.001.003');
            expect(t.gateway.textCalls()).toHaveLength(0);
        });

        it('is refused while a turn is being written, with no call', async () => {
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
                const turn = t.http
                    .post(`/api/stories/${storyId}/chats/${chat.id}/messages`)
                    .send({ text: 'Hello?' })
                    .then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 200));

                const { body } = await write(storyId, chat.id, THAI_DRAFT).expect(409);

                expect(body.error.code).toBe('409.004.004');
                expect(t.gateway.textCalls().map((call) => call.kind)).toEqual(['turn']);
                finish('Mira nods.');
                expect((await turn).status).toBe(201);
            } finally {
                t.gateway.completeText = original;
            }
        });

        it("is not blocked by the previous reply's failed background call", async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            t.gateway.scriptText('turn', 'Mira nods.');
            t.gateway.scriptText('judge', new ProviderOutageError('DeepInfra answered 503.'), new ProviderOutageError('DeepInfra answered 503.'));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(201);
            const failed = await settled(storyId, chat.id);
            expect(failed.messages[2].judge?.status).toBe('failed');
            t.gateway.scriptText('write_for_me', WRITTEN);

            const { body } = await write(storyId, chat.id, THAI_DRAFT).expect(200);

            expect(body.text).toBe(WRITTEN);
        });

        it('answers 404 for a Chat of another Story', async () => {
            const storyId = await createStory();
            const other = await createStory();
            const chat = await createChat(storyId);

            const { body } = await write(other, chat.id, THAI_DRAFT).expect(404);

            expect(body.error.code).toBe('404.004.001');
            expect(t.gateway.textCalls()).toHaveLength(0);
        });
    });

    describe('the prompt', () => {
        it("has the turn's system message and the history, then the draft and the worn identity in a closing user message", async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            await send(storyId, chat.id, 'I shake the rain off my coat.', '@Mira: Took your time.');
            t.gateway.scriptText('write_for_me', WRITTEN);

            await write(storyId, chat.id, THAI_DRAFT).expect(200);

            const turn = t.gateway.textCalls('turn')[0];
            const [call] = t.gateway.textCalls('write_for_me');
            expect(call).toMatchObject({ maxTokens: 600, stop: ['\n@'], servedFor: { storyId, chatId: chat.id } });
            expect(call.messages[0]).toEqual(turn.messages[0]);
            expect(call.messages.slice(1, -1)).toEqual([
                { role: 'assistant', content: expect.stringContaining("@Mira: You're late. Boots off, keeper.") },
                { role: 'user', content: 'I shake the rain off my coat.' },
                { role: 'assistant', content: '@Mira: Took your time.' },
            ]);
            const last = closing();
            expect(last.role).toBe('user');
            expect(last.content).toContain(`${DRAFT_OPEN}\n${THAI_DRAFT}\n${DRAFT_CLOSE}`);
            expect(last.content).toContain('as Ash, in second person for Ash ("you"), past tense');
        });

        it('names the Persona once the Chat wears one', async () => {
            const storyId = await createStory();
            const chat = await createChat(storyId);
            const persona = await t.http.post('/api/personas').send({ name: 'Rin', description: 'A drifter with a debt to settle.' }).expect(201);
            await t.http.put(`/api/stories/${storyId}/chats/${chat.id}/identity`).send({ personaId: persona.body.id }).expect(200);
            t.gateway.scriptText('write_for_me', `Rin: ${WRITTEN}`);

            const { body } = await write(storyId, chat.id, THAI_DRAFT).expect(200);

            expect(body.text).toBe(WRITTEN);
            expect(closing().content).toContain('The user plays Rin');
            expect(closing().content).not.toContain('Ash');
        });

        it('carries a Lore entry the latest exchange brought up before its instruction, and none that did not come up', async () => {
            const storyId = await createStory();
            await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Brass key', keywords: ['key'], text: 'The lamp room key is brass.' }).expect(201);
            await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Ferry', text: 'The ferry comes on Sundays.' }).expect(201);
            const chat = await createChat(storyId);
            await send(storyId, chat.id, 'I ask for the key.', '@Mira: Not yet.');
            t.gateway.scriptText('write_for_me', WRITTEN);

            await write(storyId, chat.id, THAI_DRAFT).expect(200);

            const last = closing().content;
            expect(last.startsWith(LORE_HEADING)).toBe(true);
            expect(last).toContain('## Brass key\nThe lamp room key is brass.');
            expect(last).not.toContain('The ferry comes on Sundays.');
            expect(last.indexOf('## Brass key')).toBeLessThan(last.indexOf('Step outside the story'));
        });
    });
});

describe('Write for me through the real gateway', () => {
    let t: TestApp;
    let requests: RecordedRequest[];

    beforeAll(async () => {
        requests = [];
        const routed: FetchLike = async (url, init) => {
            const request: RecordedRequest = {
                url,
                method: init.method ?? 'GET',
                headers: (init.headers ?? {}) as Record<string, string>,
                body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
            };
            requests.push(request);
            const json = url.endsWith('/credits')
                ? fixture('openrouter/credits.json')
                : url.endsWith('/billing/balance')
                  ? fixture('venice/balance.json')
                  : fixture('openrouter/chat-write-for-me.json');
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        t = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it("asks the play model with the stop string and the play model's Sampling, and records the spend under write_for_me in the text pool", async () => {
        const created = await t.http.post('/api/stories').send({ title: 'Real' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: 'The lamp is out.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);
        await t.http.put('/api/settings/samplers/glm-5.3').send({ temperature: 0.9, minP: null, topP: null, repetitionPenalty: null }).expect(200);

        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/write-for-me`).send({ draft: THAI_DRAFT }).expect(200);

        expect(body).toEqual({ text: '*You narrow your eyes.* "Where did you put the key, Mira?"' });
        const [call] = requests.filter((request) => request.url.endsWith('/chat/completions'));
        expect(call.body).toMatchObject({
            model: 'z-ai/glm-5.3',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
            max_tokens: 600,
            stop: ['\n@'],
            temperature: 0.9,
        });

        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query('SELECT kind, pool, model, story_id, chat_id, cost_usd::float8 AS cost_usd FROM usage_record ORDER BY id');
            expect(rows).toEqual([{ kind: 'write_for_me', pool: 'text', model: 'glm-5.3', story_id: storyId, chat_id: chatId, cost_usd: 0.000412 }]);
        } finally {
            await client.end();
        }

        const usage = await t.http.get('/api/usage').expect(200);
        expect(usage.body.pools.text.byKind).toEqual([{ kind: 'write_for_me', spentUsd: 0.000412, calls: 1 }]);
    });
});

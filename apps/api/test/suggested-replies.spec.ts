import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { PROMPT_LAYERS } from '../src/manager/chat/turn/prompt.js';
import { FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { fixture, RecordedRequest } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    judge?: { status: 'pending' | 'done' | 'failed'; error: string | null } | null;
    memory?: { status: 'pending' | 'done' | 'failed'; error: string | null } | null;
}

interface Chat {
    id: number;
    storyId: number;
    lastPlayedAt: string;
    identityName: string;
    messages: Message[];
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
}

interface Suggestion {
    kind: 'action' | 'speech' | 'move';
    text: string;
}

const OPENING = `The lamp went out an hour ago. Rain hammers the gallery windows.

@Mira: You're late. Boots off, keeper.`;

const MIRA = {
    name: 'Mira',
    appearance: 'Tall, grey eyes, a scar across one eyebrow.',
    personality: 'Guarded and dry, warms slowly.',
    voice: 'Short sentences. Never says please.',
};

/** A judgement that changes nothing, for turns whose Bonds, Arcs and Scene are not under test. */
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
/** An extraction that changes nothing, for turns whose Memory is not under test. */
const NO_OPS = '{"operations":[]}';

/** What the play model answers with: one of each kind, out of order to show the API orders them. */
const SUGGESTED = JSON.stringify({
    suggestions: [
        { kind: 'move', text: 'I take the logbook from her and read the last entry aloud.' },
        { kind: 'action', text: 'I pull my boots off and set them by the stove.' },
        { kind: 'speech', text: '"The ferry was late. So was the storm."' },
    ],
});

describe('Suggested replies', () => {
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

    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http
            .patch(`/api/stories/${storyId}`)
            .send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING })
            .expect(200);
        await t.http
            .patch(`/api/stories/${storyId}/role`)
            .send({ name: 'Ash', description: 'The new keeper, arrived this morning.' })
            .expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
        expect(body.playable).toBe(true);
        return body as Story;
    }

    async function createChat(storyId: number): Promise<Chat> {
        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        return body as Chat;
    }

    /** Sends a turn whose judge and extraction change nothing, and waits for both to settle. */
    async function send(storyId: number, chatId: number, text: string, reply: string): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    /** Returns once neither of the latest reply's background calls is pending. */
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

    /**
     * Holds every text call until `finish` gives its reply, so a test can act while a turn is
     * being written. `restore` puts the scripted fake back.
     */
    function holdTextCalls(): { finish(text: string): void; restore(): void } {
        let finish: (text: string) => void = () => {};
        const slow = new Promise<string>((resolve) => (finish = resolve));
        const original = t.gateway.completeText;
        t.gateway.completeText = async (request) => {
            t.gateway.calls.push({ method: 'completeText', request });
            return { text: await slow, model: FAKE_TEXT_MODEL, usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0 };
        };
        return { finish: (text) => finish(text), restore: () => (t.gateway.completeText = original) };
    }

    function suggest(storyId: number, chatId: number) {
        return t.http.post(`/api/stories/${storyId}/chats/${chatId}/suggestions`);
    }

    describe('the suggestions', () => {
        it('are three, one action, one line of speech and one bold move', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('suggested_replies', SUGGESTED);

            const { body } = await suggest(story.id, chat.id).expect(200);

            expect(body.suggestions as Suggestion[]).toEqual([
                { kind: 'action', text: 'I pull my boots off and set them by the stove.' },
                { kind: 'speech', text: '"The ferry was late. So was the storm."' },
                { kind: 'move', text: 'I take the logbook from her and read the last entry aloud.' },
            ]);
        });

        it('store nothing in the Chat and start no background call', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('suggested_replies', SUGGESTED);

            await suggest(story.id, chat.id).expect(200);

            const after = await getChat(story.id, chat.id);
            expect(after.messages).toEqual(chat.messages);
            expect(after.lastPlayedAt).toBe(chat.lastPlayedAt);
            expect(t.gateway.textCalls().map((call) => call.kind)).toEqual(['suggested_replies']);
        });
    });

    describe('unreadable output', () => {
        it.each([
            ['prose with no JSON', 'Maybe Ash takes off the boots?'],
            ['broken JSON', '{"suggestions":[{"kind":"action","text":"I sit."}'],
            ['two suggestions', JSON.stringify({ suggestions: [{ kind: 'action', text: 'I sit.' }, { kind: 'speech', text: '"Hi."' }] })],
            [
                'two of one kind',
                JSON.stringify({
                    suggestions: [
                        { kind: 'action', text: 'I sit.' },
                        { kind: 'action', text: 'I stand.' },
                        { kind: 'move', text: 'I leave.' },
                    ],
                }),
            ],
            [
                'an empty text',
                JSON.stringify({
                    suggestions: [
                        { kind: 'action', text: 'I sit.' },
                        { kind: 'speech', text: '  ' },
                        { kind: 'move', text: 'I leave.' },
                    ],
                }),
            ],
            [
                'an unknown kind',
                JSON.stringify({
                    suggestions: [
                        { kind: 'action', text: 'I sit.' },
                        { kind: 'thought', text: 'I wonder.' },
                        { kind: 'move', text: 'I leave.' },
                    ],
                }),
            ],
        ])('gives the typed error for %s, and stores nothing', async (_, output) => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('suggested_replies', output);

            const { body } = await suggest(story.id, chat.id).expect(502);

            expect(body.error.code).toBe('502.004.015');
            expect((await getChat(story.id, chat.id)).messages).toEqual(chat.messages);
        });

        it('reads a JSON object wrapped in a code fence', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('suggested_replies', `\`\`\`json\n${SUGGESTED}\n\`\`\``);

            const { body } = await suggest(story.id, chat.id).expect(200);

            expect((body.suggestions as Suggestion[]).map((suggestion) => suggestion.kind)).toEqual(['action', 'speech', 'move']);
        });
    });

    describe('the gate', () => {
        it('is refused with text credit out, with no call', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });

            const { body } = await suggest(story.id, chat.id).expect(402);

            expect(body.error.code).toBe('402.001.003');
            expect(t.gateway.textCalls()).toHaveLength(0);
        });

        it('is refused while a turn is being written, with no call', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const held = holdTextCalls();
            try {
                // Supertest sends only once awaited: `.then` starts the turn now.
                const turn = t.http
                    .post(`/api/stories/${story.id}/chats/${chat.id}/messages`)
                    .send({ text: 'Hello?' })
                    .then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 200));

                const { body } = await suggest(story.id, chat.id).expect(409);

                expect(body.error.code).toBe('409.004.004');
                expect(t.gateway.textCalls().map((call) => call.kind)).toEqual(['turn']);
                held.finish('Mira nods.');
                expect((await turn).status).toBe(201);
            } finally {
                held.restore();
            }
        });

        it("does not wait for the previous reply's background calls, and is not blocked by a failed one", async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', 'Mira nods.');
            t.gateway.scriptText('judge', new ProviderOutageError('DeepInfra answered 503.'));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(201);
            const failed = await settled(story.id, chat.id);
            expect(failed.messages[2].judge?.status).toBe('failed');
            t.gateway.scriptText('suggested_replies', SUGGESTED);

            const { body } = await suggest(story.id, chat.id).expect(200);

            expect(body.suggestions).toHaveLength(3);
        });

        it('answers 404 for a Chat of another Story', async () => {
            const story = await createStory();
            const other = await createStory();
            const chat = await createChat(story.id);

            const { body } = await suggest(other.id, chat.id).expect(404);

            expect(body.error.code).toBe('404.004.001');
        });
    });

    describe('the prompt', () => {
        it("has the turn's layers and the whole history, then asks for JSON written as the worn identity in the Story's point of view and tense", async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await send(story.id, chat.id, 'I shake the rain off my coat.', '@Mira: Took your time.');
            t.gateway.scriptText('suggested_replies', SUGGESTED);

            await suggest(story.id, chat.id).expect(200);

            const turn = t.gateway.textCalls('turn')[0];
            const [call] = t.gateway.textCalls('suggested_replies');
            expect(call).toMatchObject({ json: true, servedFor: { storyId: story.id, chatId: chat.id } });
            // The same system layers as the turn, so the two read the Chat the same way.
            expect(call.messages[0]).toEqual(turn.messages[0]);
            expect(call.messages[0].content).toContain(`${PROMPT_LAYERS.identity}\nAsh: The new keeper, arrived this morning.`);
            expect(call.messages.slice(1, -1)).toEqual([
                { role: 'assistant', content: expect.stringContaining("@Mira: You're late. Boots off, keeper.") },
                { role: 'user', content: 'I shake the rain off my coat.' },
                { role: 'assistant', content: '@Mira: Took your time.' },
            ]);
            const instruction = call.messages[call.messages.length - 1];
            // A user message: GLM-5.3 on DeepInfra answered a trailing system instruction with an empty {"": ""}.
            expect(instruction.role).toBe('user');
            expect(instruction.content).toContain('written as Ash in second person for Ash ("you"), past tense');
            expect(instruction.content).toContain('"action"');
            expect(instruction.content).toContain('"speech"');
            expect(instruction.content).toContain('"move"');
            expect(instruction.content).toContain('JSON');
        });

        it('names the Persona once the Chat wears one', async () => {
            const story = await createStory();
            await t.http.patch(`/api/stories/${story.id}`).send({ pov: 'first', tense: 'present' }).expect(200);
            const chat = await createChat(story.id);
            const persona = await t.http.post('/api/personas').send({ name: 'Rin', description: 'A drifter with a debt to settle.' }).expect(201);
            await t.http.put(`/api/stories/${story.id}/chats/${chat.id}/identity`).send({ personaId: persona.body.id }).expect(200);
            t.gateway.scriptText('suggested_replies', SUGGESTED);

            await suggest(story.id, chat.id).expect(200);

            const [call] = t.gateway.textCalls('suggested_replies');
            expect(call.messages[0].content).toContain(`${PROMPT_LAYERS.identity}\nRin: A drifter with a debt to settle.`);
            const instruction = call.messages[call.messages.length - 1].content;
            expect(instruction).toContain('written as Rin in first person as Rin ("I"), present tense');
            expect(instruction).not.toContain('Ash');
        });
    });
});

describe('Suggested replies through the real gateway', () => {
    let t: TestApp;
    let requests: RecordedRequest[];

    beforeAll(async () => {
        requests = [];
        // Routes by URL rather than by order: the gate reads credit before the call.
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
                  : fixture('openrouter/chat-suggested-replies.json');
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        t = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    it('asks the play model in JSON mode with no stop strings, and records the spend under its own kind in the text pool', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'Real' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: 'The lamp is out.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(MIRA).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);

        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/suggestions`).expect(200);

        expect(body.suggestions).toEqual([
            { kind: 'action', text: 'You pull your boots off and set them by the stove.' },
            { kind: 'speech', text: '"The ferry was late. So was the storm."' },
            { kind: 'move', text: 'You take the logbook from her and read the last entry aloud.' },
        ]);
        const [call] = requests.filter((request) => request.url.endsWith('/chat/completions'));
        expect(call.body).toMatchObject({
            model: 'z-ai/glm-5.3',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
            response_format: { type: 'json_object' },
            max_tokens: 400,
        });
        expect(call.body).not.toHaveProperty('stop');

        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query(
                'SELECT kind, pool, model, story_id, chat_id, cost_usd::float8 AS cost_usd FROM usage_record ORDER BY id',
            );
            expect(rows).toEqual([
                { kind: 'suggested_replies', pool: 'text', model: 'glm-5.3', story_id: storyId, chat_id: chatId, cost_usd: 0.000654 },
            ]);
        } finally {
            await client.end();
        }

        const usage = await t.http.get('/api/usage').expect(200);
        expect(usage.body.pools.text).toMatchObject({
            spentUsd: 0.000654,
            calls: 1,
            byKind: [{ kind: 'suggested_replies', spentUsd: 0.000654, calls: 1 }],
        });
        expect(usage.body.pools.image.byKind).toEqual([]);
    });
});

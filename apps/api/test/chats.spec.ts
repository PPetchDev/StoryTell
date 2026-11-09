import pg from 'pg';

import { ModelRefusalError, ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { PROMPT_LAYERS, TURN_PROMPT_TOKEN_BUDGET } from '../src/manager/chat/turn/prompt.js';
import { FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { fixture, RecordedRequest } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Part {
    kind: 'narration' | 'speech';
    characterId?: number | null;
    speakerName?: string;
    text: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    identityName?: string;
    model?: string;
    parts?: Part[];
    judge?: { status: 'pending' | 'done' | 'failed'; error: string | null } | null;
    memory?: { status: 'pending' | 'done' | 'failed'; error: string | null } | null;
}

interface Chat {
    id: number;
    storyId: number;
    title: string;
    createdAt: string;
    lastPlayedAt: string;
    currentScene: { id: number; name: string } | null;
    identityName: string;
    messages: Message[];
    awaitingReply: boolean;
    playable: boolean;
    missing: Array<{ field: string; label: string }>;
    textCreditOut: boolean;
    playModel: string;
    drift: { lastModel: string; playModel: string; lastModelLabel: string; playModelLabel: string } | null;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    scenes: Array<{ id: number; name: string }>;
}

const OPENING = `The lamp went out an hour ago. Rain hammers the gallery windows.

@Mira: You're late. Boots off, keeper.

She doesn't look up from the logbook.`;

const CAST = [
    {
        name: 'Mira',
        appearance: 'Tall, grey eyes, a scar across one eyebrow.',
        personality: 'Guarded and dry, warms slowly.',
        voice: 'Short sentences. Never says please.',
        exampleLines: ['Go away.', 'Boots off.'],
        background: 'Kept the light alone for six years.',
        secrets: 'She let the lamp go out on purpose.',
    },
    {
        name: "Kai O'Rourke",
        appearance: 'Wiry, sunburnt, a gold tooth.',
        personality: 'Cheerful, nosy.',
        voice: 'Rambling, calls everyone "friend".',
    },
];

function countSql(fromTable: string, where: string) {
    return `SELECT count(*)::int AS n FROM "${fromTable}" WHERE ${where}`;
}

/** A judgement that changes nothing, for turns whose Bonds, Arcs and Scene are not under test. */
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
/** An extraction that changes nothing, for turns whose Memory is not under test. */
const NO_OPS = '{"operations":[]}';

/** Both background calls run after a turn; this returns once the last reply's judge and extraction have settled. */
async function awaitJudge(http: TestApp['http'], storyId: number, chatId: number): Promise<Chat> {
    const deadline = Date.now() + 5_000;
    for (;;) {
        const { body } = await http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        const chat = body as Chat;
        const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
        if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
        if (Date.now() > deadline) throw new Error('The judge did not settle in time');
        await new Promise((resolve) => setTimeout(resolve, 20));
    }
}

describe('Chats', () => {
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

    /** A playable Story with two Characters and, optionally, Scenes. */
    async function createStory(options: { scenes?: Array<{ name: string; situation: string; moveOnCondition?: string }> } = {}): Promise<Story> {
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
        for (const character of CAST) {
            await t.http.post(`/api/stories/${storyId}/characters`).send(character).expect(201);
        }
        for (const scene of options.scenes ?? []) {
            await t.http.post(`/api/stories/${storyId}/scenes`).send(scene).expect(201);
        }
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

    /**
     * Sends a turn whose judge and extraction change nothing, and waits for both to settle.
     * Answers the Chat as read after them, so the reply's statuses are `done`, not the
     * `pending` the send itself answered with.
     */
    async function send(storyId: number, chatId: number, text: string, reply: string | object): Promise<Chat> {
        t.gateway.scriptText('turn', reply as string);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return awaitJudge(t.http, storyId, chatId);
    }

    function lastAi(chat: Chat): Message {
        const last = chat.messages[chat.messages.length - 1];
        expect(last.kind).toBe('ai');
        return last;
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

    function lastTurnCall() {
        const calls = t.gateway.textCalls('turn');
        return calls[calls.length - 1];
    }

    async function countRows(sql: string, params: unknown[]): Promise<number> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query(sql, params);
            return rows[0].n as number;
        } finally {
            await client.end();
        }
    }

    describe('Chats per Story', () => {
        it('starts a Chat with the Opening as Message 1, split into parts, model "author"', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            expect(chat).toMatchObject({
                storyId: story.id,
                title: 'Chat 1',
                identityName: 'Ash',
                currentScene: null,
                awaitingReply: false,
                playable: true,
                drift: null,
            });
            expect(chat.messages).toHaveLength(1);
            expect(chat.messages[0]).toMatchObject({ kind: 'ai', model: 'author' });
            expect(chat.messages[0].parts).toEqual([
                { kind: 'narration', text: 'The lamp went out an hour ago. Rain hammers the gallery windows.' },
                {
                    kind: 'speech',
                    characterId: story.characters[0].id,
                    speakerName: 'Mira',
                    text: "You're late. Boots off, keeper.",
                },
                { kind: 'narration', text: "She doesn't look up from the logbook." },
            ]);
        });

        it('starts at the first Scene when the Story has Scenes', async () => {
            const story = await createStory({
                scenes: [
                    { name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up.' },
                    { name: 'The lamp', situation: 'Light it.' },
                ],
            });
            const chat = await createChat(story.id);

            expect(chat.currentScene).toEqual({ id: story.scenes[0].id, name: 'Arrival' });
        });

        it('names Chats "Chat N", lists them with created and last played times, and renames', async () => {
            const story = await createStory();
            const first = await createChat(story.id);
            const second = await createChat(story.id);
            expect(second.title).toBe('Chat 2');

            const renamed = await t.http
                .patch(`/api/stories/${story.id}/chats/${first.id}`)
                .send({ title: '  Second try  ' })
                .expect(200);
            expect(renamed.body.title).toBe('Second try');
            const kept = await t.http.patch(`/api/stories/${story.id}/chats/${first.id}`).send({ title: '   ' }).expect(200);
            expect(kept.body.title).toBe('Second try');

            const { body } = await t.http.get(`/api/stories/${story.id}/chats`).expect(200);
            expect(body.chats).toHaveLength(2);
            expect(body.chats.map((chat: Chat) => chat.title)).toEqual(['Chat 2', 'Second try']);
            for (const chat of body.chats as Chat[]) {
                expect(chat.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
                expect(chat.lastPlayedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            }
        });

        it('lists the most recently played Chat first and bumps last played on a turn', async () => {
            const story = await createStory();
            const first = await createChat(story.id);
            const second = await createChat(story.id);
            expect((await t.http.get(`/api/stories/${story.id}/chats`)).body.chats[0].id).toBe(second.id);

            const played = await send(story.id, first.id, 'I take my boots off.', 'Mira grunts.');

            expect(Date.parse(played.lastPlayedAt)).toBeGreaterThan(Date.parse(first.lastPlayedAt));
            expect((await t.http.get(`/api/stories/${story.id}/chats`)).body.chats[0].id).toBe(first.id);
        });

        it('refuses to start a Chat on a Story that is not playable', async () => {
            const story = await createStory();
            await t.http.patch(`/api/stories/${story.id}`).send({ opening: '' }).expect(200);

            const { body } = await t.http.post(`/api/stories/${story.id}/chats`).expect(422);

            expect(body.error.code).toBe('422.004.002');
            expect(body.error.message).toContain('Opening');
        });

        it('answers 404 for an unknown Story or a Chat of another Story', async () => {
            const story = await createStory();
            const other = await createStory();
            const chat = await createChat(story.id);

            expect((await t.http.get('/api/stories/999999/chats').expect(404)).body.error.code).toBe('404.003.001');
            expect((await t.http.get(`/api/stories/${other.id}/chats/${chat.id}`).expect(404)).body.error.code).toBe(
                '404.004.001',
            );
            expect((await t.http.get(`/api/stories/${story.id}/chats/999999`).expect(404)).body.error.code).toBe(
                '404.004.001',
            );
        });

        it('deletes a Chat with its Messages, and deleting the Story takes its Chats', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const other = await createChat(story.id);
            await send(story.id, chat.id, 'Hello?', 'Mira says nothing.\n\n@Mira: Boots.');
            expect(await countRows(countSql('message', 'chat_id = $1'), [chat.id])).toBe(3);

            await t.http.delete(`/api/stories/${story.id}/chats/${chat.id}`).expect(204);

            await t.http.get(`/api/stories/${story.id}/chats/${chat.id}`).expect(404);
            expect(await countRows(countSql('message', 'chat_id = $1'), [chat.id])).toBe(0);
            expect(
                await countRows(
                    countSql('message_part', 'message_id IN (SELECT id FROM "message" WHERE chat_id = $1)'),
                    [chat.id],
                ),
            ).toBe(0);
            expect((await t.http.get(`/api/stories/${story.id}/chats`)).body.chats.map((c: Chat) => c.id)).toEqual([other.id]);

            await t.http.delete(`/api/stories/${story.id}`).expect(204);
            expect(await countRows(countSql('chat', 'story_id = $1'), [story.id])).toBe(0);
            expect(await countRows(countSql('message', 'chat_id = $1'), [other.id])).toBe(0);
        });
    });

    describe('reply parser and guard', () => {
        it('splits parts and stamps canonical cast names, case-insensitively', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const reply = `The door bangs open behind you.

@mira: Shut it. You're letting the storm in.
She finally looks up, taking you in from boots to hat.

*@KAI O'ROURKE*: Friend! You made it up the cliff path in this?

Rain drips from the brim of your hat onto the floorboards.
Nobody moves to help.`;

            const played = await send(story.id, chat.id, 'I push the door open.', reply);

            const [mira, kai] = story.characters;
            expect(lastAi(played).parts).toEqual([
                { kind: 'narration', text: 'The door bangs open behind you.' },
                {
                    kind: 'speech',
                    characterId: mira.id,
                    speakerName: 'Mira',
                    text: "Shut it. You're letting the storm in.\nShe finally looks up, taking you in from boots to hat.",
                },
                {
                    kind: 'speech',
                    characterId: kai.id,
                    speakerName: "Kai O'Rourke",
                    text: 'Friend! You made it up the cliff path in this?',
                },
                {
                    kind: 'narration',
                    text: 'Rain drips from the brim of your hat onto the floorboards.\nNobody moves to help.',
                },
            ]);
            expect(lastAi(played).model).toBe(FAKE_TEXT_MODEL);
            expect(played.awaitingReply).toBe(false);
            expect(played.messages[played.messages.length - 2]).toMatchObject({
                kind: 'user',
                text: 'I push the door open.',
                identityName: 'Ash',
            });
        });

        it('keeps an unknown speaker by name with no Character link', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const played = await send(
                story.id,
                chat.id,
                'Who else is here?',
                '@Mira: Nobody.\n\n@The Stranger: That is not quite true.\n\nA cough from the stairwell.',
            );

            expect(lastAi(played).parts).toEqual([
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Nobody.' },
                { kind: 'speech', characterId: null, speakerName: 'The Stranger', text: 'That is not quite true.' },
                { kind: 'narration', text: 'A cough from the stairwell.' },
            ]);
        });

        it.each([
            ['Ash:', 'Ash: I step back.'],
            ['@Ash:', '@Ash: I step back.'],
            ['*Ash*:', '*Ash*: I step back.'],
            ['You:', 'You: I step back.'],
            ['@ash: (any case)', '@ash: I step back.'],
        ])('cuts the reply at a %s line written as the Role', async (_label, userLine) => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const played = await send(
                story.id,
                chat.id,
                'I wait.',
                `Mira stands.\n\n@Mira: Well?\n\n${userLine}\n\n@Mira: Thought so.`,
            );

            expect(lastAi(played).parts).toEqual([
                { kind: 'narration', text: 'Mira stands.' },
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Well?' },
            ]);
        });

        it('does not cut the Opening at a line the author wrote as the Role', async () => {
            const story = await createStory();
            await t.http
                .patch(`/api/stories/${story.id}`)
                .send({ opening: 'The door is open.\n\nAsh: Hello?\n\n@Mira: Boots off.' })
                .expect(200);

            const chat = await createChat(story.id);

            expect(chat.messages[0].parts).toEqual([
                { kind: 'narration', text: 'The door is open.\n\nAsh: Hello?' },
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Boots off.' },
            ]);
        });
    });

    describe('the prompt', () => {
        it('is assembled in the layer order, with Secrets marked as known only to that Character', async () => {
            const story = await createStory({
                scenes: [{ name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up.' }],
            });
            await t.http.patch(`/api/stories/${story.id}`).send({ pov: 'second', tense: 'present', replyLength: 'short' }).expect(200);
            const chat = await createChat(story.id);

            await send(story.id, chat.id, 'I knock the rain off my hat.', 'Mira nods.');

            const call = lastTurnCall();
            expect(call.kind).toBe('turn');
            expect(call.servedFor).toEqual({ storyId: story.id, chatId: chat.id });
            expect(call.maxTokens).toBe(450);

            const [system, ...rest] = call.messages;
            expect(system.role).toBe('system');
            const order = [
                PROMPT_LAYERS.rules,
                PROMPT_LAYERS.setting,
                PROMPT_LAYERS.identity,
                PROMPT_LAYERS.style,
                PROMPT_LAYERS.cast,
                PROMPT_LAYERS.scene,
                PROMPT_LAYERS.feelings,
                PROMPT_LAYERS.arcs,
                PROMPT_LAYERS.memory,
            ].map((heading) => system.content.indexOf(heading));
            expect(order.every((index) => index >= 0)).toBe(true);
            expect([...order].sort((a, b) => a - b)).toEqual(order);
            // The Memory layer is last in the system message and empty on the first turn.
            expect(system.content.endsWith(`${PROMPT_LAYERS.memory} (what has happened in this Chat so far)
Nothing has been established in this Chat yet.
A Character knows only the Memories it is tagged on and acts as if the rest never happened; the Narrator knows them all.`)).toBe(true);

            expect(system.content).toContain('A lighthouse on a storm-cut island, 1890s.');
            expect(system.content).toContain('Ash: The new keeper, arrived this morning.');
            expect(system.content).toContain('second person for Ash ("you"), present tense');
            expect(system.content).toContain('Reply length: 60–150 words');
            expect(system.content).toContain('## Mira');
            expect(system.content).toContain("## Kai O'Rourke");
            expect(system.content).toContain('- Go away.');
            expect(system.content).toContain(
                'Secrets (known only to Mira; no one else knows these unless Mira reveals them): She let the lamp go out on purpose.',
            );
            expect(system.content).toContain('# Current Scene: Arrival\nReach the lamp room.\nThis Scene moves on once: Mira lets Ash up.');
            expect(system.content).toContain('using exactly these names: Mira, Kai O\'Rourke');
            expect(system.content).toContain("NEVER write Ash's words, thoughts, feelings, decisions or actions");

            // Then the recent Messages, the user's message and the final instruction.
            expect(rest).toEqual([
                { role: 'assistant', content: OPENING },
                { role: 'user', content: 'I knock the rain off my hat.' },
                {
                    role: 'system',
                    content: expect.stringMatching(/^Where things stand: [^\n]+\nWrite the next turn now. Do not write anything Ash says, thinks or does. Use @Name: lines for Character speech, spoken words only: no parentheses or \*\(stage directions\)\* inside them, even where earlier turns had them. Actions go in narration.$/),
                },
            ]);
            expect(call.stop).toEqual(['\nAsh:', '\n@Ash:', '\nYou:']);
        });

        it('says the story unfolds freely when there is no Scene, and sends the turn so far', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await send(story.id, chat.id, 'First.', 'Mira looks up.\n\n@Mira: What?');

            await send(story.id, chat.id, 'Second.', 'Mira shrugs.');

            const call = lastTurnCall();
            expect(call.messages[0].content).toContain('No Scene — the story unfolds freely.');
            expect(call.messages.slice(1, -1)).toEqual([
                { role: 'assistant', content: OPENING },
                { role: 'user', content: 'First.' },
                { role: 'assistant', content: 'Mira looks up.\n\n@Mira: What?' },
                { role: 'user', content: 'Second.' },
            ]);
            expect(call.maxTokens).toBe(900);
        });

        it('trims the recent-Message window from the oldest to fit the token budget', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            // Each long message is about 4.75k tokens: three fit a 16k prompt beside the system
            // prompt, four cannot.
            const long = (n: number) => `Turn ${n}. ${'The storm goes on and on. '.repeat(770)}`.slice(0, 19_000);
            expect(TURN_PROMPT_TOKEN_BUDGET).toBe(16_000);

            await send(story.id, chat.id, long(1), 'Reply one.');
            await send(story.id, chat.id, long(2), 'Reply two.');
            await send(story.id, chat.id, long(3), 'Reply three.');
            await send(story.id, chat.id, long(4), 'Reply four.');

            const call = lastTurnCall();
            const contents = call.messages.map((message) => message.content);
            expect(contents).not.toContain(OPENING);
            expect(contents).not.toContain(long(1));
            expect(call.messages.slice(1).map((message) => message.content.slice(0, 12))).toEqual([
                'Reply one.',
                'Turn 2. The ',
                'Reply two.',
                'Turn 3. The ',
                'Reply three.',
                'Turn 4. The ',
                'Where things',
            ]);
            // Every stored Message is still there; only the prompt window is trimmed.
            expect((await getChat(story.id, chat.id)).messages).toHaveLength(9);
        });
    });

    describe('a failed turn', () => {
        it('stores no AI Message, keeps the User Message, and Retry runs the turn again', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', new ProviderOutageError());

            const failed = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(502);
            expect(failed.body.error.code).toBe('502.001.001');

            const waiting = await getChat(story.id, chat.id);
            expect(waiting.awaitingReply).toBe(true);
            expect(waiting.messages).toHaveLength(2);
            expect(waiting.messages[1]).toMatchObject({ kind: 'user', text: 'Hello?' });
            expect(Date.parse(waiting.lastPlayedAt)).toBe(Date.parse(chat.lastPlayedAt));

            t.gateway.scriptText('turn', '@Mira: Took you long enough.');
            // Scripted, so no failing background call (and its automatic retry) spills into the next test.
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const retried = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/retry`).expect(200);

            expect(retried.body.awaitingReply).toBe(false);
            expect(retried.body.messages).toHaveLength(3);
            expect(lastAi(retried.body as Chat).parts).toEqual([
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Took you long enough.' },
            ]);
            // The same turn: the retried call carries the same User Message.
            const calls = t.gateway.textCalls('turn');
            expect(calls).toHaveLength(2);
            expect(calls[1].messages).toEqual(calls[0].messages);
            await awaitJudge(t.http, story.id, chat.id);
        });

        it('refuses Retry when the Chat is not waiting for a reply', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/retry`).expect(409);

            expect(body.error.code).toBe('409.004.003');
            expect(t.gateway.textCalls()).toHaveLength(0);
        });

        it('passes a refusal through unchanged, with the User Message kept', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await send(story.id, chat.id, 'Hi.', 'Mira nods.');
            t.gateway.scriptText('turn', new ModelRefusalError());

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Again.' }).expect(422);

            expect(body.error.code).toBe('422.001.002');
            expect((await getChat(story.id, chat.id)).awaitingReply).toBe(true);
        });
    });

    describe('blocked sends', () => {
        it('rejects an empty message without a call', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: '   ' }).expect(422);

            expect(body.error.code).toBe('422.004.005');
            expect(t.gateway.textCalls()).toHaveLength(0);
        });

        it('blocks sending while a required Story field is empty, naming the field', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await t.http.patch(`/api/stories/${story.id}/characters/${story.characters[0].id}`).send({ voice: ' ' }).expect(200);

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(422);

            expect(body.error.code).toBe('422.004.002');
            expect(body.error.message).toContain('Mira: Voice');
            expect(t.gateway.textCalls()).toHaveLength(0);
            const blocked = await getChat(story.id, chat.id);
            expect(blocked.playable).toBe(false);
            expect(blocked.missing).toEqual([{ field: 'characters.0.voice', label: 'Mira: Voice' }]);
            // Nothing was stored for the blocked send.
            expect(blocked.messages).toHaveLength(1);

            await t.http.patch(`/api/stories/${story.id}/characters/${story.characters[0].id}`).send({ voice: 'Clipped.' }).expect(200);
            await send(story.id, chat.id, 'Hello?', 'Mira nods.');
        });

        it('blocks sending when text credit is out, and not when it is unknown', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(402);

            expect(body.error.code).toBe('402.001.003');
            expect(t.gateway.textCalls()).toHaveLength(0);
            expect((await getChat(story.id, chat.id)).textCreditOut).toBe(true);
            expect((await getChat(story.id, chat.id)).messages).toHaveLength(1);

            t.gateway.setRemainingCredit({ text: { remainingUsd: null, limitUsd: null } });
            expect((await getChat(story.id, chat.id)).textCreditOut).toBe(false);
            await send(story.id, chat.id, 'Hello?', 'Mira nods.');
        });

        it('refuses a second send while the turn is being written', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const held = holdTextCalls();
            try {
                // Supertest sends only once awaited: `.then` starts the first request now.
                const first = t.http
                    .post(`/api/stories/${story.id}/chats/${chat.id}/messages`)
                    .send({ text: 'One.' })
                    .then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 200));
                const second = await t.http
                    .post(`/api/stories/${story.id}/chats/${chat.id}/messages`)
                    .send({ text: 'Two.' })
                    .expect(409);
                expect(second.body.error.code).toBe('409.004.004');

                held.finish('Mira nods.');
                const done = await first;
                expect(done.status).toBe(201);
                expect(done.body.messages).toHaveLength(3);
            } finally {
                held.restore();
            }
        });
    });

    describe('editing a Message', () => {
        /**
         * The Opening, then two turns: positions 1 (user), 2 (ai), 3 (user), 4 (ai). The
         * gateway's record of those two turns is cleared, so the test sees only its own calls.
         */
        async function playTwoTurns(storyId: number): Promise<Chat> {
            const chat = await createChat(storyId);
            await send(storyId, chat.id, 'Hello?', { text: 'Mira nods.', model: 'glm-5.3' });
            const played = await send(storyId, chat.id, 'Where is the lamp?', { text: '@Mira: Upstairs.', model: 'glm-5.3' });
            t.gateway.reset();
            return played;
        }

        function edit(storyId: number, chatId: number, messageId: number, text: string) {
            return t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}`).send({ text });
        }

        it('editing a User Message deletes the later Messages, overwrites its text, and runs exactly one new turn', async () => {
            const story = await createStory();
            const played = await playTwoTurns(story.id);
            expect(played.messages).toHaveLength(5);
            const [opening, firstUser] = played.messages;
            t.gateway.scriptText('turn', { text: 'Rain drips from your hat.\n\n@Mira: Took you long enough.', model: 'glm-5.3' });

            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);

            const { body } = await edit(story.id, played.id, firstUser.id, 'I shake the rain off my coat.').expect(200);
            const { rolledBack, ...chat } = body as Chat & { rolledBack: object };

            expect(rolledBack).toEqual({ memoryChanges: 0, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 });
            expect(chat.awaitingReply).toBe(false);
            expect(chat.messages.map((message) => message.id).slice(0, 2)).toEqual([opening.id, firstUser.id]);
            expect(chat.messages).toHaveLength(3);
            expect(chat.messages[1]).toMatchObject({ kind: 'user', text: 'I shake the rain off my coat.', identityName: 'Ash' });
            expect(lastAi(chat).parts).toEqual([
                { kind: 'narration', text: 'Rain drips from your hat.' },
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Took you long enough.' },
            ]);
            // Exactly one turn, and its prompt carries the new text after the Opening only.
            const calls = t.gateway.textCalls('turn');
            expect(calls).toHaveLength(1);
            const conversation = calls[0].messages.filter((message) => message.role !== 'system');
            expect(conversation.map((message) => message.role)).toEqual(['assistant', 'user']);
            expect(conversation[1].content).toBe('I shake the rain off my coat.');
            expect(calls[0].messages.map((message) => message.content).join('\n')).not.toContain('Upstairs');
            // The discarded Messages and their parts are gone, not hidden.
            expect(await countRows(countSql('message', 'chat_id = $1'), [chat.id])).toBe(3);
            expect(
                await countRows(
                    countSql('message_part', 'message_id IN (SELECT id FROM "message" WHERE chat_id = $1)'),
                    [chat.id],
                ),
            ).toBe(5);
            // The same Chat once the new reply's judge has settled.
            expect(await awaitJudge(t.http, story.id, chat.id)).toEqual({
                ...chat,
                messages: chat.messages.map((message) =>
                    message.judge
                        ? { ...message, judge: { status: 'done', error: null }, memory: { status: 'done', error: null } }
                        : message,
                ),
            });
        });

        it('a failed turn after a User Message edit keeps the edited text with Retry', async () => {
            const story = await createStory();
            const played = await playTwoTurns(story.id);
            t.gateway.scriptText('turn', new ProviderOutageError());

            const failed = await edit(story.id, played.id, played.messages[1].id, 'Changed my mind.').expect(502);
            expect(failed.body.error.code).toBe('502.001.001');

            const waiting = await getChat(story.id, played.id);
            expect(waiting.awaitingReply).toBe(true);
            expect(waiting.messages).toHaveLength(2);
            expect(waiting.messages[1]).toMatchObject({ kind: 'user', text: 'Changed my mind.' });

            t.gateway.scriptText('turn', 'Mira shrugs.');
            const retried = await t.http.post(`/api/stories/${story.id}/chats/${played.id}/retry`).expect(200);
            expect(retried.body.messages).toHaveLength(3);
            expect(lastAi(retried.body as Chat).parts).toEqual([{ kind: 'narration', text: 'Mira shrugs.' }]);
        });

        it('editing an AI Message re-splits its parts, deletes the later Messages, and runs no turn', async () => {
            const story = await createStory();
            const played = await playTwoTurns(story.id);
            const firstReply = played.messages[2];
            // The edited reply is judged and extracted from again (twice here: two edits), but no turn is written.
            t.gateway.scriptText('judge', NO_CHANGE, NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS, NO_OPS);

            const { body } = await edit(
                story.id,
                played.id,
                firstReply.id,
                "Mira sets the pen down.\n\n@mira: Boots off.\nThen we talk.\n\n@Kai O'Rourke: Easy, friend.\n\n@Ghost: Boo.",
            ).expect(200);
            const chat = body as Chat;

            expect(chat.messages).toHaveLength(3);
            expect(chat.awaitingReply).toBe(false);
            expect(chat.messages[2]).toMatchObject({ id: firstReply.id, kind: 'ai', model: 'glm-5.3' });
            expect(chat.messages[2].parts).toEqual([
                { kind: 'narration', text: 'Mira sets the pen down.' },
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Boots off.\nThen we talk.' },
                { kind: 'speech', characterId: story.characters[1].id, speakerName: "Kai O'Rourke", text: 'Easy, friend.' },
                { kind: 'speech', characterId: null, speakerName: 'Ghost', text: 'Boo.' },
            ]);
            expect(t.gateway.textCalls('turn')).toHaveLength(0);
            expect(chat.drift).toBeNull();
            await awaitJudge(t.http, story.id, played.id);

            // A line written as the Role is kept: the user wrote it, so the guard is off.
            const kept = await edit(story.id, played.id, firstReply.id, '@Mira: Well?\n\nAsh: I say nothing.').expect(200);
            expect((kept.body as Chat).messages[2].parts).toEqual([
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Well?' },
                { kind: 'narration', text: 'Ash: I say nothing.' },
            ]);
            expect(t.gateway.textCalls('turn')).toHaveLength(0);
            await awaitJudge(t.http, story.id, played.id);
        });

        it('edits the Opening copy like any AI Message, keeping model "author"', async () => {
            const story = await createStory();
            const played = await playTwoTurns(story.id);

            const { body } = await edit(story.id, played.id, played.messages[0].id, '@Mira: Boots off.').expect(200);

            expect(body.messages).toHaveLength(1);
            expect(body.messages[0]).toMatchObject({ id: played.messages[0].id, kind: 'ai', model: 'author' });
            expect(body.messages[0].parts).toEqual([
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Boots off.' },
            ]);
        });

        it('refuses an empty edit and an unknown Message, changing nothing', async () => {
            const story = await createStory();
            const played = await playTwoTurns(story.id);
            const otherChat = await createChat(story.id);

            const empty = await edit(story.id, played.id, played.messages[1].id, '  \n').expect(422);
            expect(empty.body.error.code).toBe('422.004.005');

            const missing = await edit(story.id, played.id, 999_999, 'Hello.').expect(404);
            expect(missing.body.error.code).toBe('404.004.006');
            // A Message of another Chat is not found through this one.
            const foreign = await edit(story.id, otherChat.id, played.messages[1].id, 'Hello.').expect(404);
            expect(foreign.body.error.code).toBe('404.004.006');

            expect((await getChat(story.id, played.id)).messages).toEqual(played.messages);
            expect(t.gateway.textCalls()).toHaveLength(0);
        });

        it('blocks a User Message edit, but not an AI Message edit, when sending is blocked', async () => {
            const story = await createStory();
            const played = await playTwoTurns(story.id);
            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });

            const blocked = await edit(story.id, played.id, played.messages[1].id, 'Hello.').expect(402);
            expect(blocked.body.error.code).toBe('402.001.003');
            expect((await getChat(story.id, played.id)).messages).toHaveLength(5);

            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const { body } = await edit(story.id, played.id, played.messages[4].id, 'Mira says nothing.').expect(200);
            expect(body.messages).toHaveLength(5);
            expect(body.messages[4].parts).toEqual([{ kind: 'narration', text: 'Mira says nothing.' }]);
            await awaitJudge(t.http, story.id, played.id);
        });
    });

    describe('Continue', () => {
        function continueTurn(storyId: number, chatId: number) {
            return t.http.post(`/api/stories/${storyId}/chats/${chatId}/continue`);
        }

        /** A Continue whose judge and extraction change nothing, read once both have settled. */
        async function continued(storyId: number, chatId: number, reply: string): Promise<Chat> {
            t.gateway.scriptText('turn', reply);
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await continueTurn(storyId, chatId).expect(200);
            return awaitJudge(t.http, storyId, chatId);
        }

        it('right after the Opening stores one AI Message and no User Message', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const played = await continued(story.id, chat.id, '@Mira: Well? Are you staying or not?');

            expect(played.messages.map((message) => message.kind)).toEqual(['ai', 'ai']);
            expect(lastAi(played)).toMatchObject({ model: FAKE_TEXT_MODEL });
            expect(lastAi(played).parts).toEqual([
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Well? Are you staying or not?' },
            ]);
            expect(played.awaitingReply).toBe(false);
            expect(Date.parse(played.lastPlayedAt)).toBeGreaterThan(Date.parse(chat.lastPlayedAt));
            expect(await countRows(countSql('message', "chat_id = $1 AND kind = 'user'"), [chat.id])).toBe(0);
        });

        it('after another AI Message, sends the whole history and ends on the continue instruction', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await send(story.id, chat.id, 'I take my boots off.', 'Mira grunts.');
            await continued(story.id, chat.id, '@Mira: The lamp, then.');

            const played = await continued(story.id, chat.id, 'Mira climbs the stairs without waiting.');

            expect(played.messages.map((message) => message.kind)).toEqual(['ai', 'user', 'ai', 'ai', 'ai']);
            expect(lastAi(played).parts).toEqual([{ kind: 'narration', text: 'Mira climbs the stairs without waiting.' }]);

            const call = lastTurnCall();
            expect(call.kind).toBe('turn');
            expect(call.stop).toEqual(['\nAsh:', '\n@Ash:', '\nYou:']);
            expect(call.messages.slice(1)).toEqual([
                { role: 'assistant', content: OPENING },
                { role: 'user', content: 'I take my boots off.' },
                { role: 'assistant', content: 'Mira grunts.' },
                { role: 'assistant', content: '@Mira: The lamp, then.' },
                {
                    role: 'user',
                    content:
                        '(Ash does nothing new this turn and waits.) Continue the story from exactly where it stands: let the Characters and the world move it forward. Do not write anything Ash says, thinks, feels, decides or does, and stop where Ash can respond.',
                },
                {
                    role: 'system',
                    content: expect.stringMatching(/^Where things stand: [^\n]+\nWrite the next turn now. Do not write anything Ash says, thinks or does. Use @Name: lines for Character speech, spoken words only: no parentheses or \*\(stage directions\)\* inside them, even where earlier turns had them. Actions go in narration.$/),
                },
            ]);
            // The rule against writing the worn identity still holds in the system message.
            expect(call.messages[0].content).toContain("NEVER write Ash's words, thoughts, feelings, decisions or actions");
        });

        it('runs the judge and Memory extraction on the reply, with no user line in the exchange', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const played = await continued(story.id, chat.id, '@Mira: Well?');

            expect(lastAi(played).judge).toEqual({ status: 'done', error: null });
            expect(lastAi(played).memory).toEqual({ status: 'done', error: null });
            for (const kind of ['judge', 'memory_extraction'] as const) {
                const calls = t.gateway.textCalls(kind);
                expect(calls).toHaveLength(1);
                const exchange = calls[0].messages[calls[0].messages.length - 1].content.split('# LATEST EXCHANGE')[1];
                expect(exchange).toContain('(Ash did nothing new; the story went on.)\n\n@Mira: Well?');
                expect(exchange).not.toMatch(/^Ash:/m);
            }
        });

        it('cuts a line the reply wrote as the worn identity', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const played = await continued(story.id, chat.id, 'Mira waits.\n\n@Ash: I follow her up.\n\n@Mira: Good.');

            expect(lastAi(played).parts).toEqual([{ kind: 'narration', text: 'Mira waits.' }]);
        });

        it('stores nothing when the call fails, and can be tapped again', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', new ProviderOutageError());

            const failed = await continueTurn(story.id, chat.id).expect(502);

            expect(failed.body.error.code).toBe('502.001.001');
            const after = await getChat(story.id, chat.id);
            expect(after.messages).toHaveLength(1);
            expect(after.awaitingReply).toBe(false);
            expect(Date.parse(after.lastPlayedAt)).toBe(Date.parse(chat.lastPlayedAt));

            const played = await continued(story.id, chat.id, 'Mira sighs.');
            expect(played.messages.map((message) => message.kind)).toEqual(['ai', 'ai']);
        });

        it('is refused while a User Message awaits its reply, with nothing stored', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', new ProviderOutageError());
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(502);

            const { body } = await continueTurn(story.id, chat.id).expect(409);

            expect(body.error.code).toBe('409.004.013');
            expect(t.gateway.textCalls('turn')).toHaveLength(1);
            const after = await getChat(story.id, chat.id);
            expect(after.awaitingReply).toBe(true);
            expect(after.messages).toHaveLength(2);
        });

        it('is refused with text credit out and on a Story that is not playable, without a call', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });
            expect((await continueTurn(story.id, chat.id).expect(402)).body.error.code).toBe('402.001.003');
            t.gateway.setRemainingCredit({ text: { remainingUsd: null, limitUsd: null } });

            await t.http.patch(`/api/stories/${story.id}/characters/${story.characters[0].id}`).send({ voice: ' ' }).expect(200);
            const blocked = await continueTurn(story.id, chat.id).expect(422);
            expect(blocked.body.error.code).toBe('422.004.002');
            expect(blocked.body.error.message).toContain('Mira: Voice');

            expect(t.gateway.textCalls()).toHaveLength(0);
            expect((await getChat(story.id, chat.id)).messages).toHaveLength(1);
        });

        it('is refused while a turn is being written', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const held = holdTextCalls();
            try {
                // Supertest sends only once awaited: `.then` starts the first request now.
                const first = continueTurn(story.id, chat.id).then((response) => response);
                await new Promise((resolve) => setTimeout(resolve, 200));
                const second = await continueTurn(story.id, chat.id).expect(409);
                const send = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hi.' }).expect(409);
                expect(second.body.error.code).toBe('409.004.004');
                expect(send.body.error.code).toBe('409.004.004');

                held.finish('Mira nods.');
                const done = await first;
                expect(done.status).toBe(200);
                expect(done.body.messages.map((message: Message) => message.kind)).toEqual(['ai', 'ai']);
            } finally {
                held.restore();
            }
        });

        it('is refused while the previous reply\'s background call has failed, until it is retried', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', 'Mira nods.');
            // The try and its automatic retry.
            t.gateway.scriptText('judge', new ProviderOutageError('DeepInfra answered 503.'), new ProviderOutageError('DeepInfra answered 503.'));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(201);
            const failed = await awaitJudge(t.http, story.id, chat.id);
            expect(lastAi(failed).judge?.status).toBe('failed');

            const { body } = await continueTurn(story.id, chat.id).expect(409);

            expect(body.error.code).toBe('409.004.008');
            expect(t.gateway.textCalls('turn')).toHaveLength(1);
            expect((await getChat(story.id, chat.id)).messages).toHaveLength(3);

            t.gateway.scriptText('judge', NO_CHANGE);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(failed).id}/judge`).expect(200);
            const played = await continued(story.id, chat.id, 'Mira turns to the stairs.');
            expect(played.messages.map((message) => message.kind)).toEqual(['ai', 'user', 'ai', 'ai']);
        });
    });

    describe('reset', () => {
        it('keeps the title and identity, clears every Message, and copies the current Opening in again', async () => {
            const story = await createStory({
                scenes: [
                    { name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up.' },
                    { name: 'The lamp', situation: 'Light it.' },
                ],
            });
            const started = await createChat(story.id);
            await t.http.patch(`/api/stories/${story.id}/chats/${started.id}`).send({ title: 'Second try' }).expect(200);
            await send(story.id, started.id, 'Hello?', 'Mira nods.');
            // An Opening edited after the Chat started reaches it only through reset.
            await t.http.patch(`/api/stories/${story.id}`).send({ opening: '@Mira: Boots off, keeper.' }).expect(200);
            const before = await getChat(story.id, started.id);
            expect(before.messages[0].parts).toHaveLength(3);
            // Removing the Scene the Chat is on moves it to the next one (ticket 29); reset starts on the first left.
            await t.http.delete(`/api/stories/${story.id}/scenes/${story.scenes[0].id}`).expect(200);
            expect((await getChat(story.id, started.id)).currentScene).toEqual({ id: story.scenes[1].id, name: 'The lamp' });

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${started.id}/reset`).expect(200);
            const chat = body as Chat;

            expect(chat).toMatchObject({
                id: started.id,
                title: 'Second try',
                identityName: 'Ash',
                createdAt: started.createdAt,
                currentScene: { id: story.scenes[1].id, name: 'The lamp' },
                awaitingReply: false,
            });
            expect(chat.messages).toHaveLength(1);
            expect(chat.messages[0]).toMatchObject({ kind: 'ai', model: 'author' });
            expect(chat.messages[0].parts).toEqual([
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Boots off, keeper.' },
            ]);
            expect(await countRows(countSql('message', 'chat_id = $1'), [chat.id])).toBe(1);
            expect(t.gateway.textCalls('turn')).toHaveLength(1);
            expect(await getChat(story.id, chat.id)).toEqual(chat);
        });

        it('refuses to reset a Chat of a Story that is not playable', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await t.http.patch(`/api/stories/${story.id}`).send({ opening: '' }).expect(200);

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(422);

            expect(body.error.code).toBe('422.004.002');
            expect((await getChat(story.id, chat.id)).messages[0].parts).toHaveLength(3);
        });
    });

    describe('the Drift notice', () => {
        it('appears once the play model differs from the model that wrote the last AI Message', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            expect(chat.drift).toBeNull();

            const played = await send(story.id, chat.id, 'Hello?', { text: 'Mira nods.', model: 'glm-5.3' });
            expect(played.drift).toBeNull();
            expect(played.playModel).toBe('glm-5.3');

            await t.http.put('/api/settings').send({ playModel: 'deepseek-v4-pro' }).expect(200);
            expect((await getChat(story.id, chat.id)).drift).toEqual({
                lastModel: 'glm-5.3',
                playModel: 'deepseek-v4-pro',
                lastModelLabel: 'GLM-5.3',
                playModelLabel: 'DeepSeek V4 Pro',
            });

            // A turn from the new model clears it.
            const next = await send(story.id, chat.id, 'Still here.', { text: 'Mira blinks.', model: 'deepseek-v4-pro' });
            expect(next.drift).toBeNull();

            await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);
        });

        it('does not appear for a Sampling change', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await send(story.id, chat.id, 'Hello?', { text: 'Mira nods.', model: 'glm-5.3' });

            try {
                await t.http.put('/api/settings/samplers/glm-5.3').send({ temperature: 1.3, minP: 0.1 }).expect(200);

                expect((await getChat(story.id, chat.id)).drift).toBeNull();
            } finally {
                await t.http.put('/api/settings/samplers/glm-5.3').send({ temperature: null, minP: null }).expect(200);
            }
        });

        it('names a model that has left the list by its stored id', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            await send(story.id, chat.id, 'Hello?', { text: 'Mira nods.', model: 'retired-model-9' });

            expect((await getChat(story.id, chat.id)).drift).toEqual({
                lastModel: 'retired-model-9',
                playModel: 'glm-5.3',
                lastModelLabel: 'retired-model-9',
                playModelLabel: 'GLM-5.3',
            });
        });
    });
});

describe('Chats through the real gateway', () => {
    let t: TestApp;
    let requests: RecordedRequest[];

    beforeAll(async () => {
        requests = [];
        // Routes by URL rather than by order: the send flow reads credit before the turn.
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
                  : request.body?.model !== 'deepseek/deepseek-v4-flash'
                    ? fixture('openrouter/chat-success.json')
                    : String(request.body.messages?.[0]?.content).includes('Memory of an interactive story')
                      ? fixture('openrouter/chat-memory.json')
                      : fixture('openrouter/chat-judge.json');
            return new Response(JSON.stringify(json), { status: 200, headers: { 'content-type': 'application/json' } });
        };
        t = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
    });

    afterAll(async () => {
        await t.close();
    });

    async function playableChat(): Promise<{ storyId: number; chatId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'Real' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: 'The lamp is out.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send(CAST[0]).expect(201);
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return { storyId, chatId: chat.body.id as number };
    }

    function turnRequests(): RecordedRequest[] {
        return requests.filter((request) => request.url.endsWith('/chat/completions'));
    }

    it('sends stop strings on the Role name for GLM-5.3, judges in JSON mode on V4 Flash, and records both as UsageRecords', async () => {
        const { storyId, chatId } = await playableChat();
        await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);

        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201);

        const request = turnRequests()[0];
        expect(request.body).toMatchObject({
            model: 'z-ai/glm-5.3',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
            stop: ['\nAsh:', '\n@Ash:', '\nYou:'],
            max_tokens: 900,
        });
        expect(body.messages[2]).toMatchObject({
            kind: 'ai',
            model: 'glm-5.3',
            judge: { status: 'pending', error: null },
            memory: { status: 'pending', error: null },
        });
        expect(body.messages[2].parts).toEqual([
            { kind: 'narration', text: 'The lighthouse keeper nods once and goes back to polishing the lens.' },
        ]);
        expect(body.drift).toBeNull();

        // The judge and the extraction ran in the background on the pinned background model, in JSON mode.
        const judged = await awaitJudge(t.http, storyId, chatId);
        expect(judged.messages[2].judge).toEqual({ status: 'done', error: null });
        expect(judged.messages[2].memory).toEqual({ status: 'done', error: null });
        const background = turnRequests().slice(1);
        expect(background).toHaveLength(2);
        const isExtraction = (request: RecordedRequest) => String(request.body.messages[0].content).includes('Memory of an interactive story');
        const judgeRequest = background.find((request) => !isExtraction(request))!;
        const memoryRequest = background.find(isExtraction)!;
        expect(judgeRequest.body).toMatchObject({
            model: 'deepseek/deepseek-v4-flash',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
            reasoning: { enabled: false },
            response_format: { type: 'json_object' },
            max_tokens: 700,
        });
        expect(judgeRequest.body).not.toHaveProperty('stop');
        expect(memoryRequest.body).toMatchObject({
            model: 'deepseek/deepseek-v4-flash',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
            reasoning: { enabled: false },
            response_format: { type: 'json_object' },
            max_tokens: 1200,
        });
        expect(memoryRequest.body).not.toHaveProperty('stop');
        const memories = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200);
        expect(memories.body.memories).toMatchObject([{ text: '{user} arrived at the lighthouse in a storm.', writtenBy: 'ai', locked: false }]);
        const dashboard = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200);
        expect(dashboard.body.characters[0].bonds).toMatchObject([{ toward: { characterId: null, name: 'Ash' }, label: 'Curious' }]);

        const usage = await t.http.get('/api/usage').expect(200);
        expect(usage.body.pools.text).toMatchObject({ calls: 3, spentUsd: 0.00121 });
    });

    it('sends stop strings for DeepSeek V4 Pro on DeepInfra', async () => {
        const { storyId, chatId } = await playableChat();
        await t.http.put('/api/settings').send({ playModel: 'deepseek-v4-pro' }).expect(200);
        const before = turnRequests().length;

        const { body } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201);

        const request = turnRequests()[before];
        expect(request.body).toMatchObject({
            model: 'deepseek/deepseek-v4-pro',
            provider: { only: ['deepinfra'], allow_fallbacks: false },
        });
        expect(request.body.stop).toEqual(['\nAsh:', '\n@Ash:', '\nYou:']);
        expect(body.messages[2]).toMatchObject({ kind: 'ai', model: 'deepseek-v4-pro' });
        await awaitJudge(t.http, storyId, chatId);

        await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);
    });

    it('sends the Sampling saved for the play model on a turn, and none on its background calls', async () => {
        const { storyId, chatId } = await playableChat();
        await t.http.put('/api/settings').send({ playModel: 'deepseek-v4-pro' }).expect(200);
        await t.http.put('/api/settings/samplers/glm-5.3').send({ temperature: 0.3 }).expect(200);
        await t.http.put('/api/settings/samplers/deepseek-v4-pro').send({ temperature: 1.15, repetitionPenalty: 1.05 }).expect(200);
        const before = turnRequests().length;

        try {
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Hello?' }).expect(201);
            await awaitJudge(t.http, storyId, chatId);

            const [turn, ...background] = turnRequests().slice(before);
            expect(turn.body).toMatchObject({
                model: 'deepseek/deepseek-v4-pro',
                temperature: 1.15,
                repetition_penalty: 1.05,
                provider: { only: ['deepinfra'], allow_fallbacks: false, require_parameters: true },
            });
            expect(turn.body).not.toHaveProperty('min_p');
            expect(background).toHaveLength(2);
            for (const request of background) {
                expect(request.body).not.toHaveProperty('temperature');
                expect(request.body.provider).toEqual({ only: ['deepinfra'], allow_fallbacks: false });
            }
        } finally {
            await t.http.put('/api/settings/samplers/glm-5.3').send({ temperature: null }).expect(200);
            await t.http
                .put('/api/settings/samplers/deepseek-v4-pro')
                .send({ temperature: null, repetitionPenalty: null })
                .expect(200);
            await t.http.put('/api/settings').send({ playModel: 'glm-5.3' }).expect(200);
        }
    });
});

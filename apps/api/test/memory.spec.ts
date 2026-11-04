import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { MEMORY_CAP_TOKENS } from '../src/manager/chat/memory/memory-prompt.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Memory extraction, the Memory record and its user actions, the prompt layer and rollback
 * (ticket 28), through the HTTP API with the extraction's output scripted on the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
}

interface Chat {
    id: number;
    storyId: number;
    messages: Message[];
    rolledBack?: { memoryChanges: number; bondChanges: number; arcSteps: number; sceneAdvances: number };
}

interface Memory {
    id: number;
    text: string;
    knownBy: number[];
    writtenBy: 'ai' | 'user';
    locked: boolean;
    archived: boolean;
    messageId: number | null;
    createdAt: string;
}

interface MemoryList {
    chatId: number;
    storyId: number;
    identityName: string;
    cast: Array<{ id: number; name: string }>;
    present: number[];
    memories: Memory[];
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

/** An extraction as the model writes it. */
function extraction(operations: object[]): string {
    return JSON.stringify({ operations });
}

const add = (text: string, knownBy: string[] = ['Mira'], cause = 'said so') => ({ op: 'add', text, known_by: knownBy, cause });

describe('Memory: extraction, the record, the prompt layer and rollback', () => {
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

    /** A playable Story with Mira and Kai, no Scenes. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http
            .patch(`/api/stories/${storyId}`)
            .send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING })
            .expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.' })
            .expect(201);
        const { body } = await t.http.get(`/api/stories/${storyId}`).expect(200);
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

    async function memories(storyId: number, chatId: number): Promise<MemoryList> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200);
        return body as MemoryList;
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

    /** A turn with the given reply and extraction output and a judge that changes nothing, settled. */
    async function play(storyId: number, chatId: number, text: string, reply: string, extracted: string = NO_OPS): Promise<Chat> {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', extracted);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function lastAi(chat: Chat): Message {
        const last = chat.messages[chat.messages.length - 1];
        expect(last.kind).toBe('ai');
        return last;
    }

    function lastCall(kind: 'turn' | 'memory_extraction'): TextCompletionRequest {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }

    function systemPrompt(request: TextCompletionRequest): string {
        return request.messages[0].content;
    }

    async function countRows(table: string, where: string, params: unknown[]): Promise<number> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query(`SELECT count(*)::int AS n FROM "${table}" WHERE ${where}`, params);
            return rows[0].n as number;
        } finally {
            await client.end();
        }
    }

    const ids = (story: Story) => ({ mira: story.characters[0].id, kai: story.characters[1].id });

    describe('the extraction call', () => {
        it('runs once per turn in JSON mode with the cast, the Characters present, the Memories and the exchange, and records an add', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const first = await play(story.id, chat.id, 'I knock.', 'Mira looks up.\n\n@Mira: Boots.', extraction([add('{user} knocked on the lighthouse door.')]));
            t.gateway.reset();

            const played = await play(story.id, chat.id, 'I take them off.', '@Mira: Better.');

            expect(lastAi(played)).toMatchObject({ judge: { status: 'done', error: null }, memory: { status: 'done', error: null } });
            const calls = t.gateway.textCalls('memory_extraction');
            expect(calls).toHaveLength(1);
            expect(calls[0]).toMatchObject({ kind: 'memory_extraction', json: true, maxTokens: 1200, servedFor: { storyId: story.id, chatId: chat.id } });
            expect(calls[0].messages.map((message) => message.role)).toEqual(['system', 'user']);
            expect(systemPrompt(calls[0])).toContain('Memories marked [locked]');
            expect(systemPrompt(calls[0])).not.toContain('over its size cap');
            const firstMemory = (await memories(story.id, chat.id)).memories[0];
            expect(calls[0].messages[1].content).toBe(`# Cast
- Mira
- Kai
The user plays Ash: write {user} wherever a Memory refers to them.

# Characters present in this exchange
Mira

# Current Memories (id: [known by] text)
${firstMemory.id}: - [known by Mira] {user} knocked on the lighthouse door.

# LATEST EXCHANGE (extract from this)
Ash: I take them off.

@Mira: Better.`);

            // The add from the first turn: the AI's, unlocked, caused by that reply, known by Mira.
            const list = await memories(story.id, chat.id);
            expect(list).toMatchObject({ chatId: chat.id, storyId: story.id, identityName: 'Ash', cast: [{ name: 'Mira' }, { name: 'Kai' }], present: [ids(story).mira] });
            expect(list.memories).toEqual([
                {
                    id: expect.any(Number),
                    text: '{user} knocked on the lighthouse door.',
                    knownBy: [ids(story).mira],
                    writtenBy: 'ai',
                    locked: false,
                    archived: false,
                    messageId: lastAi(first).id,
                    createdAt: expect.any(String),
                },
            ]);
            expect(await countRows('memory_change', 'chat_id = $1 AND kind = $2', [chat.id, 'add'])).toBe(1);
            // The second turn's prompt carried it in the Memory layer, with {user} rendered as Ash.
            expect(systemPrompt(lastCall('turn'))).toContain(`# Memory (what has happened in this Chat so far)
- [known by Mira] Ash knocked on the lighthouse door.
A Character knows only the Memories it is tagged on`);
            const dashboard = await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/dashboard`).expect(200);
            expect(dashboard.body.background[0]).toMatchObject({ messageId: lastAi(played).id, memory: { status: 'done', error: null } });
        });

        it('writes the identity name as {user}, drops unknown names and ids, never removes a name from Known by, and applies every kind of operation', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(
                story.id,
                chat.id,
                'I knock.',
                'Mira looks up.',
                extraction([add('Ash came in from the storm, and Ash was soaked.', ['Mira', 'Ghost', 'user']), add('The lamp went out an hour before Ash arrived.', ['Mira'])]),
            );
            let list = await memories(story.id, chat.id);
            expect(list.memories.map((memory) => [memory.text, memory.knownBy])).toEqual([
                ['{user} came in from the storm, and {user} was soaked.', [ids(story).mira]],
                ['The lamp went out an hour before {user} arrived.', [ids(story).mira]],
            ]);
            const [storm, lamp] = list.memories;

            const played = await play(
                story.id,
                chat.id,
                'Kai comes in behind me.',
                '@Kai: Friend!',
                extraction([
                    { op: 'known_by', id: storm.id, names: ['Kai', 'Nobody'], cause: 'Kai saw the wet coat' },
                    { op: 'update', id: lamp.id, text: 'The lamp went out an hour before {user} arrived; Mira says the wick was wet.', cause: 'Mira explained' },
                    { op: 'update', id: 999_999, text: 'Nothing.', cause: 'unknown id' },
                    { op: 'known_by', id: storm.id, names: ['Mira'], cause: 'already known' },
                    { op: 'update', id: lamp.id, text: 'The lamp went out an hour before {user} arrived; Mira says the wick was wet.', cause: 'same text' },
                ]),
            );

            list = await memories(story.id, chat.id);
            expect(list.memories).toMatchObject([
                { id: storm.id, knownBy: [ids(story).mira, ids(story).kai] },
                { id: lamp.id, text: 'The lamp went out an hour before {user} arrived; Mira says the wick was wet.', knownBy: [ids(story).mira], messageId: lamp.messageId },
            ]);
            expect(list.present).toEqual([ids(story).kai]);
            expect(await countRows('memory_change', 'chat_id = $1', [chat.id])).toBe(4);
            expect(await countRows('memory_change', 'chat_id = $1 AND kind = $2 AND message_id = $3', [chat.id, 'known_by', lastAi(played).id])).toBe(1);
            expect(await countRows('memory_change', 'chat_id = $1 AND kind = $2 AND message_id = $3', [chat.id, 'update', lastAi(played).id])).toBe(1);
        });

        it('marks the extraction failed when its output has no JSON, keeping the reply and the judge', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const played = await play(story.id, chat.id, 'One.', 'Reply one.', 'Sorry, nothing to extract.');

            expect(lastAi(played)).toMatchObject({
                judge: { status: 'done', error: null },
                memory: { status: 'failed', error: 'The extraction wrote no JSON object.' },
            });
            expect((await memories(story.id, chat.id)).memories).toEqual([]);
        });
    });

    describe('locked Memories', () => {
        it('reject update, delete, merge and archive but accept a Known-by addition', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'I knock.', 'Mira looks up.');
            // A hand-written Memory is locked and known by the Characters present (Mira).
            const added = await t.http
                .post(`/api/stories/${story.id}/chats/${chat.id}/memories`)
                .send({ text: '{user} carries a letter from Mira\'s brother.' })
                .expect(201);
            expect(added.body).toMatchObject({ writtenBy: 'user', locked: true, archived: false, messageId: null, knownBy: [ids(story).mira] });
            const letter = added.body as Memory;
            await play(story.id, chat.id, 'I mention the letter.', '@Mira: A letter?', extraction([add('Mira asked about the letter.')]));
            const other = (await memories(story.id, chat.id)).memories.find((memory) => memory.id !== letter.id)!;

            await play(
                story.id,
                chat.id,
                'Kai reads it over my shoulder.',
                '@Kai: Her brother, friend?',
                extraction([
                    { op: 'update', id: letter.id, text: 'Changed.', cause: 'no' },
                    { op: 'delete', id: letter.id, cause: 'no' },
                    { op: 'archive', id: letter.id, cause: 'no' },
                    { op: 'merge', ids: [letter.id, other.id], text: 'Merged.', known_by: ['Mira'], cause: 'no' },
                    { op: 'known_by', id: letter.id, names: ['Kai'], cause: 'Kai read the letter' },
                ]),
            );

            const list = await memories(story.id, chat.id);
            expect(list.memories).toMatchObject([
                { id: letter.id, text: '{user} carries a letter from Mira\'s brother.', locked: true, archived: false, knownBy: [ids(story).mira, ids(story).kai] },
                { id: other.id, text: 'Mira asked about the letter.', locked: false, archived: false },
            ]);
            expect(list.memories).toHaveLength(2);
            expect(await countRows('memory_change', 'chat_id = $1 AND kind = $2', [chat.id, 'known_by'])).toBe(1);
            expect(await countRows('memory_change', 'chat_id = $1', [chat.id])).toBe(2);
        });

        it('a merge with a locked source is dropped whole', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply.', extraction([add('A fact.'), add('Another fact.', ['Kai'])]));
            const [a, b] = (await memories(story.id, chat.id)).memories;
            await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/memories/${a.id}`).send({ text: 'A fact, corrected.' }).expect(200);

            await play(story.id, chat.id, 'Two.', 'Reply.', extraction([{ op: 'merge', ids: [a.id, b.id], text: 'Both facts.', known_by: [], cause: 'tidy' }]));

            const list = await memories(story.id, chat.id);
            expect(list.memories).toMatchObject([
                { id: a.id, text: 'A fact, corrected.', locked: true, writtenBy: 'user' },
                { id: b.id, text: 'Another fact.', locked: false },
            ]);
            expect(list.memories).toHaveLength(2);
            expect(await countRows('memory_change', 'chat_id = $1', [chat.id])).toBe(2);
        });
    });

    describe('merge and archive', () => {
        it('are recorded as deletes plus an add, and an archive, and revert correctly on a rewind', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(
                story.id,
                chat.id,
                'I look around.',
                'The room is bare.',
                extraction([add('The lamp room has one chair.'), add('The lamp room has a logbook.', ['Mira', 'Kai']), add('Rain drummed on the windows.', ['Kai'])]),
            );
            const before = (await memories(story.id, chat.id)).memories;
            const [chair, logbook, rain] = before;

            const played = await play(
                story.id,
                chat.id,
                'I sit.',
                'The chair creaks.',
                extraction([
                    { op: 'merge', ids: [chair.id, logbook.id], text: 'The lamp room has one chair and a logbook.', known_by: ['Mira'], cause: 'same room' },
                    { op: 'archive', id: rain.id, cause: 'the rain stopped mattering' },
                ]),
            );

            let list = await memories(story.id, chat.id);
            expect(list.memories).toMatchObject([
                { id: rain.id, archived: true, locked: false },
                { text: 'The lamp room has one chair and a logbook.', knownBy: [ids(story).mira, ids(story).kai], writtenBy: 'ai', archived: false, messageId: lastAi(played).id },
            ]);
            expect(list.memories).toHaveLength(2);
            const merged = list.memories[1];
            expect(await countRows('memory_change', 'chat_id = $1 AND message_id = $2 AND kind = $3', [chat.id, lastAi(played).id, 'delete'])).toBe(2);
            expect(await countRows('memory_change', 'chat_id = $1 AND message_id = $2 AND kind = $3', [chat.id, lastAi(played).id, 'add'])).toBe(1);
            expect(await countRows('memory_change', 'chat_id = $1 AND message_id = $2 AND kind = $3', [chat.id, lastAi(played).id, 'archive'])).toBe(1);
            // The archived Memory is out of the prompt; the merged one is in.
            await play(story.id, chat.id, 'I open the logbook.', 'Blank pages.');
            const system = systemPrompt(lastCall('turn'));
            expect(system).toContain('- [known by Mira, Kai] The lamp room has one chair and a logbook.');
            expect(system).not.toContain('Rain drummed');

            // Rewinding to before the merge puts the sources back under their ids and unarchives the third.
            t.gateway.scriptText('turn', 'The chair holds.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const { body } = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[3].id}`)
                .send({ text: 'I sit, carefully.' })
                .expect(200);
            expect(body.rolledBack).toEqual({ memoryChanges: 4, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 });
            await settled(story.id, chat.id);
            list = await memories(story.id, chat.id);
            expect(list.memories.map((memory) => ({ id: memory.id, text: memory.text, knownBy: memory.knownBy, archived: memory.archived, messageId: memory.messageId }))).toEqual(
                before.map((memory) => ({ id: memory.id, text: memory.text, knownBy: memory.knownBy, archived: false, messageId: memory.messageId })),
            );
            expect(list.memories.find((memory) => memory.id === merged.id)).toBeUndefined();
            expect(await countRows('memory_change', 'chat_id = $1', [chat.id])).toBe(3);
        });
    });

    describe('rollback on edit', () => {
        it('removes an AI-added Memory the user edited, keeps one the user wrote from scratch, and reverts an update', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.', extraction([add('Mira keeps the light alone.')]));
            const [alone] = (await memories(story.id, chat.id)).memories;
            const played = await play(
                story.id,
                chat.id,
                'Two.',
                'Reply two.',
                extraction([add('Mira\'s brother sent {user}.'), { op: 'update', id: alone.id, text: 'Mira has kept the light alone for six years.', cause: 'she said so' }]),
            );
            const sent = (await memories(story.id, chat.id)).memories.find((memory) => memory.id !== alone.id)!;
            // The user edits the AI's second-turn Memory, which locks it, and writes one of their own.
            await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/memories/${sent.id}`).send({ text: 'Mira\'s brother Tomas sent {user}.' }).expect(200);
            const own = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/memories`).send({ text: '{user} left a horse at the ferry.', knownBy: [] }).expect(201);
            expect((await memories(story.id, chat.id)).memories).toMatchObject([
                { id: alone.id, text: 'Mira has kept the light alone for six years.' },
                { id: sent.id, text: 'Mira\'s brother Tomas sent {user}.', locked: true, writtenBy: 'user', messageId: lastAi(played).id },
                { id: own.body.id, locked: true, writtenBy: 'user', messageId: null, knownBy: [] },
            ]);

            t.gateway.scriptText('turn', 'Reply two, again.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const { body } = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[3].id}`)
                .send({ text: 'Two, differently.' })
                .expect(200);

            expect(body.rolledBack).toEqual({ memoryChanges: 2, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 });
            await settled(story.id, chat.id);
            expect((await memories(story.id, chat.id)).memories).toMatchObject([
                { id: alone.id, text: 'Mira keeps the light alone.', locked: false },
                { id: own.body.id, text: '{user} left a horse at the ferry.', locked: true },
            ]);
            expect((await memories(story.id, chat.id)).memories).toHaveLength(2);
            // The new turn's prompt saw the rolled-back Memory and the user's own.
            const system = systemPrompt(lastCall('turn'));
            expect(system).toContain('- [known by Mira] Mira keeps the light alone.');
            expect(system).toContain('- [known by no one] Ash left a horse at the ferry.');
            expect(system).not.toContain('Tomas');
        });

        it('keeps a user edit of an updated Memory when the update is rolled back, and reverts a Known-by addition', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.', extraction([add('The ferry runs on Sundays.')]));
            const [ferry] = (await memories(story.id, chat.id)).memories;
            const played = await play(
                story.id,
                chat.id,
                'Two.',
                '@Kai: Sundays, friend.',
                extraction([
                    { op: 'update', id: ferry.id, text: 'The ferry runs on Sundays only.', cause: 'Kai said' },
                    { op: 'known_by', id: ferry.id, names: ['Kai'], cause: 'Kai said' },
                ]),
            );
            await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/memories/${ferry.id}`).send({ text: 'The ferry runs on Sundays, weather allowing.' }).expect(200);
            t.gateway.reset();

            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const { body } = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(played).id}`)
                .send({ text: '@Kai: Never on Sundays.' })
                .expect(200);

            expect(body.rolledBack).toEqual({ memoryChanges: 2, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 });
            await settled(story.id, chat.id);
            expect((await memories(story.id, chat.id)).memories).toMatchObject([
                { id: ferry.id, text: 'The ferry runs on Sundays, weather allowing.', locked: true, knownBy: [ids(story).mira] },
            ]);
            // The edited reply was extracted from again.
            expect(t.gateway.textCalls('memory_extraction')).toHaveLength(1);
            expect(lastCall('memory_extraction').messages[1].content).toContain('# LATEST EXCHANGE (extract from this)\nAsh: Two.\n\n@Kai: Never on Sundays.');
        });
    });

    describe('archived Memories', () => {
        it('are listed apart, left out of the prompt, and restoring one locks it', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.', extraction([add('The gull took the bread.'), add('The stairs have forty steps.')]));
            const [gull, stairs] = (await memories(story.id, chat.id)).memories;
            await play(story.id, chat.id, 'Two.', 'Reply two.', extraction([{ op: 'archive', id: gull.id, cause: 'stale' }]));
            expect((await memories(story.id, chat.id)).memories).toMatchObject([{ id: gull.id, archived: true, locked: false }, { id: stairs.id, archived: false }]);
            await play(story.id, chat.id, 'Three.', 'Reply three.');
            expect(systemPrompt(lastCall('turn'))).not.toContain('gull');
            expect(lastCall('memory_extraction').messages[1].content).not.toContain('gull');

            const restored = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/memories/${gull.id}/restore`).expect(200);

            expect(restored.body).toMatchObject({ id: gull.id, archived: false, locked: true, writtenBy: 'ai' });
            await play(story.id, chat.id, 'Four.', 'Reply four.');
            expect(systemPrompt(lastCall('turn'))).toContain('- [known by Mira] The gull took the bread.');
            expect(lastCall('memory_extraction').messages[1].content).toContain(`${gull.id}: - [known by Mira] [locked] The gull took the bread.`);
        });
    });

    describe('the cap', () => {
        it('asks the extraction to merge and archive once the Memory lines pass the cap', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const line = 'The keeper before Mira left a crate of candles in the store room under the stairs, which nobody has opened since the spring.';
            // Hand-written here for speed; the cap measures the prompt lines whoever wrote them.
            const needed = Math.ceil((MEMORY_CAP_TOKENS * 4) / (line.length + 20)) + 1;
            for (let i = 0; i < needed; i++) {
                await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/memories`).send({ text: `${line} (${i})` }).expect(201);
            }

            await play(story.id, chat.id, 'One.', 'Reply one.');

            expect(systemPrompt(lastCall('memory_extraction'))).toContain(
                `The Memory list is over its size cap: ${needed} Memories, where about 50 fit. Besides the exchange, this turn you MUST return at least ${Math.max(3, Math.min(12, needed - 50))} "merge" or "archive" operations`,
            );
            expect(systemPrompt(lastCall('memory_extraction'))).toContain('Never archive or merge a [locked] Memory.');
            expect(lastCall('memory_extraction').maxTokens).toBe(2500);
            // Locked Memories are never left out of the turn prompt, whatever the cap.
            for (let i = 0; i < needed; i++) expect(systemPrompt(lastCall('turn'))).toContain(`${line} (${i})`);
        });

        it('counts too: short Memories past 60 of them are over the cap as well', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.', extraction(Array.from({ length: 60 }, (_, i) => add(`Fact ${i}.`))));
            await play(story.id, chat.id, 'Two.', 'Reply two.');
            expect(systemPrompt(lastCall('memory_extraction'))).not.toContain('over its size cap');

            await play(story.id, chat.id, 'Three.', 'Reply three.', extraction([add('Fact 60.')]));
            await play(story.id, chat.id, 'Four.', 'Reply four.');

            expect(systemPrompt(lastCall('memory_extraction'))).toContain('The Memory list is over its size cap: 61 Memories, where about 50 fit.');
            expect(systemPrompt(lastCall('memory_extraction'))).toContain('at least 11 "merge" or "archive" operations');
        });

        it('leaves the oldest unlocked Memories out of the turn prompt past the cap, keeping locked ones', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const line = 'The keeper before Mira left a crate of candles in the store room under the stairs, which nobody has opened since the spring.';
            const needed = Math.ceil((MEMORY_CAP_TOKENS * 4) / (line.length + 20)) + 1;
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/memories`).send({ text: 'Mine, first.' }).expect(201);
            await play(story.id, chat.id, 'One.', 'Reply one.', extraction(Array.from({ length: needed }, (_, i) => add(`${line} (${i})`))));

            await play(story.id, chat.id, 'Two.', 'Reply two.');

            const system = systemPrompt(lastCall('turn'));
            expect(system).toContain('Mine, first.');
            expect(system).not.toContain(`${line} (0)`);
            expect(system).toContain(`${line} (${needed - 1})`);
            // The extraction still sees the whole list, so it can merge and archive it down.
            expect(lastCall('memory_extraction').messages[1].content).toContain(`${line} (0)`);
        });
    });

    describe('reset', () => {
        it('empties all Memory, user-written included', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            await play(story.id, chat.id, 'One.', 'Reply one.', extraction([add('A fact.')]));
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/memories`).send({ text: 'My own fact.' }).expect(201);
            expect((await memories(story.id, chat.id)).memories).toHaveLength(2);

            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(200);

            expect((await memories(story.id, chat.id)).memories).toEqual([]);
            expect(await countRows('memory', 'chat_id = $1', [chat.id])).toBe(0);
            expect(await countRows('memory_change', 'chat_id = $1', [chat.id])).toBe(0);
        });
    });

    describe('user actions', () => {
        it('add (known by the Characters present, or as given), edit (which locks), delete, with 404 and 422 where due', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            // Before any turn, the Opening is the latest exchange: Mira spoke in it.
            expect((await memories(story.id, chat.id)).present).toEqual([ids(story).mira]);
            await play(story.id, chat.id, 'Kai, is that you?', '@Kai: It is, friend.');
            expect((await memories(story.id, chat.id)).present).toEqual([ids(story).kai]);

            const added = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/memories`).send({ text: '  Kai came in.  ' }).expect(201);
            expect(added.body).toMatchObject({ text: 'Kai came in.', knownBy: [ids(story).kai], writtenBy: 'user', locked: true, archived: false, messageId: null });
            const given = await t.http
                .post(`/api/stories/${story.id}/chats/${chat.id}/memories`)
                .send({ text: 'Both saw the boat.', knownBy: [ids(story).kai, ids(story).mira, 999_999] })
                .expect(201);
            expect(given.body.knownBy).toEqual([ids(story).mira, ids(story).kai]);

            const edited = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/memories/${given.body.id}`)
                .send({ knownBy: [ids(story).mira] })
                .expect(200);
            expect(edited.body).toMatchObject({ text: 'Both saw the boat.', knownBy: [ids(story).mira], locked: true });

            expect((await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/memories`).send({ text: ' ' }).expect(422)).body.error.code).toBe('422.004.012');
            expect((await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/memories/${given.body.id}`).send({ text: '' }).expect(422)).body.error.code).toBe('422.004.012');
            expect((await t.http.patch(`/api/stories/${story.id}/chats/${chat.id}/memories/999999`).send({ text: 'x' }).expect(404)).body.error.code).toBe('404.004.011');
            const otherChat = await createChat(story.id);
            expect((await t.http.delete(`/api/stories/${story.id}/chats/${otherChat.id}/memories/${given.body.id}`).expect(404)).body.error.code).toBe('404.004.011');
            expect((await t.http.get(`/api/stories/${story.id}/chats/999999/memories`).expect(404)).body.error.code).toBe('404.004.001');

            await t.http.delete(`/api/stories/${story.id}/chats/${chat.id}/memories/${added.body.id}`).expect(204);
            expect((await memories(story.id, chat.id)).memories.map((memory) => memory.id)).toEqual([given.body.id]);
            expect(await countRows('memory_known_by', 'memory_id = $1', [added.body.id])).toBe(0);
        });
    });

    describe('the send gate', () => {
        it('blocks the send while the extraction failed, naming it, and Retry re-runs only the extraction', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', 'Reply one.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', new ProviderOutageError('DeepInfra answered 503.'));
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'One.' }).expect(201);
            const failed = await settled(story.id, chat.id);
            expect(lastAi(failed)).toMatchObject({ judge: { status: 'done' }, memory: { status: 'failed', error: 'DeepInfra answered 503.' } });

            t.gateway.scriptText('turn', 'Reply two.');
            const blocked = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).expect(409);
            expect(blocked.body.error).toEqual({ code: '409.004.008', message: "The previous turn's Memory extraction failed. Retry it before sending." });
            expect(t.gateway.textCalls('turn')).toHaveLength(1);

            // A judge retry is refused: the judge did not fail.
            expect((await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(failed).id}/judge`).expect(409)).body.error.code).toBe('409.004.009');
            t.gateway.scriptText('memory_extraction', extraction([add('{user} knocked.')]));
            const retried = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(failed).id}/memory`).expect(200);
            expect(retried.body.background).toEqual([
                { messageId: lastAi(failed).id, position: 2, judge: { status: 'done', error: null }, memory: { status: 'done', error: null } },
            ]);
            expect(t.gateway.textCalls('turn')).toHaveLength(1);
            expect(t.gateway.textCalls('judge')).toHaveLength(1);
            expect(t.gateway.textCalls('memory_extraction')).toHaveLength(2);
            expect((await memories(story.id, chat.id)).memories).toMatchObject([{ text: '{user} knocked.', messageId: lastAi(failed).id }]);

            expect((await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(failed).id}/memory`).expect(409)).body.error.code).toBe('409.004.010');
            expect((await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/999999/memory`).expect(404)).body.error.code).toBe('404.004.006');

            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const sent = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).expect(201);
            expect(sent.body.messages).toHaveLength(5);
            expect(systemPrompt(lastCall('turn'))).toContain('- [known by Mira] Ash knocked.');
            await settled(story.id, chat.id);
        });

        it('names both calls when both failed', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', 'Reply one.');
            t.gateway.scriptText('judge', new ProviderOutageError());
            t.gateway.scriptText('memory_extraction', new ProviderOutageError());
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'One.' }).expect(201);
            await settled(story.id, chat.id);

            const blocked = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Two.' }).expect(409);

            expect(blocked.body.error.message).toBe("The previous turn's the Bond, Arc and Scene judge and Memory extraction failed. Retry them before sending.");
        });
    });
});

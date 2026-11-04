import pg from 'pg';

import { PROMPT_LAYERS } from '../src/manager/chat/turn/prompt.js';
import { startTestApp, TestApp } from './harness/test-app.js';

interface Persona {
    id: number;
    name: string;
    description: string;
    createdAt: string;
    updatedAt: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    identityName?: string;
    personaId?: number | null;
    parts?: Array<{ kind: 'narration' | 'speech'; characterId?: number | null; speakerName?: string; text: string }>;
    judge?: { status: 'pending' | 'done' | 'failed'; error: string | null } | null;
    memory?: { status: 'pending' | 'done' | 'failed'; error: string | null } | null;
}

interface Chat {
    id: number;
    storyId: number;
    title: string;
    identityName: string;
    personaId: number | null;
    roleName: string;
    messages: Message[];
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

describe('Personas and swapping the worn identity', () => {
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

    /** A playable Story with Mira and Kai; the Role is Ash. */
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

    async function createPersona(name = 'Rin', description = 'A drifter with salt in her hair and a debt to settle.'): Promise<Persona> {
        const { body } = await t.http.post('/api/personas').send({ name, description }).expect(201);
        return body as Persona;
    }

    async function createChat(storyId: number): Promise<Chat> {
        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        return body as Chat;
    }

    async function swap(storyId: number, chatId: number, personaId: number | null): Promise<Chat> {
        const { body } = await t.http.put(`/api/stories/${storyId}/chats/${chatId}/identity`).send({ personaId }).expect(200);
        return body as Chat;
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

    /** A turn with the given reply, judge and extraction output, settled. */
    async function send(
        storyId: number,
        chatId: number,
        text: string,
        reply: string,
        background: { judge?: string; extraction?: string } = {},
    ): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', background.judge ?? NO_CHANGE);
        t.gateway.scriptText('memory_extraction', background.extraction ?? NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function userMessages(chat: Chat): Message[] {
        return chat.messages.filter((message) => message.kind === 'user');
    }

    function lastCall(kind: 'turn' | 'judge' | 'memory_extraction') {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }

    async function query<T>(sql: string, params: unknown[]): Promise<T[]> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            return (await client.query(sql, params)).rows as T[];
        } finally {
            await client.end();
        }
    }

    describe('Personas', () => {
        it('creates, lists, reads, updates and deletes a Persona', async () => {
            const created = await createPersona('  Rin  ', '  A drifter.  ');
            expect(created).toMatchObject({ name: 'Rin', description: 'A drifter.' });
            expect(created.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            const other = await createPersona('Vos', '');

            const listed = (await t.http.get('/api/personas').expect(200)).body.personas as Persona[];
            const ids = listed.map((persona) => persona.id);
            expect(ids.indexOf(created.id)).toBeLessThan(ids.indexOf(other.id));
            expect((await t.http.get(`/api/personas/${created.id}`).expect(200)).body).toEqual(created);

            const renamed = await t.http.patch(`/api/personas/${created.id}`).send({ name: 'Rin Vale' }).expect(200);
            expect(renamed.body).toMatchObject({ id: created.id, name: 'Rin Vale', description: 'A drifter.' });
            const described = await t.http.patch(`/api/personas/${created.id}`).send({ description: 'Owes Mira money.' }).expect(200);
            expect(described.body).toMatchObject({ name: 'Rin Vale', description: 'Owes Mira money.' });

            await t.http.delete(`/api/personas/${created.id}`).expect(204);
            expect((await t.http.get(`/api/personas/${created.id}`).expect(404)).body.error.code).toBe('404.006.001');
            const after = (await t.http.get('/api/personas').expect(200)).body.personas as Persona[];
            expect(after.map((persona) => persona.id)).not.toContain(created.id);
        });

        it('refuses a blank Name, a missing Name and an unknown Persona', async () => {
            expect((await t.http.post('/api/personas').send({ name: '   ' }).expect(422)).body.error.code).toBe('422.006.002');
            await t.http.post('/api/personas').send({ description: 'No name.' }).expect(400);
            const persona = await createPersona();
            expect((await t.http.patch(`/api/personas/${persona.id}`).send({ name: '' }).expect(422)).body.error.code).toBe(
                '422.006.002',
            );
            expect((await t.http.get(`/api/personas/${persona.id}`).expect(200)).body.name).toBe('Rin');

            expect((await t.http.patch('/api/personas/999999').send({ name: 'X' }).expect(404)).body.error.code).toBe('404.006.001');
            expect((await t.http.delete('/api/personas/999999').expect(404)).body.error.code).toBe('404.006.001');
        });
    });

    describe('swapping identity', () => {
        it('after a swap, the prompt carries the Persona and not the Role, and the User Message is stamped with it', async () => {
            const story = await createStory();
            const persona = await createPersona();
            const chat = await createChat(story.id);
            expect(chat).toMatchObject({ identityName: 'Ash', personaId: null });
            await send(story.id, chat.id, 'I knock.', 'Mira opens the door.');

            const swapped = await swap(story.id, chat.id, persona.id);
            expect(swapped).toMatchObject({ identityName: 'Rin', personaId: persona.id, roleName: 'Ash' });
            // A swap writes no Message and makes no call.
            expect(swapped.messages).toHaveLength(3);
            expect(t.gateway.textCalls('turn')).toHaveLength(1);

            const played = await send(story.id, chat.id, 'I shake the rain off.', 'Mira squints.\n\n@Mira: Who are you?');

            const call = lastCall('turn');
            const system = call.messages[0].content;
            expect(system).toContain(`${PROMPT_LAYERS.identity}\nRin: A drifter with salt in her hair and a debt to settle.`);
            expect(system).toContain("The user plays Rin. NEVER write Rin's words, thoughts, feelings, decisions or actions.");
            expect(system).toContain('second person for Rin ("you")');
            expect(system).not.toContain('Ash');
            expect(system).not.toContain('The new keeper');
            expect(call.messages[call.messages.length - 1].content).toBe(
                'Write the next turn now. Do not write anything Rin says, thinks or does. Use @Name: lines for Character speech.',
            );
            expect(call.stop).toEqual(['\nRin:', '\n@Rin:', '\nYou:']);

            expect(userMessages(played).map((message) => [message.identityName, message.personaId])).toEqual([
                ['Ash', null],
                ['Rin', persona.id],
            ]);

            // Swapping back to the Role puts Ash back in the prompt.
            expect(await swap(story.id, chat.id, null)).toMatchObject({ identityName: 'Ash', personaId: null });
            await send(story.id, chat.id, 'I nod.', 'Mira nods back.');
            expect(lastCall('turn').messages[0].content).toContain(`${PROMPT_LAYERS.identity}\nAsh: The new keeper, arrived this morning.`);
            expect(lastCall('turn').stop).toEqual(['\nAsh:', '\n@Ash:', '\nYou:']);
        });

        it.each([
            ['Rin:', 'Rin: I step back.'],
            ['@Rin:', '@Rin: I step back.'],
            ['*Rin*:', '*Rin*: I step back.'],
            ['@rin: (any case)', '@rin: I step back.'],
        ])('the guard cuts the reply at a %s line written as the worn Persona', async (_label, userLine) => {
            const story = await createStory();
            const persona = await createPersona();
            const chat = await createChat(story.id);
            await swap(story.id, chat.id, persona.id);

            const played = await send(story.id, chat.id, 'I wait.', `Mira stands.\n\n@Mira: Well?\n\n${userLine}\n\n@Mira: Thought so.`);

            expect(played.messages[played.messages.length - 1].parts).toEqual([
                { kind: 'narration', text: 'Mira stands.' },
                { kind: 'speech', characterId: story.characters[0].id, speakerName: 'Mira', text: 'Well?' },
            ]);
        });

        it('an edit does not undo a swap, and reset keeps it', async () => {
            const story = await createStory();
            const persona = await createPersona();
            const chat = await createChat(story.id);
            const first = await send(story.id, chat.id, 'I knock.', 'Mira opens the door.');
            await swap(story.id, chat.id, persona.id);
            await send(story.id, chat.id, 'I step in.', 'Mira steps aside.');

            // Editing the User Message written as the Role, before the swap, rolls the Chat back past the swap.
            t.gateway.scriptText('turn', 'Mira waits.');
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${userMessages(first)[0].id}`)
                .send({ text: 'I knock twice.' })
                .expect(200);
            const edited = await settled(story.id, chat.id);
            expect(edited).toMatchObject({ identityName: 'Rin', personaId: persona.id });
            expect(edited.messages).toHaveLength(3);
            // The fresh reply is written to the identity worn now, so the edited text carries it.
            expect(userMessages(edited)[0]).toMatchObject({ text: 'I knock twice.', identityName: 'Rin', personaId: persona.id });
            expect(lastCall('turn').stop).toEqual(['\nRin:', '\n@Rin:', '\nYou:']);

            // An AI Message edit leaves it alone too.
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${edited.messages[2].id}`)
                .send({ text: 'Mira waits a long time.' })
                .expect(200);
            expect(await settled(story.id, chat.id)).toMatchObject({ identityName: 'Rin', personaId: persona.id });

            const { body } = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(200);
            expect(body).toMatchObject({ identityName: 'Rin', personaId: persona.id });
            expect(body.messages).toHaveLength(1);

            const replayed = await send(story.id, chat.id, 'Hello?', 'Mira looks up.');
            expect(userMessages(replayed)[0]).toMatchObject({ identityName: 'Rin', personaId: persona.id });
            expect(lastCall('turn').messages[0].content).toContain(`${PROMPT_LAYERS.identity}\nRin:`);
        });

        it('renaming or deleting a Persona leaves the names stamped on old Messages intact', async () => {
            const story = await createStory();
            const persona = await createPersona();
            const chat = await createChat(story.id);
            await swap(story.id, chat.id, persona.id);
            await send(story.id, chat.id, 'I knock.', 'Mira opens the door.');

            await t.http.patch(`/api/personas/${persona.id}`).send({ name: 'Rin Vale' }).expect(200);
            const renamed = await getChat(story.id, chat.id);
            expect(renamed.identityName).toBe('Rin Vale');
            expect(userMessages(renamed)[0]).toMatchObject({ identityName: 'Rin', personaId: persona.id });

            const played = await send(story.id, chat.id, 'I step in.', 'Mira steps aside.');
            expect(lastCall('turn').stop).toEqual(['\nRin Vale:', '\n@Rin Vale:', '\nYou:']);
            expect(userMessages(played).map((message) => message.identityName)).toEqual(['Rin', 'Rin Vale']);

            await t.http.delete(`/api/personas/${persona.id}`).expect(204);
            const after = await getChat(story.id, chat.id);
            expect(userMessages(after).map((message) => [message.identityName, message.personaId])).toEqual([
                ['Rin', null],
                ['Rin Vale', null],
            ]);
            const rows = await query<{ identity_name: string; persona_id: number | null }>(
                `SELECT identity_name, persona_id FROM "message" WHERE chat_id = $1 AND kind = 'user' ORDER BY position`,
                [chat.id],
            );
            expect(rows).toEqual([
                { identity_name: 'Rin', persona_id: null },
                { identity_name: 'Rin Vale', persona_id: null },
            ]);
        });

        it('deleting a worn Persona falls its Chats back to the Role, and leaves other Chats alone', async () => {
            const story = await createStory();
            const persona = await createPersona();
            const other = await createPersona('Vos', 'A smuggler.');
            const chat = await createChat(story.id);
            const second = await createChat(story.id);
            await swap(story.id, chat.id, persona.id);
            await swap(story.id, second.id, other.id);

            await t.http.delete(`/api/personas/${persona.id}`).expect(204);

            expect(await getChat(story.id, chat.id)).toMatchObject({ identityName: 'Ash', personaId: null });
            expect(await getChat(story.id, second.id)).toMatchObject({ identityName: 'Vos', personaId: other.id });
            const played = await send(story.id, chat.id, 'Hello?', 'Mira looks up.');
            expect(userMessages(played)[0]).toMatchObject({ identityName: 'Ash', personaId: null });
            expect(lastCall('turn').messages[0].content).toContain(`${PROMPT_LAYERS.identity}\nAsh: The new keeper, arrived this morning.`);
            expect(lastCall('turn').stop).toEqual(['\nAsh:', '\n@Ash:', '\nYou:']);
        });

        it('refuses a swap to an unknown Persona, a missing personaId and a Chat of another Story', async () => {
            const story = await createStory();
            const otherStory = await createStory();
            const persona = await createPersona();
            const chat = await createChat(story.id);

            const unknown = await t.http.put(`/api/stories/${story.id}/chats/${chat.id}/identity`).send({ personaId: 999_999 }).expect(404);
            expect(unknown.body.error.code).toBe('404.006.001');
            await t.http.put(`/api/stories/${story.id}/chats/${chat.id}/identity`).send({}).expect(400);
            await t.http.put(`/api/stories/${story.id}/chats/${chat.id}/identity`).send({ personaId: 'Rin' }).expect(400);
            const foreign = await t.http
                .put(`/api/stories/${otherStory.id}/chats/${chat.id}/identity`)
                .send({ personaId: persona.id })
                .expect(404);
            expect(foreign.body.error.code).toBe('404.004.001');

            expect(await getChat(story.id, chat.id)).toMatchObject({ identityName: 'Ash', personaId: null });
        });
    });

    describe('what a swap carries over', () => {
        it('the judge reads the worn Persona, and Bonds toward it stay keyed to the user', async () => {
            const story = await createStory();
            const persona = await createPersona();
            const chat = await createChat(story.id);
            await swap(story.id, chat.id, persona.id);

            await send(story.id, chat.id, 'I hand Mira the letter.', 'Mira reads it.\n\n@Mira: Where did you get this?', {
                judge: JSON.stringify({
                    bond_changes: [{ from: 'Mira', to: 'Rin', label: 'Intrigued', description: 'The letter changed things.', cause: 'The letter.' }],
                    arc_steps: [],
                    scene: { move_on: false, reason: 'no Scene' },
                }),
            });

            const judgePrompt = lastCall('judge').messages.map((message) => message.content).join('\n');
            expect(judgePrompt).toContain('The user plays Rin (refer to them as "user").');
            expect(judgePrompt).toContain('Rin: I hand Mira the letter.');
            expect(judgePrompt).not.toContain('Ash');
            const rows = await query<{ to_character_id: number | null; label: string }>(
                `SELECT to_character_id, label FROM "bond_change" WHERE chat_id = $1`,
                [chat.id],
            );
            expect(rows).toEqual([{ to_character_id: null, label: 'Intrigued' }]);

            const dashboard = (await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/dashboard`).expect(200)).body;
            expect(dashboard.identityName).toBe('Rin');
            expect(dashboard.characters[0].bonds[0]).toMatchObject({ toward: { characterId: null, name: 'Rin' }, label: 'Intrigued' });

            // Back on the Role, the same Bond is Ash's: one user, whichever identity is worn.
            await swap(story.id, chat.id, null);
            const back = (await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/dashboard`).expect(200)).body;
            expect(back.characters[0].bonds[0]).toMatchObject({ toward: { characterId: null, name: 'Ash' }, label: 'Intrigued' });
            await send(story.id, chat.id, 'I wait.', 'Mira folds the letter.');
            expect(lastCall('turn').messages[0].content).toContain('- Mira → the user (Ash): "Intrigued" — The letter changed things.');
        });

        it('Memory writes the worn Persona as {user} and renders {user} as whoever is worn now', async () => {
            const story = await createStory();
            const persona = await createPersona();
            const chat = await createChat(story.id);
            await swap(story.id, chat.id, persona.id);

            await send(story.id, chat.id, 'I show Mira the key.', 'Mira stares at it.', {
                extraction: JSON.stringify({
                    operations: [{ op: 'add', text: 'Rin carries the key to the lamp room.', known_by: ['Mira'], cause: 'shown' }],
                }),
            });

            const extractionPrompt = lastCall('memory_extraction').messages.map((message) => message.content).join('\n');
            expect(extractionPrompt).toContain('The user plays Rin: write {user} wherever a Memory refers to them.');
            const drawer = (await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/memories`).expect(200)).body;
            expect(drawer.identityName).toBe('Rin');
            expect(drawer.memories.map((memory: { text: string }) => memory.text)).toEqual(['{user} carries the key to the lamp room.']);

            await send(story.id, chat.id, 'I pocket it.', 'Mira says nothing.');
            expect(t.gateway.textCalls('turn')[1].messages[0].content).toContain('- [known by Mira] Rin carries the key to the lamp room.');

            await swap(story.id, chat.id, null);
            expect((await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/memories`).expect(200)).body.identityName).toBe('Ash');
            await send(story.id, chat.id, 'I climb the stairs.', 'Mira follows.');
            const system = lastCall('turn').messages[0].content;
            expect(system).toContain('- [known by Mira] Ash carries the key to the lamp room.');
            expect(system).not.toContain('Rin');
        });
    });
});

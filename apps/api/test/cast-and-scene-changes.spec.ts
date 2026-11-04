import pg from 'pg';

import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Cast and Scene changes reaching existing Chats (ticket 29, spec: "Cast and Scene changes"):
 * every row of the lifecycle table, across two Chats of one Story, through the HTTP API with
 * the play model, the judge and the extraction scripted on the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';

interface Part {
    kind: 'narration' | 'speech';
    text: string;
    characterId?: number | null;
    speakerName?: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    parts?: Part[];
    judge?: { status: Status } | null;
    memory?: { status: Status } | null;
}

interface Chat {
    id: number;
    currentScene: { id: number; name: string } | null;
    messages: Message[];
    playable: boolean;
    missing: Array<{ field: string; label: string }>;
}

interface Dashboard {
    characters: Array<{
        id: number;
        name: string;
        bonds: Array<{ toward: { characterId: number | null; name: string }; label: string; history: unknown[] }>;
        arcSteps: Array<{ step: string }>;
        arcDirection: string;
    }>;
    scene: {
        current: { id: number; name: string } | null;
        advance: { fromSceneName: string; toSceneName: string | null } | null;
    };
}

interface Memory {
    id: number;
    text: string;
    knownBy: number[];
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    scenes: Array<{ id: number; name: string }>;
    startingBonds: Array<{ id: number; fromCharacterId: number; toCharacterId: number | null; label: string }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const MOVE_ON = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: true, reason: 'They went on.' } });

const SCENES = {
    arrival: { name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up the stairs.' },
    lamp: { name: 'The lamp', situation: 'Light it.', moveOnCondition: 'The lamp burns.' },
    storm: { name: 'The storm', situation: 'Ride out the night.', moveOnCondition: 'Dawn comes.' },
};

describe('Cast and Scene changes reaching existing Chats', () => {
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

    /**
     * A playable Story: Mira and Kai (Kai with an Arc direction), StartingBonds Mira → Ash,
     * Mira → Kai and Kai → Mira, and the given Scenes (none by default).
     */
    async function createStory(scenes: Array<keyof typeof SCENES> = []): Promise<Story> {
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
        const withKai = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({
                name: 'Kai',
                appearance: 'Wiry, sunburnt.',
                personality: 'Cheerful, nosy.',
                voice: 'Rambling.',
                arcDirections: 'If trusted, his cheer turns to loyalty.',
            })
            .expect(201);
        const [mira, kai] = (withKai.body as Story).characters;
        const bonds = [
            { fromCharacterId: mira.id, toCharacterId: null, label: 'Wary', description: 'She expects Ash to leave by spring.' },
            { fromCharacterId: mira.id, toCharacterId: kai.id, label: 'Fond', description: 'Her cousin.' },
            { fromCharacterId: kai.id, toCharacterId: mira.id, label: 'Admiring', description: 'She raised him.' },
        ];
        for (const bond of bonds) await t.http.post(`/api/stories/${storyId}/starting-bonds`).send(bond).expect(201);
        for (const scene of scenes) await t.http.post(`/api/stories/${storyId}/scenes`).send(SCENES[scene]).expect(201);
        return read(storyId);
    }

    async function read(storyId: number): Promise<Story> {
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

    async function dashboard(storyId: number, chatId: number): Promise<Dashboard> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200);
        return body as Dashboard;
    }

    async function memories(storyId: number, chatId: number): Promise<Memory[]> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200);
        return body.memories as Memory[];
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

    /** A turn with the given reply and judgement and an extraction that changes nothing, settled. */
    async function play(storyId: number, chatId: number, reply: string, judge: string = NO_CHANGE): Promise<Chat> {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Go on.' }).expect(201);
        return settled(storyId, chatId);
    }

    function lastTurnPrompt(): string {
        const calls = t.gateway.textCalls('turn');
        const request: TextCompletionRequest = calls[calls.length - 1];
        return request.messages[0].content;
    }

    function character(board: Dashboard, name: string) {
        return board.characters.find((candidate) => candidate.name === name);
    }

    async function count(sql: string, params: unknown[]): Promise<number> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query(`SELECT count(*)::int AS n FROM ${sql}`, params);
            return rows[0].n as number;
        } finally {
            await client.end();
        }
    }

    /** A Snapshot of the latest AI Message with these Characters in frame, waited for. */
    async function snapshot(storyId: number, chatId: number, inFrame: string[]): Promise<void> {
        t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: inFrame, scene: 'By the lamp.' }));
        t.gateway.scriptImage('snapshot_image', {});
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshots`).send({}).expect(202);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/snapshots`).expect(200);
            if (body.jobs.length === 0) return;
            if (body.jobs.some((job: { status: string }) => job.status === 'failed') || Date.now() > deadline) {
                throw new Error(`The Snapshot did not finish: ${JSON.stringify(body.jobs)}`);
            }
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function sceneOf(storyId: number, chatId: number): Promise<string | null> {
        return (await getChat(storyId, chatId)).currentScene?.name ?? null;
    }

    describe('Live edits', () => {
        it('reach every Chat on its next turn, while the Opening, StartingBonds and Arc directions reach only new or reset Chats', async () => {
            const story = await createStory();
            const kai = story.characters[1];
            const first = await createChat(story.id);
            const second = await createChat(story.id);
            const wary = story.startingBonds.find((bond) => bond.label === 'Wary')!;

            await t.http
                .patch(`/api/stories/${story.id}`)
                .send({ setting: 'A lighthouse in a fog bank, 1890s.', opening: 'Fog.\n\n@Mira: Who?' })
                .expect(200);
            await t.http.patch(`/api/stories/${story.id}/characters/${kai.id}`).send({ voice: 'Clipped now.', arcDirections: 'He leaves.' }).expect(200);
            await t.http.patch(`/api/stories/${story.id}/starting-bonds/${wary.id}`).send({ label: 'Hostile' }).expect(200);

            for (const chat of [first, second]) {
                await play(story.id, chat.id, 'Mira shrugs.');
                const prompt = lastTurnPrompt();
                expect(prompt).toContain('A lighthouse in a fog bank, 1890s.');
                expect(prompt).toContain('Clipped now.');
                expect(prompt).toContain('If trusted, his cheer turns to loyalty.');
                expect(prompt).not.toContain('He leaves.');

                const read = await getChat(story.id, chat.id);
                expect(read.messages[0].parts?.map((part) => part.text)).toEqual(['The lamp went out an hour ago.', 'Boots off, keeper.']);
                const board = await dashboard(story.id, chat.id);
                expect(character(board, 'Mira')!.bonds.find((bond) => bond.toward.characterId === null)!.label).toBe('Wary');
                expect(character(board, 'Kai')!.arcDirection).toBe('If trusted, his cheer turns to loyalty.');
            }

            // A reset Chat and a new one take the Story as it is now.
            await t.http.post(`/api/stories/${story.id}/chats/${second.id}/reset`).expect(200);
            const third = await createChat(story.id);
            for (const chatId of [second.id, third.id]) {
                const read = await getChat(story.id, chatId);
                expect(read.messages[0].parts?.[0].text).toBe('Fog.');
                const board = await dashboard(story.id, chatId);
                expect(character(board, 'Mira')!.bonds.find((bond) => bond.toward.characterId === null)!.label).toBe('Hostile');
                expect(character(board, 'Kai')!.arcDirection).toBe('He leaves.');
            }
            // The first Chat was neither reset nor new.
            expect(character(await dashboard(story.id, first.id), 'Mira')!.bonds.find((bond) => bond.toward.characterId === null)!.label).toBe('Wary');
        });
    });

    describe('Add a Character', () => {
        it('joins every Chat as a stranger, with its Arc directions copied in', async () => {
            const story = await createStory();
            const first = await createChat(story.id);
            const second = await createChat(story.id);
            await play(story.id, first.id, '@Mira: Sit.');

            const added = await t.http
                .post(`/api/stories/${story.id}/characters`)
                .send({
                    name: 'Lena',
                    appearance: 'Short, freckled.',
                    personality: 'Blunt.',
                    voice: 'Dockside slang.',
                    arcDirections: 'She may come to trust the keeper.',
                })
                .expect(201);
            const lena = (added.body as Story).characters[2];

            for (const chat of [first, second]) {
                const board = await dashboard(story.id, chat.id);
                expect(character(board, 'Lena')).toEqual({
                    id: lena.id,
                    name: 'Lena',
                    bonds: [],
                    arcSteps: [],
                    arcDirection: 'She may come to trust the keeper.',
                });
                // Nobody has a Bond toward her either.
                for (const other of board.characters) {
                    expect(other.bonds.filter((bond) => bond.toward.characterId === lena.id)).toEqual([]);
                }
            }
            expect(await count('bond_change WHERE from_character_id = $1 OR to_character_id = $1', [lena.id])).toBe(0);

            await play(story.id, second.id, '@Lena: Who are you?');
            const prompt = lastTurnPrompt();
            expect(prompt).toContain('Dockside slang.');
            expect(prompt).toMatch(/- Lena: Arc so far: .*Possible direction \(author's intent, not yet happened\): She may come to trust the keeper\./);
            const reply = (await getChat(story.id, second.id)).messages.at(-1)!;
            expect(reply.parts).toEqual([{ kind: 'speech', characterId: lena.id, speakerName: 'Lena', text: 'Who are you?' }]);
        });

        it('copies nothing for a Character added without Arc directions, and a StartingBond added later stays out of existing Chats', async () => {
            const story = await createStory();
            const first = await createChat(story.id);
            const second = await createChat(story.id);

            const added = await t.http
                .post(`/api/stories/${story.id}/characters`)
                .send({ name: 'Tomas', appearance: 'Old.', personality: 'Quiet.', voice: 'Few words.' })
                .expect(201);
            const tomas = (added.body as Story).characters[2];
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: tomas.id, toCharacterId: null, label: 'Suspicious', description: 'Strangers bring storms.' })
                .expect(201);

            expect(await count('chat_arc_direction WHERE character_id = $1', [tomas.id])).toBe(0);
            for (const chat of [first, second]) {
                expect(character(await dashboard(story.id, chat.id), 'Tomas')).toMatchObject({ bonds: [], arcDirection: '' });
            }
            // A new Chat seeds the StartingBond.
            const third = await createChat(story.id);
            expect(character(await dashboard(story.id, third.id), 'Tomas')!.bonds.map((bond) => bond.label)).toEqual(['Suspicious']);
        });

        it('copies the first Arc direction typed after a blank add into existing Chats, and no later edit', async () => {
            const story = await createStory();
            const first = await createChat(story.id);
            const second = await createChat(story.id);

            // The editor's "Add Character" creates the Character blank; the author fills it in after.
            const added = await t.http.post(`/api/stories/${story.id}/characters`).send({}).expect(201);
            const tomas = (added.body as Story).characters[2];
            await t.http
                .patch(`/api/stories/${story.id}/characters/${tomas.id}`)
                .send({ name: 'Tomas', appearance: 'Old.', personality: 'Quiet.', voice: 'Few words.' })
                .expect(200);
            expect(await count('chat_arc_direction WHERE character_id = $1', [tomas.id])).toBe(0);

            await t.http
                .patch(`/api/stories/${story.id}/characters/${tomas.id}`)
                .send({ arcDirections: 'He may speak of the wreck.' })
                .expect(200);
            for (const chat of [first, second]) {
                expect(character(await dashboard(story.id, chat.id), 'Tomas')!.arcDirection).toBe('He may speak of the wreck.');
            }

            // Once a Chat holds a copy, later edits are the author's and reach only new or reset Chats.
            await t.http
                .patch(`/api/stories/${story.id}/characters/${tomas.id}`)
                .send({ arcDirections: 'He leaves on the supply boat.' })
                .expect(200);
            for (const chat of [first, second]) {
                expect(character(await dashboard(story.id, chat.id), 'Tomas')!.arcDirection).toBe('He may speak of the wreck.');
            }
            expect(await count('chat_arc_direction WHERE character_id = $1', [tomas.id])).toBe(2);
            // Kai's copy, made when the Chats started, is untouched by any of this.
            expect(character(await dashboard(story.id, first.id), 'Kai')!.arcDirection).toBe('If trusted, his cheer turns to loyalty.');
        });
    });

    describe('Remove a Character', () => {
        /**
         * Two Chats where Kai has spoken, holds and receives Bonds with history, has an Arc
         * step, and is on two Memories' Known by (one with Mira, one alone).
         */
        async function storyWithKaiInPlay() {
            const story = await createStory();
            const [mira, kai] = story.characters;
            const chats = [await createChat(story.id), await createChat(story.id)];
            for (const chat of chats) {
                await play(
                    story.id,
                    chat.id,
                    '@Kai: Welcome, keeper!\n\n@Mira: Hush.',
                    JSON.stringify({
                        bond_changes: [
                            { from: 'Kai', to: 'Ash', label: 'Curious', description: 'A new face.', cause: 'Ash came.' },
                            { from: 'Mira', to: 'Kai', label: 'Annoyed', description: 'He talks too much.', cause: 'He blurted.' },
                            { from: 'Kai', to: 'Mira', label: 'Sheepish', description: 'Shushed again.', cause: 'She hushed him.' },
                        ],
                        arc_steps: [{ character: 'Kai', step: 'He greets a stranger first.', cause: 'He spoke up.' }],
                        scene: { move_on: false, reason: 'not yet' },
                    }),
                );
                const memoryPath = `/api/stories/${story.id}/chats/${chat.id}/memories`;
                await t.http.post(memoryPath).send({ text: 'Kai hides a key under the step.', knownBy: [kai.id] }).expect(201);
                await t.http.post(memoryPath).send({ text: '{user} arrived at dusk.', knownBy: [mira.id, kai.id] }).expect(201);
                await snapshot(story.id, chat.id, ['Kai', 'Mira']);
            }
            return { story, mira, kai, chats };
        }

        async function expectKaiGone(storyId: number, chatIds: number[], mira: { id: number }, kai: { id: number }) {
            const story = await read(storyId);
            expect(story.characters.map((c) => c.name)).toEqual(['Mira']);
            // StartingBonds pointing at Kai went with him; Mira's toward the Role stays.
            expect(story.startingBonds.map((bond) => bond.label)).toEqual(['Wary']);

            for (const chatId of chatIds) {
                const board = await dashboard(storyId, chatId);
                expect(board.characters.map((c) => c.name)).toEqual(['Mira']);
                expect(character(board, 'Mira')!.bonds.map((bond) => bond.toward.name)).toEqual(['Ash']);

                // Old speech keeps the stamped name, with the Character link cleared.
                const chat = await getChat(storyId, chatId);
                expect(chat.messages.at(-1)!.parts).toEqual([
                    { kind: 'speech', characterId: null, speakerName: 'Kai', text: 'Welcome, keeper!' },
                    { kind: 'speech', characterId: mira.id, speakerName: 'Mira', text: 'Hush.' },
                ]);
                expect(chat.playable).toBe(true);

                // Dropped from every Known by; the Memory left with nobody stays.
                const list = await memories(storyId, chatId);
                expect(list.map((memory) => [memory.text, memory.knownBy])).toEqual([
                    ['Kai hides a key under the step.', []],
                    ['{user} arrived at dusk.', [mira.id]],
                ]);
            }
            expect(await count('bond_change WHERE from_character_id = $1 OR to_character_id = $1', [kai.id])).toBe(0);
            expect(await count('arc_step WHERE character_id = $1', [kai.id])).toBe(0);
            expect(await count('chat_arc_direction WHERE character_id = $1', [kai.id])).toBe(0);
            expect(await count('memory_known_by WHERE character_id = $1', [kai.id])).toBe(0);
            expect(await count('message_part WHERE character_id = $1', [kai.id])).toBe(0);

            // Snapshots keep the stamped name with the Character link cleared, and stay in the Gallery.
            const { body } = await t.http.get(`/api/stories/${storyId}/gallery`).expect(200);
            expect(body.snapshots).toHaveLength(chatIds.length);
            for (const item of body.snapshots) {
                expect(item.characters).toEqual([
                    { characterId: null, name: 'Kai' },
                    { characterId: mira.id, name: 'Mira' },
                ]);
            }
            expect(await count('snapshot_character WHERE character_id = $1', [kai.id])).toBe(0);
        }

        it('deletes its Bonds both ways, StartingBonds, Arc steps, Arc directions and Known-by entries in every Chat, and keeps its stamped name on old speech', async () => {
            const { story, mira, kai, chats } = await storyWithKaiInPlay();
            expect(await count('bond_change WHERE from_character_id = $1 OR to_character_id = $1', [kai.id])).toBe(10);

            await t.http.delete(`/api/stories/${story.id}/characters/${kai.id}`).expect(200);

            await expectKaiGone(story.id, chats.map((chat) => chat.id), mira, kai);
            // Play goes on without him; the cast no longer names him, and his old line is still history.
            await play(story.id, chats[0].id, '@Mira: Tea?');
            const prompt = lastTurnPrompt();
            expect(prompt).not.toContain('Rambling.');
            expect(prompt).toContain('- [known by no one] Kai hides a key under the step.');
            expect(prompt).toContain('- [known by Mira] Ash arrived at dusk.');
        });

        it('does the same through the Story assistant, once the removal is confirmed', async () => {
            const { story, mira, kai, chats } = await storyWithKaiInPlay();
            t.gateway.scriptText('story_assistant', JSON.stringify({ reply: 'Kai is gone.', changes: [{ op: 'remove', target: 'character', name: 'Kai' }] }));

            const pending = await t.http.post(`/api/stories/${story.id}/assistant`).send({ instruction: 'Remove Kai.' }).expect(200);
            expect(pending.body.pending.removals).toEqual(['Character Kai']);
            // Nothing happened to the Chats while the removal waits for confirmation.
            expect(character(await dashboard(story.id, chats[0].id), 'Kai')).toBeDefined();
            expect(await count('arc_step WHERE character_id = $1', [kai.id])).toBe(2);

            await t.http
                .post(`/api/stories/${story.id}/assistant/apply`)
                .send({ changes: pending.body.pending.changes, confirmRemovals: true })
                .expect(200);

            await expectKaiGone(story.id, chats.map((chat) => chat.id), mira, kai);
        });
    });

    describe('Add Scenes', () => {
        it('puts Chats that never had Scenes on the first one, and a Chat in free play on the first new Scene after the last one it finished', async () => {
            const story = await createStory();
            const [first, second] = [await createChat(story.id), await createChat(story.id)];
            expect(first.currentScene).toBeNull();
            expect(second.currentScene).toBeNull();

            await t.http.post(`/api/stories/${story.id}/scenes`).send(SCENES.arrival).expect(201);
            expect(await sceneOf(story.id, first.id)).toBe('Arrival');
            expect(await sceneOf(story.id, second.id)).toBe('Arrival');

            // The first Chat finishes Arrival, the last Scene, into free play; the second stays.
            await play(story.id, first.id, '@Mira: Up you go.', MOVE_ON);
            expect(await sceneOf(story.id, first.id)).toBeNull();

            await t.http.post(`/api/stories/${story.id}/scenes`).send(SCENES.lamp).expect(201);
            expect(await sceneOf(story.id, first.id)).toBe('The lamp');
            expect(await sceneOf(story.id, second.id)).toBe('Arrival');

            // Adding a Scene moves a Chat without recording a SceneAdvance.
            expect(await count('scene_advance WHERE chat_id = $1', [first.id])).toBe(1);
            expect(await count('scene_advance WHERE chat_id = $1', [second.id])).toBe(0);
            await play(story.id, first.id, '@Mira: Light it.');
            expect(lastTurnPrompt()).toMatch(/# Current Scene[\s\S]*The lamp/);
        });

        it('puts a Chat in free play whose last finished Scene is gone on the new Scene', async () => {
            const story = await createStory(['arrival']);
            const [first, second] = [await createChat(story.id), await createChat(story.id)];
            await play(story.id, first.id, '@Mira: Up.', MOVE_ON);
            await play(story.id, second.id, '@Mira: Up.', MOVE_ON);
            await t.http.delete(`/api/stories/${story.id}/scenes/${story.scenes[0].id}`).expect(200);
            expect(await sceneOf(story.id, first.id)).toBeNull();

            await t.http.post(`/api/stories/${story.id}/scenes`).send(SCENES.storm).expect(201);

            expect(await sceneOf(story.id, first.id)).toBe('The storm');
            expect(await sceneOf(story.id, second.id)).toBe('The storm');
        });
    });

    describe('Reorder Scenes', () => {
        it('keeps each Chat on the same Scene, and the next move-on follows the new order', async () => {
            const story = await createStory(['arrival', 'lamp', 'storm']);
            const [arrival, lamp, storm] = story.scenes;
            const [first, second] = [await createChat(story.id), await createChat(story.id)];
            await play(story.id, second.id, '@Mira: Up.', MOVE_ON);
            expect(await sceneOf(story.id, second.id)).toBe('The lamp');

            await t.http.put(`/api/stories/${story.id}/scenes/order`).send({ sceneIds: [storm.id, lamp.id, arrival.id] }).expect(200);

            expect(await sceneOf(story.id, first.id)).toBe('Arrival');
            expect(await sceneOf(story.id, second.id)).toBe('The lamp');
            await play(story.id, second.id, '@Mira: Lit.', MOVE_ON);
            expect(await sceneOf(story.id, second.id)).toBe('Arrival');
            await play(story.id, first.id, '@Mira: Done.', MOVE_ON);
            expect(await sceneOf(story.id, first.id)).toBeNull();
        });
    });

    describe('Remove a Scene', () => {
        it('moves a Chat on it to the next Scene, or to free play after the last, and SceneAdvances keep their stamped names', async () => {
            const story = await createStory(['arrival', 'lamp', 'storm']);
            const [arrival, lamp, storm] = story.scenes;
            const [first, second] = [await createChat(story.id), await createChat(story.id)];
            await play(story.id, second.id, '@Mira: Up.', MOVE_ON);
            await play(story.id, second.id, '@Mira: Lit.', MOVE_ON);
            expect(await sceneOf(story.id, first.id)).toBe('Arrival');
            expect(await sceneOf(story.id, second.id)).toBe('The storm');

            await t.http.delete(`/api/stories/${story.id}/scenes/${arrival.id}`).expect(200);
            expect(await sceneOf(story.id, first.id)).toBe('The lamp');
            expect(await sceneOf(story.id, second.id)).toBe('The storm');

            await t.http.delete(`/api/stories/${story.id}/scenes/${storm.id}`).expect(200);
            expect(await sceneOf(story.id, first.id)).toBe('The lamp');
            expect(await sceneOf(story.id, second.id)).toBeNull();

            await t.http.delete(`/api/stories/${story.id}/scenes/${lamp.id}`).expect(200);
            expect(await sceneOf(story.id, first.id)).toBeNull();

            // The author's moves record nothing; the judge's advances keep their stamped names.
            expect(await count('scene_advance WHERE chat_id = $1', [first.id])).toBe(0);
            const board = await dashboard(story.id, second.id);
            expect(board.scene).toMatchObject({ current: null, advance: { fromSceneName: 'The lamp', toSceneName: 'The storm' } });
            expect(await count('scene_advance WHERE chat_id = $1 AND from_scene_id IS NULL AND to_scene_id IS NULL', [second.id])).toBe(2);

            // Rolling back the last advance returns to a Scene that is gone: free play.
            const chat = await getChat(story.id, second.id);
            const lastReply = chat.messages.at(-1)!;
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.patch(`/api/stories/${story.id}/chats/${second.id}/messages/${lastReply.id}`).send({ text: '@Mira: Lit, again.' }).expect(200);
            await settled(story.id, second.id);
            expect(await sceneOf(story.id, second.id)).toBeNull();
        });
    });

    describe('Required field emptied', () => {
        it('keeps every Chat readable and blocks sending with a note naming the field', async () => {
            const story = await createStory(['arrival']);
            const chats = [await createChat(story.id), await createChat(story.id)];
            await play(story.id, chats[0].id, '@Mira: Sit.');

            await t.http.patch(`/api/stories/${story.id}`).send({ setting: '' }).expect(200);
            await t.http.patch(`/api/stories/${story.id}/scenes/${story.scenes[0].id}`).send({ situation: ' ' }).expect(200);

            for (const chat of chats) {
                const read = await getChat(story.id, chat.id);
                expect(read.playable).toBe(false);
                expect(read.missing.map((field) => field.label)).toEqual(['Setting', 'Arrival: Situation']);
                expect(read.messages.length).toBeGreaterThan(0);
                await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/dashboard`).expect(200);
                await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/memories`).expect(200);

                const refused = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(422);
                expect(refused.body.error.code).toBe('422.004.002');
                expect(refused.body.error.message).toContain('Setting');
                expect(refused.body.error.message).toContain('Arrival: Situation');
                expect((await getChat(story.id, chat.id)).messages).toEqual(read.messages);
            }
            expect(t.gateway.textCalls('turn')).toHaveLength(1);

            await t.http.patch(`/api/stories/${story.id}`).send({ setting: 'Back again.' }).expect(200);
            await t.http.patch(`/api/stories/${story.id}/scenes/${story.scenes[0].id}`).send({ situation: 'Reach the lamp room.' }).expect(200);
            await play(story.id, chats[1].id, '@Mira: Better.');
        });
    });
});

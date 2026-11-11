import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Bond gates on Scenes (.scratch/bond-axes/issues/04-bond-gates.md), through the HTTP API with the
 * Judge scripted on the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';
type Axis = 'trust' | 'affection' | 'desire' | 'tension';

interface Gate {
    fromCharacterId: number;
    toCharacterId: number | null;
    axis: Axis;
    atLeast: number;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    scenes: Array<{ id: number; name: string; situation: string; moveOnCondition: string; gates: Gate[] }>;
    playable: boolean;
    missing: Array<{ field: string; label: string }>;
}

interface Chat {
    id: number;
    currentScene: { id: number; name: string } | null;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: Status } | null; memory?: { status: Status } | null }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Nara: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';

function judgement(options: { moveOn?: boolean; changes?: Array<{ from: string; to: string; label: string; levels?: Partial<Record<Axis, number>> }> } = {}): string {
    return JSON.stringify({
        bond_changes: (options.changes ?? []).map((change) => ({ ...change, description: `${change.label}, in a word.`, cause: `Because ${change.label}.` })),
        arc_steps: [],
        scene: { reason: options.moveOn ? 'Nara opened the door.' : 'Not yet.', move_on: options.moveOn ?? false },
    });
}

describe('Bond gates', () => {
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
     * A Story with Nara (who starts unsure of Ash) and Kai, and two Scenes: Arrival, with the given
     * move-on condition, and The lamp.
     */
    async function createStory(condition = ''): Promise<{ story: Story; nara: number; kai: number; arrival: number; lamp: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const nara = (
            await t.http
                .post(`/api/stories/${storyId}/characters`)
                .send({ name: 'Nara', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
                .expect(201)
        ).body.characters[0].id as number;
        const kai = (
            await t.http
                .post(`/api/stories/${storyId}/characters`)
                .send({ name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.' })
                .expect(201)
        ).body.characters[1].id as number;
        await t.http
            .post(`/api/stories/${storyId}/starting-bonds`)
            .send({ fromCharacterId: nara, toCharacterId: null, label: 'Unsure', description: 'She does not know the new keeper yet.' })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: condition }).expect(201);
        const story = (await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The lamp', situation: 'Light it.' }).expect(201)).body as Story;
        return { story, nara, kai, arrival: story.scenes[0].id, lamp: story.scenes[1].id };
    }

    async function setGates(storyId: number, sceneId: number, gates: unknown, status = 200) {
        return t.http.put(`/api/stories/${storyId}/scenes/${sceneId}/gates`).send(gates as object).expect(status);
    }

    async function getStory(storyId: number): Promise<Story> {
        return (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    async function play(storyId: number, chatId: number, text: string, judge: string): Promise<Chat> {
        t.gateway.scriptText('turn', '@Nara: Hm.');
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    describe('the gates API', () => {
        it('saves the whole list, answers the Story with each Scene\'s gates, and a new list replaces it', async () => {
            const { story, nara, kai, arrival, lamp } = await createStory('Nara opens the door.');
            const gates: Gate[] = [
                { fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 2 },
                { fromCharacterId: kai, toCharacterId: nara, axis: 'tension', atLeast: 0 },
            ];

            const saved = (await setGates(story.id, arrival, gates)).body as Story;
            expect(saved.scenes.map((scene) => scene.gates)).toEqual([gates, []]);
            expect((await getStory(story.id)).scenes[0].gates).toEqual(gates);

            const replaced = (await setGates(story.id, arrival, [{ fromCharacterId: kai, toCharacterId: null, axis: 'desire', atLeast: -1 }])).body as Story;
            expect(replaced.scenes[0].gates).toEqual([{ fromCharacterId: kai, toCharacterId: null, axis: 'desire', atLeast: -1 }]);

            await setGates(story.id, lamp, [{ fromCharacterId: nara, toCharacterId: kai, axis: 'affection', atLeast: 3 }]);
            const cleared = (await setGates(story.id, arrival, [])).body as Story;
            expect(cleared.scenes.map((scene) => scene.gates)).toEqual([[], [{ fromCharacterId: nara, toCharacterId: kai, axis: 'affection', atLeast: 3 }]]);
        });

        it.each([
            ['an axis outside the four', { axis: 'lust', atLeast: 1 }],
            ['a level above any axis', { axis: 'trust', atLeast: 4 }],
            ['a level below any axis', { axis: 'affection', atLeast: -4 }],
            ['a level that is not whole', { axis: 'desire', atLeast: 1.5 }],
            ['a level that is a word', { axis: 'trust', atLeast: 'trusts' }],
            ['no axis', { atLeast: 1 }],
        ])('refuses %s with a validation error, and keeps the gates it had', async (_what, fields) => {
            const { story, nara, arrival } = await createStory();
            const kept: Gate[] = [{ fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 }];
            await setGates(story.id, arrival, kept);

            const refused = await setGates(story.id, arrival, [{ fromCharacterId: nara, toCharacterId: null, ...fields }], 400);
            expect(refused.body.error.code).toBe('400.000.000');
            expect((await getStory(story.id)).scenes[0].gates).toEqual(kept);
        });

        it('refuses a body that is not a list', async () => {
            const { story, nara, arrival } = await createStory();
            await setGates(story.id, arrival, { fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 }, 400);
        });

        it('refuses a Character not in the cast, a gate toward oneself, a Tension below at ease, or one gate twice', async () => {
            const { story, nara, kai, arrival } = await createStory();
            const other = await createStory();
            const kept: Gate[] = [{ fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 }];
            await setGates(story.id, arrival, kept);

            for (const gates of [
                [{ fromCharacterId: other.nara, toCharacterId: null, axis: 'trust', atLeast: 1 }],
                [{ fromCharacterId: nara, toCharacterId: other.kai, axis: 'trust', atLeast: 1 }],
                [{ fromCharacterId: 999_999, toCharacterId: null, axis: 'trust', atLeast: 1 }],
                [{ fromCharacterId: kai, toCharacterId: kai, axis: 'trust', atLeast: 1 }],
                [{ fromCharacterId: kai, toCharacterId: nara, axis: 'tension', atLeast: -1 }],
                [
                    { fromCharacterId: kai, toCharacterId: null, axis: 'trust', atLeast: 1 },
                    { fromCharacterId: kai, toCharacterId: null, axis: 'trust', atLeast: 2 },
                ],
            ]) {
                const refused = await setGates(story.id, arrival, gates, 422);
                expect(refused.body.error.code).toBe('422.003.024');
            }
            expect((await getStory(story.id)).scenes[0].gates).toEqual(kept);
        });

        it('answers 404 for a Scene of another Story', async () => {
            const { story } = await createStory();
            const other = await createStory();
            await setGates(story.id, other.arrival, [], 404);
        });

        it('a Character\'s gates go with the Character', async () => {
            const { story, nara, kai, arrival } = await createStory();
            await setGates(story.id, arrival, [
                { fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 },
                { fromCharacterId: nara, toCharacterId: kai, axis: 'trust', atLeast: 1 },
            ]);
            const removed = (await t.http.delete(`/api/stories/${story.id}/characters/${kai}`).expect(200)).body as Story;
            expect(removed.scenes[0].gates).toEqual([{ fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 }]);
        });
    });

    describe('the playable rule', () => {
        it('a Scene before the last needs a move-on condition, a gate, or both', async () => {
            const { story, nara, arrival } = await createStory();
            expect(story.playable).toBe(false);
            expect(story.missing).toContainEqual({ field: 'scenes.0.moveOnCondition', label: 'Arrival: Move-on condition' });

            const gated = (await setGates(story.id, arrival, [{ fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 }])).body as Story;
            expect(gated.missing).toEqual([]);
            expect(gated.playable).toBe(true);

            const both = (await t.http.patch(`/api/stories/${story.id}/scenes/${arrival}`).send({ moveOnCondition: 'Nara opens the door.' }).expect(200)).body as Story;
            expect(both.playable).toBe(true);

            await t.http.patch(`/api/stories/${story.id}/scenes/${arrival}`).send({ moveOnCondition: '' }).expect(200);
            const neither = (await setGates(story.id, arrival, [])).body as Story;
            expect(neither.playable).toBe(false);
            expect(neither.missing).toContainEqual({ field: 'scenes.0.moveOnCondition', label: 'Arrival: Move-on condition' });
        });
    });

    describe('moving on', () => {
        it('a Scene with a condition and gates waits for both', async () => {
            const { story, nara, arrival } = await createStory('Nara opens the door.');
            await setGates(story.id, arrival, [{ fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 }]);
            const chatId = ((await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body as Chat).id;

            // The event without the feeling.
            expect((await play(story.id, chatId, 'I knock.', judgement({ moveOn: true }))).currentScene?.name).toBe('Arrival');
            // The judge sees the condition, not "(gates only)".
            expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain('# Current Scene\nArrival. Move-on condition: Nara opens the door.\n');
            // The feeling without the event.
            const warmer = judgement({ changes: [{ from: 'Nara', to: 'user', label: 'Unsure', levels: { trust: 1, affection: 0, desire: 0, tension: 0 } }] });
            expect((await play(story.id, chatId, 'I keep her secret.', warmer)).currentScene?.name).toBe('Arrival');
            // Both: it moves on, with the Judge's reason as its event.
            expect((await play(story.id, chatId, 'I wait at the door.', judgement({ moveOn: true }))).currentScene?.name).toBe('The lamp');
            const board = (await t.http.get(`/api/stories/${story.id}/chats/${chatId}/dashboard`).expect(200)).body;
            expect(board.scene.advance).toMatchObject({ fromSceneName: 'Arrival', toSceneName: 'The lamp', event: 'Nara opened the door.' });
        });

        it('a gates-only Scene moves on in the same judgement that opens its gate, and the event names the gate', async () => {
            const { story, nara, arrival } = await createStory();
            await setGates(story.id, arrival, [{ fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 1 }]);
            const chatId = ((await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body as Chat).id;

            // A turn that changes nothing: the gate does not hold, and the Judge's move_on is not what decides.
            expect((await play(story.id, chatId, 'I knock.', judgement({ moveOn: true }))).currentScene?.name).toBe('Arrival');
            expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain('# Current Scene\nArrival. Move-on condition: (gates only)\n');
            // The Narrator is steered toward the gate in words.
            expect(t.gateway.textCalls('turn').at(-1)!.messages[0].content).toContain(
                'This Scene moves on once these feelings have grown: Nara toward Ash, Trust at least inclined to trust.',
            );

            const opens = judgement({ changes: [{ from: 'Nara', to: 'user', label: 'Warming', levels: { trust: 1, affection: 0, desire: 0, tension: 0 } }] });
            const played = await play(story.id, chatId, 'I keep her secret.', opens);
            expect(played.currentScene?.name).toBe('The lamp');
            const board = (await t.http.get(`/api/stories/${story.id}/chats/${chatId}/dashboard`).expect(200)).body;
            expect(board.scene.advance).toMatchObject({
                fromSceneName: 'Arrival',
                toSceneName: 'The lamp',
                event: 'Nara toward Ash, Trust at least inclined to trust',
            });
            // The change and the advance are one record, caused by the same reply.
            const reply = played.messages[played.messages.length - 1];
            expect(board.scene.advance.messageId).toBe(reply.id);
            const nara_ = board.characters.find((character: { name: string }) => character.name === 'Nara');
            expect(nara_.bonds[0].history[0]).toMatchObject({ label: 'Warming', messageId: reply.id });
        });

        it('a gate on a Bond with no levels yet holds the Scene back', async () => {
            const { story, nara, kai, arrival } = await createStory();
            // Tension at least "at ease": the lowest level, which any measured Bond would meet.
            await setGates(story.id, arrival, [{ fromCharacterId: nara, toCharacterId: kai, axis: 'tension', atLeast: 0 }]);
            const chatId = ((await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body as Chat).id;

            // Nara's Bond toward Kai forms with no levels.
            const forms = judgement({ changes: [{ from: 'Nara', to: 'Kai', label: 'Curious' }] });
            expect((await play(story.id, chatId, 'I ask about Kai.', forms)).currentScene?.name).toBe('Arrival');
            // Its first measure opens the gate.
            const measured = judgement({ changes: [{ from: 'Nara', to: 'Kai', label: 'Curious', levels: { trust: 0, affection: 0, desire: 0, tension: 0 } }] });
            expect((await play(story.id, chatId, 'Kai waves.', measured)).currentScene?.name).toBe('The lamp');
        });
    });

    it('Duplicate copies each Scene\'s gates onto the copy\'s Characters and Scenes', async () => {
        const { story, nara, kai, arrival, lamp } = await createStory('Nara opens the door.');
        await setGates(story.id, arrival, [
            { fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 2 },
            { fromCharacterId: kai, toCharacterId: nara, axis: 'tension', atLeast: 1 },
        ]);
        await setGates(story.id, lamp, [{ fromCharacterId: nara, toCharacterId: kai, axis: 'affection', atLeast: -1 }]);

        const copy = (await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201)).body as Story;

        const names = new Map(copy.characters.map((character) => [character.id, character.name]));
        const named = (gate: Gate) => ({
            from: names.get(gate.fromCharacterId),
            to: gate.toCharacterId === null ? null : names.get(gate.toCharacterId),
            axis: gate.axis,
            atLeast: gate.atLeast,
        });
        expect(copy.scenes.map((scene) => [scene.name, scene.gates.map(named)])).toEqual([
            [
                'Arrival',
                [
                    { from: 'Nara', to: null, axis: 'trust', atLeast: 2 },
                    { from: 'Kai', to: 'Nara', axis: 'tension', atLeast: 1 },
                ],
            ],
            ['The lamp', [{ from: 'Nara', to: 'Kai', axis: 'affection', atLeast: -1 }]],
        ]);
        expect(copy.scenes.every((scene) => !story.scenes.some((original) => original.id === scene.id))).toBe(true);
    });
});

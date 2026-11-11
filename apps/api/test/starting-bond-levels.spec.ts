import pg from 'pg';

import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Starting Bond levels (.scratch/bond-axes/issues/02-starting-bond-levels.md), through the HTTP
 * API with the Judge scripted on the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';
type Levels = { trust: number; affection: number; desire: number; tension: number };

interface StartingBond extends Levels {
    id: number;
    fromCharacterId: number;
    toCharacterId: number | null;
    label: string;
    description: string;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    startingBonds: StartingBond[];
}

interface Chat {
    id: number;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: Status } | null; memory?: { status: Status } | null }>;
    bonds: Array<{ fromCharacterId: number; toCharacterId: number | null; label: string; levels: Levels | null }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';
const MIDDLE: Levels = { trust: 0, affection: 0, desire: 0, tension: 0 };

describe('Starting Bond levels', () => {
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

    /** A playable Story with Mira and Kai, and Mira's Starting Bond toward the Role. */
    async function createStory(): Promise<{ story: Story; bond: StartingBond; mira: number; kai: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const mira = (
            await t.http
                .post(`/api/stories/${storyId}/characters`)
                .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
                .expect(201)
        ).body.characters[0].id as number;
        const kai = (
            await t.http
                .post(`/api/stories/${storyId}/characters`)
                .send({ name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.' })
                .expect(201)
        ).body.characters[1].id as number;
        const story = (
            await t.http
                .post(`/api/stories/${storyId}/starting-bonds`)
                .send({ fromCharacterId: mira, toCharacterId: null, label: 'Wary', description: 'She expects the new keeper to leave by spring.' })
                .expect(201)
        ).body as Story;
        return { story, bond: story.startingBonds[0], mira, kai };
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
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    async function play(storyId: number, chatId: number, text: string, judge: string): Promise<Chat> {
        t.gateway.scriptText('turn', '@Mira: Hm.');
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    async function miraTowardAsh(storyId: number, chatId: number): Promise<{ label: string; levels: Levels | null }> {
        const board = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200)).body as {
            characters: Array<{ name: string; bonds: Array<{ toward: { characterId: number | null }; label: string; levels: Levels | null }> }>;
        };
        const bond = board.characters.find((character) => character.name === 'Mira')?.bonds.find((entry) => entry.toward.characterId === null);
        if (!bond) throw new Error('Mira has no Bond toward the user');
        return bond;
    }

    it('a new Starting Bond starts in the middle of every axis', async () => {
        const { bond } = await createStory();
        expect(bond).toMatchObject(MIDDLE);
    });

    it('saves levels sent with a new Starting Bond and with an edit, one axis at a time', async () => {
        const { story, mira, kai } = await createStory();

        const added = (
            await t.http
                .post(`/api/stories/${story.id}/starting-bonds`)
                .send({ fromCharacterId: kai, toCharacterId: mira, label: 'Old friends', trust: 2, desire: -1 })
                .expect(201)
        ).body as Story;
        const kaiToMira = added.startingBonds.find((bond) => bond.fromCharacterId === kai)!;
        expect(kaiToMira).toMatchObject({ trust: 2, affection: 0, desire: -1, tension: 0 });

        await t.http.patch(`/api/stories/${story.id}/starting-bonds/${kaiToMira.id}`).send({ tension: 3 }).expect(200);
        const edited = (await t.http.patch(`/api/stories/${story.id}/starting-bonds/${kaiToMira.id}`).send({ affection: -3 }).expect(200)).body as Story;
        expect(edited.startingBonds.find((bond) => bond.id === kaiToMira.id)).toMatchObject({
            label: 'Old friends',
            trust: 2,
            affection: -3,
            desire: -1,
            tension: 3,
        });
    });

    it.each([
        ['trust', 4],
        ['trust', -4],
        ['affection', 4],
        ['desire', -4],
        ['tension', -1],
        ['tension', 4],
        ['trust', 1.5],
        ['affection', 'fond'],
    ])('refuses %s at %o with a validation error, and saves nothing', async (axis, level) => {
        const { story, bond } = await createStory();

        const refused = await t.http.patch(`/api/stories/${story.id}/starting-bonds/${bond.id}`).send({ [axis]: level }).expect(400);
        expect(refused.body.error.code).toBe('400.000.000');

        const after = (await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story;
        expect(after.startingBonds[0]).toMatchObject(MIDDLE);
    });

    it('refuses a level out of range on a new Starting Bond too', async () => {
        const { story, mira, kai } = await createStory();
        await t.http.post(`/api/stories/${story.id}/starting-bonds`).send({ fromCharacterId: kai, toCharacterId: mira, tension: 5 }).expect(400);
        const after = (await t.http.get(`/api/stories/${story.id}`).expect(200)).body as Story;
        expect(after.startingBonds).toHaveLength(1);
    });

    it('seeds a new Chat with the levels, and Reset puts them back after the Judge moved them', async () => {
        const { story, bond, mira } = await createStory();
        const start: Levels = { trust: -2, affection: 0, desire: 1, tension: 2 };
        await t.http.patch(`/api/stories/${story.id}/starting-bonds/${bond.id}`).send(start).expect(200);

        const chat = (await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body as Chat;
        expect(chat.bonds).toEqual([{ fromCharacterId: mira, toCharacterId: null, label: 'Wary', levels: start }]);
        expect(await miraTowardAsh(story.id, chat.id)).toMatchObject({ label: 'Wary', levels: start });

        // The Judge reads the seed in words, and moves Trust a step.
        await play(
            story.id,
            chat.id,
            'I bring her brother\'s letter.',
            JSON.stringify({
                bond_changes: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'Less sure he will leave.', levels: { ...start, trust: -1 }, cause: 'The letter.' }],
                arc_steps: [],
                scene: { move_on: false, reason: 'not yet' },
            }),
        );
        expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain(
            '- Mira → user: "Wary" — She expects the new keeper to leave by spring. (Trust: suspicious · Affection: indifferent · Desire: drawn · Tension: strained)',
        );
        expect(await miraTowardAsh(story.id, chat.id)).toMatchObject({ label: 'Curious', levels: { ...start, trust: -1 } });

        const reset = (await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(200)).body as Chat;
        expect(reset.bonds).toEqual([{ fromCharacterId: mira, toCharacterId: null, label: 'Wary', levels: start }]);
        expect(await miraTowardAsh(story.id, chat.id)).toMatchObject({ label: 'Wary', levels: start });
    });

    it('Reset seeds the Starting Bond levels as they are now', async () => {
        const { story, bond, mira } = await createStory();
        const chat = (await t.http.post(`/api/stories/${story.id}/chats`).expect(201)).body as Chat;
        expect(chat.bonds[0].levels).toEqual(MIDDLE);

        await t.http.patch(`/api/stories/${story.id}/starting-bonds/${bond.id}`).send({ affection: 2 }).expect(200);
        const reset = (await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(200)).body as Chat;

        expect(reset.bonds).toEqual([{ fromCharacterId: mira, toCharacterId: null, label: 'Wary', levels: { ...MIDDLE, affection: 2 } }]);
    });

    it('Duplicate copies each Starting Bond with its levels', async () => {
        const { story, bond, mira, kai } = await createStory();
        await t.http.patch(`/api/stories/${story.id}/starting-bonds/${bond.id}`).send({ trust: 3, affection: -1, desire: 2, tension: 1 }).expect(200);
        await t.http.post(`/api/stories/${story.id}/starting-bonds`).send({ fromCharacterId: kai, toCharacterId: mira, tension: 2 }).expect(201);

        const copy = (await t.http.post(`/api/stories/${story.id}/duplicate`).expect(201)).body as Story;

        const names = new Map(copy.characters.map((character) => [character.id, character.name]));
        expect(
            copy.startingBonds.map(({ fromCharacterId, toCharacterId, trust, affection, desire, tension }) => ({
                from: names.get(fromCharacterId),
                to: toCharacterId === null ? null : names.get(toCharacterId),
                levels: { trust, affection, desire, tension },
            })),
        ).toEqual([
            { from: 'Mira', to: null, levels: { trust: 3, affection: -1, desire: 2, tension: 1 } },
            { from: 'Kai', to: 'Mira', levels: { trust: 0, affection: 0, desire: 0, tension: 2 } },
        ]);
    });

    it('migrates the four columns not null, defaulting to the middle', async () => {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query<{ column_name: string; is_nullable: string; column_default: string; data_type: string }>(
                `SELECT column_name, is_nullable, column_default, data_type FROM information_schema.columns
                 WHERE table_name = 'starting_bond' AND column_name IN ('trust', 'affection', 'desire', 'tension') ORDER BY column_name`,
            );
            expect(rows).toEqual(
                ['affection', 'desire', 'tension', 'trust'].map((column_name) => ({ column_name, is_nullable: 'NO', column_default: '0', data_type: 'smallint' })),
            );
        } finally {
            await client.end();
        }
    });
});

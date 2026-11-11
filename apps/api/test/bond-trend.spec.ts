import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Each Bond's `trend` on the dashboard (.scratch/bond-axes/issues/03-bond-chart-on-the-dashboard.md):
 * every change in order, with its Message, its levels or null, and whether the label changed.
 */

type Status = 'pending' | 'done' | 'failed';
type Levels = { trust: number; affection: number; desire: number; tension: number };

interface Chat {
    id: number;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: Status } | null; memory?: { status: Status } | null }>;
}

interface TrendPoint {
    id: number;
    messageId: number | null;
    position: number | null;
    levels: Levels | null;
    labelChanged: boolean;
}

interface DashboardBond {
    toward: { characterId: number | null; name: string };
    label: string;
    levels: Levels | null;
    history: Array<{ id: number; label: string }>;
    trend: TrendPoint[];
}

interface Dashboard {
    lastPosition: number;
    characters: Array<{ name: string; bonds: DashboardBond[] }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';

function judgement(changes: Array<{ from: string; to: string; label: string; levels?: Partial<Levels> }>): string {
    return JSON.stringify({
        bond_changes: changes.map((change) => ({ ...change, description: `${change.label}, in a word.`, cause: `Because ${change.label}.` })),
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
    });
}

describe('Bond trend on the dashboard', () => {
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

    async function createStory(): Promise<{ storyId: number; mira: number; kai: number }> {
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
        await t.http
            .post(`/api/stories/${storyId}/starting-bonds`)
            .send({ fromCharacterId: mira, toCharacterId: null, label: 'Wary', description: 'She expects the new keeper to leave.', trust: -1 })
            .expect(201);
        return { storyId, mira, kai };
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

    /** Plays one turn and answers the reply's Message. */
    async function play(storyId: number, chatId: number, text: string, judge: string): Promise<{ id: number; position: number }> {
        t.gateway.scriptText('turn', '@Mira: Hm.');
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        const chat = await settled(storyId, chatId);
        // A Chat's Messages are numbered from the Opening, 0, in order.
        return { id: chat.messages[chat.messages.length - 1].id, position: chat.messages.length - 1 };
    }

    async function dashboard(storyId: number, chatId: number): Promise<Dashboard> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200)).body as Dashboard;
    }

    function bondOf(board: Dashboard, from: string, towardCharacterId: number | null): DashboardBond {
        const bond = board.characters.find((character) => character.name === from)?.bonds.find((entry) => entry.toward.characterId === towardCharacterId);
        if (!bond) throw new Error(`${from} has no such Bond`);
        return bond;
    }

    it('lists every change oldest first, with its Message, its levels or null, and whether the label changed', async () => {
        const { storyId, mira } = await createStory();
        const chatId = ((await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat).id;

        // Kai's Bond toward Mira forms with no levels, then gets its first measure under the same label.
        const first = await play(storyId, chatId, 'I knock.', judgement([
            { from: 'Mira', to: 'user', label: 'Wary', levels: { trust: 0, affection: 1, desire: 0, tension: 0 } },
            { from: 'Kai', to: 'Mira', label: 'Protective' },
        ]));
        const second = await play(storyId, chatId, 'I stay.', judgement([
            { from: 'Mira', to: 'user', label: 'Curious', levels: { trust: 1, affection: 1, desire: 0, tension: 0 } },
            { from: 'Kai', to: 'Mira', label: 'Protective', levels: { trust: 2, affection: 2, desire: 0, tension: 1 } },
        ]));
        const third = await play(storyId, chatId, 'I light the lamp.', judgement([
            { from: 'Mira', to: 'user', label: 'Curious', levels: { trust: 1, affection: 2, desire: 1, tension: 0 } },
        ]));

        const board = await dashboard(storyId, chatId);
        const miraToAsh = bondOf(board, 'Mira', null);
        expect(miraToAsh.trend).toEqual([
            { id: expect.any(Number), messageId: null, position: null, levels: { trust: -1, affection: 0, desire: 0, tension: 0 }, labelChanged: false },
            { id: expect.any(Number), messageId: first.id, position: first.position, levels: { trust: 0, affection: 1, desire: 0, tension: 0 }, labelChanged: false },
            { id: expect.any(Number), messageId: second.id, position: second.position, levels: { trust: 1, affection: 1, desire: 0, tension: 0 }, labelChanged: true },
            { id: expect.any(Number), messageId: third.id, position: third.position, levels: { trust: 1, affection: 2, desire: 1, tension: 0 }, labelChanged: false },
        ]);
        // The same changes as the history, which reads newest first.
        expect(miraToAsh.trend.map((point) => point.id)).toEqual([...miraToAsh.history].reverse().map((change) => change.id));

        const kaiToMira = bondOf(board, 'Kai', mira);
        expect(kaiToMira.trend).toEqual([
            // A Bond that forms in play: its first label is a turning point too.
            { id: expect.any(Number), messageId: first.id, position: first.position, levels: null, labelChanged: true },
            { id: expect.any(Number), messageId: second.id, position: second.position, levels: { trust: 2, affection: 2, desire: 0, tension: 1 }, labelChanged: false },
        ]);

        // The chart runs up to the newest Message.
        expect(board.lastPosition).toBe(third.position);
    });

    it('a new Chat has only the seed in its trend, and the chart ends at the Opening', async () => {
        const { storyId } = await createStory();
        const chatId = ((await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat).id;

        const board = await dashboard(storyId, chatId);
        expect(bondOf(board, 'Mira', null).trend).toEqual([
            { id: expect.any(Number), messageId: null, position: null, levels: { trust: -1, affection: 0, desire: 0, tension: 0 }, labelChanged: false },
        ]);
        expect(board.lastPosition).toBe(0);
    });
});

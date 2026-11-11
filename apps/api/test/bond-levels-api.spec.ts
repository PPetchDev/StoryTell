import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Bond levels from the Judge (.scratch/bond-axes/issues/01-bond-levels-from-the-judge.md), through
 * the HTTP API with the judge's output scripted on the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';
type Levels = { trust: number; affection: number; desire: number; tension: number };

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
}

interface Chat {
    id: number;
    messages: Message[];
    bonds: Array<{ fromCharacterId: number; toCharacterId: number | null; label: string; levels: Levels | null }>;
}

interface DashboardBond {
    toward: { characterId: number | null; name: string };
    label: string;
    description: string;
    levels: Levels | null;
    history: Array<{ label: string }>;
}

interface Dashboard {
    characters: Array<{ name: string; bonds: DashboardBond[] }>;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const WARY_LINE = '- Mira → the user (Ash): "Wary" — She expects the new keeper to leave by spring.';

/** A judgement with one Bond change of Mira toward the user. */
function bondChange(label: string, levels?: unknown): string {
    return JSON.stringify({
        bond_changes: [{ from: 'Mira', to: 'user', label, description: `${label}, in a word.`, cause: `Because ${label}.`, ...(levels === undefined ? {} : { levels }) }],
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
    });
}

describe('Bond levels from the Judge', () => {
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

    /** A playable Story: Mira, wary of the Role at the start, and Kai. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const mira = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Kai', appearance: 'Wiry, sunburnt.', personality: 'Cheerful, nosy.', voice: 'Rambling.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/starting-bonds`)
            .send({ fromCharacterId: mira.body.characters[0].id, toCharacterId: null, label: 'Wary', description: 'She expects the new keeper to leave by spring.' })
            .expect(201);
        return (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    async function miraTowardAsh(storyId: number, chatId: number): Promise<DashboardBond> {
        const board = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200)).body as Dashboard;
        const bond = board.characters.find((character) => character.name === 'Mira')?.bonds.find((entry) => entry.toward.characterId === null);
        if (!bond) throw new Error('Mira has no Bond toward the user');
        return bond;
    }

    /** Returns once neither of the latest reply's background calls is pending. */
    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The judge did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, text: string, judge: string = NO_CHANGE): Promise<Chat> {
        t.gateway.scriptText('turn', '@Mira: Hm.');
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    const lastCall = (kind: TextCompletionRequest['kind']): TextCompletionRequest => t.gateway.textCalls(kind).at(-1)!;
    const system = (kind: TextCompletionRequest['kind']): string => lastCall(kind).messages[0].content;

    it('a first measure takes the levels as given, a later change is held to one step, and the dashboard and the Chat show them', async () => {
        const story = await createStory();
        const mira = story.characters[0].id;
        const chat = await createChat(story.id);
        expect(chat.bonds).toEqual([{ fromCharacterId: mira, toCharacterId: null, label: 'Wary', levels: null }]);
        expect((await miraTowardAsh(story.id, chat.id)).levels).toBeNull();

        // The seed has no levels: the Judge is shown so, and its first measure is taken as it is, under the same label.
        await play(story.id, chat.id, 'I knock.', bondChange('Wary', { trust: -2, affection: 0, desire: 1, tension: 2 }));
        expect(lastCall('judge').messages[1].content).toContain(
            '- Mira → user: "Wary" — She expects the new keeper to leave by spring. (levels not set yet)',
        );
        const first: Levels = { trust: -2, affection: 0, desire: 1, tension: 2 };
        expect(await miraTowardAsh(story.id, chat.id)).toMatchObject({ label: 'Wary', description: 'Wary, in a word.', levels: first });
        expect((await getChat(story.id, chat.id)).bonds).toEqual([{ fromCharacterId: mira, toCharacterId: null, label: 'Wary', levels: first }]);

        // Trust asks for three steps and gets one; Tension falls one of the two it asks for.
        const played = await play(story.id, chat.id, 'I bring her brother\'s letter.', bondChange('Curious', { trust: 1, affection: 0, desire: 1, tension: 0 }));
        expect(lastCall('judge').messages[1].content).toContain(
            '- Mira → user: "Wary" — Wary, in a word. (Trust: suspicious · Affection: indifferent · Desire: drawn · Tension: strained)',
        );
        const second: Levels = { trust: -1, affection: 0, desire: 1, tension: 1 };
        const bond = await miraTowardAsh(story.id, chat.id);
        expect(bond).toMatchObject({ label: 'Curious', levels: second });
        expect(bond.history.map((change) => change.label)).toEqual(['Curious', 'Wary', 'Wary']);
        expect(played.bonds).toEqual([{ fromCharacterId: mira, toCharacterId: null, label: 'Curious', levels: second }]);

        // A change with the same label and the same levels is no change: nothing is written.
        await play(story.id, chat.id, 'I wait.', bondChange('curious', second));
        expect((await miraTowardAsh(story.id, chat.id)).history).toHaveLength(3);

        // The Narrator, Suggested replies and Write for me read the levels in words.
        const words = '- Mira → the user (Ash): "Curious" — Curious, in a word. (Trust: wary · Affection: indifferent · Desire: drawn · Tension: uneasy)';
        await play(story.id, chat.id, 'I climb.');
        expect(system('turn')).toContain(words);
        t.gateway.scriptText('suggested_replies', JSON.stringify({ suggestions: [{ kind: 'action', text: 'I wait.' }, { kind: 'speech', text: '"Hi."' }, { kind: 'move', text: 'I go.' }] }));
        await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/suggestions`).expect(200);
        expect(system('suggested_replies')).toContain(words);
        t.gateway.scriptText('write_for_me', 'Ash: I wait.');
        await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/write-for-me`).send({ draft: '' }).expect(200);
        expect(system('write_for_me')).toContain(words);
    });

    it('a change that gives no levels keeps the ones the Bond has', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const levels: Levels = { trust: 0, affection: 1, desire: 0, tension: 0 };
        await play(story.id, chat.id, 'I knock.', bondChange('Wary', levels));

        await play(story.id, chat.id, 'I stay.', bondChange('Fond'));

        expect(await miraTowardAsh(story.id, chat.id)).toMatchObject({ label: 'Fond', levels });
    });

    it('a Branch at an earlier Message carries the levels as they were then', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const atN = await play(story.id, chat.id, 'I knock.', bondChange('Wary', { trust: -1, affection: 0, desire: 0, tension: 1 }));
        await play(story.id, chat.id, 'I stay.', bondChange('Curious', { trust: 0, affection: 1, desire: 0, tension: 1 }));
        const n = atN.messages[atN.messages.length - 1];

        const made = (await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${n.id}/branch`).expect(201)).body as Chat;

        const then: Levels = { trust: -1, affection: 0, desire: 0, tension: 1 };
        expect(made.bonds).toEqual([{ fromCharacterId: story.characters[0].id, toCharacterId: null, label: 'Wary', levels: then }]);
        expect(await miraTowardAsh(story.id, made.id)).toMatchObject({ label: 'Wary', levels: then });
        expect(await miraTowardAsh(story.id, chat.id)).toMatchObject({ label: 'Curious', levels: { trust: 0, affection: 1, desire: 0, tension: 1 } });
    });

    it('a Story whose Bonds have no levels sends the Narrator exactly the feelings text it sent before', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);

        await play(story.id, chat.id, 'I knock.');

        expect(system('turn')).toContain(
            `# Feelings (hidden from the user; show them only through behaviour)\n${WARY_LINE}\nEach Character knows only its OWN feelings. Other Characters' feelings are unknown to them unless shown openly in the story.`,
        );
    });
});

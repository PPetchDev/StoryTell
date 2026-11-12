import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { startTestApp, TestApp } from './harness/test-app.js';
import { takeSnapshot } from './harness/snapshot.js';

interface StoryListItem {
    id: number;
    title: string;
    playable: boolean;
    missing: Array<{ field: string; label: string }>;
    lastPlayedAt: string | null;
    latestChat: { id: number; sceneName: string | null } | null;
    coverImagePath: string | null;
    hook: string;
}

interface ChatListItem {
    id: number;
    title: string;
    lastPlayedAt: string;
    sceneName: string | null;
    latestLine: string;
}

interface Chat {
    id: number;
    lastPlayedAt: string;
    messages: Array<{
        kind: 'user' | 'ai';
        judge?: { status: string } | null;
        memory?: { status: string } | null;
    }>;
}

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';

const SETTING =
    'A lighthouse on a storm-cut island where the lamp has gone out. The new keeper arrives on the supply boat.';

describe('The Story and Chat lists', () => {
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

    /** A playable Story with one Character and, when given, Scenes in that order. */
    async function createPlayableStory(options: { scenes?: string[] } = {}): Promise<number> {
        const { body } = await t.http
            .post('/api/stories')
            .send({ title: 'The Lighthouse', setting: SETTING, opening: OPENING })
            .expect(201);
        const storyId = body.id as number;
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        for (const name of options.scenes ?? []) {
            await t.http
                .post(`/api/stories/${storyId}/scenes`)
                .send({ name, situation: `Ash is in ${name}.`, moveOnCondition: 'Ash leaves.' })
                .expect(201);
        }
        return storyId;
    }

    async function createChat(storyId: number): Promise<Chat> {
        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return body as Chat;
    }

    /** One turn whose background calls change nothing; returns the Chat once both settled. */
    async function play(storyId: number, chatId: number, text: string, reply: string): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const last = (body as Chat).messages.at(-1)!;
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return body as Chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** Takes one Snapshot of the Chat's latest Message, whose image file holds `bytes`, and waits for it. */
    async function snap(storyId: number, chatId: number, bytes: string): Promise<{ imagePath: string }> {
        t.gateway.scriptText('snapshot_prompt', JSON.stringify({ in_frame: ['Mira'], scene: 'Mira by the window.' }));
        t.gateway.scriptImage('snapshot_image', {
            image: { bytes: Buffer.from(bytes), mimeType: 'image/jpeg' },
            model: 'seedream-v4-edit',
            costUsd: 0.05,
        });
        const path = `/api/stories/${storyId}/chats/${chatId}/snapshots`;
        await takeSnapshot(t.http, storyId, chatId);
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(path).expect(200);
            const state = body as { snapshots: Array<{ imagePath: string }>; jobs: Array<{ status: string }> };
            if (state.jobs.every((job) => job.status !== 'pending')) return state.snapshots.at(-1)!;
            if (Date.now() > deadline) throw new Error('The Snapshot job did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function listed(storyId: number): Promise<StoryListItem> {
        const { body } = await t.http.get('/api/stories').expect(200);
        const story = (body.stories as StoryListItem[]).find((candidate) => candidate.id === storyId);
        if (!story) throw new Error(`Story ${storyId} is not in the list`);
        return story;
    }

    describe('Story list', () => {
        it('shows a Story with no Chats as never played, with no cover, and its Setting’s first sentence as the hook', async () => {
            const { body } = await t.http.post('/api/stories').send({ title: 'The Lighthouse', setting: SETTING }).expect(201);

            const story = await listed(body.id);

            expect(story).toMatchObject({
                title: 'The Lighthouse',
                playable: false,
                lastPlayedAt: null,
                latestChat: null,
                coverImagePath: null,
                hook: 'A lighthouse on a storm-cut island where the lamp has gone out.',
            });
            expect(story.missing.length).toBeGreaterThan(0);
        });

        it('cuts a long first sentence at a word, with an ellipsis', async () => {
            const setting =
                'Beyond the salt marshes, where the ferry no longer runs and the bells of the drowned chapel still ring at low tide, ' +
                'a village keeps a promise it no longer remembers making. Nobody leaves.';
            const { body } = await t.http.post('/api/stories').send({ setting }).expect(201);

            const { hook } = await listed(body.id);

            expect(hook).toBe(
                'Beyond the salt marshes, where the ferry no longer runs and the bells of the drowned chapel still ring at low tide, a…',
            );
            expect(hook.length).toBeLessThanOrEqual(120);
        });

        it('does not end the hook at a title such as Mr. or Dr.', async () => {
            const setting = 'Mr. Hale and Dr. Okafor share the last lighthouse on the coast. Neither will leave.';
            const { body } = await t.http.post('/api/stories').send({ setting }).expect(201);

            expect((await listed(body.id)).hook).toBe('Mr. Hale and Dr. Okafor share the last lighthouse on the coast.');
        });

        it('names the most recently played Chat and its Scene, and has no cover while there are no Snapshots', async () => {
            const storyId = await createPlayableStory({ scenes: ['The flooded archive', 'The lamp room'] });
            const first = await createChat(storyId);
            const second = await createChat(storyId);
            // The older Chat is played after the newer one was started, so it is the newest played.
            const played = await play(storyId, first.id, 'I light the lamp.', 'The wick catches.');

            const story = await listed(storyId);

            expect(second.id).toBeGreaterThan(first.id);
            expect(story).toMatchObject({
                playable: true,
                missing: [],
                lastPlayedAt: played.lastPlayedAt,
                latestChat: { id: first.id, sceneName: 'The flooded archive' },
                coverImagePath: null,
            });
        });

        it("uses the Story's newest Snapshot, from any of its Chats, as the cover", async () => {
            const storyId = await createPlayableStory();
            const first = await createChat(storyId);
            const second = await createChat(storyId);
            await snap(storyId, second.id, 'older');
            const newest = await snap(storyId, first.id, 'newer');

            expect((await listed(storyId)).coverImagePath).toBe(newest.imagePath);
            // The Gallery serves the cover where the list says it is.
            const served = await t.http.get(`/api/images/${newest.imagePath}`).expect(200);
            expect(Buffer.from(served.body).toString()).toBe('newer');
        });

        it('shows free play as no Scene name', async () => {
            const storyId = await createPlayableStory();
            const chat = await createChat(storyId);

            expect((await listed(storyId)).latestChat).toEqual({ id: chat.id, sceneName: null });
        });
    });

    describe('Chat list', () => {
        async function chatList(storyId: number): Promise<ChatListItem[]> {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats`).expect(200);
            return body.chats as ChatListItem[];
        }

        it("shows each Chat's Scene and its latest Message as one plain line, speakers named", async () => {
            const storyId = await createPlayableStory({ scenes: ['The flooded archive'] });
            const chat = await createChat(storyId);
            await play(
                storyId,
                chat.id,
                'I hang my coat by the stove.',
                'Rain drips from your hat.\n\n@Mira: Took you long enough.\n\nShe does not look up.',
            );

            const [listedChat] = await chatList(storyId);

            expect(listedChat).toMatchObject({
                id: chat.id,
                sceneName: 'The flooded archive',
                latestLine: 'Rain drips from your hat. Mira: Took you long enough. She does not look up.',
            });
        });

        it('shows a new Chat in free play with its Opening as the latest line', async () => {
            const storyId = await createPlayableStory();
            await createChat(storyId);

            const [listedChat] = await chatList(storyId);

            expect(listedChat).toMatchObject({
                sceneName: null,
                latestLine: 'The lamp went out an hour ago. Mira: Boots off, keeper.',
            });
        });

        it("shows the user's own line without its action marks, cut to about 100 characters", async () => {
            const storyId = await createPlayableStory();
            const chat = await createChat(storyId);
            const line =
                '*I set the lamp on the logbook and lean in close.* You knew the light would go out tonight, ' +
                'and you let it. Why?';
            t.gateway.scriptText('turn', new ProviderOutageError());
            // The turn fails, so the User Message stays the latest.
            await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: line }).expect(502);

            const [listedChat] = await chatList(storyId);

            expect(listedChat.latestLine).toBe(
                'I set the lamp on the logbook and lean in close. You knew the light would go out tonight, and you…',
            );
        });
    });
});

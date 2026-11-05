import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Reply versions (spec: .scratch/swipe/spec.md): ↺ Again keeps the reply it replaces as a
 * version of the newest AI Message, and choosing one rolls back what the shown one changed
 * and runs the background calls on the chosen one. Through the HTTP API with the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    parts?: Array<{ kind: string; text: string }>;
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
    versions?: { current: number; count: number } | null;
}

interface RollbackCounts {
    memoryChanges: number;
    bondChanges: number;
    arcSteps: number;
    sceneAdvances: number;
}

interface Chat {
    id: number;
    currentScene: { id: number; name: string } | null;
    messages: Message[];
    awaitingReply: boolean;
    rolledBack?: RollbackCounts;
}

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    scenes: Array<{ id: number; name: string }>;
}

interface Snapshot {
    id: number;
    messageId: number | null;
    chatId: number | null;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const NO_ROLLBACK: RollbackCounts = { memoryChanges: 0, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 };
const MOVE_ON = JSON.stringify({
    bond_changes: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'Curious, in a word.', cause: 'Ash climbed.' }],
    arc_steps: [{ character: 'Kai', step: 'Grows loyal.', cause: 'Ash stayed.' }],
    scene: { move_on: true, reason: 'She let Ash up.' },
});
const ADD_MEMORY = JSON.stringify({ operations: [{ op: 'add', text: 'Mira let {user} up the stairs.', known_by: ['Mira'], cause: 'she did' }] });

describe('Reply versions', () => {
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
            .send({ fromCharacterId: mira.body.characters[0].id, toCharacterId: null, label: 'Wary', description: 'She expects Ash to leave.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/scenes`)
            .send({ name: 'Arrival', situation: 'Reach the lamp room.', moveOnCondition: 'Mira lets Ash up the stairs.' })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The lamp', situation: 'Light it.' }).expect(201);
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

    function script(reply: string | Error, judge = NO_CHANGE, extraction = NO_OPS): void {
        t.gateway.scriptText('turn', reply as string);
        if (reply instanceof Error) return;
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', extraction);
    }

    async function play(storyId: number, chatId: number, text: string, reply: string, judge = NO_CHANGE, extraction = NO_OPS): Promise<Chat> {
        script(reply, judge, extraction);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    async function again(storyId: number, chatId: number, messageId: number, reply: string, judge = NO_CHANGE, extraction = NO_OPS): Promise<Chat> {
        script(reply, judge, extraction);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/regenerate`).expect(200);
        return settled(storyId, chatId);
    }

    function choose(storyId: number, chatId: number, messageId: number, version: number) {
        return t.http.put(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/version`).send({ version });
    }

    function lastAi(chat: Chat): Message {
        const last = chat.messages[chat.messages.length - 1];
        expect(last.kind).toBe('ai');
        return last;
    }

    function partTexts(message: Message): string[] {
        return (message.parts ?? []).map((part) => part.text);
    }

    async function memoryTexts(storyId: number, chatId: number): Promise<string[]> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200);
        return (body.memories as Array<{ text: string }>).map((memory) => memory.text);
    }

    it('keeps the replaced reply: Again writes into the same Message, now version 2 of 2', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story.id, chat.id, 'I take my boots off.', 'Mira grunts.');
        const reply = lastAi(played);
        expect(reply.versions).toBeNull();

        const after = await again(story.id, chat.id, reply.id, '@Mira: About time.');

        expect(after.messages.map((message) => message.kind)).toEqual(['ai', 'user', 'ai']);
        expect(lastAi(after)).toMatchObject({ id: reply.id, versions: { current: 2, count: 2 } });
        expect(partTexts(lastAi(after))).toEqual(['About time.']);
        // The Opening and the User Message have no versions.
        expect(after.messages[0]).toMatchObject({ versions: null });
        expect(after.messages[1]).not.toHaveProperty('versions');
    });

    it('choosing a version rolls back the shown one, shows the chosen one and runs both background calls on it', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story.id, chat.id, 'I climb the stairs.', 'Mira blocks the stairs.');
        const reply = lastAi(played);
        const second = await again(story.id, chat.id, reply.id, '@Mira: Fine. Come up.', MOVE_ON, ADD_MEMORY);
        expect(second.currentScene?.name).toBe('The lamp');
        expect(await memoryTexts(story.id, chat.id)).toEqual(['Mira let {user} up the stairs.']);

        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        const { body } = await choose(story.id, chat.id, reply.id, 1).expect(200);

        const chosen = body as Chat;
        expect(chosen.rolledBack).toEqual({ memoryChanges: 1, bondChanges: 1, arcSteps: 1, sceneAdvances: 1 });
        expect(chosen.currentScene?.name).toBe('Arrival');
        expect(lastAi(chosen)).toMatchObject({ id: reply.id, versions: { current: 1, count: 2 }, judge: { error: null }, memory: { error: null } });
        // Set pending before answering; on a fast machine the fake has answered by the time the Chat is read.
        expect(['pending', 'done']).toContain(lastAi(chosen).judge?.status);
        expect(partTexts(lastAi(chosen))).toEqual(['Mira blocks the stairs.']);
        const done = await settled(story.id, chat.id);
        expect(lastAi(done)).toMatchObject({ judge: { status: 'done' }, memory: { status: 'done' } });
        expect(await memoryTexts(story.id, chat.id)).toEqual([]);
        // The judge and the extraction read the chosen version.
        expect(t.gateway.textCalls('judge').at(-1)!.messages.map((m) => m.content).join('\n')).toContain('Mira blocks the stairs.');
        expect(t.gateway.textCalls('memory_extraction').at(-1)!.messages.map((m) => m.content).join('\n')).toContain('Mira blocks the stairs.');

        // And back again: version 2 is the reply it was, judged afresh.
        t.gateway.scriptText('judge', MOVE_ON);
        t.gateway.scriptText('memory_extraction', ADD_MEMORY);
        const back = (await choose(story.id, chat.id, reply.id, 2).expect(200)).body as Chat;
        expect(back.rolledBack).toEqual(NO_ROLLBACK);
        expect(partTexts(lastAi(back))).toEqual(['Fine. Come up.']);
        expect((await settled(story.id, chat.id)).currentScene?.name).toBe('The lamp');
    });

    it('sends only the shown version in the next prompt', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const reply = lastAi(await play(story.id, chat.id, 'Hello?', 'Mira nods once.'));
        await again(story.id, chat.id, reply.id, 'Mira turns away.');
        t.gateway.reset();

        await play(story.id, chat.id, 'Tea?', 'Mira shrugs.');

        const prompt = t.gateway.textCalls('turn')[0].messages.map((message) => message.content).join('\n');
        expect(prompt).toContain('Mira turns away.');
        expect(prompt).not.toContain('Mira nods once.');
    });

    it('keeps at most 5 versions, dropping the oldest', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const reply = lastAi(await play(story.id, chat.id, 'Hello?', 'Take 1.'));
        let after = await again(story.id, chat.id, reply.id, 'Take 2.');
        for (const take of ['Take 3.', 'Take 4.', 'Take 5.', 'Take 6.']) after = await again(story.id, chat.id, reply.id, take);

        expect(lastAi(after)).toMatchObject({ id: reply.id, versions: { current: 5, count: 5 } });
        const shown: string[] = [];
        for (let n = 1; n <= 5; n++) {
            t.gateway.reset();
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const { body } = await choose(story.id, chat.id, reply.id, n).expect(200);
            await settled(story.id, chat.id);
            shown.push(partTexts(lastAi(body as Chat))[0]);
        }
        expect(shown).toEqual(['Take 2.', 'Take 3.', 'Take 4.', 'Take 5.', 'Take 6.']);
    });

    it('choosing the shown version changes nothing and makes no call', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const reply = lastAi(await play(story.id, chat.id, 'Hello?', 'Take 1.'));
        const before = await again(story.id, chat.id, reply.id, 'Take 2.');
        t.gateway.reset();

        const { body } = await choose(story.id, chat.id, reply.id, 2).expect(200);

        expect(body.rolledBack).toEqual(NO_ROLLBACK);
        expect((body as Chat).messages).toEqual(before.messages);
        expect(t.gateway.textCalls()).toEqual([]);
    });

    it('refuses a version that does not exist, and a Message without versions', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story.id, chat.id, 'Hello?', 'Take 1.');
        const reply = lastAi(played);

        expect((await choose(story.id, chat.id, reply.id, 2).expect(404)).body.error.code).toBe('404.004.018');
        await again(story.id, chat.id, reply.id, 'Take 2.');
        expect((await choose(story.id, chat.id, reply.id, 3).expect(404)).body.error.code).toBe('404.004.018');
        expect((await choose(story.id, chat.id, played.messages[0].id, 2).expect(404)).body.error.code).toBe('404.004.018');
        expect((await choose(story.id, chat.id, 999_999, 1).expect(404)).body.error.code).toBe('404.004.006');
        await choose(story.id, chat.id, reply.id, 0).expect(400);
        await choose(story.id, chat.id, reply.id, 1.5).expect(400);
        expect(t.gateway.textCalls('judge')).toHaveLength(2);
    });

    describe('drops the versions', () => {
        async function withVersions(): Promise<{ story: Story; chat: Chat; reply: Message }> {
            const story = await createStory();
            const created = await createChat(story.id);
            const reply = lastAi(await play(story.id, created.id, 'Hello?', 'Take 1.'));
            const chat = await again(story.id, created.id, reply.id, 'Take 2.');
            expect(lastAi(chat).versions).toEqual({ current: 2, count: 2 });
            return { story, chat, reply };
        }

        it('on a send, even one whose turn fails', async () => {
            const { story, chat, reply } = await withVersions();
            script(new ProviderOutageError());
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Tea?' }).expect(502);

            const after = await getChat(story.id, chat.id);
            expect(after.messages.find((message) => message.id === reply.id)?.versions).toBeNull();
            expect((await choose(story.id, chat.id, reply.id, 2).expect(404)).body.error.code).toBe('404.004.018');
        });

        it('on a Continue', async () => {
            const { story, chat, reply } = await withVersions();
            script('@Mira: Well?');
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/continue`).expect(200);
            const after = await settled(story.id, chat.id);
            expect(after.messages.find((message) => message.id === reply.id)?.versions).toBeNull();
        });

        it('on an edit of the User Message before it, and on Reset', async () => {
            const first = await withVersions();
            script('A new take.');
            const edited = await t.http
                .patch(`/api/stories/${first.story.id}/chats/${first.chat.id}/messages/${first.chat.messages[1].id}`)
                .send({ text: 'Hi.' })
                .expect(200);
            expect(lastAi(edited.body as Chat).versions).toBeNull();
            await settled(first.story.id, first.chat.id);

            const second = await withVersions();
            const reset = await t.http.post(`/api/stories/${second.story.id}/chats/${second.chat.id}/reset`).expect(200);
            expect((reset.body as Chat).messages.map((message) => message.versions)).toEqual([null]);
        });

        it('but not on an edit of the newest reply, which rewrites only the shown version', async () => {
            const { story, chat, reply } = await withVersions();
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const edited = await t.http
                .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${reply.id}`)
                .send({ text: 'Take 2, edited.' })
                .expect(200);
            expect(lastAi(edited.body as Chat)).toMatchObject({ versions: { current: 2, count: 2 } });
            await settled(story.id, chat.id);

            t.gateway.scriptText('judge', NO_CHANGE, NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS, NO_OPS);
            expect(partTexts(lastAi((await choose(story.id, chat.id, reply.id, 1).expect(200)).body))).toEqual(['Take 1.']);
            await settled(story.id, chat.id);
            expect(partTexts(lastAi((await choose(story.id, chat.id, reply.id, 2).expect(200)).body))).toEqual(['Take 2, edited.']);
            await settled(story.id, chat.id);
        });
    });

    it('a failed Again keeps the reply it had, and runs its background calls again', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story.id, chat.id, 'I climb the stairs.', 'Mira lets Ash pass.', MOVE_ON);
        const reply = lastAi(played);
        expect(played.currentScene?.name).toBe('The lamp');

        t.gateway.scriptText('turn', new ProviderOutageError());
        t.gateway.scriptText('judge', MOVE_ON);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        const failed = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${reply.id}/regenerate`).expect(502);
        expect(failed.body.error.code).toBe('502.001.001');

        const after = await settled(story.id, chat.id);
        expect(after.awaitingReply).toBe(false);
        expect(lastAi(after)).toMatchObject({ id: reply.id, versions: null, judge: { status: 'done' }, memory: { status: 'done' } });
        expect(partTexts(lastAi(after))).toEqual(['Mira lets Ash pass.']);
        expect(after.currentScene?.name).toBe('The lamp');
    });

    describe('Snapshots', () => {
        const writtenScene = JSON.stringify({ in_frame: ['Mira'], scene: 'Mira on the stairs, lamp in hand.' });

        async function snap(storyId: number, chatId: number): Promise<void> {
            t.gateway.scriptText('snapshot_prompt', writtenScene);
            t.gateway.scriptImage('snapshot_image', { image: { bytes: Buffer.from('jpeg'), mimeType: 'image/jpeg' }, model: 'seedream-v4-edit', costUsd: 0.05 });
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/snapshots`).send({}).expect(202);
            const deadline = Date.now() + 5_000;
            for (;;) {
                const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}/snapshots`).expect(200);
                if ((body.jobs as Array<{ status: string }>).every((job) => job.status !== 'pending')) return;
                if (Date.now() > deadline) throw new Error('The Snapshot did not settle in time');
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
        }

        async function timeline(storyId: number, chatId: number): Promise<Snapshot[]> {
            return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/snapshots`).expect(200)).body.snapshots as Snapshot[];
        }

        async function gallery(storyId: number): Promise<Snapshot[]> {
            return (await t.http.get(`/api/stories/${storyId}/gallery`).expect(200)).body.snapshots as Snapshot[];
        }

        it('stay with the version they were taken of, and stay in the Gallery once it is dropped', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const reply = lastAi(await play(story.id, chat.id, 'Hello?', 'Take 1.'));
            await snap(story.id, chat.id);
            const [ofFirst] = await timeline(story.id, chat.id);
            expect(ofFirst.messageId).toBe(reply.id);

            await again(story.id, chat.id, reply.id, 'Take 2.');
            expect(await timeline(story.id, chat.id)).toEqual([]);
            expect((await gallery(story.id)).map((s) => [s.id, s.messageId])).toEqual([[ofFirst.id, null]]);

            await snap(story.id, chat.id);
            const [ofSecond] = await timeline(story.id, chat.id);
            expect(ofSecond.id).not.toBe(ofFirst.id);

            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await choose(story.id, chat.id, reply.id, 1).expect(200);
            await settled(story.id, chat.id);
            expect((await timeline(story.id, chat.id)).map((s) => s.id)).toEqual([ofFirst.id]);

            // A send drops version 2: its Snapshot keeps only its Story and Chat, in the Gallery.
            await play(story.id, chat.id, 'Tea?', 'Mira shrugs.');
            expect((await timeline(story.id, chat.id)).map((s) => s.id)).toEqual([ofFirst.id]);
            const items = await gallery(story.id);
            expect(items.find((s) => s.id === ofSecond.id)).toMatchObject({ messageId: null, chatId: chat.id });
        });
    });
});

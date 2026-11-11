import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Regenerate (friendly UI ticket 06, spec: "Regenerate"): ↺ Again writes the Chat's newest
 * AI Message again, undoing everything the shown one changed; the replaced one is kept as a
 * Reply version (reply-versions.spec.ts covers those). Through the
 * HTTP API with the fake gateway scripted.
 */

type Status = 'pending' | 'done' | 'failed';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    model?: string;
    parts?: Array<{ kind: string; text: string; speakerName?: string }>;
    judge?: { status: Status; error: string | null } | null;
    memory?: { status: Status; error: string | null } | null;
}

interface RollbackCounts {
    memoryChanges: number;
    bondChanges: number;
    arcSteps: number;
    sceneAdvances: number;
}

interface Chat {
    id: number;
    storyId: number;
    lastPlayedAt: string;
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

interface Memory {
    id: number;
    text: string;
    writtenBy: 'ai' | 'user';
}

interface Dashboard {
    characters: Array<{
        name: string;
        bonds: Array<{ toward: { name: string }; label: string }>;
        arcChanges: Array<{ cause: string }>;
    }>;
    scene: { current: { name: string } | null; advance: unknown };
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const NO_ROLLBACK: RollbackCounts = { memoryChanges: 0, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 };
const CONTINUE_INSTRUCTION =
    '(Ash does nothing new this turn and waits.) Continue the story from exactly where it stands: let the Characters and the world move it forward. Do not write anything Ash says, thinks, feels, decides or does, and stop where Ash can respond.';

describe('Regenerate', () => {
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

    /** A playable Story: Mira (wary of the Role at the start) and Kai, with two Scenes. */
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

    /** Scripts one turn with its background calls (changing nothing unless given). */
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

    async function continued(storyId: number, chatId: number, reply: string): Promise<Chat> {
        script(reply);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/continue`).expect(200);
        return settled(storyId, chatId);
    }

    function regenerate(storyId: number, chatId: number, messageId: number) {
        return t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/regenerate`);
    }

    function lastAi(chat: Chat): Message {
        const last = chat.messages[chat.messages.length - 1];
        expect(last.kind).toBe('ai');
        return last;
    }

    function turnCalls(): TextCompletionRequest[] {
        return t.gateway.textCalls('turn');
    }

    function partTexts(message: Message): string[] {
        return (message.parts ?? []).map((part) => part.text);
    }

    it('replaces the newest AI Message in place, rerunning the User Message\'s turn', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story.id, chat.id, 'I take my boots off.', 'Mira grunts.');
        const old = lastAi(played);

        script('@Mira: About time.');
        const { body } = await regenerate(story.id, chat.id, old.id).expect(200);

        const { rolledBack, ...after } = body as Chat;
        expect(rolledBack).toEqual(NO_ROLLBACK);
        expect(after.messages.map((message) => message.kind)).toEqual(['ai', 'user', 'ai']);
        expect(after.messages[1]).toMatchObject({ id: played.messages[1].id, text: 'I take my boots off.' });
        // The same Message, now its second Reply version: the first is kept (.scratch/swipe/spec.md).
        expect(lastAi(after)).toMatchObject({ id: old.id, versions: { current: 2, count: 2 } });
        expect(partTexts(lastAi(after))).toEqual(['About time.']);
        expect(after.awaitingReply).toBe(false);
        // The same turn as the first: the rerun prompt is the User Message's.
        const calls = turnCalls();
        expect(calls).toHaveLength(2);
        expect(calls[1].messages).toEqual(calls[0].messages);
        expect((await settled(story.id, chat.id)).messages).toHaveLength(3);
    });

    it("rolls back the old reply's Bond, Arc, Scene advance and AI-added Memory, keeping a user-written Memory, and reports the counts", async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(
            story.id,
            chat.id,
            'I climb the stairs.',
            '@Mira: Fine. Come up.',
            JSON.stringify({
                bond_changes: [{ from: 'Mira', to: 'user', label: 'Curious', description: 'Curious, in a word.', cause: 'Ash climbed.' }],
                arc_steps: [{ character: 'Kai', step: 'Grows loyal.', cause: 'Ash stayed.' }],
                scene: { move_on: true, reason: 'She let Ash up.' },
            }),
            JSON.stringify({ operations: [{ op: 'add', text: 'Mira let {user} up the stairs.', known_by: ['Mira'], cause: 'she did' }] }),
        );
        expect(played.currentScene?.name).toBe('The lamp');
        const memoriesPath = `/api/stories/${story.id}/chats/${chat.id}/memories`;
        await t.http.post(memoriesPath).send({ text: '{user} left a horse at the ferry.', knownBy: [] }).expect(201);
        const before = (await t.http.get(memoriesPath).expect(200)).body.memories as Memory[];
        expect(before.map((memory) => memory.writtenBy)).toEqual(['ai', 'user']);

        script('Mira shrugs and goes up alone.');
        const { body } = await regenerate(story.id, chat.id, lastAi(played).id).expect(200);

        expect(body.rolledBack).toEqual({ memoryChanges: 1, bondChanges: 1, arcSteps: 1, sceneAdvances: 1 });
        expect(body.currentScene).toEqual({ id: story.scenes[0].id, name: 'Arrival' });
        await settled(story.id, chat.id);
        const after = (await t.http.get(memoriesPath).expect(200)).body.memories as Memory[];
        expect(after.map((memory) => [memory.writtenBy, memory.text])).toEqual([['user', '{user} left a horse at the ferry.']]);
        const board = (await t.http.get(`/api/stories/${story.id}/chats/${chat.id}/dashboard`).expect(200)).body as Dashboard;
        const mira = board.characters.find((character) => character.name === 'Mira')!;
        const kai = board.characters.find((character) => character.name === 'Kai')!;
        expect(mira.bonds.map((bond) => [bond.toward.name, bond.label])).toEqual([['Ash', 'Wary']]);
        expect(kai.arcChanges).toEqual([]);
        expect(board.scene).toEqual({ current: { id: story.scenes[0].id, name: 'Arrival' }, advance: null });
        // The rerun prompt saw the rolled-back state.
        const system = turnCalls()[1].messages[0].content;
        expect(system).toContain('# Current Scene: Arrival');
        expect(system).not.toContain('Curious');
        expect(system).not.toContain('Mira let Ash up the stairs.');
        expect(system).toContain('Ash left a horse at the ferry.');
    });

    it('after a Continue reply, continues again: the prompt ends on the continue instruction and no User Message is stored', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        await play(story.id, chat.id, 'I take my boots off.', 'Mira grunts.');
        const played = await continued(story.id, chat.id, '@Mira: The lamp, then.');

        script('Mira climbs the stairs without waiting.');
        const { body } = await regenerate(story.id, chat.id, lastAi(played).id).expect(200);

        const after = body as Chat;
        expect(after.messages.map((message) => message.kind)).toEqual(['ai', 'user', 'ai', 'ai']);
        expect(partTexts(lastAi(after))).toEqual(['Mira climbs the stairs without waiting.']);
        const call = turnCalls()[2];
        expect(call.messages.slice(-4).map((message) => [message.role, message.content])).toEqual([
            ['user', 'I take my boots off.'],
            ['assistant', 'Mira grunts.'],
            ['user', CONTINUE_INSTRUCTION],
            ['system', expect.stringMatching(/^Where things stand: [^\n]+\nWrite the next turn now. Do not write anything Ash says, thinks or does. Use @Name: lines for Character speech, spoken words only: no parentheses or \*\(stage directions\)\* inside them, even where earlier turns had them. Actions go in narration.$/)],
        ]);
        // The same Continue as the one it replaces.
        expect(call.messages).toEqual(turnCalls()[1].messages);
        await settled(story.id, chat.id);
    });

    describe('a failed turn', () => {
        it('keeps the reply it had, with its changes made again by its background calls', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(
                story.id,
                chat.id,
                'I climb the stairs.',
                'Mira lets Ash pass.',
                JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: true, reason: 'She let Ash up.' } }),
            );
            expect(played.currentScene?.name).toBe('The lamp');

            t.gateway.scriptText('turn', new ProviderOutageError());
            t.gateway.scriptText('judge', JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: true, reason: 'She let Ash up.' } }));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const failed = await regenerate(story.id, chat.id, lastAi(played).id).expect(502);

            expect(failed.body.error.code).toBe('502.001.001');
            const kept = await settled(story.id, chat.id);
            expect(kept.awaitingReply).toBe(false);
            expect(kept.messages.map((message) => message.id)).toEqual(played.messages.map((message) => message.id));
            expect(partTexts(lastAi(kept))).toEqual(['Mira lets Ash pass.']);
            expect(lastAi(kept)).toMatchObject({ judge: { status: 'done' }, memory: { status: 'done' }, versions: null });
            expect(kept.currentScene?.name).toBe('The lamp');
        });

        it('after a Continue reply, keeps that reply too', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await continued(story.id, chat.id, '@Mira: Well?');

            script(new ProviderOutageError());
            t.gateway.scriptText('judge', NO_CHANGE);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await regenerate(story.id, chat.id, lastAi(played).id).expect(502);

            const after = await settled(story.id, chat.id);
            expect(after.awaitingReply).toBe(false);
            expect(after.messages.map((message) => message.id)).toEqual(played.messages.map((message) => message.id));
            expect(partTexts(lastAi(after))).toEqual(['Well?']);
        });
    });

    it('is refused while a turn is being written', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        const played = await play(story.id, chat.id, 'Hello?', 'Mira nods.');
        let finish: (text: string) => void = () => {};
        const held = new Promise<string>((resolve) => (finish = resolve));
        const original = t.gateway.completeText;
        t.gateway.completeText = async (request) => ({ ...(await original.call(t.gateway, request)), text: await held });
        try {
            script('ignored');
            // Supertest sends only once awaited: `.then` starts the first request now.
            const first = regenerate(story.id, chat.id, lastAi(played).id).then((response) => response);
            // Wait for its turn call to be held, not for a fixed time: under load 200 ms was not
            // always enough, and the second request then reached the held gateway too.
            const deadline = Date.now() + 10_000;
            while (turnCalls().length < 2) {
                if (Date.now() > deadline) throw new Error('The first Regenerate never reached its turn call');
                await new Promise((resolve) => setTimeout(resolve, 20));
            }

            const second = await regenerate(story.id, chat.id, lastAi(played).id).expect(409);
            expect(second.body.error.code).toBe('409.004.004');

            finish('Mira shakes her head.');
            const done = await first;
            expect(done.status).toBe(200);
            expect(partTexts(lastAi(done.body as Chat))).toEqual(['Mira shakes her head.']);
        } finally {
            t.gateway.completeText = original;
        }
        await settled(story.id, chat.id);
    });

    describe('is refused, changing nothing and making no call', () => {
        it('on the Opening', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);

            const { body } = await regenerate(story.id, chat.id, chat.messages[0].id).expect(409);

            expect(body.error.code).toBe('409.004.014');
            expect(t.gateway.textCalls()).toHaveLength(0);
            expect((await getChat(story.id, chat.id)).messages).toEqual(chat.messages);
        });

        it('on a User Message awaiting its reply, and on an AI Message that is not the newest', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello?', 'Mira nods.');
            t.gateway.scriptText('turn', new ProviderOutageError());
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Tea?' }).expect(502);
            const waiting = await getChat(story.id, chat.id);
            const user = waiting.messages[3];
            expect(user).toMatchObject({ kind: 'user', text: 'Tea?' });
            t.gateway.reset();

            expect((await regenerate(story.id, chat.id, user.id).expect(409)).body.error.code).toBe('409.004.014');
            expect((await regenerate(story.id, chat.id, lastAi(played).id).expect(409)).body.error.code).toBe('409.004.014');
            expect((await regenerate(story.id, chat.id, 999_999).expect(404)).body.error.code).toBe('404.004.006');

            expect(t.gateway.textCalls()).toHaveLength(0);
            expect((await getChat(story.id, chat.id)).messages).toEqual(waiting.messages);
        });

        it('under the send gate: text credit out, or a Story that is not playable', async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            const played = await play(story.id, chat.id, 'Hello?', 'Mira nods.');
            t.gateway.reset();

            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });
            expect((await regenerate(story.id, chat.id, lastAi(played).id).expect(402)).body.error.code).toBe('402.001.003');
            t.gateway.setRemainingCredit({ text: { remainingUsd: null, limitUsd: null } });
            await t.http.patch(`/api/stories/${story.id}/characters/${story.characters[0].id}`).send({ voice: ' ' }).expect(200);
            expect((await regenerate(story.id, chat.id, lastAi(played).id).expect(422)).body.error.code).toBe('422.004.002');

            expect(t.gateway.textCalls()).toHaveLength(0);
            expect((await getChat(story.id, chat.id)).messages).toEqual(played.messages);
        });

        it("under the send gate: the reply's background call failed, until it is retried", async () => {
            const story = await createStory();
            const chat = await createChat(story.id);
            t.gateway.scriptText('turn', 'Mira nods.');
            t.gateway.scriptText('judge', new ProviderOutageError('DeepInfra answered 503.'), new ProviderOutageError('DeepInfra answered 503.'));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages`).send({ text: 'Hello?' }).expect(201);
            const failed = await settled(story.id, chat.id);
            expect(lastAi(failed).judge?.status).toBe('failed');

            const { body } = await regenerate(story.id, chat.id, lastAi(failed).id).expect(409);

            expect(body.error.code).toBe('409.004.008');
            expect(t.gateway.textCalls('turn')).toHaveLength(1);
            expect((await getChat(story.id, chat.id)).messages).toEqual(failed.messages);

            t.gateway.scriptText('judge', NO_CHANGE);
            await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${lastAi(failed).id}/judge`).expect(200);
            script('Mira shakes her head.');
            const again = await regenerate(story.id, chat.id, lastAi(failed).id).expect(200);
            expect(partTexts(lastAi(again.body as Chat))).toEqual(['Mira shakes her head.']);
            await settled(story.id, chat.id);
        });
    });
});

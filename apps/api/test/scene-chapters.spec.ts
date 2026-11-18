import { Logger } from '@nestjs/common';
import pg from 'pg';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { FAKE_TEXT_MODEL } from '../src/service/model-gateway/fake-model-gateway.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { closingParts } from './harness/prompt-layers.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Move on, and Chapters (.scratch/scene-chapters/spec.md), through the HTTP API with the Judge and the
 * Chapter writer scripted on the fake gateway.
 */

type Status = 'pending' | 'done' | 'failed';

interface Story {
    id: number;
    scenes: Array<{ id: number; name: string }>;
}

interface Chat {
    id: number;
    currentScene: { id: number; name: string } | null;
    messages: Array<{ id: number; kind: 'user' | 'ai'; position: number; judge?: { status: Status } | null; memory?: { status: Status } | null }>;
}

interface Chapter {
    id: number;
    number: number;
    sceneName: string;
    toSceneName: string | null;
    movedBy: 'judge' | 'user';
    event: string;
    messageId: number;
    summary: string | null;
    writtenBy: 'ai' | 'user';
    status: 'written' | 'writing' | 'waiting' | 'failed' | 'empty';
    failedReason: string | null;
}

interface Chapters {
    current: { number: number; scene: { id: number; name: string } | null };
    chapters: Chapter[];
}

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const NO_OPS = '{"operations":[]}';
const STAYS = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: 'Not yet.', move_on: false } });
const MOVES_ON = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: 'Ash asked about the cows.', move_on: true } });
const CHOSEN = 'has chosen to move the story on to this Scene';

describe('Move on, and Chapters', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp({ backgroundWaitMs: 300 });
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    /** Nara's camp, with three Scenes: Mare's milk, The guest tent, The fire. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: "A herders' camp on the steppe.", opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A trader passing through.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
        await t.http
            .post(`/api/stories/${storyId}/scenes`)
            .send({ name: "Mare's milk", situation: 'Ash is a guest at the fire.', moveOnCondition: 'Ash openly asks where the tribe keeps its cows.' })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The guest tent', situation: 'Night in the guest tent.', moveOnCondition: 'Nara tells a secret.' }).expect(201);
        return (await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The fire', situation: 'A lord comes to the fire.' }).expect(201)).body as Story;
    }

    async function createChat(storyId: number): Promise<number> {
        return ((await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat).id;
    }

    const getChat = async (storyId: number, chatId: number): Promise<Chat> => (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;

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

    /** The Chapters once none is being written. */
    async function chapters(storyId: number, chatId: number): Promise<Chapters> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const body = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/chapters`).expect(200)).body as Chapters;
            if (!body.chapters.some((chapter) => chapter.status === 'writing')) return body;
            if (Date.now() > deadline) throw new Error('The Chapters were not written in time');
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
    }

    async function play(storyId: number, chatId: number, judge = STAYS, text = 'I sip the milk.'): Promise<Chat> {
        t.gateway.scriptText('turn', '@Nara: Hm.');
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    const moveOn = (storyId: number, chatId: number, toSceneId: number | null) =>
        t.http.post(`/api/stories/${storyId}/chats/${chatId}/scene`).send({ toSceneId });

    async function sql(text: string, params: unknown[] = []): Promise<any[]> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            return (await client.query(text, params)).rows;
        } finally {
            await client.end();
        }
    }

    /** Holds every call of one kind until released. */
    function hold(kind: TextCompletionRequest['kind']): { release(text: string): void; restore(): void } {
        let release: (text: string) => void = () => {};
        const result = new Promise<string>((resolve) => (release = resolve));
        const original = t.gateway.completeText.bind(t.gateway);
        t.gateway.completeText = async (request) => {
            if (request.kind !== kind) return original(request);
            t.gateway.calls.push({ method: 'completeText', request });
            return { text: await result, model: FAKE_TEXT_MODEL, usage: { promptTokens: 0, completionTokens: 0 }, costUsd: 0 };
        };
        return { release: (text) => release(text), restore: () => (t.gateway.completeText = original) };
    }

    describe('Move on', () => {
        it('goes to the next Scene at the newest reply, as the user, and writes the Chapter it ended', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            const played = await play(story.id, chatId);
            const newest = played.messages.at(-1)!;
            t.gateway.scriptText('chapter_summary', 'Ash drank the milk at Nara\'s fire.');

            const { body } = await moveOn(story.id, chatId, story.scenes[1].id).expect(200);

            expect((body as Chat).currentScene).toEqual({ id: story.scenes[1].id, name: 'The guest tent' });
            const dashboard = (await t.http.get(`/api/stories/${story.id}/chats/${chatId}/dashboard`).expect(200)).body;
            expect(dashboard.scene.advance).toMatchObject({
                fromSceneName: "Mare's milk",
                toSceneName: 'The guest tent',
                event: 'You moved the story on.',
                movedBy: 'user',
                messageId: newest.id,
            });
            const listed = await chapters(story.id, chatId);
            expect(listed.current).toEqual({ number: 2, scene: { id: story.scenes[1].id, name: 'The guest tent' } });
            expect(listed.chapters).toEqual([
                expect.objectContaining({ number: 1, sceneName: "Mare's milk", toSceneName: 'The guest tent', movedBy: 'user', summary: "Ash drank the milk at Nara's fire.", writtenBy: 'ai', status: 'written' }),
            ]);
            // The whole Chapter, the Opening on: no Judge call, no other call.
            const [call] = t.gateway.textCalls('chapter_summary');
            expect(call.messages[1].content).toContain('[Story]\nSmoke curls from the fire.');
            expect(call.messages[1].content).toContain('[Ash]\nI sip the milk.');
            expect(call.messages[1].content).toContain("This chapter's scene: Mare's milk");
            expect(call.messages[1].content).not.toContain('cows');
            expect(call.maxTokens).toBe(400);
            expect(t.gateway.textCalls('judge')).toHaveLength(1);
        });

        it('goes to the Scene the user picks, into free play, and from free play into a Scene', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await play(story.id, chatId);
            t.gateway.scriptText('chapter_summary', 'One.', 'Two.', 'Three.');

            expect(((await moveOn(story.id, chatId, story.scenes[2].id).expect(200)).body as Chat).currentScene?.name).toBe('The fire');
            expect(((await moveOn(story.id, chatId, null).expect(200)).body as Chat).currentScene).toBeNull();
            expect(((await moveOn(story.id, chatId, story.scenes[0].id).expect(200)).body as Chat).currentScene?.name).toBe("Mare's milk");

            const listed = await chapters(story.id, chatId);
            expect(listed.chapters.map((chapter) => [chapter.sceneName, chapter.toSceneName, chapter.status])).toEqual([
                ["Mare's milk", 'The fire', 'written'],
                // Two more moves at the same reply: nothing was played in them.
                ['The fire', null, 'empty'],
                ['Free play', "Mare's milk", 'empty'],
            ]);
            expect(t.gateway.textCalls('chapter_summary')).toHaveLength(1);
        });

        it('refuses the Scene the Chat is on, free play from free play, and a Scene of another Story', async () => {
            const story = await createStory();
            const other = await createStory();
            const chatId = await createChat(story.id);

            expect((await moveOn(story.id, chatId, story.scenes[0].id).expect(422)).body.error.code).toBe('422.004.090');
            expect((await moveOn(story.id, chatId, other.scenes[1].id).expect(422)).body.error.code).toBe('422.004.090');
            await moveOn(story.id, chatId, null).expect(200);
            expect((await moveOn(story.id, chatId, null).expect(422)).body.error.code).toBe('422.004.090');
        });

        it('is refused while the newest reply\'s Judge outlasts the wait, and after it failed', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            const judge = hold('judge');
            try {
                t.gateway.scriptText('turn', '@Nara: Hm.');
                t.gateway.scriptText('memory_extraction', NO_OPS);
                await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'Hello.' }).expect(201);
                expect((await moveOn(story.id, chatId, story.scenes[1].id).expect(409)).body.error.code).toBe('409.004.007');
            } finally {
                judge.release(STAYS);
                judge.restore();
            }
            await settled(story.id, chatId);

            t.gateway.scriptText('turn', '@Nara: Hm.');
            t.gateway.scriptText('judge', new ProviderOutageError('Down.'), new ProviderOutageError('Down.'));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages`).send({ text: 'Again.' }).expect(201);
            await settled(story.id, chatId);
            expect((await moveOn(story.id, chatId, story.scenes[1].id).expect(409)).body.error.code).toBe('409.004.008');
            expect((await getChat(story.id, chatId)).currentScene?.name).toBe("Mare's milk");
        });

        it('the next reply is told to carry the story into the chosen Scene, in the closing message, with the opening cached', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await play(story.id, chatId);
            t.gateway.scriptText('chapter_summary', 'One.');
            await moveOn(story.id, chatId, story.scenes[1].id).expect(200);
            await chapters(story.id, chatId);

            await play(story.id, chatId);
            await play(story.id, chatId);

            const [first, second, third] = t.gateway.textCalls('turn');
            expect(closingParts(second).moment).toContain(`Ash ${CHOSEN}. Let this reply bring the story there`);
            expect(closingParts(second).moment).toContain('# Current Scene: The guest tent');
            expect(closingParts(third).moment).not.toContain(CHOSEN);
            // Nothing about the move or the Chapter changes the standing system message.
            expect(second.messages[0]).toEqual(first.messages[0]);
            expect(third.messages[0]).toEqual(first.messages[0]);
        });

        it('goes back with Again on the reply it was made at, and with an edit of it, but not with a later reply', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            const played = await play(story.id, chatId);
            const reply = played.messages.at(-1)!;
            t.gateway.scriptText('chapter_summary', 'One.', 'Two.');

            await moveOn(story.id, chatId, story.scenes[1].id).expect(200);
            t.gateway.scriptText('turn', '@Nara: Again.');
            t.gateway.scriptText('judge', STAYS);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages/${reply.id}/regenerate`).expect(200);
            expect((await settled(story.id, chatId)).currentScene?.name).toBe("Mare's milk");
            expect((await chapters(story.id, chatId)).chapters).toEqual([]);

            await moveOn(story.id, chatId, story.scenes[1].id).expect(200);
            t.gateway.scriptText('judge', STAYS);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.patch(`/api/stories/${story.id}/chats/${chatId}/messages/${reply.id}`).send({ text: '@Nara: Edited.' }).expect(200);
            expect((await settled(story.id, chatId)).currentScene?.name).toBe("Mare's milk");

            t.gateway.scriptText('chapter_summary', 'Three.');
            await moveOn(story.id, chatId, story.scenes[1].id).expect(200);
            const later = await play(story.id, chatId);
            t.gateway.scriptText('turn', '@Nara: Later, again.');
            t.gateway.scriptText('judge', STAYS);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages/${later.messages.at(-1)!.id}/regenerate`).expect(200);
            expect((await settled(story.id, chatId)).currentScene?.name).toBe('The guest tent');
        });
    });

    describe('Chapters', () => {
        it('a Judge move_on writes the Chapter of the Messages since the Scene began', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await play(story.id, chatId);
            t.gateway.scriptText('chapter_summary', 'Ash asked about the herd.');
            await play(story.id, chatId, MOVES_ON, 'Where are your cows?');
            t.gateway.scriptText('chapter_summary', 'Nara told a secret.');
            await play(story.id, chatId, MOVES_ON, 'Tell me.');

            const listed = await chapters(story.id, chatId);
            expect(listed.chapters.map((chapter) => [chapter.number, chapter.sceneName, chapter.movedBy, chapter.summary])).toEqual([
                [1, "Mare's milk", 'judge', 'Ash asked about the herd.'],
                [2, 'The guest tent', 'judge', 'Nara told a secret.'],
            ]);
            expect(listed.current).toEqual({ number: 3, scene: { id: story.scenes[2].id, name: 'The fire' } });
            const [, second] = t.gateway.textCalls('chapter_summary');
            const input = second.messages[1].content;
            expect(input).toContain('[Ash]\nTell me.');
            expect(input).not.toContain('Where are your cows?');
            expect(input).not.toContain('Smoke curls');
            expect(input).toContain('The chapter before, for context only:\nAsh asked about the herd.');
        });

        it('writes two per run at most, newest first, so an older Chat fills in a few at a time', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            // Three Scene ends with no Chapter written, as an older Chat has them.
            t.gateway.scriptText('chapter_summary', new ProviderOutageError('Down.'));
            await play(story.id, chatId, MOVES_ON);
            t.gateway.scriptText('chapter_summary', new ProviderOutageError('Down.'));
            await play(story.id, chatId, MOVES_ON);
            t.gateway.scriptText('chapter_summary', new ProviderOutageError('Down.'));
            await play(story.id, chatId, MOVES_ON);
            await chapters(story.id, chatId);
            await sql(`UPDATE "scene_advance" SET "chapter_failed" = NULL WHERE "chat_id" = $1`, [chatId]);
            t.gateway.reset();

            // The two newest are chosen, then written oldest first, so each reads the one before.
            t.gateway.scriptText('chapter_summary', 'Second.', 'Third.');
            await play(story.id, chatId);
            let listed = await chapters(story.id, chatId);
            expect(listed.chapters.map((chapter) => chapter.status)).toEqual(['waiting', 'written', 'written']);
            expect(listed.chapters.map((chapter) => chapter.summary)).toEqual([null, 'Second.', 'Third.']);

            t.gateway.scriptText('chapter_summary', 'First.');
            await play(story.id, chatId);
            listed = await chapters(story.id, chatId);
            expect(listed.chapters.map((chapter) => chapter.summary)).toEqual(['First.', 'Second.', 'Third.']);
        });

        it('a failed one waits for Try again, and is not tried again after the next turn', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            const logger = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
            try {
                // Asked once more right away, then failed.
                t.gateway.scriptText('chapter_summary', '', '   ');
                await play(story.id, chatId, MOVES_ON);
                let [chapter] = (await chapters(story.id, chatId)).chapters;
                expect(chapter).toMatchObject({ status: 'failed', failedReason: 'The Chapter writer wrote nothing.', summary: null });

                await play(story.id, chatId);
                await chapters(story.id, chatId);
                expect(t.gateway.textCalls('chapter_summary')).toHaveLength(2);

                t.gateway.scriptText('chapter_summary', 'Written at last.');
                const retried = (await t.http.post(`/api/stories/${story.id}/chats/${chatId}/chapters/${chapter.id}/write`).expect(200)).body as Chapters;
                expect(['writing', 'written']).toContain(retried.chapters[0].status);
                [chapter] = (await chapters(story.id, chatId)).chapters;
                expect(chapter).toMatchObject({ status: 'written', summary: 'Written at last.', failedReason: null });

                expect((await t.http.post(`/api/stories/${story.id}/chats/${chatId}/chapters/${chapter.id}/write`).expect(409)).body.error.code).toBe('409.004.093');
            } finally {
                logger.mockRestore();
            }
        });

        it("keeps the user's own summary, which a late AI write never replaces", async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await play(story.id, chatId);
            const writer = hold('chapter_summary');
            try {
                await moveOn(story.id, chatId, story.scenes[1].id).expect(200);
                const [chapter] = ((await t.http.get(`/api/stories/${story.id}/chats/${chatId}/chapters`).expect(200)).body as Chapters).chapters;
                expect(chapter.status).toBe('writing');
                await t.http.put(`/api/stories/${story.id}/chats/${chatId}/chapters/${chapter.id}`).send({ text: '  ' }).expect(422);
                const saved = (await t.http.put(`/api/stories/${story.id}/chats/${chatId}/chapters/${chapter.id}`).send({ text: ' My own words. ' }).expect(200))
                    .body as Chapters;
                expect(saved.chapters[0]).toMatchObject({ summary: 'My own words.', writtenBy: 'user', status: 'written' });
            } finally {
                writer.release('The AI\'s words.');
                writer.restore();
            }
            const [chapter] = (await chapters(story.id, chatId)).chapters;
            expect(chapter).toMatchObject({ summary: 'My own words.', writtenBy: 'user' });
            await t.http.put(`/api/stories/${story.id}/chats/${chatId}/chapters/99999`).send({ text: 'Lost.' }).expect(404);
        });

        it('goes with its advance on a rollback, comes along in a Branch up to its Message, and Reset clears them', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            t.gateway.scriptText('chapter_summary', 'One.');
            const first = await play(story.id, chatId, MOVES_ON);
            t.gateway.scriptText('chapter_summary', 'Two.');
            const second = await play(story.id, chatId, MOVES_ON);
            expect((await chapters(story.id, chatId)).chapters.map((chapter) => chapter.summary)).toEqual(['One.', 'Two.']);

            const branched = await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages/${first.messages.at(-1)!.id}/branch`).expect(201);
            const inBranch = await chapters(story.id, branched.body.id as number);
            expect(inBranch.chapters.map((chapter) => [chapter.summary, chapter.movedBy])).toEqual([['One.', 'judge']]);

            t.gateway.scriptText('turn', '@Nara: Hm, again.');
            t.gateway.scriptText('judge', STAYS);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/messages/${second.messages.at(-1)!.id}/regenerate`).expect(200);
            await settled(story.id, chatId);
            expect((await chapters(story.id, chatId)).chapters.map((chapter) => chapter.summary)).toEqual(['One.']);

            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/reset`).expect(200);
            expect(await chapters(story.id, chatId)).toEqual({ current: { number: 1, scene: { id: story.scenes[0].id, name: "Mare's milk" } }, chapters: [] });
        });
    });
});

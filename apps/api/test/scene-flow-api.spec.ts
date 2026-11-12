import { Logger } from '@nestjs/common';
import pg from 'pg';

import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Scenes that keep moving (.scratch/scene-flow/spec.md), through the HTTP API with the Judge
 * scripted on the fake gateway: the Lingering Scene line the Narrator reads.
 */

type Status = 'pending' | 'done' | 'failed';

interface Story {
    id: number;
    characters: Array<{ id: number; name: string }>;
    scenes: Array<{ id: number; name: string }>;
}

interface Chat {
    id: number;
    currentScene: { id: number; name: string } | null;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: Status } | null; memory?: { status: Status } | null }>;
}

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const NO_OPS = '{"operations":[]}';
const STAYS = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: 'Not yet.', move_on: false } });
const MOVES_ON = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: 'Ash asked about the cows.', move_on: true } });
const SUGGESTED = JSON.stringify({
    suggestions: [
        { kind: 'action', text: 'I set the bowl down.' },
        { kind: 'speech', text: '"Where do you keep the herd?"' },
        { kind: 'move', text: 'I walk toward the pens.' },
    ],
});

/** Words only the lingering Scene line has, and words only the calm one has. */
const LINGERING = 'This Scene has gone on a while.';
const CALM = "Don't hurry toward it";

describe('Scenes that keep moving', () => {
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

    /** Nara's camp, with three Scenes: Mare's milk and The guest tent, each with a condition, then The fire. */
    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A herders\' camp on the steppe.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A trader passing through.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Nara', appearance: 'Tall, sun-dark.', personality: 'Warm and teasing.', voice: 'Quick.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/scenes`)
            .send({ name: 'Mare\'s milk', situation: 'Ash is a guest at the fire.', moveOnCondition: 'Ash openly asks where the tribe keeps its cows.' })
            .expect(201);
        await t.http
            .post(`/api/stories/${storyId}/scenes`)
            .send({ name: 'The guest tent', situation: 'Night in the guest tent.', moveOnCondition: 'Nara tells Ash a secret.' })
            .expect(201);
        return (await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'The fire', situation: 'A lord comes to the fire.' }).expect(201)).body as Story;
    }

    async function createChat(storyId: number): Promise<number> {
        return ((await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat).id;
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

    async function play(storyId: number, chatId: number, judge = STAYS): Promise<Chat> {
        t.gateway.scriptText('turn', '@Nara: Hm.');
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'I sip the milk.' }).expect(201);
        return settled(storyId, chatId);
    }

    async function playMany(storyId: number, chatId: number, count: number): Promise<Chat> {
        let chat: Chat | undefined;
        for (let i = 0; i < count; i++) chat = await play(storyId, chatId);
        return chat!;
    }

    /** The Narrator's Scene layer in a call's system message. */
    function sceneLayer(request: { messages: Array<{ content: string }> }): string {
        const system = request.messages[0].content;
        const start = system.indexOf('# Current Scene');
        return system.slice(start, system.indexOf('\n\n# ', start + 1));
    }

    describe('the Judge reads the story so far', () => {
        it('sends the Chat\'s Story so far to the Judge, so a part met long ago is in view', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await play(story.id, chatId);
            // As if the Story so far had already been written over the first exchange.
            const client = new pg.Client({ connectionString: t.databaseUrl });
            await client.connect();
            try {
                await client.query(
                    `UPDATE "chat" SET "story_so_far" = $2, "story_so_far_through" = 1, "story_so_far_by" = 'ai' WHERE "id" = $1`,
                    [chatId, 'On the first day Ash tasted the milk at the crescent stall.'],
                );
            } finally {
                await client.end();
            }

            await play(story.id, chatId);

            expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain(
                '# Story so far (earlier events, summarised)\nOn the first day Ash tasted the milk at the crescent stall.',
            );
        });
    });

    describe('the Lingering Scene line', () => {
        it('the turn prompt is calm with seven replies in the Scene, lingers with eight, and is calm again after the Scene moves on', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);

            await playMany(story.id, chatId, 8);
            const turns = t.gateway.textCalls('turn');
            // The first turn has none in the Scene; the eighth has seven before it: both calm.
            expect(sceneLayer(turns[0])).toContain(CALM);
            expect(sceneLayer(turns[7])).toContain('# Current Scene: Mare\'s milk');
            expect(sceneLayer(turns[7])).toContain(CALM);
            expect(sceneLayer(turns[7])).not.toContain(LINGERING);

            // The ninth turn has eight before it: it lingers, and the Scene then moves on.
            expect((await play(story.id, chatId, MOVES_ON)).currentScene?.name).toBe('The guest tent');
            const ninth = sceneLayer(t.gateway.textCalls('turn')[8]);
            expect(ninth).toContain('# Current Scene: Mare\'s milk');
            expect(ninth).toContain(LINGERING);
            expect(ninth).toContain('open the way toward it');
            expect(ninth).not.toContain(CALM);

            // The new Scene starts its count again.
            await play(story.id, chatId);
            const tenth = sceneLayer(t.gateway.textCalls('turn')[9]);
            expect(tenth).toContain('# Current Scene: The guest tent');
            expect(tenth).toContain(CALM);
            expect(tenth).not.toContain(LINGERING);
        });

        it('Suggested replies and Write for me read the same lingering Scene line as the next turn', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await playMany(story.id, chatId, 7);

            // Seven replies: the next turn would be calm, and so are they.
            t.gateway.scriptText('suggested_replies', SUGGESTED);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/suggestions`).expect(200);
            t.gateway.scriptText('write_for_me', 'I ask about the herd.');
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/write-for-me`).send({ draft: '' }).expect(200);
            expect(sceneLayer(t.gateway.textCalls('suggested_replies').at(-1)!)).toContain(CALM);
            expect(sceneLayer(t.gateway.textCalls('write_for_me').at(-1)!)).toContain(CALM);

            await play(story.id, chatId);
            t.gateway.scriptText('suggested_replies', SUGGESTED);
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/suggestions`).expect(200);
            t.gateway.scriptText('write_for_me', 'I ask about the herd.');
            await t.http.post(`/api/stories/${story.id}/chats/${chatId}/write-for-me`).send({ draft: '' }).expect(200);
            for (const kind of ['suggested_replies', 'write_for_me'] as const) {
                const layer = sceneLayer(t.gateway.textCalls(kind).at(-1)!);
                expect(layer).toContain(LINGERING);
                expect(layer).not.toContain(CALM);
            }
        });
    });

    // .scratch/scene-flow/issues/03-passed-by-scenes.md
    describe('a passed-by Scene', () => {
        const WENT = 'The story went to the stall and the lord\'s fire.';
        // As seen in play (2026-11-12), the reason restates the condition, and wrongly: the event must never show it.
        const REASON = 'Ash has not yet tasted the milk or asked about the cows. The talk is all of the stall.';
        const PASSED_BY = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: REASON, move_on: false, passed_by: true, went_to: WENT } });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        async function advance(storyId: number, chatId: number) {
            return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/dashboard`).expect(200)).body.scene.advance as {
                fromSceneName: string;
                toSceneName: string | null;
                event: string;
                messageId: number;
            } | null;
        }

        const lastJudgeUser = () => t.gateway.textCalls('judge').at(-1)!.messages[1].content;

        it('is rejected at 19 replies; at 20 it moves to the next Scene past an unmet condition and an unheld gate, saying why, and logs it', async () => {
            const story = await createStory();
            const nara = story.characters[0].id;
            // A gate that never holds: Nara starts with no Bond toward Ash.
            await t.http
                .put(`/api/stories/${story.id}/scenes/${story.scenes[0].id}/gates`)
                .send([{ fromCharacterId: nara, toCharacterId: null, axis: 'trust', atLeast: 3 }])
                .expect(200);
            const chatId = await createChat(story.id);
            const log = vi.spyOn(Logger.prototype, 'log');

            await playMany(story.id, chatId, 18);
            expect((await play(story.id, chatId, PASSED_BY)).currentScene?.name).toBe('Mare\'s milk');
            // The 19th reply's Judge was not offered the rule, and its passed_by was dropped and logged.
            expect(lastJudgeUser()).not.toContain('Passed-by rule');
            expect(await advance(story.id, chatId)).toBeNull();
            const lines = () => log.mock.calls.map(([message]) => String(message));
            expect(lines()).toContainEqual(expect.stringContaining('judge item dropped: Scene: passed by with only 19 replies in the Scene'));

            const moved = await play(story.id, chatId, PASSED_BY);
            expect(lastJudgeUser()).toContain('Passed-by rule:');
            expect(moved.currentScene?.name).toBe('The guest tent');
            expect(await advance(story.id, chatId)).toMatchObject({
                fromSceneName: 'Mare\'s milk',
                toSceneName: 'The guest tent',
                event: `The story moved past Mare's milk: ${WENT}`,
                messageId: moved.messages.at(-1)!.id,
            });
            // The log line keeps the Judge's whole reason for debugging.
            expect(lines().filter((line) => line.endsWith(`after 20 replies the story passed Scene "Mare's milk" by: ${REASON}`))).toHaveLength(1);
        });

        it('with no went_to, the event names only the Scene, never the reason', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await playMany(story.id, chatId, 19);

            const noWentTo = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: REASON, move_on: false, passed_by: true } });
            expect((await play(story.id, chatId, noWentTo)).currentScene?.name).toBe('The guest tent');
            expect((await advance(story.id, chatId))!.event).toBe('The story moved past Mare\'s milk.');
        });

        it('with move_on as well, advances once, with move_on\'s reason', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await playMany(story.id, chatId, 19);

            const both = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { reason: 'Ash asked about the cows.', move_on: true, passed_by: true } });
            expect((await play(story.id, chatId, both)).currentScene?.name).toBe('The guest tent');
            expect(await advance(story.id, chatId)).toMatchObject({ fromSceneName: 'Mare\'s milk', toSceneName: 'The guest tent', event: 'Ash asked about the cows.' });
        });

        it('counts again from each advance, and from the last Scene goes to free play', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            // The first reply moves the Chat on: The guest tent starts counting after it.
            expect((await play(story.id, chatId, MOVES_ON)).currentScene?.name).toBe('The guest tent');
            await playMany(story.id, chatId, 18);
            // 20 replies in the Chat, but 19 in this Scene.
            expect((await play(story.id, chatId, PASSED_BY)).currentScene?.name).toBe('The guest tent');
            expect((await play(story.id, chatId, PASSED_BY)).currentScene?.name).toBe('The fire');

            // The last Scene: 20 replies in it, and it goes to free play.
            await playMany(story.id, chatId, 19);
            const free = await play(story.id, chatId, PASSED_BY);
            expect(free.currentScene).toBeNull();
            expect(await advance(story.id, chatId)).toMatchObject({ fromSceneName: 'The fire', toSceneName: null, event: `The story moved past The fire: ${WENT}` });
            // Free play has no count: the next Judge gets no rule, and its passed_by is dropped.
            await play(story.id, chatId, PASSED_BY);
            expect(lastJudgeUser()).toContain('# Current Scene\nnone\n');
            expect(lastJudgeUser()).not.toContain('Passed-by rule');
        });

        it('an edit of the reply rolls the move back', async () => {
            const story = await createStory();
            const chatId = await createChat(story.id);
            await playMany(story.id, chatId, 19);
            const moved = await play(story.id, chatId, PASSED_BY);
            expect(moved.currentScene?.name).toBe('The guest tent');

            t.gateway.scriptText('judge', STAYS);
            t.gateway.scriptText('memory_extraction', NO_OPS);
            const { body } = await t.http
                .patch(`/api/stories/${story.id}/chats/${chatId}/messages/${moved.messages.at(-1)!.id}`)
                .send({ text: '@Nara: The herd? Later.' })
                .expect(200);
            expect(body.rolledBack.sceneAdvances).toBe(1);
            expect(body.currentScene?.name).toBe('Mare\'s milk');
            expect((await settled(story.id, chatId)).currentScene?.name).toBe('Mare\'s milk');
            expect(await advance(story.id, chatId)).toBeNull();
            // The re-judged reply is still the 20th in the Scene: its Judge is offered the rule.
            expect(lastJudgeUser()).toContain('Passed-by rule:');
        });

        it('a Branch keeps the count of its own story', async () => {
            const story = await createStory();
            const source = await createChat(story.id);
            const played = await playMany(story.id, source, 19);

            // Branched at the 10th reply: Messages 1 (the Opening) to 21.
            const tenth = played.messages[20];
            expect(tenth.kind).toBe('ai');
            const branch = (await t.http.post(`/api/stories/${story.id}/chats/${source}/messages/${tenth.id}/branch`).expect(201)).body as Chat;
            expect(branch.messages).toHaveLength(21);

            // The Branch's 11th reply is not passed by, though the source has 19 replies before it.
            expect((await play(story.id, branch.id, PASSED_BY)).currentScene?.name).toBe('Mare\'s milk');
            expect(lastJudgeUser()).not.toContain('Passed-by rule');
            // The source's own 20th reply is.
            expect((await play(story.id, source, PASSED_BY)).currentScene?.name).toBe('The guest tent');

            // The Branch reaches its own 20th reply and moves on then.
            await playMany(story.id, branch.id, 8);
            expect((await play(story.id, branch.id, PASSED_BY)).currentScene?.name).toBe('The guest tent');
            expect(await advance(story.id, branch.id)).toMatchObject({ event: `The story moved past Mare's milk: ${WENT}` });
        });
    });
});

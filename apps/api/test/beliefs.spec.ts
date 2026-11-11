import pg from 'pg';

import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/memory-by-meaning/spec.md, "Beliefs" (ticket 04), through the HTTP API with the
 * extraction scripted on the fake gateway: Beliefs made and given up by the extraction, told to the
 * Narrator, rolled back with their Message, carried by a Branch, cleared by Reset, and the Beliefs
 * API. The people are adults in a hill-tribe Story where the user, Petch, hides that he is a Marquis.
 */

const OPENING = 'Smoke rises over the camp.\n\n@Nara: Another stranger.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const MARQUIS = '{user} is the Marquis of the river lands, in disguise.';
const HERDER = '{user} is a wandering herder.';

interface Belief {
    id: number;
    characterId: number;
    text: string;
    contradictsMemoryId: number | null;
    writtenBy: 'ai' | 'user';
    messageId: number | null;
    givenUp: { messageId: number; line: string } | null;
    createdAt: string;
}

interface Chat {
    id: number;
    messages: Array<{ id: number; kind: 'user' | 'ai' }>;
    beliefs: Belief[];
    memoriesInPlay: { memoryIds: number[]; beliefIds: number[] };
}

describe('Beliefs', () => {
    let t: TestApp;
    let db: pg.Client;

    beforeAll(async () => {
        t = await startTestApp();
        db = new pg.Client({ connectionString: t.databaseUrl });
        await db.connect();
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await db.end();
        await t.close();
    });

    async function story(): Promise<{ storyId: number; nara: number; kai: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Hill Camp' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A hill camp of herders.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A traveller.' }).expect(200);
        const add = async (name: string) =>
            (
                await t.http
                    .post(`/api/stories/${storyId}/characters`)
                    .send({ name, appearance: 'Tall, weathered.', personality: 'Proud.', voice: 'Low.' })
                    .expect(201)
            ).body.characters.find((character: { name: string }) => character.name === name).id as number;
        return { storyId, nara: await add('Nara'), kai: await add('Kai') };
    }

    async function newChat(storyId: number): Promise<number> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id;
    }

    const getChat = async (storyId: number, chatId: number): Promise<Chat> => (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;

    async function play(storyId: number, chatId: number, text: string, reply: string, operations: object[] = []): Promise<Chat> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', operations.length > 0 ? JSON.stringify({ operations }) : NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
        return getChat(storyId, chatId);
    }

    const lastTurnSystem = () => t.gateway.textCalls('turn').at(-1)!.messages[0].content;
    const lastExtractionUser = () => t.gateway.textCalls('memory_extraction').at(-1)!.messages[1].content;

    /** A Chat where Kai knows the truth and Nara has been lied to. */
    async function deceived(): Promise<{ storyId: number; chatId: number; nara: number; kai: number; marquis: number; chat: Chat }> {
        const { storyId, nara, kai } = await story();
        const chatId = await newChat(storyId);
        await play(storyId, chatId, 'I show Kai the seal of the river lands.', '@Kai: My lord.', [
            { op: 'add', text: MARQUIS, known_by: ['Kai'], cause: 'the seal' },
        ]);
        const marquis = (await db.query(`SELECT id FROM memory WHERE chat_id = $1`, [chatId])).rows[0].id as number;
        const chat = await play(storyId, chatId, 'I tell Nara I herd goats.', '@Nara: A herder, then.', [
            { op: 'believe', character: 'Nara', text: 'Petch is a wandering herder.', contradicts: marquis, cause: 'he lied' },
        ]);
        return { storyId, chatId, nara, kai, marquis, chat };
    }

    it('records a scripted believe on the Chat, and tells the Narrator "Nara believes: …" while Nara is present', async () => {
        const { storyId, chatId, nara, marquis, chat } = await deceived();

        expect(chat.beliefs).toEqual([
            {
                id: expect.any(Number),
                characterId: nara,
                text: HERDER,
                contradictsMemoryId: marquis,
                writtenBy: 'ai',
                messageId: chat.messages.at(-1)!.id,
                givenUp: null,
                createdAt: expect.any(String),
            },
        ]);
        const belief = chat.beliefs[0];

        const next = await play(storyId, chatId, 'Nara, sit with me.', '@Nara: For a moment.');
        const system = lastTurnSystem();
        expect(system).toContain('- Nara believes: Petch is a wandering herder.');
        expect(system).toContain('A Character acts on what they believe, even when it is wrong.');
        // The truth stays a Memory known only by Kai.
        expect(system).toContain('- [known by Kai] Petch is the Marquis of the river lands, in disguise.');
        expect(next.memoriesInPlay.beliefIds).toEqual([belief.id]);
        // The extraction sees it numbered, beside the Memories.
        expect(lastExtractionUser()).toContain(`# Active Beliefs (id: who believes what)\n${belief.id}: Nara believes: ${HERDER} (contradicts Memory ${marquis})`);
        // The Memory drawer's list carries it too.
        expect((await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body.beliefs).toEqual(next.beliefs);
    });

    it("doesn't tell the Narrator the Belief of a Character who isn't present", async () => {
        const { storyId, chatId } = await deceived();

        await play(storyId, chatId, 'Kai, walk with me.', '@Kai: Of course.');
        // Now the latest exchange is Kai's alone.
        await play(storyId, chatId, 'We walk on.', '@Kai: The path is steep.');

        expect(lastTurnSystem()).not.toContain('believes:');
        expect(lastTurnSystem()).toContain('Petch is the Marquis');
    });

    it('gives a Belief up with give_up: it leaves the prompt and shows when it was given up', async () => {
        const { storyId, chatId, chat } = await deceived();
        const belief = chat.beliefs[0];

        const after = await play(storyId, chatId, 'Nara sees the seal on my ring.', '@Nara: You lied to me, my lord.', [
            { op: 'give_up', belief: belief.id, because: 'she saw the seal' },
        ]);
        const revealing = after.messages.at(-1)!;
        expect(after.beliefs).toEqual([{ ...belief, givenUp: { messageId: revealing.id, line: expect.stringContaining('You lied to me, my lord.') } }]);

        await play(storyId, chatId, 'Nara, forgive me.', '@Nara: Perhaps.');
        expect(lastTurnSystem()).not.toContain('believes:');
        expect(lastExtractionUser()).toContain('# Active Beliefs (id: who believes what)\n(none)');

        // A second give-up of it is dropped: it isn't active.
        const again = await play(storyId, chatId, 'Nara?', '@Nara: Yes.', [{ op: 'give_up', belief: belief.id, because: 'again' }]);
        expect(again.beliefs[0].givenUp!.messageId).toBe(revealing.id);
    });

    it('rolls back on Regenerate: the Belief the replaced reply made goes, and one it gave up is held again', async () => {
        const { storyId, chatId, chat } = await deceived();
        const belief = chat.beliefs[0];

        t.gateway.scriptText('turn', '@Nara: Then I will hold my tongue.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${chat.messages.at(-1)!.id}/regenerate`).expect(200);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
        expect((await getChat(storyId, chatId)).beliefs).toEqual([]);

        // Made again, then given up by a reply that is then regenerated: held again.
        const made = await play(storyId, chatId, 'I repeat that I herd goats.', '@Nara: A herder.', [
            { op: 'believe', character: 'Nara', text: HERDER, cause: 'he lied again' },
        ]);
        const remade = made.beliefs[0];
        expect(remade.id).not.toBe(belief.id);
        const reveal = await play(storyId, chatId, 'Nara sees the seal.', '@Nara: My lord!', [{ op: 'give_up', belief: remade.id, because: 'the seal' }]);
        expect(reveal.beliefs[0].givenUp).not.toBeNull();
        t.gateway.scriptText('turn', '@Nara: What is that ring?');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${reveal.messages.at(-1)!.id}/regenerate`).expect(200);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
        expect((await getChat(storyId, chatId)).beliefs).toEqual([{ ...remade, givenUp: null }]);
    });

    it('carries the Beliefs into a Branch as they stood at its Message, on its own ids, linked to its own Memories', async () => {
        const { storyId, chatId, chat, marquis } = await deceived();
        const believedAt = chat.messages.at(-1)!;
        const belief = chat.beliefs[0];
        const revealed = await play(storyId, chatId, 'Nara sees the seal.', '@Nara: My lord!', [{ op: 'give_up', belief: belief.id, because: 'the seal' }]);
        const revealedAt = revealed.messages.at(-1)!;

        // At the Message that made it, before the reveal: held.
        const early: Chat = (await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${believedAt.id}/branch`).expect(201)).body;
        const earlyMarquis = (await db.query(`SELECT id FROM memory WHERE chat_id = $1`, [early.id])).rows[0].id as number;
        expect(earlyMarquis).not.toBe(marquis);
        expect(early.beliefs).toEqual([
            { ...belief, id: expect.any(Number), contradictsMemoryId: earlyMarquis, messageId: early.messages.at(-1)!.id, givenUp: null, createdAt: belief.createdAt },
        ]);
        expect(early.beliefs[0].id).not.toBe(belief.id);

        // At the reveal: given up there, in the Branch's own Message.
        const late: Chat = (await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${revealedAt.id}/branch`).expect(201)).body;
        expect(late.beliefs).toHaveLength(1);
        expect(late.beliefs[0].givenUp).toEqual({ messageId: late.messages.at(-1)!.id, line: expect.stringContaining('My lord!') });

        // The early Branch's Belief still rolls back with its own Message.
        t.gateway.scriptText('turn', '@Nara: Hm.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${early.id}/messages/${early.messages.at(-1)!.id}/regenerate`).expect(200);
        await t.app.get(ChatManagerService).backgroundIdle(early.id);
        expect((await getChat(storyId, early.id)).beliefs).toEqual([]);

        // The source is untouched.
        expect((await getChat(storyId, chatId)).beliefs).toEqual(revealed.beliefs);
    });

    it('Reset clears every Belief, the user\'s too', async () => {
        const { storyId, chatId, nara } = await deceived();
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/beliefs`).send({ characterId: nara, text: 'The river is safe to ford.' }).expect(201);
        expect((await getChat(storyId, chatId)).beliefs).toHaveLength(2);

        const reset = (await t.http.post(`/api/stories/${storyId}/chats/${chatId}/reset`).expect(200)).body;

        expect(reset.beliefs).toEqual([]);
        expect((await db.query(`SELECT count(*)::int AS n FROM belief_change WHERE chat_id = $1`, [chatId])).rows[0].n).toBe(0);
    });

    describe('the Beliefs API', () => {
        const path = (storyId: number, chatId: number, beliefId?: number) =>
            `/api/stories/${storyId}/chats/${chatId}/beliefs${beliefId === undefined ? '' : `/${beliefId}`}`;

        it('adds, edits and deletes a Belief the user writes', async () => {
            const { storyId, chatId, nara, kai, marquis } = await deceived();

            const added: Belief = (
                await t.http.post(path(storyId, chatId)).send({ characterId: kai, text: '  {user} owes the camp a horse. ', contradictsMemoryId: marquis }).expect(201)
            ).body;
            expect(added).toEqual({
                id: expect.any(Number),
                characterId: kai,
                text: '{user} owes the camp a horse.',
                contradictsMemoryId: marquis,
                writtenBy: 'user',
                messageId: null,
                givenUp: null,
                createdAt: expect.any(String),
            });

            const edited: Belief = (
                await t.http.patch(path(storyId, chatId, added.id)).send({ characterId: nara, text: '{user} owes the camp two horses.', contradictsMemoryId: null }).expect(200)
            ).body;
            expect(edited).toEqual({ ...added, characterId: nara, text: '{user} owes the camp two horses.', contradictsMemoryId: null });
            expect((await getChat(storyId, chatId)).beliefs.map((belief) => belief.id)).toContain(added.id);

            // An AI-made one may be edited too; it is the user's text then.
            const aiMade = (await getChat(storyId, chatId)).beliefs.find((belief) => belief.writtenBy === 'ai')!;
            const corrected: Belief = (await t.http.patch(path(storyId, chatId, aiMade.id)).send({ text: '{user} is a goatherd.' }).expect(200)).body;
            expect(corrected).toMatchObject({ text: '{user} is a goatherd.', writtenBy: 'user', contradictsMemoryId: aiMade.contradictsMemoryId });

            await t.http.delete(path(storyId, chatId, added.id)).expect(204);
            expect((await getChat(storyId, chatId)).beliefs.map((belief) => belief.id)).not.toContain(added.id);
        });

        it('answers BeliefNotFoundError for a missing Belief or another Chat\'s', async () => {
            const { storyId, chatId, nara } = await deceived();
            const otherChat = await newChat(storyId);
            const other: Belief = (await t.http.post(path(storyId, otherChat)).send({ characterId: nara, text: 'Rain is coming.' }).expect(201)).body;

            for (const response of [
                await t.http.patch(path(storyId, chatId, 999_999)).send({ text: 'x' }).expect(404),
                await t.http.delete(path(storyId, chatId, 999_999)).expect(404),
                await t.http.patch(path(storyId, chatId, other.id)).send({ text: 'x' }).expect(404),
            ]) {
                expect(response.body.error.code).toBe('404.004.024');
            }
        });

        it('refuses blank text, a Character outside the cast, and a Memory of another Chat, changing nothing', async () => {
            const { storyId, chatId, nara, chat } = await deceived();
            const elsewhere = await story();
            const otherChat = await newChat(storyId);
            await t.http.post(`/api/stories/${storyId}/chats/${otherChat}/memories`).send({ text: 'Not this Chat.' }).expect(201);
            const otherMemory = (await db.query(`SELECT id FROM memory WHERE chat_id = $1`, [otherChat])).rows[0].id as number;

            expect((await t.http.post(path(storyId, chatId)).send({ characterId: nara, text: '   ' }).expect(422)).body.error.code).toBe('422.004.025');
            expect((await t.http.patch(path(storyId, chatId, chat.beliefs[0].id)).send({ text: ' ' }).expect(422)).body.error.code).toBe('422.004.025');
            expect((await t.http.post(path(storyId, chatId)).send({ characterId: elsewhere.nara, text: 'x' }).expect(404)).body.error.code).toBe('404.003.002');
            expect(
                (await t.http.post(path(storyId, chatId)).send({ characterId: nara, text: 'x', contradictsMemoryId: otherMemory }).expect(404)).body.error.code,
            ).toBe('404.004.011');
            await t.http.post(path(storyId, chatId)).send({ text: 'no Character' }).expect(400);
            expect((await getChat(storyId, chatId)).beliefs).toEqual(chat.beliefs);
        });
    });
});

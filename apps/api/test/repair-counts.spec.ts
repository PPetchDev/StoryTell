import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Repair counts (.scratch/reply-repair/spec.md, ticket 06): one record for each repair the app
 * makes or refuses, and the Usage answer counts them for its month by kind and play model.
 */
describe('Repair counts: Usage (HTTP)', () => {
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

    const NO_OPS = '{"operations":[]}';
    const judged = (pressing?: unknown) => JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...(pressing === undefined ? {} : { pressing }) });

    async function settle(storyId: number, chatId: number): Promise<void> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body;
            const last = chat.messages.at(-1);
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** A Story with Nara, and with Bram too when asked, and a Chat of it. */
    async function chatWith(...more: string[]) {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Camp' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer camp.', opening: 'Smoke rises from the fire.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A traveller.' }).expect(200);
        for (const name of ['Nara', ...more]) {
            await t.http.post(`/api/stories/${storyId}/characters`).send({ name, appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201);
        }
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        return { storyId, chatId };
    }

    async function play(storyId: number, chatId: number, reply: string, judgement = judged(), model = 'glm-5.3') {
        t.gateway.scriptText('turn', { text: reply, model });
        t.gateway.scriptText('judge', judgement);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'I talk about the road.' }).expect(201);
        await settle(storyId, chatId);
    }

    type Count = { kind: string; model: string; made: number; refused: number };
    /** The month's counts of one kind, as Usage answers them. */
    const counts = async (kind: string): Promise<Count[]> => ((await t.http.get('/api/usage').expect(200)).body.repairs as Count[]).filter((one) => one.kind === kind);

    it('counts a speech-line repair made, one weighed and refused, and none for a reply that needed no look', async () => {
        const one = await chatWith();
        const two = await chatWith('Bram');
        await play(one.storyId, one.chatId, '@Nara: Tea?');
        expect(await counts('speech_lines')).toEqual([]);

        await play(one.storyId, one.chatId, '"Sit," she said.');
        // Two Characters and a tag that names neither: weighed, and left as written.
        await play(two.storyId, two.chatId, '"Sit," she said.');

        expect(await counts('speech_lines')).toEqual([{ kind: 'speech_lines', model: 'glm-5.3', made: 1, refused: 1 }]);
    });

    it('counts a Line repair kept and one refused, apart by the play model that wrote the reply', async () => {
        const { storyId, chatId } = await chatWith();
        const habit = '@Nara: I had a plan. I had stages. I had a sequence.';
        t.gateway.scriptText('speech_repair', 'I had a whole plan. Stages and everything.');
        await play(storyId, chatId, habit);
        // A repair that is no better than the line is refused.
        t.gateway.scriptText('speech_repair', 'I had a plan. I had stages. I had a sequence.');
        await play(storyId, chatId, habit, judged(), 'deepseek-v4-pro');

        expect(await counts('line')).toEqual([
            { kind: 'line', model: 'deepseek-v4-pro', made: 0, refused: 1 },
            { kind: 'line', model: 'glm-5.3', made: 1, refused: 0 },
        ]);
    });

    it('counts a pressing note when a turn reads it', async () => {
        const { storyId, chatId } = await chatWith();
        await play(storyId, chatId, '@Nara: Why are you really here?', judged([{ character: 'Nara', for: 'to say why they really came' }]));
        expect(await counts('pressing_note')).toEqual([]);

        await play(storyId, chatId, '@Nara: Fine weather.');

        expect(await counts('pressing_note')).toEqual([{ kind: 'pressing_note', model: 'glm-5.3', made: 1, refused: 0 }]);
    });

    it('keeps the month’s count when the reply it was made on is rewound away', async () => {
        const { storyId, chatId } = await chatWith();
        await play(storyId, chatId, '"Sit," she said.');
        const before = await counts('speech_lines');
        const sent = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.messages.at(-2).id as number;

        // Editing the user's Message writes the reply again: the mended reply's Message is gone.
        t.gateway.scriptText('turn', { text: '@Nara: Tea?', model: 'glm-5.3' });
        t.gateway.scriptText('judge', judged());
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${sent}`).send({ text: 'I talk about the weather.' }).expect(200);
        await settle(storyId, chatId);

        expect(await counts('speech_lines')).toEqual(before);
    });

    it('takes a Chat’s repair records away with the Chat', async () => {
        const before = await counts('speech_lines');
        const { storyId, chatId } = await chatWith();
        await play(storyId, chatId, '"Sit," she said.');
        expect(await counts('speech_lines')).not.toEqual(before);

        await t.http.delete(`/api/stories/${storyId}/chats/${chatId}`).expect(204);

        expect(await counts('speech_lines')).toEqual(before);
    });
});

import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Pressing notes (.scratch/reply-repair/spec.md, ticket 04): when a reply has a Character press
 * the user for something the user's Message was not about, the Judge says so in the call it
 * already makes, the note is recorded against that reply, and the next turn is told once.
 */
describe('Pressing notes: the turn (HTTP)', () => {
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
    const NARA_PRESSED = [{ character: 'Nara', for: 'to say why they really came' }];

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

    async function newChat() {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Camp' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer camp.', opening: 'Smoke rises from the fire.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A traveller.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        return { storyId, chatId };
    }

    /** One exchange: the play model's reply, then the Judge's answer about it. */
    async function play(storyId: number, chatId: number, text: string, reply: string, judgement: string) {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judgement);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await settle(storyId, chatId);
    }

    /** Everything the newest turn call was sent. */
    const turnPrompt = () =>
        t.gateway
            .textCalls('turn')
            .at(-1)!
            .messages.map((message) => message.content)
            .join('\n');

    const LINE = 'In the last reply Nara pressed Ash for this: to say why they really came.';

    it('asks the Judge for pressing in every judgement, with the same system message each time', async () => {
        const { storyId, chatId } = await newChat();
        await play(storyId, chatId, 'I sit by the fire.', '@Nara: Tea?', judged());
        await play(storyId, chatId, 'Yes.', '@Nara: Here.', judged(NARA_PRESSED));

        const [first, second] = t.gateway.textCalls('judge').slice(-2);
        expect(first.messages[0].content).toContain('"pressing":[{"character":"...","for":"..."}]');
        expect(first.messages[0].content).toBe(second.messages[0].content);
        expect(first.messages.at(-1)!.content).toContain('Pressing rule:');
        expect(second.messages.at(-1)!.content).toContain('Pressing rule:');
    });

    it('tells the next turn, once, that the Character pressed and does not ask again; the turn after is not told', async () => {
        const { storyId, chatId } = await newChat();
        await play(storyId, chatId, 'I talk about the road.', '@Nara: Never mind the road. Why are you really here?', judged(NARA_PRESSED));

        await play(storyId, chatId, 'I talk about the weather.', '@Nara: It is fine weather.', judged());
        const next = turnPrompt();
        expect(next).toContain(LINE);
        expect(next).toContain('Ash spoke of something else, and that is the answer for now: Nara does not ask for it again in this reply');
        // In the closing message, which is read last.
        expect(t.gateway.textCalls('turn').at(-1)!.messages.at(-1)!.content).toContain(LINE);

        await play(storyId, chatId, 'I talk about the horses.', '@Nara: Good horses.', judged());
        expect(turnPrompt()).not.toContain('pressed Ash for this');
    });

    it('with no note, the turn is told nothing about pressing', async () => {
        const { storyId, chatId } = await newChat();
        await play(storyId, chatId, 'I sit.', '@Nara: Tea?', judged());
        await play(storyId, chatId, 'Yes.', '@Nara: Here.', judged([]));

        expect(turnPrompt()).not.toContain('pressed Ash');
    });

    it('takes the note back with its reply: a Regenerate that does not press leaves nothing to tell', async () => {
        const { storyId, chatId } = await newChat();
        await play(storyId, chatId, 'I talk about the road.', '@Nara: Why are you really here?', judged(NARA_PRESSED));
        const pressedId = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.messages.at(-1).id as number;

        t.gateway.scriptText('turn', { text: '@Nara: The road is long.', model: 'glm-5.3' });
        t.gateway.scriptText('judge', judged());
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${pressedId}/regenerate`).expect(200);
        await settle(storyId, chatId);

        await play(storyId, chatId, 'I talk about the weather.', '@Nara: Fine weather.', judged());
        expect(turnPrompt()).not.toContain('pressed Ash for this');
    });

    it('drops a note for someone not in the Story or for the user’s own character, keeps two at most, and cuts a long one short', async () => {
        const { storyId, chatId } = await newChat();
        const long = `to ${'explain every single thing about the journey and '.repeat(4)}more`;
        await play(
            storyId,
            chatId,
            'I talk about the road.',
            '@Nara: Why are you really here?',
            judged([
                { character: 'Bram', for: 'to leave' },
                { character: 'Ash', for: 'to stay' },
                { character: 'Nara', for: long },
                { character: 'nara', for: 'to sit down' },
                { character: 'Nara', for: 'to drink the tea' },
            ]),
        );

        await play(storyId, chatId, 'I talk about the weather.', '@Nara: Fine weather.', judged());
        const next = turnPrompt();
        expect(next).not.toContain('Bram pressed');
        expect(next).not.toContain('pressed Ash for this: to stay');
        expect(next).toContain(`Nara pressed Ash for this: ${long.slice(0, 80).trim()}`);
        expect(next).not.toContain(long.slice(0, 81));
        expect(next).toContain('Nara pressed Ash for this: to sit down');
        expect(next).not.toContain('to drink the tea');
    });

    // Found in review.
    describe('where there is nothing to tell', () => {
        it('a Continue has no Message of the user’s, so a note on its reply is dropped, and a Continue is told nothing of a note before it', async () => {
            const { storyId, chatId } = await newChat();
            await play(storyId, chatId, 'I talk about the road.', '@Nara: Why are you really here?', judged(NARA_PRESSED));

            // The user says nothing: there is no "spoke of something else" to tell the Character about.
            t.gateway.scriptText('turn', { text: '@Nara: Well? Say it.', model: 'glm-5.3' });
            t.gateway.scriptText('judge', judged(NARA_PRESSED));
            t.gateway.scriptText('memory_extraction', NO_OPS);
            await t.http.post(`/api/stories/${storyId}/chats/${chatId}/continue`).expect(200);
            await settle(storyId, chatId);
            expect(turnPrompt()).not.toContain('pressed Ash for this');

            // And the note the Judge gave on the Continue's reply was not kept.
            await play(storyId, chatId, 'I talk about the weather.', '@Nara: Fine weather.', judged());
            expect(turnPrompt()).not.toContain('pressed Ash for this');
        });

        it('drops a note for a Character who is sitting out', async () => {
            const { storyId, chatId } = await newChat();
            const cast = (await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Bram', appearance: 'Short.', personality: 'Gruff.', voice: 'Short.' }).expect(201)).body.characters as { id: number; name: string }[];
            await t.http.put(`/api/stories/${storyId}/chats/${chatId}/sitting-out`).send({ characterIds: [cast.find((one) => one.name === 'Bram')!.id] }).expect(200);
            await play(storyId, chatId, 'I talk about the road.', '@Nara: Hm.', judged([{ character: 'Bram', for: 'to leave' }]));

            await play(storyId, chatId, 'I talk about the weather.', '@Nara: Fine weather.', judged());
            expect(turnPrompt()).not.toContain('Bram pressed');
        });
    });

    it('names the Character as the Story does, even one whose name holds a colon, and ends the thing pressed for with one full stop', async () => {
        const { storyId, chatId } = await newChat();
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Dr: Who', appearance: 'Tall.', personality: 'Odd.', voice: 'Short.' }).expect(201);
        await play(storyId, chatId, 'I talk about the road.', '@Nara: Hm.', judged([{ character: 'dr: who', for: 'to say where the box went.' }]));

        await play(storyId, chatId, 'I talk about the weather.', '@Nara: Fine weather.', judged());
        expect(turnPrompt()).toContain('In the last reply Dr: Who pressed Ash for this: to say where the box went. Ash spoke of something else');
    });
});

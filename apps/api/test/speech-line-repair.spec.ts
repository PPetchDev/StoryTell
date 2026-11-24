import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Speech-line repair (.scratch/reply-repair/spec.md, ticket 01): a reply with no speech line at
 * all, whose narration quotes someone speaking, has the quoted words moved onto speech lines of
 * the Character who said them, where code can tell who that was. The shapes below are those of a
 * real played Chat whose six replies had no `@Name:` line (the prompt eval run, 2026-11-24);
 * the words are written for the test.
 */
describe('Speech-line repair: the turn (HTTP)', () => {
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
    const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' } });

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
        const ids: Record<string, number> = {};
        for (const name of ['Nara', ...more]) {
            // Adding a Character answers the Story, in cast order.
            const cast = (await t.http.post(`/api/stories/${storyId}/characters`).send({ name, appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201)).body.characters as { id: number; name: string }[];
            ids[name] = cast.find((character) => character.name === name)!.id;
        }
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        return { storyId, chatId, ids };
    }

    /** Sends a Message the play model answers with `reply`, and gives the stored reply's parts as kind, speaker and text. */
    async function play(storyId: number, chatId: number, reply: string, text = 'I hold up the bag.') {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await settle(storyId, chatId);
        const parts = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.messages.at(-1).parts as { kind: string; speakerName?: string; characterId?: number | null; text: string }[];
        return parts.map((part) => (part.kind === 'speech' ? `${part.speakerName}: ${part.text}` : part.text));
    }

    const QUOTED = [
        'Nara looked at the bag.',
        '"Too much for one person," she repeated, like she was checking the sums.',
        'She held the tent flap wide and stood aside.',
        '"Coincidence, that. I happen to be a second person."',
    ].join('\n\n');

    it('gives the one Character of the Story her quoted words as speech lines, the quotation marks gone and the narration kept', async () => {
        const { storyId, chatId, ids } = await chatWith();

        const parts = await play(storyId, chatId, QUOTED);

        expect(parts).toEqual([
            'Nara looked at the bag.',
            'Nara: Too much for one person.',
            'She repeated, like she was checking the sums.\n\nShe held the tent flap wide and stood aside.',
            'Nara: Coincidence, that. I happen to be a second person.',
        ]);
        const stored = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.messages.at(-1).parts;
        expect(stored[1]).toMatchObject({ kind: 'speech', characterId: ids.Nara, speakerName: 'Nara' });
    });

    it('takes a bare speech tag away, and keeps one that carries an action', async () => {
        const { storyId, chatId } = await chatWith();

        const parts = await play(storyId, chatId, '"Sit," she said.\n\n"Not there," she said, pointing at the dry log.');

        expect(parts).toEqual(['Nara: Sit.', 'Nara: Not there.', 'She said, pointing at the dry log.']);
    });

    it('gives the next turn the mended reply as its history', async () => {
        const { storyId, chatId } = await chatWith();
        await play(storyId, chatId, QUOTED);

        await play(storyId, chatId, '@Nara: Well?', 'I sit.');

        const history = t.gateway
            .textCalls('turn')
            .at(-1)!
            .messages.map((message) => message.content)
            .join('\n');
        expect(history).toContain('@Nara: Too much for one person.');
        expect(history).not.toContain('"Too much for one person,"');
    });

    it('leaves a reply that has a speech line exactly as written', async () => {
        const { storyId, chatId } = await chatWith();

        const parts = await play(storyId, chatId, '"Odd," she said to nobody.\n\n@Nara: Tea?');

        expect(parts).toEqual(['"Odd," she said to nobody.', 'Nara: Tea?']);
    });

    it('never makes a speech line of words the narration gives to the user’s character', async () => {
        const { storyId, chatId } = await chatWith();
        const reply = '"Evening," Ash said, and held up the bag.\n\nNara only nodded at the fire.';

        expect(await play(storyId, chatId, reply)).toEqual([reply]);
    });

    it('leaves alone a quotation that is not someone speaking now', async () => {
        const { storyId, chatId } = await chatWith();
        const reply = '"Character" was what she called the wobble in the good stool.\n\nThe sign on the post read "Closed."';

        expect(await play(storyId, chatId, reply)).toEqual([reply]);
    });

    // Found in review: each of these opens with a quotation and went to Nara, the Story's one Character.
    it.each([
        ['a stranger the narration names by what they are', '"Closing time," the ferryman called across the water.'],
        ['words remembered from someone else', '"Never trust a ferryman," her mother had once said.'],
        ['a sign', '"Closed," the sign read.'],
        ['a title', '"The Long Road," the book was called.'],
        ['someone the narration calls they, as it may call the user', '"Evening," they said, lifting the bag.'],
    ])('leaves alone %s', async (_what, paragraph) => {
        const { storyId, chatId } = await chatWith();
        const reply = `${paragraph}\n\nNara only nodded at the fire.`;

        expect(await play(storyId, chatId, reply)).toEqual([reply]);
    });

    it('takes away a bare tag whatever its verb of saying, and mends a quotation one line under the narration', async () => {
        const { storyId, chatId } = await chatWith();

        const parts = await play(storyId, chatId, 'Nara looked up.\n"Sit," she snapped.');

        expect(parts).toEqual(['Nara looked up.', 'Nara: Sit.']);
    });

    describe('with several Characters', () => {
        // Found in review: the first name after the quotation was taken for the speaker.
        it.each([
            ['names a listener first', '"Hand me that," Bram heard Nara say.'],
            ['names one of them doing something else', '"Mine." Bram watched Nara take it anyway. "All of it."'],
        ])('leaves alone a quotation whose tag %s', async (_what, paragraph) => {
            const { storyId, chatId } = await chatWith('Bram');
            const reply = `${paragraph}\n\nThe fire spat.`;

            expect(await play(storyId, chatId, reply)).toEqual([reply]);
        });

        it('moves only a quotation whose own sentence names one of them, and leaves the rest as narration', async () => {
            const { storyId, chatId } = await chatWith('Bram');

            const parts = await play(storyId, chatId, '"Hand me that," Nara said, pointing at the kettle.\n\n"No," she said.\n\n"Mine," Bram muttered into his cup.');

            expect(parts).toEqual(['Nara: Hand me that.', 'Nara said, pointing at the kettle.\n\n"No," she said.', 'Bram: Mine.', 'Bram muttered into his cup.']);
        });

        it('keeps the reply as written when no quotation can be given to anyone', async () => {
            const { storyId, chatId } = await chatWith('Bram');
            const reply = '"No," she said.\n\n"Then go," he answered.';

            expect(await play(storyId, chatId, reply)).toEqual([reply]);
        });

        it('makes no speech line for a Character sitting out, and gives the one left the quotations that name nobody', async () => {
            const { storyId, chatId, ids } = await chatWith('Bram');
            await t.http.put(`/api/stories/${storyId}/chats/${chatId}/sitting-out`).send({ characterIds: [ids.Bram] }).expect(200);

            const parts = await play(storyId, chatId, '"Mine," Bram muttered into his cup.\n\n"Sit," she said.');

            expect(parts).toEqual(['"Mine," Bram muttered into his cup.', 'Nara: Sit.']);
        });
    });

    it('offers the recovered lines to Line repair', async () => {
        const { storyId, chatId } = await chatWith();
        t.gateway.scriptText('speech_repair', 'I had a whole plan. Stages and everything.');

        const parts = await play(storyId, chatId, '"I had a plan. I had stages. I had a sequence," she said.');

        expect(t.gateway.textCalls('speech_repair')).toHaveLength(1);
        expect(parts).toEqual(['Nara: I had a whole plan. Stages and everything.']);
    });
});

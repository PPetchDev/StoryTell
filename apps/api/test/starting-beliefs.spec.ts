import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/memory-by-meaning/spec.md, "Starting Beliefs" (ticket 05), through the HTTP API: an
 * author's Starting Beliefs save as a whole list and validate, seed every new Chat and every
 * Reset as Beliefs, and Duplicate copies them onto the copy's Characters. The people are adults
 * in a hill-tribe Story where the user, Petch, hides that he is a Marquis.
 */

const OPENING = 'Smoke rises over the camp.\n\n@Nara: Another stranger.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';

interface StartingBelief {
    id: number;
    characterId: number;
    text: string;
}

describe('Starting Beliefs', () => {
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

    const put = (storyId: number, startingBeliefs: object[]) => t.http.put(`/api/stories/${storyId}/starting-beliefs`).send({ startingBeliefs });

    it('saves the whole list, trimmed, answers the Story, and a later list replaces it', async () => {
        const { storyId, nara, kai } = await story();

        const saved = (await put(storyId, [
            { characterId: nara, text: '  {user} is a wandering herder. ' },
            { characterId: kai, text: 'The ford is safe at dusk.' },
        ]).expect(200)).body;

        expect(saved.id).toBe(storyId);
        expect(saved.startingBeliefs).toEqual([
            { id: expect.any(Number), characterId: nara, text: '{user} is a wandering herder.' },
            { id: expect.any(Number), characterId: kai, text: 'The ford is safe at dusk.' },
        ]);
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.startingBeliefs).toEqual(saved.startingBeliefs);

        const replaced = (await put(storyId, [{ characterId: kai, text: 'The herds are sick.' }]).expect(200)).body;
        expect(replaced.startingBeliefs).toEqual([{ id: expect.any(Number), characterId: kai, text: 'The herds are sick.' }]);

        expect((await put(storyId, []).expect(200)).body.startingBeliefs).toEqual([]);
    });

    it('refuses blank text and a Character outside the cast, changing nothing', async () => {
        const { storyId, nara } = await story();
        const elsewhere = await story();
        await put(storyId, [{ characterId: nara, text: 'Kept.' }]).expect(200);

        expect((await put(storyId, [{ characterId: nara, text: 'Fine.' }, { characterId: nara, text: '   ' }]).expect(422)).body.error.code).toBe('422.003.025');
        expect((await put(storyId, [{ characterId: elsewhere.nara, text: 'Not ours.' }]).expect(404)).body.error.code).toBe('404.003.002');
        await put(storyId, [{ text: 'No Character.' }]).expect(400);
        await t.http.put(`/api/stories/${storyId}/starting-beliefs`).send({}).expect(400);

        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.startingBeliefs).toEqual([
            { id: expect.any(Number), characterId: nara, text: 'Kept.' },
        ]);
    });

    it('seeds every new Chat with them as Beliefs, which reach the Narrator', async () => {
        const { storyId, nara, kai } = await story();
        await put(storyId, [
            { characterId: nara, text: '{user} is a wandering herder.' },
            { characterId: kai, text: 'The ford is safe at dusk.' },
        ]).expect(200);

        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body;

        expect(chat.beliefs).toEqual([
            { id: expect.any(Number), characterId: nara, text: '{user} is a wandering herder.', contradictsMemoryId: null, writtenBy: 'user', messageId: null, givenUp: null, createdAt: expect.any(String) },
            { id: expect.any(Number), characterId: kai, text: 'The ford is safe at dusk.', contradictsMemoryId: null, writtenBy: 'user', messageId: null, givenUp: null, createdAt: expect.any(String) },
        ]);

        t.gateway.scriptText('turn', '@Nara: Sit, herder.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', '{"operations":[]}');
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'Nara, may I sit?' }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);
        expect(t.gateway.textCalls('turn')[0].messages[0].content).toContain('- Nara believes: Petch is a wandering herder.');
    });

    it('Reset brings back the Starting Beliefs as the Story has them now, whatever happened to the Chat\'s', async () => {
        const { storyId, nara, kai } = await story();
        await put(storyId, [{ characterId: nara, text: '{user} is a wandering herder.' }]).expect(200);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body;
        const seeded = chat.beliefs[0];

        // Given up by a turn, and one more added by hand.
        t.gateway.scriptText('turn', '@Nara: That seal... my lord!');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', JSON.stringify({ operations: [{ op: 'give_up', belief: seeded.id, because: 'the seal' }] }));
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I show Nara my seal.' }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chat.id);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/beliefs`).send({ characterId: kai, text: 'Rain is coming.' }).expect(201);
        const played = (await t.http.get(`/api/stories/${storyId}/chats/${chat.id}`).expect(200)).body;
        expect(played.beliefs[0].givenUp).not.toBeNull();
        expect(played.beliefs).toHaveLength(2);

        // The author changes the list; Reset reads it as it is now.
        await put(storyId, [
            { characterId: nara, text: '{user} is a wandering herder.' },
            { characterId: kai, text: 'The herds are sick.' },
        ]).expect(200);
        const reset = (await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200)).body;

        expect(reset.beliefs.map((belief: { characterId: number; text: string; givenUp: unknown }) => [belief.characterId, belief.text, belief.givenUp])).toEqual([
            [nara, '{user} is a wandering herder.', null],
            [kai, 'The herds are sick.', null],
        ]);
    });

    it("Duplicate copies them onto the copy's own Characters", async () => {
        const { storyId, nara, kai } = await story();
        await put(storyId, [
            { characterId: nara, text: '{user} is a wandering herder.' },
            { characterId: kai, text: 'The ford is safe at dusk.' },
        ]).expect(200);

        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body;

        const copyNara = copy.characters.find((character: { name: string }) => character.name === 'Nara').id;
        const copyKai = copy.characters.find((character: { name: string }) => character.name === 'Kai').id;
        expect([copyNara, copyKai]).not.toContain(nara);
        expect(copy.startingBeliefs.map((belief: StartingBelief) => [belief.characterId, belief.text])).toEqual([
            [copyNara, '{user} is a wandering herder.'],
            [copyKai, 'The ford is safe at dusk.'],
        ]);
        // The source keeps its own.
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.startingBeliefs.map((belief: StartingBelief) => belief.characterId)).toEqual([nara, kai]);
    });

    it('go with their Character when it is removed', async () => {
        const { storyId, nara, kai } = await story();
        await put(storyId, [
            { characterId: nara, text: '{user} is a wandering herder.' },
            { characterId: kai, text: 'The ford is safe at dusk.' },
        ]).expect(200);

        await t.http.delete(`/api/stories/${storyId}/characters/${kai}`).expect(200);

        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.startingBeliefs.map((belief: StartingBelief) => belief.characterId)).toEqual([nara]);
    });
});

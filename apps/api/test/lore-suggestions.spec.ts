import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Lore from a Chat (.scratch/lore-from-chat/spec.md), through the HTTP API with the suggestions
 * scripted on the fake gateway.
 */

interface Chat {
    id: number;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: string } | null; memory?: { status: string } | null }>;
}

interface Suggestion {
    name: string;
    keywords: string[];
    text: string;
}

const OPENING = 'Smoke curls from the fire.\n\n@Nara: Drink, guest.';
const NO_OPS = '{"operations":[]}';
const JUDGE = JSON.stringify({
    bond_changes: [],
    arc_steps: [],
    scene: { reason: 'Not yet.', move_on: false },
    details: { where: 'At the fire in the felt tent.', place: 'the felt tent by the river road' },
});

describe('Lore from a Chat', () => {
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

    async function createChat(): Promise<{ storyId: number; chatId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Steppe' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: "A herders' camp.", opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A trader passing through.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Quick.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Mare milk', keywords: ['kumis'], text: 'Fermented and sour; offered to every guest.' }).expect(201);
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return { storyId, chatId: chat.body.id as number };
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

    async function play(storyId: number, chatId: number): Promise<void> {
        t.gateway.scriptText('turn', 'The lamps of the vigil burn all night.\n\n@Nara: At the vigil, no one sleeps until the river horn sounds.');
        t.gateway.scriptText('judge', JUDGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'What is the vigil?' }).expect(201);
        await settled(storyId, chatId);
    }

    const url = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}/lore-suggestions`;

    it('refuses with only the Opening, and makes no call', async () => {
        const { storyId, chatId } = await createChat();
        const refused = await t.http.post(url(storyId, chatId)).expect(409);
        expect(refused.body.error.code).toBe('409.004.170');
        expect(t.gateway.textCalls('lore_suggestions')).toHaveLength(0);
    });

    it("reads the Chat's world and the Lore there is, and keeps only new, clean entries", async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId);
        await t.http.put(`/api/stories/${storyId}/chats/${chatId}/facts`).send({ topic: 'The river horn', fact: 'blown at dawn' }).expect(200);
        t.gateway.scriptText(
            'lore_suggestions',
            'Here they are: ' +
                JSON.stringify({
                    entries: [
                        { name: '  The vigil ', keywords: ['vigils', ' Vigil night ', '', 'the vigil', 'vigils'], text: ' A night when the camp keeps its lamps lit and no one sleeps until the river horn. ' },
                        { name: 'mare MILK', keywords: [], text: 'Already Lore.' },
                        { name: 'Nara', keywords: [], text: 'A Character, not Lore.' },
                        { name: 'Ash', keywords: [], text: 'The identity, not Lore.' },
                        { name: 'The river horn', text: 'A horn blown at dawn from the river road.' },
                        { name: '', text: 'No name.' },
                        { name: 'Empty', text: '  ' },
                        { name: 'The vigil', text: 'A second one of the same name.' },
                        { name: 'Felt tents', keywords: ['tent'], text: 'Round tents of pressed felt.' },
                        { name: 'Lamps', keywords: ['lamp'], text: 'Fat lamps.' },
                        { name: 'River road', keywords: [], text: 'The road along the river.' },
                        { name: 'Herds', keywords: [], text: 'Horses and goats.' },
                        { name: 'Seventh', keywords: [], text: 'One too many.' },
                    ],
                }),
        );

        const answer = (await t.http.post(url(storyId, chatId)).expect(200)).body as { suggestions: Suggestion[] };

        expect(answer.suggestions).toEqual([
            { name: 'The vigil', keywords: ['vigils', 'Vigil night'], text: 'A night when the camp keeps its lamps lit and no one sleeps until the river horn.' },
            { name: 'The river horn', keywords: [], text: 'A horn blown at dawn from the river road.' },
            { name: 'Felt tents', keywords: ['tent'], text: 'Round tents of pressed felt.' },
            { name: 'Lamps', keywords: ['lamp'], text: 'Fat lamps.' },
            { name: 'River road', keywords: [], text: 'The road along the river.' },
            { name: 'Herds', keywords: [], text: 'Horses and goats.' },
        ]);

        const [call] = t.gateway.textCalls('lore_suggestions');
        expect(call.json).toBe(true);
        const prompt = call.messages.map((message) => message.content).join('\n');
        expect(prompt).toContain("# Setting\nA herders' camp.");
        expect(prompt).toContain('- Mare milk: Fermented and sour; offered to every guest.');
        expect(prompt).toContain("Characters: Nara. The user's character: Ash.");
        expect(prompt).toContain('- The river horn: blown at dawn');
        expect(prompt).toContain('# Places this Chat has been\n- the felt tent by the river road');
        expect(prompt).toContain('Ash: What is the vigil?');
        expect(prompt).toContain('no one sleeps until the river horn sounds');

        // Nothing is added by asking: the Story's Lore is as it was.
        const story = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as { lore: Array<{ name: string }> };
        expect(story.lore.map((entry) => entry.name)).toEqual(['Mare milk']);
    });

    it('answers an empty list when the Chat established nothing new, and an unreadable answer is the gateway error', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId);
        t.gateway.scriptText('lore_suggestions', '{"entries":[]}');
        expect((await t.http.post(url(storyId, chatId)).expect(200)).body).toEqual({ suggestions: [] });

        t.gateway.scriptText('lore_suggestions', 'I could not find anything.');
        const failed = await t.http.post(url(storyId, chatId)).expect(502);
        expect(failed.body.error.code).toBe('502.001.005');
    });
});

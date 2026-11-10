import * as loreSelect from '../src/manager/chat/lore/lore-select.js';
import { startTestApp, TestApp } from './harness/test-app.js';

// .scratch/lore-triggers/issues/01: "The turn's selection runs once per turn". The selection
// entry point is wrapped here, in this file only, so each call into it is counted.
const counted = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/manager/chat/lore/lore-select.js', async (importOriginal) => {
    const actual = await importOriginal<typeof loreSelect>();
    return {
        ...actual,
        selectLoreAt: (...args: Parameters<typeof actual.selectLoreAt>) => {
            counted.calls++;
            return actual.selectLoreAt(...args);
        },
    };
});

const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false}}';
const NO_OPS = '{"operations":[]}';

describe('Lore selection in a turn', () => {
    let t: TestApp;

    beforeAll(async () => {
        t = await startTestApp();
    });

    afterAll(async () => {
        await t.close();
    });

    it('runs once per turn, and the turn carries what it chose', async () => {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Market' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A grassland market.', opening: 'Dust rises.\n\n@Nara: Welcome.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A traveller.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Salt', text: 'Salt is money here.', alwaysOn: true }).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        t.gateway.scriptText('turn', '@Nara: The blue one.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        counted.calls = 0;

        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Which yurt is yours?' }).expect(201);

        expect(counted.calls).toBe(1);
        const trailing = t.gateway.textCalls('turn')[0].messages.at(-1)!.content;
        expect(trailing).toContain('Round felt tents.');
        expect(trailing).toContain('Salt is money here.');
    });
});

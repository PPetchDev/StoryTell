import { loreReserveTokens, mentions, PromptLoreEntry, selectLore } from '../src/manager/chat/lore/lore-select.js';
import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { buildTurnPrompt, loreScan, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

let nextId = 1;
function entry(fields: Partial<PromptLoreEntry> & { name: string }): PromptLoreEntry {
    return { id: nextId++, keywords: [], text: `About ${fields.name}.`, alwaysOn: false, ...fields };
}

function input(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A grassland market.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Petch', description: 'A traveller.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        history: [{ role: 'assistant', text: '@Nara: Welcome to the market.' }],
        userText: 'I look at the tents.',
        ...overrides,
    };
}

describe('Lore: matching and selection (pure)', () => {
    it('matches ignoring case, Latin triggers only at the start of a word, other scripts anywhere', () => {
        expect(mentions('The CRESCENT tribe rides.', 'Crescent')).toBe(true);
        expect(mentions('Two Crescents rise.', 'crescent')).toBe(true);
        expect(mentions('She looks at herself.', 'elf')).toBe(false);
        expect(mentions('An elf, and another elf-lord.', 'elf')).toBe(true);
        expect(mentions('เผ่าพระจันทร์เสี้ยวมาถึงแล้ว', 'พระจันทร์')).toBe(true);
        expect(mentions('Anything', '  ')).toBe(false);
    });

    it("counts the entry's name as a trigger, alongside its keywords", () => {
        const tent = entry({ name: 'Tent', keywords: ['yurt'] });
        const well = entry({ name: 'The well', keywords: ['water'] });
        expect(selectLore([tent, well], ['I step into the tent.'])).toEqual([tent]);
        expect(selectLore([tent, well], ['Bring water.'])).toEqual([well]);
        expect(selectLore([tent, well], ['Nothing here.'])).toEqual([]);
    });

    it('puts Always include first, then the most recently mentioned, position breaking ties', () => {
        const law = entry({ name: 'Law', alwaysOn: true });
        const old = entry({ name: 'Old road' });
        const river = entry({ name: 'River' });
        const hill = entry({ name: 'Hill' });
        const scan = ['We cross the river by the hill.', 'Past the old road.'];
        expect(selectLore([old, river, hill, law], scan).map((e) => e.name)).toEqual(['Law', 'River', 'Hill', 'Old road']);
    });

    it('never sends an entry with blank text, even an Always include one', () => {
        expect(selectLore([entry({ name: 'Empty', text: '  ', alwaysOn: true }), entry({ name: 'Blank', text: '' })], ['Blank'])).toEqual([]);
    });

    it('keeps under the cap, skipping an entry that does not fit while still trying the rest', () => {
        const big = entry({ name: 'Big', text: 'x'.repeat(400) });
        const small = entry({ name: 'Small', text: 'Short.' });
        const chosen = selectLore([big, small], ['Big and Small'], 60);
        expect(chosen.map((e) => e.name)).toEqual(['Small']);
    });

    it('scans the user message and the 4 newest Messages, newest first', () => {
        const history = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map((text) => ({ role: 'assistant' as const, text }));
        expect(loreScan(history, 'new')).toEqual(['new', 'm6', 'm5', 'm4', 'm3']);
        expect(loreScan(history, null)).toEqual(['m6', 'm5', 'm4', 'm3']);
        const old = entry({ name: 'm1' });
        expect(selectLore([old], loreScan(history, 'new'))).toEqual([]);
    });

    it('reserves nothing for a Story without sendable Lore, and at most about the cap', () => {
        expect(loreReserveTokens([])).toBe(0);
        expect(loreReserveTokens([entry({ name: 'A', text: '' })])).toBe(0);
        expect(loreReserveTokens([entry({ name: 'A', text: 'x'.repeat(40_000) })])).toBeLessThanOrEqual(1_530);
    });
});

describe('Lore: the turn and Suggested replies prompts (pure)', () => {
    const tent = entry({ name: 'Tents', keywords: ['yurt'], text: 'Round felt tents with a smoke hole.' });
    const salt = entry({ name: 'Salt', text: 'Salt is money here.' });

    it('opens the trailing system message with the Lore the exchange brings up, before the reminder', () => {
        const prompt = buildTurnPrompt(input({ lore: [tent, salt] }));
        const last = prompt.messages.at(-1)!;
        expect(last.role).toBe('system');
        expect(last.content.startsWith('# Lore (facts of this world that matter right now: common knowledge')).toBe(true);
        expect(last.content).toContain('## Tents\nRound felt tents with a smoke hole.');
        expect(last.content).not.toContain('Salt is money here.');
        expect(last.content.indexOf('# Lore')).toBeLessThan(last.content.indexOf('Where things stand:'));
    });

    it('leaves the system message, and with it the cached prefix, exactly as without Lore', () => {
        const without = buildTurnPrompt(input());
        const withLore = buildTurnPrompt(input({ lore: [tent, salt] }));
        expect(withLore.messages[0]).toEqual(without.messages[0]);
        expect(without.messages.at(-1)!.content.startsWith('Where things stand:')).toBe(true);
    });

    it('gives Suggested replies the Lore of the newest Messages', () => {
        const prompt = buildSuggestionsPrompt({ ...input({ lore: [tent, salt] }), history: [{ role: 'assistant', text: '@Nara: Pay in salt.' }] });
        const last = prompt.messages.at(-1)!.content;
        expect(last).toContain('Salt is money here.');
        expect(last).not.toContain('Round felt tents');
        expect(last.indexOf('# Lore')).toBeLessThan(last.indexOf('Step outside the story'));
    });
});

interface LoreEntry {
    id: number;
    name: string;
    keywords: string[];
    text: string;
    alwaysOn: boolean;
}

interface Story {
    id: number;
    updatedAt: string;
    lore: LoreEntry[];
    playable: boolean;
}

const OPENING = `Dust rises over the market.

@Nara: Welcome, traveller.`;
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

describe('Lore: the API', () => {
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

    async function playableStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Market' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A grassland market.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A traveller.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' })
            .expect(201);
        return storyId;
    }

    async function settle(storyId: number, chatId: number): Promise<void> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
            const last = body.messages.at(-1);
            if (last.judge?.status !== 'pending' && last.memory?.status !== 'pending') return;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    it('adds, edits and removes entries, each write answering the whole Story, without touching playability', async () => {
        const storyId = await playableStory();
        const before = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        expect(before.lore).toEqual([]);

        const added = (
            await t.http
                .post(`/api/stories/${storyId}/lore`)
                .send({ name: 'Tents', keywords: [' yurt ', '', 'YURT', 'กระโจม'], text: 'Round felt tents.' })
                .expect(201)
        ).body as Story;
        expect(added.lore).toEqual([{ id: expect.any(Number), name: 'Tents', keywords: ['yurt', 'กระโจม'], text: 'Round felt tents.', alwaysOn: false }]);
        expect(added.playable).toBe(before.playable);
        const id = added.lore[0].id;

        await t.http.post(`/api/stories/${storyId}/lore`).send({}).expect(201);
        const edited = (await t.http.patch(`/api/stories/${storyId}/lore/${id}`).send({ alwaysOn: true }).expect(200)).body as Story;
        expect(edited.lore.map((e) => [e.name, e.alwaysOn, e.text])).toEqual([
            ['Tents', true, 'Round felt tents.'],
            ['', false, ''],
        ]);

        const removed = (await t.http.delete(`/api/stories/${storyId}/lore/${id}`).expect(200)).body as Story;
        expect(removed.lore).toHaveLength(1);

        const missing = await t.http.patch(`/api/stories/${storyId}/lore/${id}`).send({ text: 'x' }).expect(404);
        expect(missing.body.error.code).toBe('404.003.013');
        await t.http.post(`/api/stories/${storyId}/lore`).send({ keywords: Array.from({ length: 21 }, (_, i) => `k${i}`) }).expect(400);
    });

    it('sends a mentioned entry in the turn and leaves an unmentioned one out; Lore in play follows the Chat', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Tents', keywords: ['yurt'], text: 'Round felt tents with a smoke hole.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Salt', text: 'Salt is money here.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Sky law', text: 'Never point at the moon.', alwaysOn: true }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as { id: number };

        const before = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/lore`).expect(200);
        expect(before.body.entries.map((e: LoreEntry) => e.name)).toEqual(['Sky law']);

        t.gateway.scriptText('turn', '@Nara: That yurt is mine.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I walk to the yurt.' }).expect(201);
        await settle(storyId, chat.id);

        const [turn] = t.gateway.textCalls('turn');
        const trailing = turn.messages.at(-1)!.content;
        expect(trailing).toContain('Round felt tents with a smoke hole.');
        expect(trailing).toContain('Never point at the moon.');
        expect(trailing).not.toContain('Salt is money here.');
        expect(turn.messages[0].content).not.toContain('Round felt tents');

        const after = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/lore`).expect(200);
        expect(after.body.entries).toEqual([
            { id: expect.any(Number), name: 'Sky law', alwaysOn: true },
            { id: expect.any(Number), name: 'Tents', alwaysOn: false },
        ]);
    });

    it('lets the Story assistant add, change and remove Lore, removal without asking, and shows it the Lore', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Tents', text: 'Round felt tents.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Salt', text: 'Salt is money.' }).expect(201);
        t.gateway.scriptText(
            'story_assistant',
            JSON.stringify({
                reply: 'Done.',
                changes: [
                    { op: 'set', target: 'lore', name: 'tents', field: 'keywords', value: ['yurt', ' '] },
                    { op: 'set', target: 'lore', name: 'Lore 1', field: 'alwaysOn', value: true },
                    { op: 'remove', target: 'lore', name: 'Salt' },
                    { op: 'add', target: 'lore', value: { name: 'The well', keywords: ['water'], text: 'One well for the whole camp.' } },
                ],
            }),
        );
        const result = await t.http.post(`/api/stories/${storyId}/assistant`).send({ instruction: 'Tidy the Lore.' }).expect(200);

        expect(result.body.pending).toBeNull();
        expect(result.body.story.lore).toEqual([
            { id: expect.any(Number), name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.', alwaysOn: true },
            { id: expect.any(Number), name: 'The well', keywords: ['water'], text: 'One well for the whole camp.', alwaysOn: false },
        ]);
        expect(result.body.changes).toEqual(
            expect.arrayContaining([
                { kind: 'remove', target: 'lore', label: 'Lore Salt' },
                expect.objectContaining({ kind: 'set', target: 'lore', field: 'alwaysOn', before: false, after: true, label: 'Lore Tents: Always include' }),
                expect.objectContaining({ kind: 'add', target: 'lore', label: 'Lore The well' }),
            ]),
        );
        const asked = t.gateway.textCalls('story_assistant')[0].messages.map((message) => message.content).join('\n');
        expect(asked).toContain('Lore 2:\n  Name: Salt');
        expect(asked).toContain('"target": "lore"');

        t.gateway.scriptText('story_assistant', JSON.stringify({ reply: '', changes: [{ op: 'remove', target: 'lore', name: 'Nope' }] }));
        const refused = await t.http.post(`/api/stories/${storyId}/assistant`).send({ instruction: 'Remove Nope.' }).expect(502);
        expect(refused.body.error.code).toBe('502.005.006');
    });

    it('creates the Lore a draft carries, at most 8', async () => {
        t.gateway.scriptText(
            'story_draft',
            JSON.stringify({
                title: 'The Market',
                setting: 'A grassland market.',
                opening: OPENING,
                style: { pov: 'second', tense: 'present', replyLength: 'medium' },
                role: { name: 'Petch', description: 'A traveller.' },
                characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Calm.', voice: 'Measured.' }],
                lore: Array.from({ length: 10 }, (_, i) => ({ name: `Place ${i + 1}`, keywords: [`p${i + 1}`], text: `About place ${i + 1}.` })),
            }),
        );
        const story = (await t.http.post('/api/stories/draft').send({ idea: 'A market on the steppe.' }).expect(201)).body as Story;
        expect(story.lore).toHaveLength(8);
        expect(story.lore[0]).toEqual({ id: expect.any(Number), name: 'Place 1', keywords: ['p1'], text: 'About place 1.', alwaysOn: false });
        expect(t.gateway.textCalls('story_draft')[0].messages[0].content).toContain('"lore": [');
    });

    it('puts a new entry last even after removals left gaps', async () => {
        const storyId = await playableStory();
        const lore = `/api/stories/${storyId}/lore`;
        for (const name of ['A', 'B', 'C']) await t.http.post(lore).send({ name, text: name }).expect(201);
        const three = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        await t.http.delete(`${lore}/${three.lore[0].id}`).expect(200);
        await t.http.delete(`${lore}/${three.lore[1].id}`).expect(200);
        const after = (await t.http.post(lore).send({ name: 'D', text: 'D' }).expect(201)).body as Story;
        expect(after.lore.map((e) => e.name)).toEqual(['C', 'D']);
    });

    it('copies the Lore with Duplicate Story', async () => {
        const storyId = await playableStory();
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.', alwaysOn: true }).expect(201);
        const copy = (await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201)).body as Story;
        expect(copy.lore).toEqual([{ id: expect.any(Number), name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.', alwaysOn: true }]);
        const original = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        expect(copy.lore[0].id).not.toBe(original.lore[0].id);
    });
});

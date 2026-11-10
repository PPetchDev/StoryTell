import {
    chosenLore,
    LoreMessage,
    loreReserveTokens,
    loreScanAt,
    mentions,
    PromptLoreEntry,
    selectLoreAt,
} from '../src/manager/chat/lore/lore-select.js';
import { buildSuggestionsPrompt } from '../src/manager/chat/suggestions/suggestions-prompt.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { buildWriteForMePrompt } from '../src/manager/chat/write-for-me/write-for-me-prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { startTestApp, TestApp } from './harness/test-app.js';

let nextId = 1;
function entry(fields: Partial<PromptLoreEntry> & { name: string }): PromptLoreEntry {
    return { id: nextId++, keywords: [], text: `About ${fields.name}.`, alwaysOn: false, ...fields };
}

const ai = (text: string): LoreMessage => ({ role: 'assistant', text });
const user = (text: string): LoreMessage => ({ role: 'user', text });

/** The names chosen at the point after `messages`, in the block's order. */
function chosenNames(entries: PromptLoreEntry[], messages: LoreMessage[], options?: Parameters<typeof selectLoreAt>[2]): string[] {
    return chosenLore(selectLoreAt(entries, messages, options)).map((chosen) => chosen.name);
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
        expect(chosenNames([tent, well], [ai('I step into the tent.')])).toEqual(['Tent']);
        expect(chosenNames([tent, well], [ai('Bring water.')])).toEqual(['The well']);
        expect(chosenNames([tent, well], [ai('Nothing here.')])).toEqual([]);
    });

    it('puts Always include first, then the most recently mentioned, position breaking ties', () => {
        const law = entry({ name: 'Law', alwaysOn: true });
        const old = entry({ name: 'Old road' });
        const river = entry({ name: 'River' });
        const hill = entry({ name: 'Hill' });
        const messages = [ai('Past the old road.'), ai('We cross the river by the hill.')];
        expect(chosenNames([old, river, hill, law], messages)).toEqual(['Law', 'River', 'Hill', 'Old road']);
    });

    it('never sends an entry with blank text, even an Always include one', () => {
        const selection = selectLoreAt([entry({ name: 'Empty', text: '  ', alwaysOn: true }), entry({ name: 'Blank', text: '' })], [ai('Blank')]);
        expect(selection).toEqual({ chosen: [], leftOut: [] });
    });

    it('keeps under the cap, leaving out with noRoom an entry that does not fit while still trying the rest', () => {
        const big = entry({ name: 'Big', text: 'x'.repeat(400) });
        const small = entry({ name: 'Small', text: 'Short.' });
        const selection = selectLoreAt([big, small], [ai('Big and Small')], { cap: 60 });
        expect(chosenLore(selection).map((e) => e.name)).toEqual(['Small']);
        expect(selection.leftOut).toEqual([{ entry: big, why: { kind: 'noRoom' } }]);
    });

    it('scans after a user Message that Message and the 4 before it; after an AI Message the 4 before the point', () => {
        const before = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].map(ai);
        expect(loreScanAt([...before, user('new')])).toEqual(['new', 'm6', 'm5', 'm4', 'm3']);
        expect(loreScanAt(before)).toEqual(['m6', 'm5', 'm4', 'm3']);

        const m2 = entry({ name: 'm2' });
        const m3 = entry({ name: 'm3' });
        expect(chosenNames([m2, m3], [...before, user('new')])).toEqual(['m3']);
        expect(chosenNames([m2, m3], before)).toEqual(['m3']);
        expect(chosenNames([m2, m3], before.slice(0, 5))).toEqual(['m3', 'm2']);
    });

    it("scans a Snapshot's hint, then the 6 Messages ending with the one it shows", () => {
        const upToMoment = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7'].map(ai);
        const [m1, m2, lantern] = [entry({ name: 'm1' }), entry({ name: 'm2' }), entry({ name: 'lantern' })];
        expect(loreScanAt(upToMoment, 6)).toEqual(['m7', 'm6', 'm5', 'm4', 'm3', 'm2']);
        expect(chosenNames([m1, m2, lantern], upToMoment, { extraScan: 'a lantern glows', scanLength: 6 })).toEqual(['lantern', 'm2']);
        // The turn window at the same point reaches m4 at most.
        expect(chosenNames([m1, m2, lantern], upToMoment)).toEqual([]);
    });

    it('says why each entry is in: always, or came up with the trigger and how many Messages back', () => {
        const law = entry({ name: 'Law', alwaysOn: true });
        const tent = entry({ name: 'Tents', keywords: ['yurt'] });
        const salt = entry({ name: 'Salt' });
        const selection = selectLoreAt([tent, salt, law], [ai('Salt is dear.'), ai('Rain.'), ai('A YURT stands.'), user('I wait.')]);
        expect(selection.chosen).toEqual([
            { entry: law, why: { kind: 'always' } },
            { entry: tent, why: { kind: 'cameUp', trigger: 'yurt', messagesAgo: 1 } },
            { entry: salt, why: { kind: 'cameUp', trigger: 'Salt', messagesAgo: 3 } },
        ]);
        expect(selection.leftOut).toEqual([]);
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

    it('opens the trailing system message with the chosen Lore, in the order handed in, before the reminder', () => {
        const prompt = buildTurnPrompt(input({ lore: [tent, salt], chosenLore: [salt, tent] }));
        const last = prompt.messages.at(-1)!;
        expect(last.role).toBe('system');
        expect(last.content.startsWith('# Lore (facts of this world that matter right now: common knowledge')).toBe(true);
        expect(last.content.indexOf('## Salt\nSalt is money here.')).toBeLessThan(last.content.indexOf('## Tents\nRound felt tents with a smoke hole.'));
        expect(last.content.indexOf('## Salt')).toBeGreaterThan(0);
        expect(last.content.indexOf('# Lore')).toBeLessThan(last.content.indexOf('Where things stand:'));
    });

    it('carries only the chosen entries: the builders choose nothing themselves', () => {
        // The user's text mentions the yurt, but nothing was chosen: no block.
        const prompt = buildTurnPrompt(input({ lore: [tent, salt], userText: 'I enter the yurt.', chosenLore: [] }));
        expect(prompt.messages.at(-1)!.content.startsWith('Where things stand:')).toBe(true);
        expect(prompt.messages.map((message) => message.content).join('\n')).not.toContain('Round felt tents');
    });

    it('gives Suggested replies and Write for me only the chosen entries: neither scans the history itself', () => {
        const yurt = entry({ name: 'Tent', keywords: ['yurt'], text: 'Round felt tents.' });
        // The history mentions the yurt, but nothing was chosen: no block in either prompt.
        const history = [
            { role: 'assistant' as const, text: '@Nara: Sleep in my yurt.' },
            { role: 'user' as const, text: 'The yurt, then.' },
        ];
        const suggestions = buildSuggestionsPrompt({ ...input({ lore: [yurt], chosenLore: [] }), history });
        const written = buildWriteForMePrompt({ ...input({ lore: [yurt], chosenLore: [] }), history, draft: 'Into the yurt.' });
        for (const prompt of [suggestions, written]) {
            expect(prompt.messages.map((message) => message.content).join('\n')).not.toContain('Round felt tents');
        }
        // Handed in, it is there.
        const chosen = buildWriteForMePrompt({ ...input({ lore: [yurt], chosenLore: [yurt] }), history, draft: '' });
        expect(chosen.messages.at(-1)!.content).toContain('Round felt tents');
    });

    it('leaves the system message, and with it the cached prefix, exactly as without Lore', () => {
        const without = buildTurnPrompt(input());
        const withLore = buildTurnPrompt(input({ lore: [tent, salt], chosenLore: [tent] }));
        expect(withLore.messages[0]).toEqual(without.messages[0]);
        expect(without.messages.at(-1)!.content.startsWith('Where things stand:')).toBe(true);
    });

    it('gives Suggested replies the chosen Lore before their instruction', () => {
        const history = [{ role: 'assistant' as const, text: '@Nara: Pay in salt.' }];
        const prompt = buildSuggestionsPrompt({ ...input({ lore: [tent, salt], chosenLore: [salt] }), history });
        const last = prompt.messages.at(-1)!.content;
        expect(last).toContain('Salt is money here.');
        expect(last).not.toContain('Round felt tents');
        expect(last.indexOf('# Lore')).toBeLessThan(last.indexOf('Step outside the story'));
        const without = buildSuggestionsPrompt({ ...input(), history });
        expect(prompt.messages[0]).toEqual(without.messages[0]);
    });
});

/** Every trigger setting at its default (.scratch/lore-triggers/spec.md: "The Lore entry"): what an entry answers with until the author tunes it. */
const TRIGGER_DEFAULTS = { secondaryKeywords: [], secondaryMode: 'alsoNeeds', patterns: [], recursable: true, sticky: 0, cooldown: 0, delay: 0, chance: 100, group: '' };

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
        expect(added.lore).toEqual([{ id: expect.any(Number), name: 'Tents', keywords: ['yurt', 'กระโจม'], text: 'Round felt tents.', alwaysOn: false, ...TRIGGER_DEFAULTS }]);
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
        expect(after.body).toEqual({
            entries: [
                { id: expect.any(Number), name: 'Sky law', alwaysOn: true, chance: 100, why: { kind: 'always' } },
                // As a Continue reads it: the reply is the newest scanned Message.
                { id: expect.any(Number), name: 'Tents', alwaysOn: false, chance: 100, why: { kind: 'cameUp', trigger: 'yurt', messagesAgo: 0 } },
            ],
            leftOut: [],
        });
    });

    it('lists in Lore in play an entry that came up but did not fit under the cap, with noRoom', async () => {
        const storyId = await playableStory();
        // About 1,250 tokens each: the first to come up fits, the second can't.
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Tents', text: 'Felt. '.repeat(830) }).expect(201);
        await t.http.post(`/api/stories/${storyId}/lore`).send({ name: 'Traveller', text: 'Dust. '.repeat(830) }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as { id: number };

        t.gateway.scriptText('turn', '@Nara: The tents are full tonight.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'I look around.' }).expect(201);
        await settle(storyId, chat.id);

        const inPlay = await t.http.get(`/api/stories/${storyId}/chats/${chat.id}/lore`).expect(200);
        expect(inPlay.body).toEqual({
            entries: [{ id: expect.any(Number), name: 'Tents', alwaysOn: false, chance: 100, why: { kind: 'cameUp', trigger: 'Tents', messagesAgo: 0 } }],
            // The Opening, 2 Messages back, calls the user "traveller".
            leftOut: [{ id: expect.any(Number), name: 'Traveller', why: { kind: 'noRoom' } }],
        });
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
            { id: expect.any(Number), name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.', alwaysOn: true, ...TRIGGER_DEFAULTS },
            { id: expect.any(Number), name: 'The well', keywords: ['water'], text: 'One well for the whole camp.', alwaysOn: false, ...TRIGGER_DEFAULTS },
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
        expect(story.lore[0]).toEqual({ id: expect.any(Number), name: 'Place 1', keywords: ['p1'], text: 'About place 1.', alwaysOn: false, ...TRIGGER_DEFAULTS });
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
        expect(copy.lore).toEqual([{ id: expect.any(Number), name: 'Tents', keywords: ['yurt'], text: 'Round felt tents.', alwaysOn: true, ...TRIGGER_DEFAULTS }]);
        const original = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body as Story;
        expect(copy.lore[0].id).not.toBe(original.lore[0].id);
    });
});

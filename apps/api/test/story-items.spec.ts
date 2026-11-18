import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DetailKind } from '../src/model/ledger/entities/detail-change.entity.js';
import {
    applyItems,
    ChatItem,
    currentItems,
    itemKey,
    itemsBlock,
    ITEMS_EXTRA_TOKENS,
    ITEMS_MAX,
    ITEMS_PER_TURN,
    ITEMS_SHAPE,
    itemsState,
    itemValue,
    judgeItemsSection,
    readJudgedItems,
    readJudgedItemsFrom,
    removedItemValue,
    userItemChange,
    withItemsJudge,
} from '../src/manager/chat/details/items.js';
import { judgeFactsSection } from '../src/manager/chat/details/facts.js';
import { buildJudgePrompt } from '../src/manager/chat/judge/judge-prompt.js';
import { judgeRollOfferSection } from '../src/manager/chat/roll-offer/roll-offer.js';
import { withAiEvents } from '../src/manager/chat/sudden-event/ai-events.js';
import { buildTurnPrompt, PromptHistoryMessage, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { storySoFarCoverage } from '../src/manager/chat/story-so-far/story-so-far-prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';
import { trailingOf } from './harness/prompt-layers.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Items (.scratch/story-items/spec.md): the things a Chat's story keeps track of, who holds each
 * and how it came to them, until it is used up, lost or destroyed. The Judge gives the changes, the
 * code decides; the Narrator reads them after the Established facts; the user edits them.
 */

const judgeItem = (item: Partial<ChatItem> & { name: string }, messageId = 7) => ({
    kind: DetailKind.Item,
    value: itemValue({ holder: '', how: '', end: null, ...item }),
    messageId,
});
const userItem = (item: Partial<ChatItem> & { name: string }) => ({ ...judgeItem(item), messageId: null });

const KEY: ChatItem = { name: 'the brass key', holder: '{user}', how: 'found in the well', end: null };
const RING: ChatItem = { name: "Nara's ring", holder: 'Nara', how: 'given by Petch', end: null };
const LETTER: ChatItem = { name: 'the letter', holder: '{user}', how: 'burned in the hearth', end: 'destroyed' };
const CONTEXT = { identityName: 'Petch', cast: ['Nara', 'Tavri'] };

describe('Items: what stands (pure)', () => {
    it('keeps the newest record of each, matched loosely, in the order first recorded, with whose each is', () => {
        const state = itemsState([
            judgeItem({ name: 'The brass key', holder: '{user}', how: 'found in the well' }),
            judgeItem({ name: "Nara's ring", holder: '{user}', how: 'bought at the market' }),
            judgeItem({ name: "NARA'S RING", holder: 'Nara', how: 'given by Petch' }, 9),
            userItem({ name: 'brass key', holder: 'Tavri', how: 'lent by Petch' }),
            { kind: DetailKind.Fact, value: 'Not an item: no', messageId: 7 },
            { kind: DetailKind.Item, value: 'not json', messageId: 7 },
        ]);
        expect(state.items).toEqual([
            { name: 'The brass key', holder: 'Tavri', how: 'lent by Petch', end: null, byUser: true },
            { name: "Nara's ring", holder: 'Nara', how: 'given by Petch', end: null, byUser: false },
        ]);
        expect(state.clearedByUser).toEqual([]);
    });

    it('keeps a gone Item as gone, and remembers one the user deleted until something records it again', () => {
        const ended = currentItems([judgeItem({ name: 'the letter', holder: '{user}', how: 'from Nara' }), judgeItem({ name: 'the letter', holder: '{user}', how: 'burned in the hearth', end: 'destroyed' })]);
        expect(ended).toEqual([LETTER]);
        const deleted = itemsState([judgeItem({ name: 'the letter', holder: '{user}' }), { kind: DetailKind.Item, value: removedItemValue('the letter'), messageId: null }]);
        expect(deleted.items).toEqual([]);
        expect(deleted.clearedByUser).toEqual([itemKey('the letter')]);
        const again = itemsState([{ kind: DetailKind.Item, value: removedItemValue('the letter'), messageId: null }, judgeItem({ name: 'Letter', holder: 'Nara' })]);
        expect(again.clearedByUser).toEqual([]);
        expect(itemKey('An  Old-Map!')).toBe('old map');
    });
});

describe('Items: what the Judge is asked, and how its answer is read (pure)', () => {
    it('reads the answer loosely', () => {
        expect(readJudgedItems([{ item: ' the key ', holder: 'Nara', how: 'given', end: 'Used up' }, { item: '' }, 'x', { item: 'map', end: 'eaten' }])).toEqual([
            { item: 'the key', holder: 'Nara', how: 'given', end: 'used' },
            { item: 'map', holder: '', how: '', end: null },
        ]);
        expect(readJudgedItems(null)).toEqual([]);
        expect(readJudgedItemsFrom('Sure: {"bond_changes":[],"items":[{"item":"ring","holder":"user","end":null}]}')).toEqual([{ item: 'ring', holder: 'user', how: '', end: null }]);
        expect(readJudgedItemsFrom('no json')).toEqual([]);
        expect(readJudgedItemsFrom('{"items": oops}')).toEqual([]);
    });

    it('lists the Items held and gone, with the user as "user", then the rule', () => {
        const section = judgeItemsSection([KEY, RING, LETTER]);
        expect(section.startsWith(`# Items\n- the brass key: held by user, found in the well\n- Nara's ring: held by Nara, given by Petch\nGone:\n- the letter: destroyed, burned in the hearth\nItems rule:`)).toBe(true);
        expect(section).toContain('"items": [{"item": "...", "holder": "...", "how": "...", "end": null}]');
        expect(section).toContain('never what someone plans, offers or asks for');
        expect(section).toContain(`at most ${ITEMS_PER_TURN} a turn`);
        expect(judgeItemsSection([])).toMatch(/^# Items\n\(none yet\)\nItems rule:/);
    });

    it('names the field in the system message on every call, so it stays byte for byte the same; the section goes last in the user message', () => {
        const input = { ...JUDGE_FIXTURE_INPUTS[0], factsSection: judgeFactsSection([]) };
        const plain = buildJudgePrompt(input);
        const none = withItemsJudge(plain, judgeItemsSection([]));
        const some = withItemsJudge(plain, judgeItemsSection([KEY, RING, LETTER]));
        // Byte-identical system message whatever the Items, so the prompt cache holds.
        expect(some.messages[0].content).toBe(none.messages[0].content);
        expect(none.messages[0].content).toBe(plain.messages[0].content.replace(/\}\nEmpty arrays when nothing changed\.$/, `,\n ${ITEMS_SHAPE}}\nEmpty arrays when nothing changed.`));
        expect(none.messages[0].content).toContain(' "roll_offer":null,\n "items":[{"item":"...","holder":"...","how":"...","end":null}]}\nEmpty arrays when nothing changed.');
        // What changes is in the closing user message, after everything the Judge already read.
        expect(some.messages[1].content).toBe(`${plain.messages[1].content}\n\n${judgeItemsSection([KEY, RING, LETTER])}`);
        expect(some.maxTokens).toBe(plain.maxTokens + ITEMS_EXTRA_TOKENS);

        // With a Roll offer, Expressions and made-up events: still one system message per kind of call.
        const offering = withItemsJudge(buildJudgePrompt({ ...input, rollOfferSection: judgeRollOfferSection([]) }), judgeItemsSection([KEY]));
        expect(offering.messages[0].content).toBe(none.messages[0].content);
        expect(offering.messages[1].content.endsWith(`\n\n${judgeItemsSection([KEY])}`)).toBe(true);
        const parts = [{ kind: 'speech' as const, characterId: 1, speakerName: 'Mira', text: 'Better.' }];
        const tagged = withItemsJudge(buildJudgePrompt({ ...input, expressionParts: parts }), judgeItemsSection([]));
        expect(tagged.messages[0].content).toContain('"expressions":[{"line":1,"emotion":"joy"}],\n "facts"');
        expect(tagged.messages[0].content).toContain(`"roll_offer":null,\n ${ITEMS_SHAPE}}`);
        const events = withAiEvents(some, { on: true, offered: true });
        expect(events.messages[0].content).toContain(`,\n ${ITEMS_SHAPE},\n "new_event":null}\nEmpty arrays when nothing changed.\n`);
        expect(events.messages[0].content).toBe(withAiEvents(none, { on: true, offered: false }).messages[0].content);
    });

    it('leaves the golden fixture as it was: buildJudgePrompt alone sends what it did', () => {
        const recorded = JSON.parse(
            readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/judge/prompts-before-expressions.json'), 'utf8'),
        ) as unknown[];
        expect(JUDGE_FIXTURE_INPUTS.map((input) => buildJudgePrompt(input))).toEqual(recorded);
        for (const input of JUDGE_FIXTURE_INPUTS) expect(buildJudgePrompt(input).messages[0].content).not.toContain('"items"');
    });
});

describe('Items: what the code takes from the Judge (pure)', () => {
    const apply = (judged: Parameters<typeof applyItems>[1], extra: Partial<Parameters<typeof applyItems>[0]> = {}) =>
        applyItems({ current: [KEY, RING, LETTER], ...CONTEXT, ...extra }, judged);
    const value = (item: ChatItem) => ({ kind: DetailKind.Item, characterId: null, value: itemValue(item) });

    it('takes a new Item, a change of hands and an end, the user by any name and a Character as the cast writes them', () => {
        const { changes, rejected } = apply([
            { item: 'A silver coin', holder: 'Petch', how: 'paid by Tavri.', end: null },
            { item: 'The Brass Key', holder: 'nara', how: 'given by Petch', end: null },
            { item: "Nara's ring", holder: '', how: 'dropped in the river', end: 'lost' },
        ]);
        expect(rejected).toEqual([]);
        expect(changes).toEqual([
            value({ name: 'A silver coin', holder: '{user}', how: 'paid by Tavri', end: null }),
            value({ name: 'the brass key', holder: 'Nara', how: 'given by Petch', end: null }),
            value({ name: "Nara's ring", holder: 'Nara', how: 'dropped in the river', end: 'lost' }),
        ]);
        // Someone else, or somewhere, in a few words.
        expect(apply([{ item: 'map', holder: 'the innkeeper', how: 'sold to him', end: null }]).changes).toEqual([value({ name: 'map', holder: 'the innkeeper', how: 'sold to him', end: null })]);
        expect(apply([{ item: 'map', holder: 'you', how: '', end: null }]).changes[0].value).toContain('"holder":"{user}"');
    });

    it('keeps gone gone: a used-up or destroyed Item never comes back, a lost one is found again', () => {
        const back = apply([{ item: 'the letter', holder: 'user', how: 'still in the coat', end: null }]);
        expect(back.changes).toEqual([]);
        expect(back.rejected).toEqual(['Item "the letter": it was destroyed, and gone stays gone']);
        const lost: ChatItem = { ...RING, end: 'lost', how: 'dropped in the river' };
        const found = applyItems({ current: [lost], ...CONTEXT }, [{ item: "Nara's ring", holder: 'Tavri', how: 'fished out of the river', end: null }]);
        expect(found.changes).toEqual([value({ name: "Nara's ring", holder: 'Tavri', how: 'fished out of the river', end: null })]);
    });

    it('drops what is no change, a new Item with no holder or that ends as it comes, and a second change to one Item', () => {
        const { changes, rejected } = apply([
            { item: 'the brass key', holder: 'Petch', how: 'found in the old well', end: null },
            { item: 'a candle', holder: 'user', how: 'lit', end: 'used' },
            { item: 'a rope', holder: '', how: '', end: null },
            { item: "Nara's ring", holder: '', how: '', end: null },
            { item: "Nara's ring", holder: 'Tavri', how: 'stolen', end: null },
            { item: "nara's ring", holder: 'Petch', how: 'taken back', end: null },
        ]);
        expect(changes).toEqual([value({ name: "Nara's ring", holder: 'Tavri', how: 'stolen', end: null })]);
        expect(rejected).toEqual([
            'Item "the brass key": still held by {user}, unchanged',
            'Item "a candle": ended as it came, not kept',
            'Item "a rope": no holder',
            'Item "Nara\'s ring": no holder and no end, nothing changed',
            'Item "Nara\'s ring": a second change in one turn',
        ]);
    });

    it('holds to the caps: so many a turn, and so many held', () => {
        const many = Array.from({ length: ITEMS_PER_TURN + 1 }, (_, i) => ({ item: `Thing ${i}`, holder: 'Nara', how: '', end: null }));
        const turn = apply(many);
        expect(turn.changes).toHaveLength(ITEMS_PER_TURN);
        expect(turn.rejected).toEqual([`Item "Thing ${ITEMS_PER_TURN}": more than ${ITEMS_PER_TURN} in one turn`]);
        const full = Array.from({ length: ITEMS_MAX }, (_, i): ChatItem => ({ name: `Thing ${i}`, holder: 'Nara', how: '', end: null }));
        const capped = applyItems({ current: full, ...CONTEXT }, [
            { item: 'Thing 3', holder: '', how: 'burned', end: 'destroyed' },
            { item: 'One more', holder: 'Nara', how: '', end: null },
            { item: 'Thing 4', holder: 'Tavri', how: 'given', end: null },
        ]);
        // Ending one makes room in the same turn; a change of hands is always taken.
        expect(capped.changes.map((change) => JSON.parse(change.value).name)).toEqual(['Thing 3', 'One more', 'Thing 4']);
        const stillFull = applyItems({ current: full, ...CONTEXT }, [{ item: 'One more', holder: 'Nara', how: '', end: null }]);
        expect(stillFull.rejected).toEqual([`Item "One more": ${ITEMS_MAX} are held already`]);
    });

    it("keeps an Item the user deleted deleted, unless the user's own words name it", () => {
        const cleared = [itemKey('the silver locket')];
        const judged = [{ item: 'the silver locket', holder: 'Nara', how: 'found', end: null }];
        expect(apply(judged, { clearedByUser: cleared, userText: 'What is that?' }).rejected).toEqual([
            'Item "the silver locket": the user deleted it, and their words do not name it',
        ]);
        expect(apply(judged, { clearedByUser: cleared, userText: 'Is that my silver locket?' }).changes).toHaveLength(1);
    });
});

describe('Items: the user\'s own change (pure)', () => {
    const current = [KEY, RING, LETTER];

    it('adds, changes, ends and deletes, a listed name keeping its wording', () => {
        expect(userItemChange(current, { name: ' A map. ', holder: 'Tavri', how: 'drawn by Nara' }, CONTEXT)).toEqual({
            value: itemValue({ name: 'A map', holder: 'Tavri', how: 'drawn by Nara', end: null }),
        });
        expect(userItemChange(current, { name: 'Brass key', holder: '{user}', how: 'given back by Nara' }, CONTEXT)).toEqual({
            value: itemValue({ ...KEY, how: 'given back by Nara' }),
        });
        expect(userItemChange(current, { name: "nara's ring", how: 'melted down', end: 'destroyed' }, CONTEXT)).toEqual({
            value: itemValue({ ...RING, how: 'melted down', end: 'destroyed' }),
        });
        expect(userItemChange(current, { name: 'the LETTER', remove: true }, CONTEXT)).toEqual({ value: removedItemValue('the letter') });
    });

    it('writes nothing for what is already so, and refuses no name, no holder or one past the cap', () => {
        expect(userItemChange(current, { name: 'the brass key', holder: 'Petch', how: 'found in the well' }, CONTEXT)).toBe('unchanged');
        expect(userItemChange(current, { name: 'a rope', remove: true }, CONTEXT)).toBe('unchanged');
        expect(userItemChange(current, { name: ' ?! ', holder: 'Nara' }, CONTEXT)).toBe('no-name');
        expect(userItemChange(current, { name: 'a rope', holder: '  ' }, CONTEXT)).toBe('no-holder');
        const full = Array.from({ length: ITEMS_MAX }, (_, i): ChatItem => ({ name: `Thing ${i}`, holder: 'Nara', how: '', end: null }));
        expect(userItemChange(full, { name: 'One more', holder: 'Nara' }, CONTEXT)).toBe('full');
        expect(userItemChange([...full, LETTER], { name: 'the letter', holder: 'Nara' }, CONTEXT)).toBe('full');
        // A change of hands, or an end, is always taken.
        expect(userItemChange(full, { name: 'Thing 1', holder: 'Tavri' }, CONTEXT)).not.toBe('full');
        expect(userItemChange(full, { name: 'Thing 1', end: 'lost' }, CONTEXT)).not.toBe('full');
    });
});

function turnInput(history: PromptHistoryMessage[], overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A summer market.',
            pov: Pov.First,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Petch', description: 'A trader.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        history,
        userText: 'I wait.',
        authorsNote: 'Slow burn.',
        ...overrides,
    };
}

describe('Items: what the Narrator reads (pure)', () => {
    it('lists who has what, the five gone most recently, then one sentence; nothing with no Items', () => {
        expect(itemsBlock([], 'Petch')).toBeNull();
        expect(itemsBlock(null, 'Petch')).toBeNull();
        expect(itemsBlock([KEY, RING, LETTER], 'Petch')).toBe(
            [
                '# Items (who has what now; where the Story so far or an earlier reply says otherwise, this wins)',
                '- the brass key: Petch has it, found in the well',
                "- Nara's ring: Nara has it, given by Petch",
                'Gone, so no one has them: the letter (destroyed, burned in the hearth)',
                'Only whoever has a thing can use, show or give it, and a thing that is gone stays gone.',
            ].join('\n'),
        );
        const gone = Array.from({ length: 7 }, (_, i): ChatItem => ({ name: `Thing ${i}`, holder: 'Nara', how: '', end: 'used' }));
        const line = itemsBlock(gone, 'Petch')!.split('\n')[1];
        expect(line).toBe('Gone, so no one has them: Thing 6 (used up); Thing 5 (used up); Thing 4 (used up); Thing 3 (used up); Thing 2 (used up)');
    });

    it('goes in the closing message right after the Established facts and before "Where things stand", never in the system message', () => {
        const prompt = buildTurnPrompt(turnInput([], { facts: { facts: [{ topic: "Nara's age", fact: 'twenty-six' }], slips: [] }, items: [KEY, RING] }));
        const trailing = trailingOf(prompt);
        const facts = trailing.indexOf('# Established facts (');
        const items = trailing.indexOf('# Items (');
        const where = trailing.indexOf('Where things stand:');
        expect(facts).toBeGreaterThanOrEqual(0);
        expect(items).toBeGreaterThan(facts);
        expect(where).toBeGreaterThan(items);
        expect(prompt.messages[0].content).not.toContain('# Items');
        // Without Items the closing message is as it was.
        expect(buildTurnPrompt(turnInput([], { items: [] }))).toEqual(buildTurnPrompt(turnInput([])));
        // Without facts, it follows the Author's note; without that too, it opens the trailing blocks.
        expect(trailingOf(buildTurnPrompt(turnInput([], { items: [KEY] })))).toContain('does.\n\n# Items (who has what now');
        expect(trailingOf(buildTurnPrompt(turnInput([], { items: [KEY], authorsNote: null }))).startsWith('# Items (who has what now')).toBe(true);
    });

    it('lets the Story so far trigger reserve room for the Items', () => {
        const long: PromptHistoryMessage[] = Array.from({ length: 60 }, (_, i) => ({ role: i % 2 ? 'user' : 'assistant', text: 'word '.repeat(200) }));
        const items = Array.from({ length: ITEMS_MAX }, (_, i): ChatItem => ({ name: `A thing of some name ${i}`, holder: 'Nara', how: 'given by Petch at the market', end: null }));
        const { history: _history, userText: _userText, ...layers } = turnInput([]);
        expect(storySoFarCoverage({ ...layers, items }, long, 12_000)).toBeGreaterThan(storySoFarCoverage(layers, long, 12_000) ?? 0);
    });
});

const NO_OPS = '{"operations":[]}';
const judged = (extra: Record<string, unknown> = {}) => JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...extra });

interface ChatBody {
    items: Array<{ name: string; holder: string; how: string; end: string | null; byUser: boolean }>;
    messages: Array<{ id: number; kind: string; judge?: { status: string }; memory?: { status: string } }>;
}

describe('Items through the API (HTTP)', () => {
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

    async function createChat(): Promise<{ storyId: number; chatId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Market' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer market.', opening: '@Nara: Peaches?' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A trader.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short.' }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body;
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}`).send({ characterThoughts: false }).expect(200);
        return { storyId, chatId: chat.id as number };
    }

    async function settled(storyId: number, chatId: number): Promise<ChatBody> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as ChatBody;
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function play(storyId: number, chatId: number, reply: string, judgement: string, text = 'Well?'): Promise<ChatBody> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', judgement);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    async function regenerate(storyId: number, chatId: number, messageId: number, reply: string, judgement: string): Promise<ChatBody> {
        t.gateway.scriptText('turn', reply);
        t.gateway.scriptText('judge', judgement);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${messageId}/regenerate`).expect(200);
        return settled(storyId, chatId);
    }

    const setItem = (storyId: number, chatId: number, body: Record<string, unknown>, status = 200) =>
        t.http.put(`/api/stories/${storyId}/chats/${chatId}/items`).send(body).expect(status);

    it("records the Judge's Items, shows them, and the next turn and Judge read them; Regenerate takes them back", async () => {
        const { storyId, chatId } = await createChat();
        expect(((await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as ChatBody).items).toEqual([]);
        // The first judgement is asked with "(none yet)" and the shape already on its system message.
        const first = await play(
            storyId,
            chatId,
            '@Nara: Take it. My mother’s ring.',
            judged({ items: [{ item: "Nara's mother's ring", holder: 'user', how: 'given by Nara', end: null }] }),
            'I hold out my hand.',
        );
        const firstJudge = t.gateway.textCalls('judge').at(-1)!;
        expect(firstJudge.messages[0].content).toContain(ITEMS_SHAPE);
        expect(firstJudge.messages.at(-1)!.content).toContain('# Items\n(none yet)\nItems rule:');
        expect(first.items).toEqual([{ name: "Nara's mother's ring", holder: '{user}', how: 'given by Nara', end: null, byUser: false }]);

        // The user gives it back; the next turn reads who has it, and the Judge sees it listed.
        const second = await play(
            storyId,
            chatId,
            '@Nara: You give it back? Fine.',
            judged({ items: [{ item: "nara's mother's ring", holder: 'Nara', how: 'given back by Petch', end: null }, { item: 'a letter', holder: 'Petch', how: 'from the courier', end: null }] }),
            'I press the ring back into her palm.',
        );
        const secondJudge = t.gateway.textCalls('judge').at(-1)!;
        expect(secondJudge.messages[0].content).toBe(firstJudge.messages[0].content);
        expect(secondJudge.messages.at(-1)!.content).toContain("# Items\n- Nara's mother's ring: held by user, given by Nara\nItems rule:");
        expect(second.items.map(({ name, holder }) => [name, holder])).toEqual([
            ["Nara's mother's ring", 'Nara'],
            ['a letter', '{user}'],
        ]);

        // Regenerate the reply whose Judge handed the ring back: its changes go with it.
        const undone = await regenerate(storyId, chatId, second.messages.at(-1)!.id, '@Nara: Hm.', judged());
        expect(undone.items).toEqual([{ name: "Nara's mother's ring", holder: '{user}', how: 'given by Nara', end: null, byUser: false }]);
        const again = await regenerate(
            storyId,
            chatId,
            second.messages.at(-1)!.id,
            '@Nara: Fine.',
            judged({ items: [{ item: "Nara's mother's ring", holder: 'Nara', how: 'given back by Petch', end: null }, { item: 'a letter', holder: 'Petch', how: 'from the courier', end: null }] }),
        );
        expect(again.items).toHaveLength(2);

        // The next turn reads who has what, in the user's worn name.
        await play(storyId, chatId, '@Nara: Read it.', judged(), 'I open it.');
        const turn = trailingOf(t.gateway.textCalls('turn').at(-1)!);
        expect(turn).toContain("- Nara's mother's ring: Nara has it, given back by Petch");
        expect(turn).toContain('- a letter: Petch has it, from the courier');
    });

    it('takes back an Item change with the reply that made it', async () => {
        const { storyId, chatId } = await createChat();
        await play(storyId, chatId, '@Nara: A gift.', judged({ items: [{ item: 'a peach knife', holder: 'user', how: 'given by Nara', end: null }] }));
        const burned = await play(storyId, chatId, '@Nara: You broke it!', judged({ items: [{ item: 'a peach knife', holder: '', how: 'snapped on a stone', end: 'destroyed' }] }));
        expect(burned.items).toEqual([{ name: 'a peach knife', holder: '{user}', how: 'snapped on a stone', end: 'destroyed', byUser: false }]);
        // A later reply that has the user holding it again is dropped: gone stays gone.
        const later = await play(storyId, chatId, '@Nara: Your knife is in your belt.', judged({ items: [{ item: 'a peach knife', holder: 'user', how: 'in the belt', end: null }] }));
        expect(later.items[0].end).toBe('destroyed');
        expect(trailingOf(t.gateway.textCalls('turn').at(-1)!)).toContain('Gone, so no one has them: a peach knife (destroyed, snapped on a stone)');
        const undone = await regenerate(storyId, chatId, later.messages.at(-1)!.id, '@Nara: Hm.', judged());
        expect(undone.items[0].end).toBe('destroyed');
        // Edit the User Message before the reply that broke it: that reply goes, and its end with it.
        t.gateway.scriptText('turn', '@Nara: Thank you.');
        t.gateway.scriptText('judge', judged());
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.patch(`/api/stories/${storyId}/chats/${chatId}/messages/${burned.messages.at(-2)!.id}`).send({ text: 'I hand it back.' }).expect(200);
        const after = await settled(storyId, chatId);
        expect(after.items).toEqual([{ name: 'a peach knife', holder: '{user}', how: 'given by Nara', end: null, byUser: false }]);
    });

    it('lets the user add, edit, end and delete Items; their change survives Regenerate and a deleted one stays deleted', async () => {
        const { storyId, chatId } = await createChat();
        const played = await play(storyId, chatId, '@Nara: Here, the key.', judged({ items: [{ item: 'the brass key', holder: 'user', how: 'given by Nara', end: null }] }));
        // Writing what is there writes nothing: it stays the Judge's.
        expect((await setItem(storyId, chatId, { name: 'The brass key', holder: '{user}', how: 'given by Nara' })).body.items[0].byUser).toBe(false);
        // Give it to Nara, by name in any case.
        expect((await setItem(storyId, chatId, { name: 'brass key', holder: 'nara', how: 'lent back' })).body.items).toEqual([
            { name: 'the brass key', holder: 'Nara', how: 'lent back', end: null, byUser: true },
        ]);
        // Add one, then mark it gone.
        await setItem(storyId, chatId, { name: 'A lantern', holder: 'you', how: 'bought at the market' });
        const ended = (await setItem(storyId, chatId, { name: 'a lantern', how: 'oil burned out', end: 'used' })).body as ChatBody;
        expect(ended.items[1]).toEqual({ name: 'A lantern', holder: '{user}', how: 'oil burned out', end: 'used', byUser: true });

        // Regenerate the reply whose Judge recorded the key: the user's own records stay.
        const regenerated = await regenerate(storyId, chatId, played.messages.at(-1)!.id, '@Nara: Well.', judged());
        expect(regenerated.items.map((item) => [item.name, item.holder, item.end])).toEqual([
            ['the brass key', 'Nara', null],
            ['A lantern', '{user}', 'used'],
        ]);

        // Deleted, it is gone, and a reply naming it does not bring it back unless the user's words do.
        expect((await setItem(storyId, chatId, { name: 'the lantern', remove: true })).body.items.map((item: { name: string }) => item.name)).toEqual(['the brass key']);
        const again = await play(storyId, chatId, '@Nara: Your lantern?', judged({ items: [{ item: 'a lantern', holder: 'user', how: 'found', end: null }] }));
        expect(again.items.map((item) => item.name)).toEqual(['the brass key']);
        const said = await play(storyId, chatId, '@Nara: Yes, that one.', judged({ items: [{ item: 'a lantern', holder: 'user', how: 'found', end: null }] }), 'I pick up the lantern.');
        expect(said.items.map((item) => item.name)).toEqual(['the brass key', 'a lantern']);
    });

    it("a Branch carries the Items; Reset clears them", async () => {
        const { storyId, chatId } = await createChat();
        const first = await play(storyId, chatId, '@Nara: A coin for you.', judged({ items: [{ item: 'a silver coin', holder: 'user', how: 'paid by Nara', end: null }] }));
        await play(storyId, chatId, '@Nara: And a map.', judged({ items: [{ item: 'a map', holder: 'user', how: 'drawn by Nara', end: null }] }));
        await setItem(storyId, chatId, { name: 'a rope', holder: 'Nara', how: 'tied to the cart' });
        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${first.messages.at(-1)!.id}/branch`).expect(201);
        expect((branch as ChatBody).items.map((item) => [item.name, item.byUser])).toEqual([
            ['a silver coin', false],
            ['a rope', true],
        ]);
        const reset = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/reset`).expect(200);
        expect((reset.body as ChatBody).items).toEqual([]);
    });

    it('refuses no name, no holder, a full Chat, a bad end or too long a name, and a Chat that is not there', async () => {
        const { storyId, chatId } = await createChat();
        expect((await setItem(storyId, chatId, { name: ' ?! ', holder: 'Nara' }, 422)).body.error.code).toBe('422.004.140');
        expect((await setItem(storyId, chatId, { name: 'a rope', holder: ' ' }, 422)).body.error.code).toBe('422.004.141');
        expect((await setItem(storyId, chatId, { name: 'a rope' }, 422)).body.error.code).toBe('422.004.141');
        await setItem(storyId, chatId, { name: 'a rope', holder: 'Nara', end: 'eaten' }, 400);
        await setItem(storyId, chatId, { name: 'x'.repeat(61), holder: 'Nara' }, 400);
        await setItem(storyId, chatId, { name: 'a rope', remove: true });
        for (let i = 0; i < ITEMS_MAX; i++) await setItem(storyId, chatId, { name: `Thing ${i}`, holder: 'Nara' });
        expect((await setItem(storyId, chatId, { name: 'One more', holder: 'Nara' }, 422)).body.error.code).toBe('422.004.142');
        // Ending one is always taken, and makes room.
        await setItem(storyId, chatId, { name: 'Thing 3', end: 'lost' });
        await setItem(storyId, chatId, { name: 'One more', holder: 'Nara' });
        await t.http.put(`/api/stories/${storyId}/chats/999999/items`).send({ name: 'a', holder: 'b' }).expect(404);
    });
});

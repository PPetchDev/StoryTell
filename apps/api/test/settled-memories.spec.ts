import pg from 'pg';

import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import {
    ChoiceMemory,
    chooseMemories,
    MemoryChoiceInput,
    memoryCost,
    SETTLED_BUDGET_TOKENS,
    SETTLED_MIN_PICKS,
    SETTLED_WINDOW_TURNS,
    settledMemoryIds,
} from '../src/manager/chat/memory/memory-choice.js';
import { buildTurnPrompt, PROMPT_LAYERS, PromptHistoryMessage, PromptLayersInput, PromptMemory } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { closingParts } from './harness/prompt-layers.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * .scratch/prompt-cache/spec.md, "Settled Memories": the locked Memories and those the search
 * picked turn after turn go in the prompt's standing part, which the host caches, and change only
 * when the Story so far is written again. The search still runs every turn, and what it finds
 * most relevant still reaches the turn.
 */

const MODEL = 'test/model';
const scoring = (score: number): number[] => [score, Math.sqrt(1 - score * score), 0];

let nextId = 1;
function memory(text: string, fields: Partial<ChoiceMemory> = {}): ChoiceMemory {
    return { id: nextId++, text: text.padEnd(76, '.'), knownBy: ['Oren'], locked: false, archived: false, embedding: null, embeddingModel: null, ...fields };
}
const near = (score: number): Partial<ChoiceMemory> => ({ embedding: scoring(score), embeddingModel: MODEL });
const room = (n: number) => n * memoryCost(memory('x'));

function input(overrides: Partial<MemoryChoiceInput>): MemoryChoiceInput {
    return { memories: [], beliefs: [], cast: ['Oren', 'Kai'], present: ['Kai'], identityName: 'Petch', query: { vector: [1, 0, 0], model: MODEL }, ...overrides };
}

describe('Settled Memories (pure)', () => {
    it('has the numbers of the spec: picked in 6 of the newest 8 turns, at most 2,000 tokens', () => {
        expect([SETTLED_MIN_PICKS, SETTLED_WINDOW_TURNS, SETTLED_BUDGET_TOKENS]).toEqual([6, 8, 2_000]);
    });

    it('settles the Memories the search picked in at least 6 of the newest 8 turns, never a locked one or one since deleted', () => {
        const [often, sometimes, locked, deleted, old] = [memory('often'), memory('sometimes'), memory('locked', { locked: true }), memory('deleted'), memory('old')];
        const memories = [often, sometimes, locked, old];
        // Older than the window, only `old` was picked, eight times over; then `sometimes` in `picks` of the newest eight.
        const records = (picks: number) => [
            ...Array.from({ length: 8 }, () => [old.id]),
            ...Array.from({ length: picks }, () => [often.id, sometimes.id, locked.id, deleted.id]),
            ...Array.from({ length: 8 - picks }, () => [often.id]),
        ];
        expect(settledMemoryIds(records(5), memories)).toEqual([often.id]);
        expect(settledMemoryIds(records(6), memories)).toEqual([often.id, sometimes.id]);
        expect(settledMemoryIds([], memories)).toEqual([]);
    });

    it('keeps the most often picked, then the newest, inside the budget', () => {
        const [a, b, c] = [memory('a'), memory('b'), memory('c')];
        const records = [...Array.from({ length: 6 }, () => [a.id, b.id, c.id]), [a.id], [a.id]];
        expect(settledMemoryIds(records, [a, b, c], { budget: room(2) })).toEqual([a.id, c.id]);
    });

    it('sends the Settled Memories after the locked ones, whatever the search finds, and records what the search picked on its own', () => {
        const locked = memory('locked', { locked: true });
        const settled = memory('settled', near(0.1));
        const close = memory('close', near(0.9));
        const choice = chooseMemories(input({ memories: [locked, settled, close], settled: [settled.id] }));
        expect(choice.memories.map(({ memory: m, reason }) => [m.id, reason])).toEqual([
            [locked.id, 'locked'],
            [settled.id, 'settled'],
            [close.id, 'meaning'],
        ]);
        expect(choice.picked).toEqual([locked.id, close.id]);
        // With none settled, the record is exactly what was sent, as before.
        expect(chooseMemories(input({ memories: [locked, settled, close] })).picked).toEqual([locked.id, close.id]);
    });

    it('still sends the Memory closest to the moment when the Settled ones take room, inside the same budget', () => {
        const settledOnes = Array.from({ length: 3 }, (_, n) => memory(`settled ${n}`, near(0.4)));
        const closest = memory('closest', near(0.95));
        const fair = Array.from({ length: 3 }, (_, n) => memory(`fair ${n}`, near(0.5)));
        const choice = chooseMemories(input({ memories: [...settledOnes, ...fair, closest], settled: settledOnes.map((m) => m.id), budget: room(5) }));
        const sent = choice.memories.map(({ memory: m }) => m.id);
        expect(sent).toContain(closest.id);
        expect(sent).toHaveLength(5);
        expect(choice.usedTokens).toBeLessThanOrEqual(room(5));
        // What gave way is the least relevant of the search's own pick: two of the three fair ones.
        expect(choice.picked).toEqual(expect.arrayContaining([...fair.map((m) => m.id), closest.id]));
        expect(sent.filter((id) => fair.some((m) => m.id === id))).toHaveLength(1);
    });
});

describe('Lasting memory in the prompt (pure)', () => {
    const layers = (memories: PromptMemory[]): PromptLayersInput => ({
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [{ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' }],
        },
        identity: { name: 'Ash', description: 'The keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories,
        storySoFar: { text: 'Ash arrived in the storm.', coveredMessages: 0 },
    });
    const history: PromptHistoryMessage[] = [{ role: 'assistant', text: '@Mira: The lamp is out.' }];
    const kept: PromptMemory = { text: 'Mira keeps the lamp oil under the stairs.', knownBy: ['Mira'], locked: false, standing: true };
    const vow: PromptMemory = { text: '{user} swore never to leave the island.', knownBy: ['Mira'], locked: true, standing: true };
    const now: PromptMemory = { text: 'Mira saw {user} pocket the compass.', knownBy: ['Mira'], locked: false };

    it('puts the standing Memories after the Cast and before the Story so far, and the rest in the closing Memory layer', () => {
        const prompt = buildTurnPrompt({ ...layers([vow, kept, now]), history, userText: 'I wait.' });
        const standing = prompt.messages[0].content;
        const at = (text: string) => standing.indexOf(text);
        expect(at(PROMPT_LAYERS.cast)).toBeLessThan(at(PROMPT_LAYERS.lastingMemory));
        expect(at(PROMPT_LAYERS.lastingMemory)).toBeLessThan(at(PROMPT_LAYERS.storySoFar));
        expect(standing).toContain('Ash swore never to leave the island.');
        expect(standing).toContain('Mira keeps the lamp oil under the stairs.');
        expect(standing).not.toContain('pocket the compass');
        const { moment } = closingParts(prompt);
        expect(moment).toContain('Mira saw Ash pocket the compass.');
        expect(moment).toContain(`${PROMPT_LAYERS.memory} (more of what has happened in this Chat, for this moment)`);
        expect(moment).not.toContain('lamp oil');
    });

    it('opens two turns the same while only the Memories for the moment differ', () => {
        const first = buildTurnPrompt({ ...layers([vow, kept, now]), history, userText: 'I wait.' });
        const other: PromptMemory = { text: 'Mira found the gull nest.', knownBy: ['Mira'], locked: false };
        const next = buildTurnPrompt({ ...layers([vow, kept, other]), history, userText: 'I wait.' });
        expect(next.messages.slice(0, -1)).toEqual(first.messages.slice(0, -1));
        expect(closingParts(next).moment).toContain('Mira found the gull nest.');
    });

    it('has no Lasting memory layer while none is standing, so the prompt is as before', () => {
        const prompt = buildTurnPrompt({ ...layers([now]), history, userText: 'I wait.' });
        expect(prompt.messages[0].content).not.toContain(PROMPT_LAYERS.lastingMemory);
        expect(closingParts(prompt).moment).toContain(`${PROMPT_LAYERS.memory} (what has happened in this Chat so far)`);
    });

    it('says nothing more is chosen for the moment when every Memory sent is standing', () => {
        const prompt = buildTurnPrompt({ ...layers([kept]), history, userText: 'I wait.' });
        expect(closingParts(prompt).moment).toContain('Nothing more for this moment.');
    });
});

describe('Settled Memories through the API', () => {
    let t: TestApp;
    let db: pg.Client;

    const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
    const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
    const COMPASS = 'Mira promised {user} the silver compass salvaged from the Albatross wreck.';
    const QUESTION = 'Ash asks Mira about the silver compass salvaged from the Albatross wreck.';
    const filler = (n: number) => `Mira logged gull count ${n} beside lantern ${n} during watch ${n}, noting wind ${n}.`;

    beforeAll(async () => {
        t = await startTestApp();
        db = new pg.Client({ connectionString: t.databaseUrl });
        await db.connect();
    });

    afterEach(() => t.gateway.reset());

    afterAll(async () => {
        await db.end();
        await t.close();
    });

    async function play(storyId: number, chatId: number, text: string, extracted = '{"operations":[]}'): Promise<void> {
        t.gateway.scriptText('turn', '@Mira: Mm.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', extracted);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        await t.app.get(ChatManagerService).backgroundIdle(chatId);
    }

    it("sends a Memory the last turns kept picking in the standing part, and the one this exchange calls for in the closing message", async () => {
        const storyId = (await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201)).body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.' }).expect(201);
        const chatId = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;
        // 200 newer Memories about Mira, far past the budget, so the oldest is never picked on its own.
        const adds = [COMPASS, ...Array.from({ length: 200 }, (_, n) => filler(n))].map((text) => ({ op: 'add', text, known_by: ['Mira'], cause: 'it happened' }));
        await play(storyId, chatId, 'I take the first watch.', JSON.stringify({ operations: adds }));
        for (let n = 0; n < 6; n++) await play(storyId, chatId, `I watch the sea, hour ${n}.`);

        // The turns so far picked the oldest filler every time (recorded the old way, without pickedIds), then the Story so far was written.
        const settledId = (await db.query(`SELECT id FROM memory WHERE chat_id = $1 AND text = $2`, [chatId, filler(0)])).rows[0].id as number;
        await db.query(`UPDATE message SET memories_used = jsonb_build_object('memoryIds', jsonb_build_array($2::int), 'beliefIds', '[]'::jsonb) WHERE chat_id = $1 AND kind = 'ai' AND memories_used IS NOT NULL`, [chatId, settledId]);
        const { rowCount } = await db.query(`SELECT 1 FROM message WHERE chat_id = $1 AND kind = 'ai' AND memories_used IS NOT NULL`, [chatId]);
        expect(rowCount).toBeGreaterThanOrEqual(SETTLED_MIN_PICKS);
        await db.query(`UPDATE chat SET story_so_far = 'Ash arrived in the storm.', story_so_far_through = 0, story_so_far_by = 'ai', story_so_far_updated_at = now() WHERE id = $1`, [chatId]);

        await play(storyId, chatId, QUESTION);
        const turn = t.gateway.textCalls('turn').at(-1)!;
        const standing = turn.messages[0].content;
        const lasting = standing.slice(standing.indexOf(PROMPT_LAYERS.lastingMemory), standing.indexOf(PROMPT_LAYERS.storySoFar));
        expect(lasting).toContain(filler(0));
        // What this exchange is about still reaches it, in the Memory layer for the moment.
        const { moment } = closingParts(turn);
        expect(moment).toContain(COMPASS.split('{user}').join('Ash'));
        expect(moment).not.toContain(filler(0));

        // The record: sent includes the Settled one; what the search picked on its own does not.
        const record = (await db.query(`SELECT memories_used FROM message WHERE chat_id = $1 AND kind = 'ai' ORDER BY position DESC LIMIT 1`, [chatId])).rows[0].memories_used;
        expect(record.memoryIds).toContain(settledId);
        expect(record.pickedIds).not.toContain(settledId);
        // The Memory drawer's "In play" is what was sent, without the search's own record.
        const inPlay = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}/memories`).expect(200)).body.inPlay;
        expect(Object.keys(inPlay).sort()).toEqual(['beliefIds', 'memoryIds']);
        expect(inPlay.memoryIds).toContain(settledId);

        // Suggested replies open with the same standing part, so they read the cache the turn left.
        t.gateway.scriptText('suggested_replies', '{"action":"I look.","speech":"Well?","move":"I go."}');
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/suggestions`).expect(200);
        expect(t.gateway.textCalls('suggested_replies').at(-1)!.messages[0].content).toBe(standing);
    });
});

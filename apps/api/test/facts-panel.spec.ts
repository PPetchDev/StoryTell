import { DetailKind } from '../src/model/ledger/entities/detail-change.entity.js';
import { applyFacts, ChatFact, factsState, FACTS_MAX, factValue, topicKey, userFactChange } from '../src/manager/chat/details/facts.js';
import { trailingOf } from './harness/prompt-layers.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * The Facts panel (.scratch/facts-panel/spec.md): the user sees, edits, deletes and adds the
 * Chat's Established facts. A user's fact is a detail record with no Message, so no rewind takes
 * it away; the Judge's rule that only the user changes canon is unchanged.
 */

const judgeFact = (value: string, messageId = 7) => ({ kind: DetailKind.Fact, value, messageId });
const userFact = (value: string) => ({ kind: DetailKind.Fact, value, messageId: null });

describe('Facts panel: what stands, and the user’s own change (pure)', () => {
    it("says whose telling each fact is, and that a Judge's later change is the Judge's", () => {
        const state = factsState([
            judgeFact("Nara's age: twenty-six"),
            judgeFact("Nara's years at the stall: twenty summers"),
            userFact("Nara's years at the stall: nine summers"),
            userFact('Tavri’s horse: Ember'),
            judgeFact('Tavri’s horse: Cinder', 9),
        ]);
        expect(state.facts).toEqual([
            { topic: "Nara's age", fact: 'twenty-six', byUser: false },
            { topic: "Nara's years at the stall", fact: 'nine summers', byUser: true },
            { topic: 'Tavri’s horse', fact: 'Cinder', byUser: false },
        ]);
        expect(state.clearedByUser).toEqual([]);
    });

    it('remembers a topic the user deleted until something sets it again', () => {
        const deleted = factsState([judgeFact("Nara's age: thirty"), userFact("Nara's age: ")]);
        expect(deleted.facts).toEqual([]);
        expect(deleted.clearedByUser).toEqual([topicKey("Nara's age")]);
        expect(factsState([judgeFact("Nara's age: thirty"), userFact("Nara's age: "), userFact("Nara's age: twenty-six")]).clearedByUser).toEqual([]);
        // A topic the Judge emptied (never done now, but old records may hold one) is not the user's deletion.
        expect(factsState([judgeFact("Nara's age: thirty"), judgeFact("Nara's age: ", 8)]).clearedByUser).toEqual([]);
    });

    const listed: ChatFact[] = [
        { topic: "Nara's age", fact: 'twenty-six' },
        { topic: "Nara's years at the stall", fact: 'nine summers' },
    ];

    it('adds, changes and deletes, tidied, with a listed topic keeping its wording', () => {
        expect(userFactChange(listed, '  Tavri’s horse ', ' Ember. ')).toEqual({ value: 'Tavri’s horse: Ember' });
        expect(userFactChange(listed, 'the NARA’S AGE', 'twenty-seven')).toEqual({ value: factValue("Nara's age", 'twenty-seven') });
        // A colon in a topic would split the record wrongly: it becomes a space.
        expect(userFactChange(listed, 'Wedding: date', 'first frost')).toEqual({ value: 'Wedding date: first frost' });
        expect(userFactChange(listed, "Nara's age", '   ')).toEqual({ value: "Nara's age: " });
    });

    it('writes nothing for what is already so, and refuses no topic or a fact past the cap', () => {
        expect(userFactChange(listed, "nara's age", 'twenty-six')).toBe('unchanged');
        // Only the exact telling is unchanged, so a capital letter can be fixed.
        expect(userFactChange(listed, "Nara's age", 'Twenty-six')).toEqual({ value: "Nara's age: Twenty-six" });
        expect(userFactChange(listed, 'Ilse', '')).toBe('unchanged');
        expect(userFactChange(listed, ' :: ', 'twenty')).toBe('no-topic');
        const full = Array.from({ length: FACTS_MAX }, (_, i) => ({ topic: `Fact ${i}`, fact: 'so' }));
        expect(userFactChange(full, 'One more', 'so')).toBe('full');
        // A change to a listed one is still taken.
        expect(userFactChange(full, 'Fact 3', 'not so')).toEqual({ value: 'Fact 3: not so' });
    });

    it('keeps a fact the user set against a reply that tells it differently, as a slip', () => {
        const { changes } = applyFacts(listed, { facts: [{ topic: "Nara's years at the stall", fact: 'twenty summers' }], slips: [] }, 'How long at the stall?');
        expect(changes).toEqual([{ kind: DetailKind.Slip, characterId: null, value: "Nara's years at the stall: twenty summers" }]);
    });

    it("keeps a topic the user deleted deleted, unless the user's own words say it", () => {
        const cleared = [topicKey("Tavri's horse")];
        const judged = { facts: [{ topic: "Tavri's horse", fact: 'Cinder' }], slips: [{ topic: "Tavri's horse", said: 'Ash' }] };
        const dropped = applyFacts(listed, judged, 'Whose horse is that?', cleared);
        expect(dropped.changes).toEqual([]);
        expect(dropped.rejected).toContain('Fact "Tavri\'s horse": the user deleted it; "Cinder" is not in the user\'s words');
        const said = applyFacts(listed, judged, 'Your horse, Cinder, is lame.', cleared);
        expect(said.changes).toContainEqual({ kind: DetailKind.Fact, characterId: null, value: "Tavri's horse: Cinder" });
        // Another new topic is taken as before.
        expect(applyFacts(listed, { facts: [{ topic: 'Market day', fact: 'Thursday' }], slips: [] }, '', cleared).changes).toHaveLength(1);
    });
});

const NO_OPS = '{"operations":[]}';
const judged = (extra: Record<string, unknown> = {}) => JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...extra });

interface ChatBody {
    facts: Array<{ topic: string; fact: string; byUser: boolean }>;
    messages: Array<{ id: number; kind: string; judge?: { status: string }; memory?: { status: string } }>;
}

describe('Facts panel: setting facts through the API (HTTP)', () => {
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

    const setFact = (storyId: number, chatId: number, topic: string, fact: string, status = 200) =>
        t.http.put(`/api/stories/${storyId}/chats/${chatId}/facts`).send({ topic, fact }).expect(status);

    it('shows the facts, and the user adds, edits and deletes them; the Narrator and the Judge read them', async () => {
        const { storyId, chatId } = await createChat();
        expect(((await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as ChatBody).facts).toEqual([]);
        const played = await play(storyId, chatId, '@Nara: Twenty summers at this stall.', judged({ facts: [{ topic: "Nara's years at the stall", fact: 'twenty summers' }] }));
        expect(played.facts).toEqual([{ topic: "Nara's years at the stall", fact: 'twenty summers', byUser: false }]);

        // Writing the same telling writes nothing: it stays the Judge's.
        expect((await setFact(storyId, chatId, "Nara's years at the stall", 'twenty summers')).body.facts[0].byUser).toBe(false);

        // The user corrects it, matched loosely, and adds one.
        expect((await setFact(storyId, chatId, "nara's years at the stall", 'nine summers.')).body.facts).toEqual([
            { topic: "Nara's years at the stall", fact: 'nine summers', byUser: true },
        ]);
        expect((await setFact(storyId, chatId, "Nara's birthday", 'the first frost')).body.facts).toEqual([
            { topic: "Nara's years at the stall", fact: 'nine summers', byUser: true },
            { topic: "Nara's birthday", fact: 'the first frost', byUser: true },
        ]);

        // The next turn reads both; the Judge sees them listed and a reply's other telling is a slip.
        await play(storyId, chatId, '@Nara: Twenty summers, I said.', judged({ facts: [{ topic: "Nara's years at the stall", fact: 'twenty summers' }] }));
        const turn = trailingOf(t.gateway.textCalls('turn').at(-1)!);
        expect(turn).toContain("- Nara's years at the stall: nine summers");
        expect(turn).toContain("- Nara's birthday: the first frost");
        expect(t.gateway.textCalls('judge').at(-1)!.messages[1].content).toContain("# Established facts\n- Nara's years at the stall: nine summers\n- Nara's birthday: the first frost\nFacts rule:");
        const after = await settled(storyId, chatId);
        expect(after.facts[0]).toEqual({ topic: "Nara's years at the stall", fact: 'nine summers', byUser: true });

        // Deleted, it is gone; and a reply saying it again does not bring it back.
        expect((await setFact(storyId, chatId, "Nara's birthday", ' ')).body.facts.map((fact: { topic: string }) => fact.topic)).toEqual(["Nara's years at the stall"]);
        const again = await play(storyId, chatId, '@Nara: My birthday? The first frost.', judged({ facts: [{ topic: "Nara's birthday", fact: 'the first frost' }] }));
        expect(again.facts.map((fact) => fact.topic)).toEqual(["Nara's years at the stall"]);
        // Unless the user's own words say it.
        const said = await play(storyId, chatId, '@Nara: Yes, the first frost.', judged({ facts: [{ topic: "Nara's birthday", fact: 'the first frost' }] }), 'Your birthday is the first frost, right?');
        expect(said.facts).toContainEqual({ topic: "Nara's birthday", fact: 'the first frost', byUser: false });
    });

    it('keeps the user’s fact through Regenerate, and brings it back when a later change is taken back', async () => {
        const { storyId, chatId } = await createChat();
        const first = await play(storyId, chatId, '@Nara: Twenty summers.', judged({ facts: [{ topic: "Nara's years at the stall", fact: 'twenty summers' }] }));
        await setFact(storyId, chatId, "Nara's years at the stall", 'nine summers');
        // Regenerate the reply whose Judge set "twenty summers": the Judge's record goes, the user's stays.
        const regenerated = await regenerate(storyId, chatId, first.messages.at(-1)!.id, '@Nara: A while.', judged());
        expect(regenerated.facts).toEqual([{ topic: "Nara's years at the stall", fact: 'nine summers', byUser: true }]);

        // The user changes it in their own words; taking that reply back brings the user's telling back.
        const changed = await play(storyId, chatId, '@Nara: Ten, then.', judged({ facts: [{ topic: "Nara's years at the stall", fact: 'ten summers' }] }), 'It has been ten summers now.');
        expect(changed.facts).toEqual([{ topic: "Nara's years at the stall", fact: 'ten summers', byUser: false }]);
        const undone = await regenerate(storyId, chatId, changed.messages.at(-1)!.id, '@Nara: Hm.', judged());
        expect(undone.facts).toEqual([{ topic: "Nara's years at the stall", fact: 'nine summers', byUser: true }]);
    });

    it("a Branch carries the user's facts; Reset clears them", async () => {
        const { storyId, chatId } = await createChat();
        const first = await play(storyId, chatId, '@Nara: Twenty-six, since you ask.', judged({ facts: [{ topic: "Nara's age", fact: 'twenty-six' }] }));
        await play(storyId, chatId, '@Nara: Nine summers.', judged({ facts: [{ topic: "Nara's years at the stall", fact: 'nine summers' }] }));
        await setFact(storyId, chatId, "Nara's birthday", 'the first frost');
        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages/${first.messages.at(-1)!.id}/branch`).expect(201);
        expect((branch as ChatBody).facts).toEqual([
            { topic: "Nara's age", fact: 'twenty-six', byUser: false },
            { topic: "Nara's birthday", fact: 'the first frost', byUser: true },
        ]);
        const reset = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/reset`).expect(200);
        expect((reset.body as ChatBody).facts).toEqual([]);
    });

    it('refuses no topic, a full Chat, or too long a fact, and a Chat that is not there', async () => {
        const { storyId, chatId } = await createChat();
        await setFact(storyId, chatId, "Nara's age", 'twenty-six');
        await setFact(storyId, chatId, "Nara's age", 'twenty-six');
        await setFact(storyId, chatId, 'Ilse', ' ');
        expect((await setFact(storyId, chatId, ' : ', 'twenty', 422)).body.error.code).toBe('422.004.031');
        await setFact(storyId, chatId, 'Age', 'x'.repeat(121), 400);
        for (let i = 1; i < FACTS_MAX; i++) await setFact(storyId, chatId, `Fact ${i}`, 'so');
        expect((await setFact(storyId, chatId, 'One more', 'so', 422)).body.error.code).toBe('422.004.032');
        // A change to a listed one is still taken.
        await setFact(storyId, chatId, 'Fact 3', 'not so');
        await t.http.put(`/api/stories/${storyId}/chats/999999/facts`).send({ topic: 'a', fact: 'b' }).expect(404);
    });
});

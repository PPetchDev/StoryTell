import { buildJudgePrompt, JUDGE_MAX_TOKENS, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import {
    applyNow,
    ChatNowNotes,
    currentNowNotes,
    judgeNowSection,
    NOW_EXTRA_TOKENS,
    NOW_MAX,
    NowRecord,
    readsAsInstruction,
    tidyNow,
} from '../src/manager/chat/details/now-notes.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { DetailKind } from '../src/model/ledger/entities/detail-change.entity.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Growing cards (.scratch/growing-cards/spec.md): a Now note per Character per Chat, as pure logic
 * (the current notes, what the Judge is asked and how its answer is applied, what the Narrator
 * reads), then through the HTTP API with the fake gateway scripted.
 */

const CAST = [
    { id: 1, name: 'Nara' },
    { id: 2, name: 'Dulcie' },
];
const { Now, Goal } = DetailKind;
const NONE: ChatNowNotes = { notes: [], clearedByUser: [] };
const judge = (characterId: number, value: string): NowRecord => ({ kind: Now, characterId, value, messageId: 7 });
const user = (characterId: number, value: string): NowRecord => ({ kind: Now, characterId, value, messageId: null });

describe('Now notes: the current notes (pure)', () => {
    it('is the newest record of each Character; an empty one clears theirs; other kinds are not read', () => {
        expect(currentNowNotes([])).toEqual(NONE);
        const notes = currentNowNotes([
            judge(1, 'Calls {user} "traveller".'),
            judge(2, 'Works the stall with Nara.'),
            { kind: Goal, characterId: 1, value: 'Sell the last cheese', messageId: 7 },
            judge(1, 'Calls {user} "my love". Married to {user}.'),
            judge(2, ''),
        ]);
        expect(notes).toEqual({ notes: [{ characterId: 1, note: 'Calls {user} "my love". Married to {user}.', byUser: false }], clearedByUser: [] });
    });

    it("the user's own record wins until a newer one; cleared by the user is known until something sets it again", () => {
        expect(currentNowNotes([judge(1, 'Calls {user} "traveller".'), user(1, 'Married to {user}.')]).notes).toEqual([{ characterId: 1, note: 'Married to {user}.', byUser: true }]);
        expect(currentNowNotes([user(1, 'Married to {user}.'), judge(1, 'Widowed.')]).notes).toEqual([{ characterId: 1, note: 'Widowed.', byUser: false }]);
        expect(currentNowNotes([judge(1, 'Married to {user}.'), user(1, '')])).toEqual({ notes: [], clearedByUser: [1] });
        expect(currentNowNotes([judge(1, 'Married to {user}.'), user(1, ''), judge(1, 'Betrothed to {user}.')]).clearedByUser).toEqual([]);
        // A Judge's empty note is not the user clearing it.
        expect(currentNowNotes([user(1, 'Married to {user}.'), judge(1, '')])).toEqual(NONE);
    });
});

describe('Now notes: what the Judge is asked and how its answer is applied (pure)', () => {
    const current: ChatNowNotes = { notes: [{ characterId: 1, note: 'Calls {user} "traveller".', byUser: false }], clearedByUser: [2] };

    it('shows each note, "nothing yet" and "cleared by the user", then the rule, after everything else', () => {
        const section = judgeNowSection(current, [...CAST, { id: 3, name: 'Kessel' }]);
        expect(section).toMatch(/^# Changed in this Chat\nNara: Calls \{user\} "traveller"\.\nDulcie: cleared by the user\nKessel: nothing yet\nNow rule: /);
        expect(section).toContain('Add "now": [{"character": "Name", "note": "..."}] inside "details"');
        expect(section).toContain('with {user} for the user');
        expect(section).toContain('never directions to anyone');
        expect(section).toContain('"Cleared by the user": give one only for a change the latest exchange itself makes.');

        const prompt = buildJudgePrompt({ ...JUDGE_FIXTURE_INPUTS[0], detailsSection: '# Place, weather, outfits and goals', nowSection: section });
        const text = prompt.messages[1].content;
        expect(text.indexOf('# Place, weather, outfits and goals')).toBeLessThan(text.indexOf('# Changed in this Chat'));
        expect(text.endsWith(section)).toBe(true);
        const without = buildJudgePrompt({ ...JUDGE_FIXTURE_INPUTS[0], detailsSection: '# Place, weather, outfits and goals' });
        expect(prompt.maxTokens - without.maxTokens).toBe(NOW_EXTRA_TOKENS);
        expect(buildJudgePrompt({ ...JUDGE_FIXTURE_INPUTS[0], nowSection: null })).toEqual(buildJudgePrompt(JUDGE_FIXTURE_INPUTS[0]));
        expect(buildJudgePrompt(JUDGE_FIXTURE_INPUTS[0]).maxTokens).toBe(JUDGE_MAX_TOKENS);
    });

    it('reads the notes inside "details" and at the top level, a null note as clearing it; none, and the judgement is as before', () => {
        const base = { bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'no' } };
        const inside = parseJudgement(JSON.stringify({ ...base, details: { now: [{ character: 'Nara', note: 'Married to {user}.' }, { character: 'Dulcie', note: null }, { character: '', note: 'x' }, { character: 'Kessel', note: 4 }, 'nonsense'] } }));
        expect(inside.now).toEqual([
            { character: 'Nara', note: 'Married to {user}.' },
            { character: 'Dulcie', note: '' },
        ]);
        expect(parseJudgement(JSON.stringify({ ...base, now: [{ character: 'Nara', note: 'Married.' }] })).now).toEqual([{ character: 'Nara', note: 'Married.' }]);
        expect(parseJudgement(JSON.stringify(base))).not.toHaveProperty('now');
    });

    const apply = (judged: Array<{ character: string; note: string }>, sittingOut: number[] = []) =>
        applyNow({ current, cast: CAST, sittingOut, identityName: 'Petch' }, judged);

    it('takes a new, changed or cleared note, the identity as {user}; drops the same, unknown, sitting out or a second one', () => {
        expect(apply([{ character: 'nara', note: '  Calls Petch "my love",  no longer "traveller".\n Married to Petch. ' }])).toEqual({
            changes: [{ kind: Now, characterId: 1, value: 'Calls {user} "my love", no longer "traveller". Married to {user}.' }],
            rejected: [],
        });
        expect(apply([{ character: 'Dulcie', note: 'Lives above the stall.' }]).changes).toEqual([{ kind: Now, characterId: 2, value: 'Lives above the stall.' }]);
        expect(apply([{ character: 'Nara', note: '' }]).changes).toEqual([{ kind: Now, characterId: 1, value: '' }]);

        const dropped = apply(
            [
                { character: 'Nara', note: 'calls {USER} "Traveller". ' },
                { character: 'Dulcie', note: '' },
                { character: 'Kessel', note: 'Exiled.' },
            ],
        );
        expect(dropped.changes).toEqual([]);
        expect(dropped.rejected).toEqual(['Now note of Nara: unchanged', 'Now note of Dulcie: unchanged', 'Now note of Kessel: unknown name']);
        expect(apply([{ character: 'Dulcie', note: 'Exiled.' }], [2]).rejected).toEqual(['Now note of Dulcie: sitting out']);
        const twice = apply([{ character: 'Nara', note: 'Married to {user}.' }, { character: 'Nara', note: 'Widowed.' }]);
        expect(twice.changes).toHaveLength(1);
        expect(twice.rejected).toEqual(['Now note of Nara: a second one in one turn']);
    });

    it('refuses a note that reads as an instruction, and takes plain facts', () => {
        for (const instruction of [
            'Make her call him "my love".',
            'Married to {user}. Always call {user} "my love".',
            'Never call {user} "traveller" again.',
            'Remember she is married now.',
            "Don't let her forget the wedding.",
            'The Narrator keeps her tender.',
            'She should call {user} "my love".',
            'Nara must stay at the stall.',
            '"Keep her shy around strangers."',
        ]) {
            expect([instruction, readsAsInstruction(instruction)]).toEqual([instruction, true]);
        }
        for (const fact of [
            'Calls {user} "my love", no longer "traveller". Married to {user} since the night of the summer market.',
            'Never calls {user} "traveller" any more.',
            'Always wears the ring {user} gave her.',
            'Uses a cane since the fall. Plays the lute at the inn. Keeps the stall key.',
            'Lives in {user}\'s house above the stall.',
        ]) {
            expect([fact, readsAsInstruction(fact)]).toEqual([fact, false]);
        }
        const refused = apply([{ character: 'Nara', note: 'Make her call him "my love".' }]);
        expect(refused.changes).toEqual([]);
        expect(refused.rejected[0]).toMatch(/^Now note of Nara: reads as an instruction/);
    });

    it(`cuts a long note to ${NOW_MAX} characters at the last sentence end that fits, or at a word`, () => {
        const sentence = 'Married to {user} since the summer market.';
        const long = Array.from({ length: 10 }, () => sentence).join(' ');
        const cut = tidyNow(long, 'Petch');
        expect(cut.length).toBeLessThanOrEqual(NOW_MAX);
        expect(cut.endsWith('market.')).toBe(true);
        const words = tidyNow('word '.repeat(100), 'Petch');
        expect(words.length).toBeLessThanOrEqual(NOW_MAX);
        expect(words.endsWith('word')).toBe(true);
    });
});

describe('Now notes: what the Narrator reads (pure)', () => {
    const input: TurnPromptInput = {
        story: {
            setting: 'A market town.',
            pov: Pov.First,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [
                { name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Calls the user "traveller".', exampleLines: [], background: '', secrets: '' },
                { name: 'Dulcie', appearance: 'Small.', personality: 'Sharp.', voice: 'Quick.', exampleLines: [], background: '', secrets: '' },
            ],
        },
        identity: { name: 'Petch', description: 'A traveller.' },
        scene: null,
        bonds: [],
        arcs: [
            { name: 'Nara', steps: [], direction: '' },
            { name: 'Dulcie', steps: [], direction: '' },
        ],
        memories: [],
        history: [{ role: 'assistant', text: '@Nara: Morning.' }],
        userText: 'I kiss her.',
        present: ['Nara'],
    };

    it('reads "Changed in this Chat" after the Arcs, in the closing message, with {user} rendered; "Where things stand" says so', () => {
        const prompt = buildTurnPrompt({ ...input, nowNotes: [{ name: 'Nara', note: 'Calls {user} "my love", no longer "traveller". Married to {user}.' }] });
        const standing = prompt.messages[0].content;
        const closing = prompt.messages.at(-1)!.content;
        expect(standing).not.toContain('Changed in this Chat');
        expect(closing).toContain(
            '# Changed in this Chat (what is true of them now in this Chat; where it differs from their card, this holds)\n- Nara: Calls Petch "my love", no longer "traveller". Married to Petch.',
        );
        expect(closing.indexOf('# Arcs')).toBeLessThan(closing.indexOf('# Changed in this Chat'));
        expect(closing.indexOf('# Changed in this Chat')).toBeLessThan(closing.indexOf('# Memory'));
        expect(closing).toContain('and keep each Character as their card describes, with what has changed in this Chat.');
    });

    it('without notes, the prompt is exactly as before', () => {
        expect(buildTurnPrompt({ ...input, nowNotes: [] })).toEqual(buildTurnPrompt(input));
        const closing = buildTurnPrompt(input).messages.at(-1)!.content;
        expect(closing).not.toContain('Changed in this Chat');
        expect(closing).toContain('and keep each Character as their card describes.');
    });
});

interface Chat {
    id: number;
    nowNotes: Array<{ characterId: number; note: string }>;
    messages: Array<{ id: number; kind: 'user' | 'ai'; judge?: { status: string } | null; memory?: { status: string } | null }>;
}

const NO_OPS = '{"operations":[]}';

/** A judgement that changes nothing but the Now notes it gives. */
function judgement(now?: Array<{ character: string; note: string | null }>): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...(now ? { details: { now } } : {}) });
}

describe('Now notes: the Judge, the user, the ledger and the Chat (HTTP)', () => {
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

    async function createStory(): Promise<{ storyId: number; nara: number; dulcie: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Summer Market' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A market town.', opening: '@Nara: Morning, traveller.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Petch', description: 'A traveller.' }).expect(200);
        const first = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Calls the user "traveller".' }).expect(201);
        const second = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Dulcie', appearance: 'Small.', personality: 'Sharp.', voice: 'Quick.' }).expect(201);
        return { storyId, nara: first.body.characters[0].id as number, dulcie: second.body.characters[1].id as number };
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(storyId, chatId);
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function script(reply: string, judged: string): void {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judged);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function play(storyId: number, chatId: number, text: string, judged: string = judgement()): Promise<Chat> {
        script(`@Nara: ${text}\n\n@Dulcie: Aye.`, judged);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    async function regenerate(storyId: number, chat: Chat): Promise<Chat> {
        script('@Nara: Again.', judgement());
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${chat.messages.at(-1)!.id}/regenerate`).expect(200);
        return settled(storyId, chat.id);
    }

    const setNote = (storyId: number, chatId: number, characterId: number, text: string) =>
        t.http.put(`/api/stories/${storyId}/chats/${chatId}/characters/${characterId}/now`).send({ text });

    function lastCall(kind: 'turn' | 'judge'): TextCompletionRequest {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }
    const closing = () => lastCall('turn').messages.at(-1)!.content;
    const judged = () => lastCall('judge').messages[1].content;

    it("a note the Judge sets shows on the Chat and is read by the next turn; Regenerate takes it back", async () => {
        const { storyId, nara } = await createStory();
        const chat = await createChat(storyId);
        expect(chat.nowNotes).toEqual([]);

        const wed = await play(storyId, chat.id, 'We are wed.', judgement([{ character: 'Nara', note: 'Calls Petch "my love", no longer "traveller". Married to {user}.' }]));
        expect(judged()).toMatch(/# Changed in this Chat\nNara: nothing yet\nDulcie: nothing yet\nNow rule: /);
        expect(wed.nowNotes).toEqual([{ characterId: nara, note: 'Calls {user} "my love", no longer "traveller". Married to {user}.' }]);

        const next = await play(storyId, chat.id, 'Morning, wife.');
        expect(closing()).toContain('- Nara: Calls Petch "my love", no longer "traveller". Married to Petch.');
        expect(closing()).toContain('keep each Character as their card describes, with what has changed in this Chat.');
        expect(judged()).toContain('Nara: Calls {user} "my love", no longer "traveller". Married to {user}.\nDulcie: nothing yet');
        expect(next.nowNotes).toHaveLength(1);

        // Taking back the reply that wed them takes the note with it.
        const before = await regenerate(storyId, await getChat(storyId, chat.id));
        expect(before.nowNotes).toHaveLength(1);
        script('@Nara: Not yet.', judgement());
        const edited = await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${wed.messages.at(-2)!.id}`).send({ text: 'We are not wed yet.' });
        expect(edited.status).toBe(200);
        expect((edited.body as Chat).nowNotes).toEqual([]);
        await settled(storyId, chat.id);
    });

    it("the user's own note shows, is read next turn, survives a Regenerate, gives way to the Judge's next change, and Clear takes it away", async () => {
        const { storyId, nara, dulcie } = await createStory();
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'Hello.');

        const set = await setNote(storyId, chat.id, nara, '  Married to Petch.\nCalls Petch "love". ').expect(200);
        expect((set.body as Chat).nowNotes).toEqual([{ characterId: nara, note: 'Married to {user}. Calls {user} "love".' }]);
        // The same again changes nothing.
        await setNote(storyId, chat.id, nara, 'Married to {user}. Calls {user} "love".').expect(200);

        const played = await play(storyId, chat.id, 'Morning.');
        expect(closing()).toContain('- Nara: Married to Petch. Calls Petch "love".');
        expect((await regenerate(storyId, played)).nowNotes).toEqual([{ characterId: nara, note: 'Married to {user}. Calls {user} "love".' }]);

        const changed = await play(storyId, chat.id, 'The baby comes.', judgement([{ character: 'Nara', note: 'Married to {user}. Calls {user} "love". Mother of a daughter.' }]));
        expect(changed.nowNotes).toEqual([{ characterId: nara, note: 'Married to {user}. Calls {user} "love". Mother of a daughter.' }]);
        // Taking back the Judge's change puts the user's wording back.
        expect((await regenerate(storyId, changed)).nowNotes).toEqual([{ characterId: nara, note: 'Married to {user}. Calls {user} "love".' }]);

        const cleared = await setNote(storyId, chat.id, nara, '   ').expect(200);
        expect((cleared.body as Chat).nowNotes).toEqual([]);
        await play(storyId, chat.id, 'Hm.');
        expect(judged()).toContain('Nara: cleared by the user\nDulcie: nothing yet');
        expect(closing()).not.toContain('Changed in this Chat');

        await setNote(storyId, chat.id, 999_999, 'Exiled.').expect(404);
        await setNote(storyId, chat.id, dulcie, 'x'.repeat(NOW_MAX + 1)).expect(400);
        await t.http.put(`/api/stories/${storyId}/chats/${chat.id}/characters/${dulcie}/now`).send({}).expect(400);
    });

    it("a Branch carries the notes as they stood at its Message, the user's own with them; Reset clears them all", async () => {
        const { storyId, nara, dulcie } = await createStory();
        const chat = await createChat(storyId);
        const first = await play(storyId, chat.id, 'Betrothed.', judgement([{ character: 'Nara', note: 'Betrothed to {user}.' }]));
        await play(storyId, chat.id, 'Wed.', judgement([{ character: 'Nara', note: 'Married to {user}.' }]));
        await setNote(storyId, chat.id, dulcie, 'Runs the stall alone now.').expect(200);

        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${first.messages.at(-1)!.id}/branch`).expect(201);
        expect((branch as Chat).nowNotes).toEqual([
            { characterId: nara, note: 'Betrothed to {user}.' },
            { characterId: dulcie, note: 'Runs the stall alone now.' },
        ]);
        expect((await getChat(storyId, chat.id)).nowNotes).toEqual([
            { characterId: nara, note: 'Married to {user}.' },
            { characterId: dulcie, note: 'Runs the stall alone now.' },
        ]);

        const reset = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        expect((reset.body as Chat).nowNotes).toEqual([]);
    });
});

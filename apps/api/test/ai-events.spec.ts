import { buildJudgePrompt } from '../src/manager/chat/judge/judge-prompt.js';
import {
    AI_EVENT_EXTRA_TOKENS,
    AI_EVENT_FIRST_AFTER,
    AI_EVENT_GAP,
    aiEventOffered,
    AiEventOfferInput,
    ChatEvent,
    chatEventState,
    eventProposalView,
    intimateExchange,
    MAX_AI_EVENTS_PER_CHAT,
    NEW_EVENT_SHAPE_NOTE,
    readJudgedNewEvent,
    readNewEventFrom,
    shownProposal,
    takeNewEvent,
    withAiEvents,
} from '../src/manager/chat/sudden-event/ai-events.js';
import { EventDefinition } from '../src/manager/chat/sudden-event/sudden-event.js';
import { SuddenEventStepKind } from '../src/model/ledger/entities/sudden-event-step.entity.js';
import { EventProposal, GaugeDirection } from '../src/model/story/entities/sudden-event.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Sudden events the story makes up (.scratch/ai-events/spec.md): when the Judge is offered one,
 * what it is asked, how its answer is read and taken, and what the Chat shows, as pure logic; then
 * the switch and play through the HTTP API with the fake gateway scripted.
 */

const ids = (count: number, from = 101): number[] => Array.from({ length: count }, (_, index) => from + index);
const offer = (input: Partial<AiEventOfferInput> = {}): boolean =>
    aiEventOffered({ on: true, epilogue: false, active: false, replyIds: ids(AI_EVENT_FIRST_AFTER), proposalMessageIds: [], stepMessageIds: [], ...input });

const PROPOSED = {
    reason: 'Mira has found the ledger.',
    name: 'The ledger',
    trigger: 'Mira confronts the user with the torn ledger.',
    gauge: 'Suspicion',
    direction: 'lower',
    turns: 3,
    success: 'Mira believes the user and hides the ledger.',
    failure: 'Mira reports the user to the harbour master.',
};

const AUTHORED: EventDefinition = {
    id: 1,
    name: 'The dare',
    trigger: 'Kai dares the user.',
    gauge: 'Nerve',
    direction: GaugeDirection.Raise,
    turns: 2,
    success: '',
    failure: '',
};
const own = (id: number, proposal: EventProposal, messageId: number): ChatEvent => ({
    id,
    name: 'The ledger',
    trigger: 'Mira confronts the user.',
    gauge: 'Suspicion',
    direction: GaugeDirection.Lower,
    turns: 3,
    success: '',
    failure: '',
    messageId,
    proposal,
    reason: 'Now.',
});

describe('Sudden events the story makes up: when one is offered (pure)', () => {
    it('is offered with the switch on, from the eighth reply, with nothing under way', () => {
        expect(offer()).toBe(true);
        expect(offer({ on: false })).toBe(false);
        expect(offer({ epilogue: true })).toBe(false);
        expect(offer({ active: true })).toBe(false);
        expect(offer({ replyIds: ids(AI_EVENT_FIRST_AFTER - 1) })).toBe(false);
    });

    it('keeps its distance from the last proposal and from the last step of any event', () => {
        const replies = ids(40);
        const at = (index: number) => replies[index];
        // The newest reply is index 39: a proposal at 39 - GAP is just far enough, one later is not.
        expect(offer({ replyIds: replies, proposalMessageIds: [at(39 - AI_EVENT_GAP)] })).toBe(true);
        expect(offer({ replyIds: replies, proposalMessageIds: [at(40 - AI_EVENT_GAP)] })).toBe(false);
        expect(offer({ replyIds: replies, stepMessageIds: [at(10), at(40 - AI_EVENT_GAP)] })).toBe(false);
        expect(offer({ replyIds: replies, stepMessageIds: [at(10), at(39 - AI_EVENT_GAP)] })).toBe(true);
    });

    it('stops at the cap, declined proposals included', () => {
        const replies = ids(200);
        const far = Array.from({ length: MAX_AI_EVENTS_PER_CHAT }, (_, index) => replies[index * 20]);
        expect(offer({ replyIds: replies, proposalMessageIds: far.slice(0, -1) })).toBe(true);
        expect(offer({ replyIds: replies, proposalMessageIds: far })).toBe(false);
    });

    it('knows an intimate moment by its words', () => {
        for (const line of ['She kisses him slowly.', 'They undress by the fire.', 'a soft moan', 'Making love in the loft.', 'Her breasts rise.']) {
            expect(intimateExchange(line)).toBe(true);
        }
        for (const line of ['Mira slams the ledger down.', 'He runs for the harbour.']) {
            expect(intimateExchange(line)).toBe(false);
        }
    });
});

describe('Sudden events the story makes up: what the Judge is asked (pure)', () => {
    const base = () => buildJudgePrompt(JUDGE_FIXTURE_INPUTS[0]);

    it('changes nothing with the switch off', () => {
        expect(withAiEvents(base(), { on: false, offered: false })).toEqual(base());
    });

    it('names the field in the reply shape whenever the switch is on, so the system message never changes from call to call', () => {
        const quiet = withAiEvents(base(), { on: true, offered: false });
        const offered = withAiEvents(base(), { on: true, offered: true });
        expect(quiet.messages[0].content).toBe(offered.messages[0].content);
        expect(quiet.messages[0].content).toContain(' "new_event":null}\nEmpty arrays when nothing changed.');
        expect(quiet.messages[0].content.endsWith(`\n${NEW_EVENT_SHAPE_NOTE}`)).toBe(true);
        // Everything else of the system message is as it was.
        expect(quiet.messages[0].content.replace(',\n "new_event":null}', '}').replace(`\n${NEW_EVENT_SHAPE_NOTE}`, '')).toBe(base().messages[0].content);
        expect(quiet.messages[1].content).toBe(base().messages[1].content);
        expect(quiet.maxTokens).toBe(base().maxTokens);
    });

    it('names it after the facts and the expressions, whichever system message the call sends', () => {
        for (const input of JUDGE_FIXTURE_INPUTS) {
            for (const extra of [{}, { factsSection: '# Established facts\n(none)' }]) {
                const system = withAiEvents(buildJudgePrompt({ ...input, ...extra }), { on: true, offered: false }).messages[0].content;
                expect(system).toMatch(/,\n "new_event":null\}\nEmpty arrays when nothing changed\.\n/);
            }
        }
    });

    it('adds the section after the exchange, with its rule and shape, and room to answer, only when offered', () => {
        const offered = withAiEvents(base(), { on: true, offered: true });
        const user = offered.messages[1].content;
        expect(user.startsWith(base().messages[1].content)).toBe(true);
        expect(user).toContain('\n\n# A new Sudden event\n');
        expect(user).toContain('New event rule: give "new_event" only when the latest exchange itself opens a real moment of pressure');
        expect(user).toContain('Never during an intimate, romantic or sexual moment');
        expect(user).toContain('"new_event": {"reason": "...", "name": "...", "trigger": "...", "gauge": "...", "direction": "lower", "turns": 4');
        expect(user).toContain('it starts at 60, the goal is 20 or lower, 100 fails');
        expect(offered.maxTokens).toBe(base().maxTokens + AI_EVENT_EXTRA_TOKENS);
    });
});

describe('Sudden events the story makes up: reading and taking an answer (pure)', () => {
    it('reads the answer loosely: a trigger and a Gauge are needed, the rest falls back', () => {
        expect(readJudgedNewEvent(PROPOSED)).toEqual({ ...PROPOSED, direction: GaugeDirection.Lower });
        expect(readJudgedNewEvent({ trigger: 'A chase.', gauge: 'Lead', direction: 'RAISE', turns: 12.4 })).toEqual({
            name: 'Lead',
            trigger: 'A chase.',
            gauge: 'Lead',
            direction: GaugeDirection.Raise,
            turns: 8,
            success: '',
            failure: '',
            reason: '',
        });
        expect(readJudgedNewEvent({ trigger: 'x', gauge: 'g', turns: 0 })?.turns).toBe(2);
        expect(readJudgedNewEvent({ trigger: 'x', gauge: 'g', turns: 'many', direction: 'sideways' })).toMatchObject({ turns: 4, direction: 'lower' });
        expect(readJudgedNewEvent({ trigger: 'x', gauge: 'g'.repeat(80) })?.gauge).toHaveLength(40);
        for (const bad of [null, 'yes', [], {}, { trigger: 'x' }, { gauge: 'g' }, { trigger: '  ', gauge: 'g' }]) expect(readJudgedNewEvent(bad)).toBeNull();
        expect(readNewEventFrom(`Here: ${JSON.stringify({ bond_changes: [], new_event: PROPOSED })}`)).toMatchObject({ name: 'The ledger' });
        expect(readNewEventFrom('{"new_event":null}')).toBeNull();
        expect(readNewEventFrom('not json')).toBeNull();
    });

    it('takes one only when offered, nothing else started, and the moment is not intimate', () => {
        const judged = readJudgedNewEvent(PROPOSED)!;
        const context = { offered: true, startedAnother: false, exchange: 'Ash: Where were you?\n@Mira: Explain this.' };
        expect(takeNewEvent(context, judged)).toEqual({ event: judged, rejected: [] });
        expect(takeNewEvent(context, null)).toEqual({ event: null, rejected: [] });
        expect(takeNewEvent({ ...context, offered: false }, judged).rejected[0]).toContain('none was offered');
        expect(takeNewEvent({ ...context, startedAnother: true }, judged).rejected[0]).toContain('another event started');
        expect(takeNewEvent({ ...context, exchange: 'Ash: Come here.\n@Mira: She kisses you.' }, judged).rejected[0]).toContain('intimate');
    });
});

describe('Sudden events the story makes up: the Chat (pure)', () => {
    it('runs an accepted one as an authored event, and never lists a made-up one as waiting', () => {
        const steps = [{ suddenEventId: 9, kind: SuddenEventStepKind.Start, gauge: 60, turnsLeft: 3, reason: 'Now.', messageId: 50 }];
        const state = chatEventState([AUTHORED], [own(9, EventProposal.Accepted, 50), own(10, EventProposal.Offered, 60)], steps);
        expect(state.active).toMatchObject({ event: { id: 9, name: 'The ledger' }, gauge: 60, turnsLeft: 3 });
        expect(state.waiting.map((event) => event.id)).toEqual([1]);
        // An accepted one whose start went with a rewind is not waiting either.
        expect(chatEventState([AUTHORED], [own(9, EventProposal.Accepted, 50)], []).waiting.map((event) => event.id)).toEqual([1]);
    });

    it('shows the newest offered proposal only while its reply is the newest and nothing is under way', () => {
        const events = [own(9, EventProposal.Declined, 50), own(10, EventProposal.Offered, 60)];
        expect(shownProposal(events, false, 60)?.id).toBe(10);
        expect(shownProposal(events, false, 61)).toBeNull();
        expect(shownProposal(events, true, 60)).toBeNull();
        expect(shownProposal(events, false, 50)).toBeNull();
        expect(eventProposalView(own(10, EventProposal.Offered, 60))).toEqual({
            id: 10,
            name: 'The ledger',
            trigger: 'Mira confronts the user.',
            gauge: 'Suspicion',
            direction: 'lower',
            turns: 3,
            start: 60,
            goal: 20,
            fail: 100,
            reason: 'Now.',
        });
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string; error: string | null } | null;
    memory?: { status: string; error: string | null } | null;
}

interface Proposal {
    id: number;
    name: string;
    trigger: string;
    gauge: string;
    direction: string;
    turns: number;
    start: number;
    goal: number;
    fail: number;
    reason: string;
}

interface Chat {
    id: number;
    suddenEvent: { id: number; name: string; status: string; value: number; turnsLeft: number; reason: string } | null;
    eventProposal: Proposal | null;
    messages: Message[];
}

const NO_OPS = '{"operations":[]}';

function judgement(fields: { newEvent?: Record<string, unknown>; suddenEvent?: Record<string, unknown> } = {}): string {
    return JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
        ...(fields.suddenEvent ? { sudden_event: fields.suddenEvent } : {}),
        new_event: fields.newEvent ?? null,
    });
}

describe('Sudden events the story makes up: the switch and play (HTTP)', () => {
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

    async function createStory(aiEvents = true): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' })
            .expect(201);
        if (aiEvents) await t.http.put(`/api/stories/${storyId}/ai-events`).send({ on: true }).expect(200);
        return storyId;
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

    function script(reply: string, judge: string): void {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function play(storyId: number, chatId: number, text: string, judge: string = judgement(), reply = `@Mira: ${text}`): Promise<Chat> {
        script(reply, judge);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    /** Plays `count` quiet replies. */
    async function playQuiet(storyId: number, chatId: number, count: number): Promise<void> {
        for (let i = 0; i < count; i++) await play(storyId, chatId, `Line ${i + 1}.`);
    }

    function lastCall(kind: 'turn' | 'judge'): TextCompletionRequest {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }
    const trailing = () => lastCall('turn').messages.at(-1)!.content;
    const judgedSystem = () => lastCall('judge').messages[0].content;
    const judged = () => lastCall('judge').messages[1].content;
    const proposalUrl = (storyId: number, chatId: number, eventId: number, answer: 'accept' | 'decline') =>
        `/api/stories/${storyId}/chats/${chatId}/event-proposals/${eventId}/${answer}`;

    /** A Chat at its eighth reply, whose judgement proposes `PROPOSED`. */
    async function proposedChat(storyId: number): Promise<Chat> {
        const chat = await createChat(storyId);
        await playQuiet(storyId, chat.id, AI_EVENT_FIRST_AFTER - 1);
        return play(storyId, chat.id, 'Where were you last night?', judgement({ newEvent: PROPOSED }), '@Mira: Explain this ledger.');
    }

    it('is off by default, saved by its switch, and carried by a Duplicate', async () => {
        const storyId = await createStory(false);
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.aiEvents).toBe(false);
        const { body: on } = await t.http.put(`/api/stories/${storyId}/ai-events`).send({ on: true }).expect(200);
        expect(on.aiEvents).toBe(true);
        expect(on.suddenEvents).toEqual([]);
        await t.http.put(`/api/stories/${storyId}/ai-events`).send({ on: 'yes' }).expect(400);
        const { body: copy } = await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201);
        expect(copy.aiEvents).toBe(true);
        await t.http.put(`/api/stories/${storyId}/ai-events`).send({ on: false }).expect(200);
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.aiEvents).toBe(false);
    });

    it('switch off: the Judge is asked exactly as before, and an answer is ignored', async () => {
        const storyId = await createStory(false);
        const chat = await createChat(storyId);
        await playQuiet(storyId, chat.id, AI_EVENT_FIRST_AFTER - 1);
        const played = await play(storyId, chat.id, 'Hm.', judgement({ newEvent: PROPOSED }));
        expect(judgedSystem()).not.toContain('new_event');
        expect(judged()).not.toContain('# A new Sudden event');
        expect(played.eventProposal).toBeNull();
    });

    it('switch on: the shape names the field on every call, the same each time, and the section comes from the eighth reply', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'One.', judgement({ newEvent: PROPOSED }));
        const first = judgedSystem();
        expect(first).toContain('"new_event":null');
        expect(first).toContain(NEW_EVENT_SHAPE_NOTE);
        expect(judged()).not.toContain('# A new Sudden event');
        // Not offered yet, so an answer is dropped.
        expect((await getChat(storyId, chat.id)).eventProposal).toBeNull();
        await playQuiet(storyId, chat.id, AI_EVENT_FIRST_AFTER - 2);
        expect(judgedSystem()).toBe(first);
        expect(judged()).not.toContain('# A new Sudden event');
        await play(storyId, chat.id, 'Eight.');
        expect(judgedSystem()).toBe(first);
        expect(judged()).toContain('# A new Sudden event');
    });

    it('shows a proposal in the Chat, never on the Story, and Not now takes it away for good', async () => {
        const storyId = await createStory();
        const proposed = await proposedChat(storyId);
        expect(proposed.suddenEvent).toBeNull();
        expect(proposed.eventProposal).toEqual({
            id: proposed.eventProposal!.id,
            name: 'The ledger',
            trigger: 'Mira confronts the user with the torn ledger.',
            gauge: 'Suspicion',
            direction: 'lower',
            turns: 3,
            start: 60,
            goal: 20,
            fail: 100,
            reason: 'Mira has found the ledger.',
        });
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.suddenEvents).toEqual([]);
        // Nothing has started: the Narrator is told of no event.
        const id = proposed.eventProposal!.id;
        const { body: declined } = await t.http.post(proposalUrl(storyId, proposed.id, id, 'decline')).expect(200);
        expect(declined.eventProposal).toBeNull();
        expect(declined.suddenEvent).toBeNull();
        await t.http.post(proposalUrl(storyId, proposed.id, id, 'decline')).expect(409);
        await t.http.post(proposalUrl(storyId, proposed.id, id, 'accept')).expect(409);
        // The next reply is too close to it for another.
        const next = await play(storyId, proposed.id, 'On.', judgement({ newEvent: PROPOSED }));
        expect(trailing()).not.toContain('sudden event');
        expect(judged()).not.toContain('# A new Sudden event');
        expect(next.eventProposal).toBeNull();
    });

    it('Start it runs it as an authored event: the Narrator, the Judge, the Gauge and its end', async () => {
        const storyId = await createStory();
        const proposed = await proposedChat(storyId);
        const id = proposed.eventProposal!.id;
        const { body: started } = await t.http.post(proposalUrl(storyId, proposed.id, id, 'accept')).expect(200);
        expect(started.eventProposal).toBeNull();
        expect(started.suddenEvent).toEqual({
            id,
            name: 'The ledger',
            gauge: 'Suspicion',
            direction: 'lower',
            status: 'active',
            value: 60,
            start: 60,
            goal: 20,
            fail: 100,
            turnsLeft: 3,
            reason: 'Mira has found the ledger.',
        });
        await t.http.post(proposalUrl(storyId, proposed.id, id, 'accept')).expect(409);

        const moved = await play(storyId, proposed.id, 'I was at the harbour.', judgement({ suddenEvent: { gauge: 40, reason: 'A fair answer.' }, newEvent: PROPOSED }));
        expect(trailing()).toContain('A sudden event is under way: The ledger. Suspicion stands at 60 of 100; Ash is trying to bring it down to 20 or lower, and 3 replies are left.');
        expect(judged()).toContain('# Sudden event under way\nThe ledger. It began when: Mira confronts the user with the torn ledger.');
        expect(judged()).not.toContain('# A new Sudden event');
        expect(moved.suddenEvent).toMatchObject({ status: 'active', value: 40, turnsLeft: 2 });
        expect(moved.eventProposal).toBeNull();

        const won = await play(storyId, proposed.id, 'Ask the ferryman.', judgement({ suddenEvent: { gauge: 15, reason: 'She believes you.' } }));
        expect(won.suddenEvent).toMatchObject({ status: 'success', value: 15 });
        await play(storyId, proposed.id, 'Thank you.');
        expect(trailing()).toContain('The sudden event The ledger has just ended: Ash came through it (Suspicion ended at 15 of 100). What follows: Mira believes the user and hides the ledger.');
        // It never waits to start again, and the Story's list never had it.
        expect(judged()).not.toContain('# Sudden events');
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.suddenEvents).toEqual([]);
    });

    it('lapses when the user plays on, and an intimate moment proposes nothing', async () => {
        const storyId = await createStory();
        const proposed = await proposedChat(storyId);
        const lapsed = await play(storyId, proposed.id, 'Never mind.');
        expect(lapsed.eventProposal).toBeNull();
        await t.http.post(proposalUrl(storyId, proposed.id, proposed.eventProposal!.id, 'accept')).expect(409);

        const chat = await createChat(storyId);
        await playQuiet(storyId, chat.id, AI_EVENT_FIRST_AFTER - 1);
        const tender = await play(storyId, chat.id, 'Come here.', judgement({ newEvent: PROPOSED }), '@Mira: She kisses you, slow.');
        expect(judged()).toContain('# A new Sudden event');
        expect(tender.eventProposal).toBeNull();
    });

    it('is never offered while an authored event is under way, nor in the reply that starts one', async () => {
        const storyId = await createStory();
        await t.http
            .post(`/api/stories/${storyId}/sudden-events`)
            .send({ name: 'The dare', trigger: 'Kai dares Ash.', gauge: 'Nerve', direction: 'raise', turns: 3 })
            .expect(201);
        const chat = await createChat(storyId);
        await playQuiet(storyId, chat.id, AI_EVENT_FIRST_AFTER - 1);
        const started = await play(storyId, chat.id, 'Fine, I dare.', judgement({ suddenEvent: { start: 1, reason: 'Kai dares.' }, newEvent: PROPOSED }));
        expect(started.suddenEvent).toMatchObject({ name: 'The dare', status: 'active' });
        expect(started.eventProposal).toBeNull();
        await play(storyId, chat.id, 'Up I go.', judgement({ suddenEvent: { gauge: 50, reason: 'Steady.' } }));
        expect(judged()).not.toContain('# A new Sudden event');
    });

    it('goes back with the reply that proposed it: Regenerate, and Reset', async () => {
        const storyId = await createStory();
        const proposed = await proposedChat(storyId);
        const id = proposed.eventProposal!.id;
        await t.http.post(proposalUrl(storyId, proposed.id, id, 'accept')).expect(200);

        // Again on the proposing reply: the event and its start go; the new judgement proposes nothing.
        script('@Mira: Never mind the ledger.', judgement());
        const again = await t.http.post(`/api/stories/${storyId}/chats/${proposed.id}/messages/${proposed.messages.at(-1)!.id}/regenerate`).expect(200);
        expect(again.body.suddenEvent).toBeNull();
        const after = await settled(storyId, proposed.id);
        expect(after.suddenEvent).toBeNull();
        expect(after.eventProposal).toBeNull();
        expect(judged()).toContain('# A new Sudden event');

        script('@Mira: Explain this ledger.', judgement({ newEvent: PROPOSED }));
        await t.http.post(`/api/stories/${storyId}/chats/${proposed.id}/messages/${after.messages.at(-1)!.id}/regenerate`).expect(200);
        expect((await settled(storyId, proposed.id)).eventProposal).toMatchObject({ name: 'The ledger' });

        const { body: reset } = await t.http.post(`/api/stories/${storyId}/chats/${proposed.id}/reset`).expect(200);
        expect(reset.eventProposal).toBeNull();
        expect(reset.suddenEvent).toBeNull();
    });

    it('a Branch carries an accepted event as it stood, as its own, and a Branch from before the proposal has none', async () => {
        const storyId = await createStory();
        const proposed = await proposedChat(storyId);
        const id = proposed.eventProposal!.id;
        await t.http.post(proposalUrl(storyId, proposed.id, id, 'accept')).expect(200);
        await play(storyId, proposed.id, 'Hm.', judgement({ suddenEvent: { gauge: 50, reason: 'Unsure.' } }));

        const proposingReply = proposed.messages.at(-1)!;
        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${proposed.id}/messages/${proposingReply.id}/branch`).expect(201);
        expect(branch.suddenEvent).toMatchObject({ name: 'The ledger', status: 'active', value: 60, turnsLeft: 3 });
        expect(branch.suddenEvent.id).not.toBe(id);
        const moved = await play(storyId, branch.id, 'Well.', judgement({ suddenEvent: { gauge: 80, reason: 'Worse.' } }));
        expect(moved.suddenEvent).toMatchObject({ value: 80, turnsLeft: 2 });
        expect((await getChat(storyId, proposed.id)).suddenEvent).toMatchObject({ id, value: 50 });

        // Deleting the source leaves the Branch's event where it is.
        await t.http.delete(`/api/stories/${storyId}/chats/${proposed.id}`).expect(204);
        expect((await getChat(storyId, branch.id)).suddenEvent).toMatchObject({ value: 80 });

        // The Branch's reply before the one that proposed it: [..., reply 7, line 8, reply 8 (proposing), line 9, reply 9].
        const branched = await getChat(storyId, branch.id);
        const earlier = branched.messages[branched.messages.length - 5];
        expect(earlier.kind).toBe('ai');
        const { body: before } = await t.http.post(`/api/stories/${storyId}/chats/${branch.id}/messages/${earlier.id}/branch`).expect(201);
        expect(before.suddenEvent).toBeNull();
        expect(before.eventProposal).toBeNull();
    });
});

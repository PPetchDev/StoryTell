import { trailingOf } from './harness/prompt-layers.js';
import { buildJudgePrompt, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import {
    applySuddenEvent,
    EventDefinition,
    EventStep,
    eventState,
    judgeSuddenEventSection,
    promptSuddenEvent,
    readJudgedSuddenEvent,
    suddenEventBlock,
    suddenEventView,
} from '../src/manager/chat/sudden-event/sudden-event.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { SuddenEventStepKind } from '../src/model/ledger/entities/sudden-event-step.entity.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { GaugeDirection } from '../src/model/story/entities/sudden-event.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Sudden events (.scratch/sudden-events/spec.md): the rules of the Gauge and what the Judge and the
 * Narrator are told, as pure logic; then authoring and play through the HTTP API with the fake
 * gateway scripted.
 */

const INTERROGATION: EventDefinition = {
    id: 1,
    name: 'The interrogation',
    trigger: 'Mira questions the user about the missing oil.',
    gauge: 'Suspicion',
    direction: GaugeDirection.Lower,
    turns: 3,
    success: 'Mira lets it go and shares the watch.',
    failure: 'Mira locks the lamp room.',
};
const COURTSHIP: EventDefinition = {
    id: 2,
    name: '',
    trigger: 'Kai dares the user to climb the gallery.',
    gauge: 'Nerve',
    direction: GaugeDirection.Raise,
    turns: 2,
    success: '',
    failure: '',
};
const DRAFT: EventDefinition = { ...INTERROGATION, id: 3, trigger: '  ' };

const step = (kind: SuddenEventStepKind, gauge: number, turnsLeft: number, messageId: number, suddenEventId = 1, reason = 'because'): EventStep => ({
    suddenEventId,
    kind,
    gauge,
    turnsLeft,
    reason,
    messageId,
});
const { Start, Move, Success, Failure } = SuddenEventStepKind;
const judgeInput = () => JUDGE_FIXTURE_INPUTS[0];

describe('Sudden events: the state read from the steps (pure)', () => {
    it('waits for every ready event with no step, and holds none under way at first', () => {
        const state = eventState([INTERROGATION, COURTSHIP, DRAFT], []);
        expect(state.active).toBeNull();
        expect(state.ended).toBeNull();
        expect(state.waiting.map((event) => event.id)).toEqual([1, 2]);
    });

    it('is under way from its start through its moves, at the newest Gauge, and no longer waits', () => {
        const state = eventState([INTERROGATION, COURTSHIP], [step(Start, 60, 3, 4), step(Move, 45, 2, 6, 1, 'A calm answer.')]);
        expect(state.active).toEqual({ event: INTERROGATION, gauge: 45, turnsLeft: 2, reason: 'A calm answer.' });
        expect(state.ended).toBeNull();
        expect(state.waiting.map((event) => event.id)).toEqual([2]);
    });

    it('has ended with its last step, runs once, and an event the Story no longer has is nothing', () => {
        const ended = eventState([INTERROGATION, COURTSHIP], [step(Start, 60, 3, 4), step(Success, 20, 1, 6)]);
        expect(ended.active).toBeNull();
        expect(ended.ended).toMatchObject({ outcome: 'success', gauge: 20, messageId: 6 });
        expect(ended.waiting.map((event) => event.id)).toEqual([2]);
        expect(eventState([INTERROGATION], [step(Failure, 100, 0, 6)]).ended?.outcome).toBe('failure');
        // Its definition is gone (the author removed it): no event under way, none ended.
        const gone = eventState([COURTSHIP], [step(Start, 60, 3, 4)]);
        expect(gone.active).toBeNull();
        expect(gone.ended).toBeNull();
    });

    it('shows the Chat screen the event under way, and an ended one only while its reply is the newest', () => {
        const active = eventState([INTERROGATION], [step(Start, 60, 3, 4, 1, 'She corners you.')]);
        expect(suddenEventView(active, 4)).toEqual({
            id: 1,
            name: 'The interrogation',
            gauge: 'Suspicion',
            direction: 'lower',
            status: 'active',
            value: 60,
            start: 60,
            goal: 20,
            fail: 100,
            turnsLeft: 3,
            reason: 'She corners you.',
        });
        const ended = eventState([INTERROGATION], [step(Start, 60, 3, 4), step(Failure, 70, 0, 8, 1, 'Time ran out.')]);
        expect(suddenEventView(ended, 8)).toMatchObject({ status: 'failure', value: 70, turnsLeft: 0, reason: 'Time ran out.' });
        expect(suddenEventView(ended, 10)).toBeNull();
        // A nameless event goes by its Gauge.
        expect(suddenEventView(eventState([COURTSHIP], [step(Start, 40, 2, 4, 2)]), 4)).toMatchObject({ name: 'Nerve', start: 40, goal: 80, fail: 0 });
    });
});

describe('Sudden events: what the Judge is asked and how its answer is applied (pure)', () => {
    it('has no section for a Story with nothing to start, and the judge prompt is then as it was', () => {
        expect(judgeSuddenEventSection(eventState([], []))).toBeNull();
        expect(judgeSuddenEventSection(eventState([DRAFT], []))).toBeNull();
        const input = judgeInput();
        expect(buildJudgePrompt({ ...input, suddenEventSection: null })).toEqual(buildJudgePrompt(input));
        expect(buildJudgePrompt(input).messages[1].content).not.toContain('Sudden event');
    });

    it('lists the waiting events by number with their triggers, after the Time of day, and raises the token cap', () => {
        const section = judgeSuddenEventSection(eventState([INTERROGATION, COURTSHIP], []))!;
        expect(section).toContain('# Sudden events\nNone is under way.');
        expect(section).toContain('1. The interrogation — starts when: Mira questions the user about the missing oil.');
        expect(section).toContain('2. Nerve — starts when: Kai dares the user to climb the gallery.');
        expect(section).toContain('"sudden_event": {"reason": "...", "start": 1}');
        const input = judgeInput();
        const prompt = buildJudgePrompt({ ...input, suddenEventSection: section });
        const user = prompt.messages[1].content;
        expect(user.indexOf('# Time of day')).toBeLessThan(user.indexOf('# Sudden events'));
        expect(user.indexOf('# Sudden events')).toBeLessThan(user.indexOf('# Recent story'));
        // The system message, and with it the cached prefix, never changes.
        expect(prompt.messages[0].content).toBe(buildJudgePrompt(input).messages[0].content);
        expect(prompt.maxTokens).toBeGreaterThan(buildJudgePrompt(input).maxTokens);
    });

    it('under way, states the Gauge, the goal, the failing end and the replies left', () => {
        const section = judgeSuddenEventSection(eventState([INTERROGATION, COURTSHIP], [step(Start, 60, 3, 4)]))!;
        expect(section).toContain('# Sudden event under way\nThe interrogation. It began when: Mira questions the user about the missing oil.');
        expect(section).toContain('Gauge: Suspicion, now 60 on a scale of 0 to 100. The user is trying to bring it down to 20 or lower; at 100 they fail at once.');
        expect(section).toContain('Replies left after this one: 2.');
        expect(section).toContain('"sudden_event": {"reason": "...", "gauge": 0}');
        expect(section).not.toContain('starts when');
        const last = judgeSuddenEventSection(eventState([COURTSHIP], [step(Move, 55, 1, 6, 2)]))!;
        expect(last).toContain('bring it up to 80 or higher; at 0 they fail at once.');
        expect(last).toContain('This is the last reply: after it the event ends.');
    });

    it('reads the answer loosely', () => {
        expect(readJudgedSuddenEvent({ start: 2, reason: ' She asks. ' })).toEqual({ start: 2, gauge: null, reason: 'She asks.' });
        expect(readJudgedSuddenEvent({ gauge: 41.6, reason: 'Calm.' })).toEqual({ start: null, gauge: 42, reason: 'Calm.' });
        expect(readJudgedSuddenEvent({ gauge: '40' })).toBeNull();
        expect(readJudgedSuddenEvent(null)).toBeNull();
        expect(readJudgedSuddenEvent([1])).toBeNull();
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null,"sudden_event":{"start":1,"reason":"Now."}}').suddenEvent).toEqual({
            start: 1,
            gauge: null,
            reason: 'Now.',
        });
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null}').suddenEvent).toBeNull();
    });

    it('starts a waiting event the Judge names, at its starting Gauge with all its replies', () => {
        const waiting = eventState([INTERROGATION, COURTSHIP], []);
        expect(applySuddenEvent(waiting, { start: 2, gauge: null, reason: 'Kai dares you.' })).toEqual({
            step: { suddenEventId: 2, kind: Start, gauge: 40, turnsLeft: 2, reason: 'Kai dares you.' },
            rejected: [],
        });
        expect(applySuddenEvent(waiting, null)).toEqual({ step: null, rejected: [] });
        expect(applySuddenEvent(waiting, { start: 3, gauge: null, reason: '' }).step).toBeNull();
        expect(applySuddenEvent(waiting, { start: 3, gauge: null, reason: '' }).rejected).toEqual(['Sudden event: start 3 names no waiting event']);
        expect(applySuddenEvent(waiting, { start: null, gauge: 30, reason: '' }).rejected).toEqual(['Sudden event: a Gauge with none under way']);
    });

    it('moves the Gauge at most 30 a reply, on its scale, and uses a reply each time, even when the Judge says nothing', () => {
        const at = (gauge: number, turnsLeft: number) => eventState([INTERROGATION], [step(Start, gauge, turnsLeft, 4)]);
        expect(applySuddenEvent(at(60, 3), { start: null, gauge: 45, reason: 'A calm answer.' }).step).toEqual({
            suddenEventId: 1,
            kind: Move,
            gauge: 45,
            turnsLeft: 2,
            reason: 'A calm answer.',
        });
        const held = applySuddenEvent(at(60, 3), { start: null, gauge: 95, reason: 'You snap at her.' });
        expect(held.step).toMatchObject({ kind: Move, gauge: 90, turnsLeft: 2 });
        expect(held.rejected).toEqual(['Sudden event: Gauge 60 → 95 held to 90']);
        expect(applySuddenEvent(at(60, 3), null).step).toEqual({ suddenEventId: 1, kind: Move, gauge: 60, turnsLeft: 2, reason: '' });
        expect(applySuddenEvent(at(60, 3), { start: 1, gauge: null, reason: 'Again.' })).toEqual({
            step: { suddenEventId: 1, kind: Move, gauge: 60, turnsLeft: 2, reason: '' },
            rejected: ['Sudden event: a start while one is under way'],
        });
    });

    it('ends with the goal reached, at the failing end, or with no replies left', () => {
        const at = (event: EventDefinition, gauge: number, turnsLeft: number) => eventState([event], [step(Start, gauge, turnsLeft, 4, event.id)]);
        expect(applySuddenEvent(at(INTERROGATION, 45, 2), { start: null, gauge: 20, reason: 'She believes you.' }).step).toMatchObject({ kind: Success, gauge: 20, turnsLeft: 1 });
        // Reaching the goal on the last reply is still a success.
        expect(applySuddenEvent(at(INTERROGATION, 45, 1), { start: null, gauge: 18, reason: '' }).step).toMatchObject({ kind: Success, gauge: 18, turnsLeft: 0 });
        expect(applySuddenEvent(at(INTERROGATION, 80, 3), { start: null, gauge: 100, reason: 'She has heard enough.' }).step).toMatchObject({ kind: Failure, gauge: 100, turnsLeft: 2 });
        expect(applySuddenEvent(at(INTERROGATION, 45, 1), { start: null, gauge: 30, reason: 'Not enough.' }).step).toMatchObject({ kind: Failure, gauge: 30, turnsLeft: 0 });
        expect(applySuddenEvent(at(COURTSHIP, 60, 2), { start: null, gauge: 85, reason: '' }).step).toMatchObject({ kind: Success, gauge: 85 });
        expect(applySuddenEvent(at(COURTSHIP, 20, 2), { start: null, gauge: -5, reason: '' }).step).toMatchObject({ kind: Failure, gauge: 0 });
    });
});

describe('Sudden events: what the Narrator is told (pure)', () => {
    const input = (overrides: Partial<TurnPromptInput> = {}): TurnPromptInput => ({
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
        memories: [],
        history: [{ role: 'assistant', text: '@Mira: Where is the oil?' }],
        userText: 'I show her the ledger.',
        present: ['Mira'],
        ...overrides,
    });

    it('tells the event under way after "Where things stand", in the trailing message only, and leaves the outcome to the Gauge', () => {
        const event = promptSuddenEvent(eventState([INTERROGATION], [step(Start, 60, 3, 4)]), 4)!;
        const prompt = buildTurnPrompt(input({ suddenEvent: event, nudge: 'Mira', cue: 'Make her sharper.' }));
        const trailing = trailingOf(prompt);
        const line =
            'A sudden event is under way: The interrogation. Suspicion stands at 60 of 100; Ash is trying to bring it down to 20 or lower, and 3 replies are left.';
        expect(trailing).toContain(line);
        expect(trailing).toContain("Don't settle it yourself, and never mention the gauge, its numbers or a \"sudden event\" in the story.");
        expect(trailing.indexOf('Where things stand:')).toBeLessThan(trailing.indexOf(line));
        expect(trailing.indexOf(line)).toBeLessThan(trailing.indexOf('would like to hear from Mira'));
        expect(trailing.indexOf("The user's cue")).toBeLessThan(trailing.indexOf('Write the next turn now.'));
        expect(prompt.messages.slice(0, -1).some((message) => message.content.includes('sudden event'))).toBe(false);
        const last = suddenEventBlock(promptSuddenEvent(eventState([INTERROGATION], [step(Move, 45, 1, 6)]), 6), 'Ash')!;
        expect(last).toContain('and this reply is the last one they have.');
    });

    it('tells the outcome in the reply after it ended, with what the author wrote follows, and nothing after that', () => {
        const ended = eventState([INTERROGATION], [step(Start, 60, 3, 4), step(Success, 15, 1, 6)]);
        const block = suddenEventBlock(promptSuddenEvent(ended, 6), 'Ash')!;
        expect(block).toContain('The sudden event The interrogation has just ended: Ash came through it (Suspicion ended at 15 of 100). What follows: Mira lets it go and shares the watch.');
        expect(block).toContain('Show that outcome in this reply');
        expect(promptSuddenEvent(ended, 8)).toBeNull();
        const failed = eventState([COURTSHIP], [step(Failure, 0, 1, 6, 2)]);
        const failure = suddenEventBlock(promptSuddenEvent(failed, 6), 'Ash')!;
        expect(failure).toContain('has just ended: it went against Ash (Nerve ended at 0 of 100). Show that outcome');
    });

    it('adds nothing without one: the prompt equals one built without the field', () => {
        expect(suddenEventBlock(null, 'Ash')).toBeNull();
        expect(buildTurnPrompt(input({ suddenEvent: null }))).toEqual(buildTurnPrompt(input()));
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string; error: string | null } | null;
    memory?: { status: string; error: string | null } | null;
}

interface EventView {
    id: number;
    name: string;
    gauge: string;
    status: 'active' | 'success' | 'failure';
    value: number;
    turnsLeft: number;
    reason: string;
}

interface Chat {
    id: number;
    suddenEvent: EventView | null;
    messages: Message[];
}

interface StoryEvent {
    id: number;
    name: string;
    trigger: string;
    gauge: string;
    direction: string;
    turns: number;
    success: string;
    failure: string;
}

const NO_OPS = '{"operations":[]}';

/** A judgement that changes nothing but what it says of Sudden events. */
function judgement(suddenEvent?: Record<string, unknown>): string {
    return JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
        ...(suddenEvent ? { sudden_event: suddenEvent } : {}),
    });
}

describe('Sudden events: authoring and play (HTTP)', () => {
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

    async function createStory(): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' })
            .expect(201);
        return storyId;
    }

    async function addEvent(storyId: number, fields: Partial<StoryEvent> = {}): Promise<StoryEvent> {
        const { body } = await t.http
            .post(`/api/stories/${storyId}/sudden-events`)
            .send({
                name: 'The interrogation',
                trigger: 'Mira questions Ash about the missing oil.',
                gauge: 'Suspicion',
                turns: 3,
                success: 'Mira shares the watch.',
                failure: 'Mira locks the lamp room.',
                ...fields,
            })
            .expect(201);
        return (body.suddenEvents as StoryEvent[]).at(-1)!;
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

    async function play(storyId: number, chatId: number, text: string, judge: string = judgement()): Promise<Chat> {
        script(`@Mira: ${text}`, judge);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function lastCall(kind: 'turn' | 'judge'): TextCompletionRequest {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }
    const trailing = () => lastCall('turn').messages.at(-1)!.content;
    const judged = () => lastCall('judge').messages[1].content;

    it('adds an event with its defaults, saves each field, and refuses what is out of range', async () => {
        const storyId = await createStory();
        const { body: added } = await t.http.post(`/api/stories/${storyId}/sudden-events`).send({}).expect(201);
        const event = added.suddenEvents[0] as StoryEvent;
        expect(event).toEqual({ id: event.id, name: '', trigger: '', gauge: '', direction: 'lower', turns: 4, success: '', failure: '' });
        // An unfinished event never stops the Story being played.
        expect(added.playable).toBe(true);

        const { body: saved } = await t.http
            .patch(`/api/stories/${storyId}/sudden-events/${event.id}`)
            .send({ name: 'The dare', trigger: 'Kai dares Ash.', gauge: 'Nerve', direction: 'raise', turns: 2, success: 'Kai grins.', failure: 'Kai laughs.' })
            .expect(200);
        expect(saved.suddenEvents).toEqual([
            { id: event.id, name: 'The dare', trigger: 'Kai dares Ash.', gauge: 'Nerve', direction: 'raise', turns: 2, success: 'Kai grins.', failure: 'Kai laughs.' },
        ]);
        // One field at a time, as autosave sends them.
        const { body: one } = await t.http.patch(`/api/stories/${storyId}/sudden-events/${event.id}`).send({ turns: 8 }).expect(200);
        expect(one.suddenEvents[0]).toMatchObject({ name: 'The dare', turns: 8 });

        for (const bad of [{ turns: 1 }, { turns: 9 }, { turns: 2.5 }, { direction: 'sideways' }, { gauge: 'x'.repeat(41) }]) {
            await t.http.patch(`/api/stories/${storyId}/sudden-events/${event.id}`).send(bad).expect(400);
        }
        await t.http.patch(`/api/stories/${storyId}/sudden-events/999999`).send({ name: 'x' }).expect(404);
        await t.http.delete(`/api/stories/${storyId}/sudden-events/999999`).expect(404);

        const { body: removed } = await t.http.delete(`/api/stories/${storyId}/sudden-events/${event.id}`).expect(200);
        expect(removed.suddenEvents).toEqual([]);
    });

    it('holds at most twelve, and a Duplicate carries them all', async () => {
        const storyId = await createStory();
        for (let i = 1; i <= 12; i++) await addEvent(storyId, { name: `Event ${i}`, direction: i % 2 ? 'lower' : 'raise' });
        const { body: refused } = await t.http.post(`/api/stories/${storyId}/sudden-events`).send({}).expect(422);
        expect(refused.error.message).toContain('at most 12 Sudden events');

        const { body: copy } = await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201);
        const original = (await t.http.get(`/api/stories/${storyId}`).expect(200)).body.suddenEvents as StoryEvent[];
        const copied = copy.suddenEvents as StoryEvent[];
        expect(copied.map(({ id: _id, ...fields }) => fields)).toEqual(original.map(({ id: _id, ...fields }) => fields));
        expect(copied.every((event, index) => event.id !== original[index].id)).toBe(true);
    });

    it('a Story without one asks the Judge nothing about them and shows none', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        expect(chat.suddenEvent).toBeNull();
        const played = await play(storyId, chat.id, 'One.', judgement({ start: 1, reason: 'Made up.' }));
        expect(judged()).not.toContain('Sudden event');
        expect(trailing()).not.toContain('sudden event');
        expect(played.suddenEvent).toBeNull();
    });

    it('starts on its trigger, moves with each reply, ends in success, and tells the Narrator each step of the way', async () => {
        const storyId = await createStory();
        const event = await addEvent(storyId);
        await addEvent(storyId, { name: 'Unfinished', trigger: '' });
        const chat = await createChat(storyId);

        // Waiting: the Judge is shown the ready event only, and nothing starts until it says so.
        const quiet = await play(storyId, chat.id, 'Evening.');
        expect(judged()).toContain('# Sudden events\nNone is under way.');
        expect(judged()).toContain('1. The interrogation — starts when: Mira questions Ash about the missing oil.');
        expect(judged()).not.toContain('Unfinished');
        expect(trailing()).not.toContain('sudden event');
        expect(quiet.suddenEvent).toBeNull();

        const started = await play(storyId, chat.id, 'Where is the oil?', judgement({ start: 1, reason: 'Mira asks about the oil.' }));
        expect(started.suddenEvent).toEqual({
            id: event.id,
            name: 'The interrogation',
            gauge: 'Suspicion',
            direction: 'lower',
            status: 'active',
            value: 60,
            start: 60,
            goal: 20,
            fail: 100,
            turnsLeft: 3,
            reason: 'Mira asks about the oil.',
        });

        const moved = await play(storyId, chat.id, 'Hm.', judgement({ gauge: 40, reason: 'The ledger backs you up.' }));
        // The reply was written with the event under way; its judgement was asked for the Gauge.
        expect(trailing()).toContain('A sudden event is under way: The interrogation. Suspicion stands at 60 of 100; Ash is trying to bring it down to 20 or lower, and 3 replies are left.');
        expect(judged()).toContain('# Sudden event under way\nThe interrogation.');
        expect(judged()).toContain('Gauge: Suspicion, now 60 on a scale of 0 to 100.');
        expect(judged()).toContain('Replies left after this one: 2.');
        expect(moved.suddenEvent).toMatchObject({ status: 'active', value: 40, turnsLeft: 2, reason: 'The ledger backs you up.' });

        // A move past the step limit is held to it; 10 is at or under the goal, so it ends in success.
        const won = await play(storyId, chat.id, 'Fine.', judgement({ gauge: 0, reason: 'She believes you.' }));
        expect(trailing()).toContain('Suspicion stands at 40 of 100');
        expect(won.suddenEvent).toMatchObject({ status: 'success', value: 10, turnsLeft: 0, reason: 'She believes you.' });

        // The next reply shows the outcome; after it the event is over for good and never starts again.
        const after = await play(storyId, chat.id, 'Take the watch.', judgement({ start: 1, reason: 'Again?' }));
        expect(trailing()).toContain('The sudden event The interrogation has just ended: Ash came through it (Suspicion ended at 10 of 100). What follows: Mira shares the watch.');
        expect(judged()).not.toContain('Sudden event');
        expect(after.suddenEvent).toBeNull();
        await play(storyId, chat.id, 'Later.');
        expect(trailing()).not.toContain('sudden event');
    });

    it('an Epilogue stands outside the event: it uses none of its replies, the Judge is not asked about it, and play goes on from where it stood', async () => {
        const storyId = await createStory();
        await addEvent(storyId);
        const chat = await createChat(storyId);
        const started = await play(storyId, chat.id, 'Where is the oil?', judgement({ start: 1, reason: 'Mira asks about the oil.' }));
        expect(started.suddenEvent).toMatchObject({ status: 'active', value: 60, turnsLeft: 3 });

        // The Judge would move the Gauge here, but an Epilogue is not one of the event's replies (docs/ui-audit-2026-11-16.md M6).
        script('The lamp burned on for forty winters.', judgement({ gauge: 30, reason: 'It closed.' }));
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/epilogue`).expect(200);
        const closed = await settled(storyId, chat.id);
        expect(closed.messages.at(-1)).toMatchObject({ kind: 'ai', epilogue: true });
        expect(trailing()).not.toContain('sudden event');
        expect(judged()).not.toContain('Sudden event');
        expect(closed.suddenEvent).toMatchObject({ status: 'active', value: 60, turnsLeft: 3, reason: 'Mira asks about the oil.' });

        // Played on, the event is where it was: this reply is its first after the start.
        const on = await play(storyId, chat.id, 'I show her the ledger.', judgement({ gauge: 40, reason: 'The ledger backs you up.' }));
        expect(judged()).toContain('# Sudden event under way\nThe interrogation.');
        expect(judged()).toContain('Replies left after this one: 2.');
        expect(on.suddenEvent).toMatchObject({ status: 'active', value: 40, turnsLeft: 2 });
    });

    it('fails when the replies run out, and at once at the far end of the Gauge', async () => {
        const storyId = await createStory();
        await addEvent(storyId, { turns: 2 });
        const slow = await createChat(storyId);
        await play(storyId, slow.id, 'Oil?', judgement({ start: 1, reason: 'She asks.' }));
        // The Judge says nothing of the Gauge: it stays, and the reply is still used.
        expect((await play(storyId, slow.id, 'Hm.')).suddenEvent).toMatchObject({ status: 'active', value: 60, turnsLeft: 1, reason: '' });
        const lost = await play(storyId, slow.id, 'Well?', judgement({ gauge: 45, reason: 'Too little, too late.' }));
        expect(judged()).toContain('This is the last reply: after it the event ends.');
        expect(lost.suddenEvent).toMatchObject({ status: 'failure', value: 45, turnsLeft: 0 });
        await play(storyId, slow.id, 'Out.');
        expect(trailing()).toContain('has just ended: it went against Ash (Suspicion ended at 45 of 100). What follows: Mira locks the lamp room.');

        const loud = await createChat(storyId);
        await play(storyId, loud.id, 'Oil?', judgement({ start: 1, reason: 'She asks.' }));
        expect((await play(storyId, loud.id, 'What?', judgement({ gauge: 90, reason: 'You shout.' }))).suddenEvent).toMatchObject({ status: 'active', value: 90, turnsLeft: 1 });
        // A second Chat of the same Story runs the event on its own.
        expect((await getChat(storyId, slow.id)).suddenEvent).toBeNull();
        const broke = await play(storyId, loud.id, 'Enough.', judgement({ gauge: 100, reason: 'She has heard enough.' }));
        expect(broke.suddenEvent).toMatchObject({ status: 'failure', value: 100 });
    });

    it('takes a step back with the reply that made it: Regenerate, an edit and Reset', async () => {
        const storyId = await createStory();
        await addEvent(storyId);
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'Oil?', judgement({ start: 1, reason: 'She asks.' }));
        const moved = await play(storyId, chat.id, 'Hm.', judgement({ gauge: 80, reason: 'A bad answer.' }));
        expect(moved.suddenEvent).toMatchObject({ value: 80, turnsLeft: 2 });

        // Again: the move is undone before the new reply is written, and its own judgement moves the Gauge afresh.
        script('@Mira: Go on.', judgement({ gauge: 45, reason: 'A better answer.' }));
        const again = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${moved.messages.at(-1)!.id}/regenerate`).expect(200);
        expect(again.body.suddenEvent).toMatchObject({ status: 'active', value: 60, turnsLeft: 3 });
        expect(trailing()).toContain('Suspicion stands at 60 of 100');
        expect((await settled(storyId, chat.id)).suddenEvent).toMatchObject({ value: 45, turnsLeft: 2, reason: 'A better answer.' });

        // Editing the User Message whose reply started it takes the whole event back; it can start again.
        script('@Mira: Nothing.', judgement());
        const edited = await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${moved.messages[1].id}`).send({ text: 'Good evening.' }).expect(200);
        expect(edited.body.suddenEvent).toBeNull();
        await settled(storyId, chat.id);
        const restarted = await play(storyId, chat.id, 'Oil?', judgement({ start: 1, reason: 'She asks after all.' }));
        expect(judged()).toContain('1. The interrogation — starts when');
        expect(restarted.suddenEvent).toMatchObject({ status: 'active', value: 60, turnsLeft: 3 });

        const reset = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        expect(reset.body.suddenEvent).toBeNull();
        await play(storyId, chat.id, 'Hello.');
        expect(judged()).toContain('# Sudden events\nNone is under way.');
    });

    it('a Branch carries the event as it stood at its Message, and removing the event ends it everywhere', async () => {
        const storyId = await createStory();
        const event = await addEvent(storyId);
        const chat = await createChat(storyId);
        const started = await play(storyId, chat.id, 'Oil?', judgement({ start: 1, reason: 'She asks.' }));
        await play(storyId, chat.id, 'Hm.', judgement({ gauge: 40, reason: 'Good.' }));

        const startReply = started.messages.at(-1)!;
        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${startReply.id}/branch`).expect(201);
        expect(branch.suddenEvent).toMatchObject({ status: 'active', value: 60, turnsLeft: 3, reason: 'She asks.' });
        expect((await getChat(storyId, chat.id)).suddenEvent).toMatchObject({ value: 40, turnsLeft: 2 });
        // The Branch plays on by itself.
        expect((await play(storyId, branch.id, 'Well.', judgement({ gauge: 75, reason: 'Worse.' }))).suddenEvent).toMatchObject({ value: 75, turnsLeft: 2 });
        expect((await getChat(storyId, chat.id)).suddenEvent).toMatchObject({ value: 40 });

        await t.http.delete(`/api/stories/${storyId}/sudden-events/${event.id}`).expect(200);
        expect((await getChat(storyId, chat.id)).suddenEvent).toBeNull();
        expect((await getChat(storyId, branch.id)).suddenEvent).toBeNull();
        await play(storyId, chat.id, 'On.');
        expect(judged()).not.toContain('Sudden event');
        expect(trailing()).not.toContain('sudden event');
    });
});

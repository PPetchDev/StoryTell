import pg from 'pg';

import { parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { stateReminder } from '../src/manager/chat/turn/prompt.js';
import { snapshotPromptMessages, SnapshotPromptInput } from '../src/manager/snapshot/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * The Story clock (spec: .scratch/story-clock/spec.md): the judge reports the Time of day when
 * it changes, the ledger records it against the causing AI Message, and the turn prompt, the
 * Snapshot scene writer and the Chat response carry it.
 */

type TimeOfDay = 'dawn' | 'morning' | 'noon' | 'afternoon' | 'evening' | 'night';

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string; error: string | null } | null;
    memory?: { status: string; error: string | null } | null;
}

interface Chat {
    id: number;
    storyId: number;
    timeOfDay: TimeOfDay | null;
    messages: Message[];
}

interface Story {
    id: number;
}

const OPENING = 'The lamp went out an hour ago.\n\n@Mira: Boots off, keeper.';
const NO_OPS = '{"operations":[]}';

/** A judgement that changes nothing else; `time` left out writes no `time_of_day` field at all. */
function judgement(time?: string | null): string {
    return JSON.stringify({
        bond_changes: [],
        arc_steps: [],
        scene: { move_on: false, reason: 'not yet' },
        ...(time === undefined ? {} : { time_of_day: time }),
    });
}

describe('Story clock: reading the judge', () => {
    it('reads time_of_day as one of the six, in any case, and anything else as unchanged', () => {
        expect(parseJudgement(judgement('night')).timeOfDay).toBe('night');
        expect(parseJudgement(judgement(' Dawn ')).timeOfDay).toBe('dawn');
        expect(parseJudgement(judgement(null)).timeOfDay).toBeNull();
        expect(parseJudgement(judgement()).timeOfDay).toBeNull();
        expect(parseJudgement(judgement('midnight')).timeOfDay).toBeNull();
        expect(parseJudgement(JSON.stringify({ bond_changes: [], arc_steps: [], scene: null, time_of_day: 3 })).timeOfDay).toBeNull();
    });
});

describe('Story clock: the prompts', () => {
    const reminderInput = {
        story: { setting: '', pov: Pov.Second, tense: Tense.Present, replyLength: ReplyLength.Medium, characters: [] },
        identity: { name: 'Ash', description: '' },
        scene: { name: 'Arrival', situation: '', moveOnCondition: '' },
        present: ['Mira'],
    };

    it('states the time in the reminder after the Scene, and nothing while there is none', () => {
        expect(stateReminder({ ...reminderInput, timeOfDay: 'night' })).toMatch(/^Where things stand: Scene: Arrival\. Time: night\. In the latest exchange: Mira\./);
        expect(stateReminder({ ...reminderInput, scene: null, timeOfDay: 'dawn' })).toMatch(/^Where things stand: No Scene: the story unfolds freely\. Time: dawn\. In/);
        expect(stateReminder({ ...reminderInput, timeOfDay: null })).not.toContain('Time:');
        expect(stateReminder(reminderInput)).toBe(stateReminder({ ...reminderInput, timeOfDay: null }));
    });

    const snapshotInput: SnapshotPromptInput = {
        identity: { name: 'Ash', description: 'The new keeper.' },
        setting: 'A lighthouse.',
        imageStyle: 'oil painting',
        cast: [{ name: 'Mira', appearance: 'Tall.' }],
        memories: [],
        messages: [{ speaker: 'Story', text: '@Mira: Mind the step.' }],
        hint: '',
        hintNames: [],
    };

    it('gives the Snapshot scene writer the time of day as a fact of the moment, and nothing while there is none', () => {
        const asked = (input: SnapshotPromptInput) => snapshotPromptMessages(input)[1].content;
        expect(asked({ ...snapshotInput, timeOfDay: 'night' })).toContain('The time of day at this moment is night: the light must match it.');
        expect(asked({ ...snapshotInput, timeOfDay: null })).not.toContain('The time of day at this moment');
        expect(asked(snapshotInput)).toBe(asked({ ...snapshotInput, timeOfDay: null }));
    });
});

describe('Story clock: the judge, the ledger and the Chat', () => {
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

    async function createStory(): Promise<Story> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse on a storm-cut island.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall, grey eyes.', personality: 'Guarded and dry.', voice: 'Short sentences.' })
            .expect(201);
        await t.http.post(`/api/stories/${storyId}/scenes`).send({ name: 'Arrival', situation: 'Reach the lamp room.' }).expect(201);
        return { id: storyId };
    }

    async function createChat(storyId: number): Promise<Chat> {
        const { body } = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return body as Chat;
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        return body as Chat;
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

    async function timeChanges(chatId: number): Promise<Array<{ from_time: string | null; to_time: string }>> {
        const client = new pg.Client({ connectionString: t.databaseUrl });
        await client.connect();
        try {
            const { rows } = await client.query('SELECT from_time, to_time FROM "time_change" WHERE chat_id = $1 ORDER BY id', [chatId]);
            return rows;
        } finally {
            await client.end();
        }
    }

    it('a new Chat has no time of day, and the judge is asked for one with the current time shown', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        expect(chat.timeOfDay).toBeNull();

        await play(story.id, chat.id, 'One.');

        const judge = lastCall('judge');
        expect(judge.messages[0].content).toContain('"time_of_day":null');
        expect(judge.messages[0].content).toContain('"dawn", "morning", "noon", "afternoon", "evening" or "night"');
        expect(judge.messages[1].content).toContain('# Current Scene\nArrival. Move-on condition: (none)\nWhat this Scene is about: Reach the lamp room.\n\n# Time of day\nnot yet known\n\n# Recent story');
        expect((await getChat(story.id, chat.id)).timeOfDay).toBeNull();
        expect(await timeChanges(chat.id)).toEqual([]);
    });

    it('records a reported time against its Message, keeps it through turns without one, and puts it in the next prompts', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);

        const first = await play(story.id, chat.id, 'Dusk falls.', judgement('evening'));
        expect(first.timeOfDay).toBe('evening');
        // A missing field, a null and the same time again all leave it as it is, and record nothing.
        expect((await play(story.id, chat.id, 'Two.')).timeOfDay).toBe('evening');
        expect((await play(story.id, chat.id, 'Three.', judgement(null))).timeOfDay).toBe('evening');
        expect((await play(story.id, chat.id, 'Four.', judgement('Evening'))).timeOfDay).toBe('evening');
        const night = await play(story.id, chat.id, 'Night now.', judgement('night'));
        expect(night.timeOfDay).toBe('night');
        expect(await timeChanges(chat.id)).toEqual([
            { from_time: null, to_time: 'evening' },
            { from_time: 'evening', to_time: 'night' },
        ]);

        await play(story.id, chat.id, 'Five.');
        expect(lastCall('judge').messages[1].content).toContain('# Time of day\nnight\n');
        expect(lastCall('turn').messages.at(-1)!.content).toMatch(/^Where things stand: Scene: Arrival\. Time: night\. /);
    });

    it('rolls back on an edit and on Regenerate, and Reset clears it', async () => {
        const story = await createStory();
        const chat = await createChat(story.id);
        await play(story.id, chat.id, 'Dusk falls.', judgement('evening'));
        const played = await play(story.id, chat.id, 'Night now.', judgement('night'));
        expect(played.timeOfDay).toBe('night');

        // Regenerate of the reply that set night puts evening back, and the new reply may set it again.
        script('@Mira: Still dusk.', judgement());
        const regenerated = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages.at(-1)!.id}/regenerate`).expect(200);
        expect(regenerated.body.timeOfDay).toBe('evening');
        expect((await settled(story.id, chat.id)).timeOfDay).toBe('evening');

        // Editing the User Message before the evening reply puts the Chat back to no time at all.
        script('@Mira: Morning.', judgement());
        const edited = await t.http
            .patch(`/api/stories/${story.id}/chats/${chat.id}/messages/${played.messages[1].id}`)
            .send({ text: 'It is morning.' })
            .expect(200);
        expect(edited.body.timeOfDay).toBeNull();
        expect(await timeChanges(chat.id)).toEqual([]);
        await settled(story.id, chat.id);

        await play(story.id, chat.id, 'Night.', judgement('night'));
        const reset = await t.http.post(`/api/stories/${story.id}/chats/${chat.id}/reset`).expect(200);
        expect(reset.body.timeOfDay).toBeNull();
        expect(await timeChanges(chat.id)).toEqual([]);
    });
});

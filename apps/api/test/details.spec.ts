import { buildJudgePrompt, parseJudgement } from '../src/manager/chat/judge/judge-prompt.js';
import { applyDetails, ChatDetails, currentDetails, detailsReminder, judgeDetailsSection, promptDetails, readJudgedDetails } from '../src/manager/chat/details/details.js';
import { stateReminder } from '../src/manager/chat/turn/prompt.js';
import { snapshotPromptMessages, SnapshotPromptInput } from '../src/manager/snapshot/prompt.js';
import { DetailKind } from '../src/model/ledger/entities/detail-change.entity.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Place, Weather and Outfits (.scratch/info-box/spec.md): the current values read from the
 * records, what the Judge is asked and how its answer is applied, and what the Narrator and the
 * Snapshot writer are told, as pure logic; then through the HTTP API with the fake gateway scripted.
 */

const CAST = [
    { id: 1, name: 'Mira' },
    { id: 2, name: 'Kai' },
];
const NOTHING: ChatDetails = { place: null, weather: null, outfits: [], goals: [] };
const { Place, Weather, Outfit } = DetailKind;

describe('Details: the current values (pure)', () => {
    it('is the newest record of each kind, and of each Character, and nothing before any', () => {
        expect(currentDetails([])).toEqual(NOTHING);
        expect(
            currentDetails([
                { kind: Place, characterId: null, value: 'the quay' },
                { kind: Outfit, characterId: 1, value: 'an oilskin coat' },
                { kind: Weather, characterId: null, value: 'rain' },
                { kind: Place, characterId: null, value: 'the lamp room' },
                { kind: Outfit, characterId: 2, value: 'a patched jersey' },
                { kind: Outfit, characterId: 1, value: 'a wool nightdress' },
            ]),
        ).toEqual({
            place: 'the lamp room',
            weather: 'rain',
            outfits: [
                { characterId: 1, outfit: 'a wool nightdress' },
                { characterId: 2, outfit: 'a patched jersey' },
            ],
            goals: [],
        });
    });

    it('keeps each Character\'s newest Goal, and an empty one clears theirs', () => {
        const { Goal } = DetailKind;
        expect(
            currentDetails([
                { kind: Goal, characterId: 1, value: 'keep the lamp lit' },
                { kind: Goal, characterId: 2, value: 'win the race' },
                { kind: Outfit, characterId: 1, value: 'a coat' },
                { kind: Goal, characterId: 1, value: '' },
                { kind: Goal, characterId: 2, value: 'climb the gallery' },
            ]),
        ).toEqual({ place: null, weather: null, outfits: [{ characterId: 1, outfit: 'a coat' }], goals: [{ characterId: 2, goal: 'climb the gallery' }] });
    });

    it('names Outfits by Character in cast order, and leaves out one whose Character is gone', () => {
        const details: ChatDetails = {
            place: 'the quay',
            weather: null,
            outfits: [{ characterId: 9, outfit: 'a cloak' }, { characterId: 2, outfit: 'a jersey' }, { characterId: 1, outfit: 'a coat' }],
            goals: [{ characterId: 2, goal: 'win the race' }],
        };
        expect(promptDetails(details, CAST)).toEqual({
            place: 'the quay',
            weather: null,
            outfits: [{ name: 'Mira', outfit: 'a coat' }, { name: 'Kai', outfit: 'a jersey' }],
            goals: [{ name: 'Kai', goal: 'win the race' }],
        });
    });
});

describe('Details: what the Judge is asked and how its answer is applied (pure)', () => {
    it('shows what is known and what is not, then the rule and the JSON field, after the exchange; left out, the prompt is as it was', () => {
        const section = judgeDetailsSection(
            { place: 'the lamp room', weather: null, outfits: [{ characterId: 1, outfit: 'an oilskin coat' }], goals: [{ characterId: 2, goal: 'climb the gallery' }] },
            CAST,
        );
        expect(section).toContain(
            '# Place, weather, outfits and goals\nPlace: the lamp room\nWeather: not yet known\nWearing: Mira: an oilskin coat; Kai: not yet known\nGoals: Mira: none yet; Kai: climb the gallery\nDetails rule: add "details": {"place": "...", "weather": "...", "outfits": [{"character": "Name", "outfit": "..."}]}',
        );
        // A Chat long under way has aims no single exchange gave: one is asked for where a Character has none (2026-11-16: none was ever set otherwise).
        expect(section).toContain(
            'Goals rule: add "goals": [{"character": "Name", "goal": "..."}] inside "details" for a Character in the latest exchange who has none yet ("none yet" above) once the story so far shows what they want, and for any Character the latest exchange gave a new aim, or saw reach or give up the one they had ("goal": "").',
        );
        expect(section).toContain("never for the user's own character");
        expect(section).toContain('Most characters in a story want something: when one in the latest exchange still has none, give theirs now.');
        expect(section).toContain('giving only what the latest exchange changed or first made clear');
        expect(section).toContain('never guess');

        const input = JUDGE_FIXTURE_INPUTS[0];
        const without = buildJudgePrompt(input);
        const withSection = buildJudgePrompt({ ...input, detailsSection: section });
        expect(buildJudgePrompt({ ...input, detailsSection: null })).toEqual(without);
        // The system message, and with it the cached prefix, never changes; the section is the last thing read.
        expect(withSection.messages[0].content).toBe(without.messages[0].content);
        expect(withSection.messages[1].content).toBe(`${without.messages[1].content}\n\n${section}`);
        expect(withSection.maxTokens).toBeGreaterThan(without.maxTokens);
    });

    it('reads the answer loosely', () => {
        expect(readJudgedDetails({ place: ' The quay. ', outfits: [{ character: 'Mira', outfit: 'a coat' }, { character: 'Kai' }, 'x'] })).toEqual({
            place: 'The quay.',
            weather: null,
            outfits: [{ character: 'Mira', outfit: 'a coat' }],
            goals: [],
        });
        expect(readJudgedDetails({ weather: 3, place: '' })).toBeNull();
        // A Goal of "" or null gives one up; one with no string is nothing.
        expect(readJudgedDetails({ goals: [{ character: 'Mira', goal: ' Keep the lamp lit. ' }, { character: 'Kai', goal: '' }, { character: 'Lio', goal: null }, { character: 'Bo', goal: 3 }] })).toEqual({
            place: null,
            weather: null,
            outfits: [],
            goals: [
                { character: 'Mira', goal: 'Keep the lamp lit.' },
                { character: 'Kai', goal: '' },
                { character: 'Lio', goal: '' },
            ],
        });
        expect(readJudgedDetails(null)).toBeNull();
        expect(readJudgedDetails('the quay')).toBeNull();
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null,"details":{"weather":"fog"}}').details).toEqual({ place: null, weather: 'fog', outfits: [], goals: [] });
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null}').details).toBeNull();
        // Goals given beside "details" rather than inside it are read the same.
        expect(parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null,"goals":[{"character":"Mira","goal":"Keep the lamp lit"}]}').details).toEqual({
            place: null,
            weather: null,
            outfits: [],
            goals: [{ character: 'Mira', goal: 'Keep the lamp lit' }],
        });
        expect(
            parseJudgement('{"bond_changes":[],"arc_steps":[],"scene":null,"details":{"place":"the quay","goals":[{"character":"Kai","goal":"win"}]},"goals":[{"character":"Mira","goal":"Keep the lamp lit"}]}').details!.goals,
        ).toEqual([
            { character: 'Kai', goal: 'win' },
            { character: 'Mira', goal: 'Keep the lamp lit' },
        ]);
    });

    it('takes what changed, tidied, and drops what is the same, unknown, sitting out or said twice', () => {
        const current: ChatDetails = { place: 'the quay', weather: 'rain', outfits: [{ characterId: 1, outfit: 'an oilskin coat' }], goals: [] };
        const applied = applyDetails(
            { current, cast: CAST, sittingOut: [2] },
            {
                place: '  The  lamp room.  ',
                weather: 'RAIN',
                outfits: [
                    { character: 'mira', outfit: 'a wool nightdress.' },
                    { character: 'Mira', outfit: 'a second thing' },
                    { character: 'Kai', outfit: 'a jersey' },
                    { character: 'Odd', outfit: 'a hat' },
                ],
            },
        );
        expect(applied.changes).toEqual([
            { kind: Place, characterId: null, value: 'The lamp room' },
            { kind: Outfit, characterId: 1, value: 'a wool nightdress' },
        ]);
        expect(applied.rejected).toEqual([
            'Weather: still "RAIN" — not a change',
            'Outfit of Mira: a second one in one turn',
            'Outfit of Kai: sitting out',
            'Outfit of Odd: unknown name',
        ]);
        expect(applyDetails({ current, cast: CAST }, null)).toEqual({ changes: [], rejected: [] });
        expect(applyDetails({ current, cast: CAST }, { place: null, weather: null, outfits: [{ character: 'Mira', outfit: 'An Oilskin Coat' }] })).toEqual({
            changes: [],
            rejected: ['Outfit of Mira: unchanged'],
        });
    });

    it('takes a Goal that is new, changed or given up, one a Character, never for one sitting out', () => {
        const current: ChatDetails = { place: null, weather: null, outfits: [], goals: [{ characterId: 1, goal: 'keep the lamp lit' }] };
        const applied = applyDetails(
            { current, cast: CAST, sittingOut: [] },
            {
                place: null,
                weather: null,
                outfits: [],
                goals: [
                    { character: 'Kai', goal: ' Win the race. ' },
                    { character: 'Kai', goal: 'something else' },
                    { character: 'Mira', goal: 'Keep the lamp lit' },
                    { character: 'Nobody', goal: 'x' },
                ],
            },
        );
        expect(applied.changes).toEqual([{ kind: DetailKind.Goal, characterId: 2, value: 'Win the race' }]);
        expect(applied.rejected).toEqual(['Goal of Kai: a second one in one turn', 'Goal of Mira: unchanged', 'Goal of Nobody: unknown name']);
        // Given up, it clears; giving up one never had is nothing; sitting out, none is taken.
        expect(applyDetails({ current, cast: CAST }, { place: null, weather: null, outfits: [], goals: [{ character: 'Mira', goal: '' }] }).changes).toEqual([
            { kind: DetailKind.Goal, characterId: 1, value: '' },
        ]);
        expect(applyDetails({ current, cast: CAST }, { place: null, weather: null, outfits: [], goals: [{ character: 'Kai', goal: '' }] }).changes).toEqual([]);
        expect(applyDetails({ current, cast: CAST, sittingOut: [2] }, { place: null, weather: null, outfits: [], goals: [{ character: 'Kai', goal: 'win' }] }).rejected).toEqual([
            'Goal of Kai: sitting out',
        ]);
    });

    it('cuts each to its length: 80 for a Place, 60 for the Weather, 160 for an Outfit', () => {
        const long = 'x'.repeat(300);
        const { changes } = applyDetails({ current: NOTHING, cast: CAST }, { place: long, weather: long, outfits: [{ character: 'Mira', outfit: long }] });
        expect(changes.map((change) => change.value.length)).toEqual([80, 60, 160]);
    });
});

describe('Details: what the Narrator and the Snapshot writer are told (pure)', () => {
    const reminderInput = {
        story: { setting: '', pov: Pov.Second, tense: Tense.Present, replyLength: ReplyLength.Medium, characters: [] },
        identity: { name: 'Ash', description: '' },
        scene: { name: 'Arrival', situation: '', moveOnCondition: '' },
        present: ['Mira'],
    };
    const details = { place: 'the lamp room', weather: 'a storm', outfits: [{ name: 'Mira', outfit: 'an oilskin coat' }, { name: 'Kai', outfit: 'a jersey' }] };

    it('states the Place and the Weather after the Time, and the Outfits of those in the latest exchange only', () => {
        expect(stateReminder({ ...reminderInput, timeOfDay: 'night', details })).toMatch(
            /^Where things stand: Scene: Arrival\. Time: night\. Place: the lamp room\. Weather: a storm\. In the latest exchange: Mira\. Wearing now: Mira, an oilskin coat\. Keep them dressed so until the story changes it\. Narrate in /,
        );
        expect(detailsReminder(details, ['Mira', 'Kai']).wearing).toBe('Wearing now: Mira, an oilskin coat; Kai, a jersey. Keep them dressed so until the story changes it.');
        // Someone sitting out is not in the exchange, so their Outfit is not restated.
        expect(stateReminder({ ...reminderInput, present: ['Mira', 'Kai'], sittingOut: ['Kai'], details })).not.toContain('Kai, a jersey');
    });

    it('adds nothing for what is not known: the reminder equals one built without them', () => {
        expect(stateReminder({ ...reminderInput, details: { place: null, weather: null, outfits: [] } })).toBe(stateReminder(reminderInput));
        expect(stateReminder({ ...reminderInput, details: null })).toBe(stateReminder(reminderInput));
        expect(stateReminder({ ...reminderInput, details: { place: 'the quay', weather: null, outfits: [] } })).toContain('Scene: Arrival. Place: the quay. In the latest exchange: Mira.');
    });

    const snapshotInput: SnapshotPromptInput = {
        identity: { name: 'Ash', description: 'The new keeper.' },
        setting: 'A lighthouse.',
        imageStyle: 'oil painting',
        cast: [{ name: 'Mira', appearance: 'Tall.' }, { name: 'Kai', appearance: 'Wiry.' }],
        memories: [],
        messages: [{ speaker: 'Story', text: '@Mira: Mind the step.' }],
        hint: '',
        hintNames: [],
    };

    it('gives the Snapshot writer the Place, the Weather and each Outfit, and nothing without them', () => {
        const asked = (input: SnapshotPromptInput) => snapshotPromptMessages(input)[1].content;
        const dressed = asked({ ...snapshotInput, place: 'the lamp room', weather: 'a storm', cast: [{ name: 'Mira', appearance: 'Tall.', outfit: 'an oilskin coat' }, { name: 'Kai', appearance: 'Wiry.' }] });
        expect(dressed).toContain('- Mira: Tall. Wearing right now: an oilskin coat.\n- Kai: Wiry.');
        expect(dressed).toContain('The story is at this place now: the lamp room.');
        expect(dressed).toContain('The weather at this moment: a storm.');
        expect(dressed).toContain('Where a Character has "Wearing right now", that is what they wear in the image');
        expect(asked({ ...snapshotInput, place: null, weather: null, cast: snapshotInput.cast.map((member) => ({ ...member, outfit: null })) })).toBe(asked(snapshotInput));
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

interface Chat {
    id: number;
    place: string | null;
    weather: string | null;
    outfits: Array<{ characterId: number; outfit: string }>;
    goals: Array<{ characterId: number; goal: string }>;
    messages: Message[];
}

const NO_OPS = '{"operations":[]}';

/** A judgement that changes nothing but the details it gives. */
function judgement(details?: Record<string, unknown>): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...(details ? { details } : {}) });
}

describe('Details: the judge, the ledger and the Chat (HTTP)', () => {
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

    async function createStory(): Promise<{ storyId: number; mira: number; kai: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const first = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        const second = await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Kai', appearance: 'Wiry.', personality: 'Restless.', voice: 'Quick.' }).expect(201);
        return { storyId, mira: first.body.characters[0].id as number, kai: second.body.characters[1].id as number };
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
        script(`@Mira: ${text}\n\n@Kai: Aye.`, judge);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function lastCall(kind: 'turn' | 'judge' | 'snapshot_prompt'): TextCompletionRequest {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }
    const trailing = () => lastCall('turn').messages.at(-1)!.content;
    const judged = () => lastCall('judge').messages[1].content;

    it('a new Chat knows none of them, and the Judge is shown that and asked', async () => {
        const { storyId } = await createStory();
        const chat = await createChat(storyId);
        expect(chat).toMatchObject({ place: null, weather: null, outfits: [] });

        const played = await play(storyId, chat.id, 'One.');
        expect(judged()).toMatch(
            /# Place, weather, outfits and goals\nPlace: not yet known\nWeather: not yet known\nWearing: Mira: not yet known; Kai: not yet known\nGoals: Mira: none yet; Kai: none yet\nDetails rule: /,
        );
        expect(judged().indexOf('# LATEST EXCHANGE')).toBeLessThan(judged().indexOf('# Place, weather, outfits and goals'));
        expect(trailing()).not.toContain('Place:');
        expect(trailing()).not.toContain('Wearing now');
        expect(played).toMatchObject({ place: null, weather: null, outfits: [] });
    });

    it('keeps what the Judge reports through turns without any, and tells the next prompts', async () => {
        const { storyId, mira, kai } = await createStory();
        const chat = await createChat(storyId);
        const first = await play(storyId, chat.id, 'Up we go.', judgement({ place: 'The lamp room.', weather: 'a rising storm', outfits: [{ character: 'Mira', outfit: 'an oilskin coat over her nightdress' }] }));
        expect(first).toMatchObject({ place: 'The lamp room', weather: 'a rising storm', outfits: [{ characterId: mira, outfit: 'an oilskin coat over her nightdress' }] });

        // No `details`, and the same values again: nothing changes.
        expect(await play(storyId, chat.id, 'Two.')).toMatchObject({ place: 'The lamp room', weather: 'a rising storm' });
        expect(trailing()).toContain('Place: The lamp room. Weather: a rising storm. In the latest exchange: Mira, Kai. Wearing now: Mira, an oilskin coat over her nightdress. Keep them dressed so');
        expect(judged()).toContain('Place: The lamp room\nWeather: a rising storm\nWearing: Mira: an oilskin coat over her nightdress; Kai: not yet known');
        const same = await play(storyId, chat.id, 'Three.', judgement({ place: 'the lamp room', outfits: [{ character: 'Kai', outfit: 'a patched jersey' }, { character: 'Nobody', outfit: 'a hat' }] }));
        expect(same).toMatchObject({
            place: 'The lamp room',
            outfits: [
                { characterId: mira, outfit: 'an oilskin coat over her nightdress' },
                { characterId: kai, outfit: 'a patched jersey' },
            ],
        });

        const moved = await play(storyId, chat.id, 'Down to the quay.', judgement({ place: 'the quay', outfits: [{ character: 'Mira', outfit: 'a dry wool dress' }] }));
        expect(moved).toMatchObject({ place: 'the quay', weather: 'a rising storm' });
        expect(moved.outfits[0]).toEqual({ characterId: mira, outfit: 'a dry wool dress' });
    });

    it('a Goal the Judge sets shows on the Chat and drives the next turn; given up, it goes; Regenerate takes it back', async () => {
        const { storyId, mira } = await createStory();
        const chat = await createChat(storyId);
        expect((await getChat(storyId, chat.id)).goals).toEqual([]);
        const set = await play(storyId, chat.id, 'The lamp is out.', judgement({ goals: [{ character: 'Mira', goal: 'Get the lamp lit before the ship passes' }] }));
        expect(set.goals).toEqual([{ characterId: mira, goal: 'Get the lamp lit before the ship passes' }]);
        // The next turn tells the Narrator what she is after, as she is in the latest exchange.
        const next = await play(storyId, chat.id, 'I hand her the oil.', judgement({ goals: [{ character: 'Mira', goal: '' }] }));
        expect(trailing()).toContain('What they are after: Mira, Get the lamp lit before the ship passes. Let each pursue it on their own initiative when the moment allows, without waiting to be asked.');
        expect(next.goals).toEqual([]);
        // Regenerate takes back the reply that gave it up: she is after it again.
        script('@Mira: Hold the light.', judgement());
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${next.messages.at(-1)!.id}/regenerate`).expect(200);
        expect((await settled(storyId, chat.id)).goals).toEqual([{ characterId: mira, goal: 'Get the lamp lit before the ship passes' }]);
    });

    it('takes a change back with the reply that made it: Regenerate, an edit and Reset', async () => {
        const { storyId, mira } = await createStory();
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'Up.', judgement({ place: 'the lamp room', outfits: [{ character: 'Mira', outfit: 'an oilskin coat' }] }));
        const moved = await play(storyId, chat.id, 'Down.', judgement({ place: 'the quay', weather: 'rain', outfits: [{ character: 'Mira', outfit: 'a wool dress' }] }));
        expect(moved).toMatchObject({ place: 'the quay', weather: 'rain' });

        script('@Mira: Stay.', judgement());
        const again = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${moved.messages.at(-1)!.id}/regenerate`).expect(200);
        expect(again.body).toMatchObject({ place: 'the lamp room', weather: null, outfits: [{ characterId: mira, outfit: 'an oilskin coat' }] });
        expect(trailing()).toContain('Place: the lamp room.');
        expect((await settled(storyId, chat.id)).place).toBe('the lamp room');

        script('@Mira: Morning.', judgement());
        const edited = await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}/messages/${moved.messages[1].id}`).send({ text: 'Good morning.' }).expect(200);
        expect(edited.body).toMatchObject({ place: null, weather: null, outfits: [] });
        await settled(storyId, chat.id);

        await play(storyId, chat.id, 'Out.', judgement({ place: 'the quay' }));
        const reset = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/reset`).expect(200);
        expect(reset.body).toMatchObject({ place: null, weather: null, outfits: [] });
    });

    it('a Branch carries them as they stood at its Message; someone sitting out keeps their Outfit; a removed Character takes theirs along', async () => {
        const { storyId, mira, kai } = await createStory();
        const chat = await createChat(storyId);
        const first = await play(storyId, chat.id, 'Up.', judgement({ place: 'the lamp room', outfits: [{ character: 'Mira', outfit: 'an oilskin coat' }, { character: 'Kai', outfit: 'a jersey' }] }));
        await play(storyId, chat.id, 'Down.', judgement({ place: 'the quay', outfits: [{ character: 'Mira', outfit: 'a wool dress' }] }));

        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${first.messages.at(-1)!.id}/branch`).expect(201);
        expect(branch).toMatchObject({ place: 'the lamp room', outfits: [{ characterId: mira, outfit: 'an oilskin coat' }, { characterId: kai, outfit: 'a jersey' }] });
        expect((await getChat(storyId, chat.id)).place).toBe('the quay');

        // Kai sits out: the Judge's Outfit for him is dropped, the one he had stays, and the reminder no longer restates it.
        await t.http.put(`/api/stories/${storyId}/chats/${chat.id}/sitting-out`).send({ characterIds: [kai] }).expect(200);
        const sat = await play(storyId, chat.id, 'On.', judgement({ outfits: [{ character: 'Kai', outfit: 'a sou\'wester' }] }));
        expect(sat.outfits).toEqual([{ characterId: mira, outfit: 'a wool dress' }, { characterId: kai, outfit: 'a jersey' }]);
        await play(storyId, chat.id, 'Further.');
        expect(trailing()).toContain('Wearing now: Mira, a wool dress.');
        expect(trailing()).not.toContain('Kai, a jersey');

        await t.http.delete(`/api/stories/${storyId}/characters/${kai}`).expect(200);
        expect((await getChat(storyId, chat.id)).outfits).toEqual([{ characterId: mira, outfit: 'a wool dress' }]);
    });

    it('a Snapshot prompt is written with the Place, the Weather and the Outfits as they stood at its Message', async () => {
        const { storyId } = await createStory();
        const chat = await createChat(storyId);
        const first = await play(storyId, chat.id, 'Up.', judgement({ place: 'the lamp room', weather: 'a storm', outfits: [{ character: 'Mira', outfit: 'an oilskin coat' }] }));
        await play(storyId, chat.id, 'Down.', judgement({ place: 'the quay', outfits: [{ character: 'Mira', outfit: 'a wool dress' }] }));
        const scene = JSON.stringify({ pieces: {}, in_frame: ['Mira'], scene: 'Mira at the rail.' });

        t.gateway.scriptText('snapshot_prompt', scene);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/snapshot-prompts`).send({ hint: '' }).expect(201);
        const now = lastCall('snapshot_prompt').messages[1].content;
        expect(now).toContain('- Mira: Tall. Wearing right now: a wool dress.');
        expect(now).toContain('The story is at this place now: the quay.');
        expect(now).toContain('The weather at this moment: a storm.');

        // A retake of the earlier moment is dressed as it was then.
        t.gateway.scriptText('snapshot_prompt', scene);
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/snapshot-prompts`).send({ hint: '', messageId: first.messages.at(-1)!.id }).expect(201);
        const then = lastCall('snapshot_prompt').messages[1].content;
        expect(then).toContain('- Mira: Tall. Wearing right now: an oilskin coat.');
        expect(then).toContain('The story is at this place now: the lamp room.');
    });
});

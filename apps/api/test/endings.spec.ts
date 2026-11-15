import {
    applyEnding,
    EndingDefinition,
    endingState,
    endingView,
    epilogueFinalInstruction,
    epilogueInstruction,
    judgeEndingSection,
    promptEpilogue,
    readJudgedEnding,
} from '../src/manager/chat/ending/ending.js';
import { buildJudgePrompt } from '../src/manager/chat/judge/judge-prompt.js';
import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { JUDGE_FIXTURE_INPUTS } from './judge-prompt-inputs.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Endings (.scratch/endings/spec.md): a Chat's Ending read from its record, what the Judge is asked
 * and how its answer is applied, and the Epilogue's instruction, as pure logic; then authoring and
 * play through the HTTP API with the fake gateway scripted.
 */

const LIGHT: EndingDefinition = { id: 1, name: 'The light returns', condition: 'The lamp is lit again.', epilogue: 'Tell of the first ship to pass safely.' };
const DARK: EndingDefinition = { id: 2, name: '', condition: 'Ash leaves the island for good.', epilogue: '' };
const DRAFT: EndingDefinition = { id: 3, name: 'Unfinished', condition: '  ', epilogue: '' };

describe('Endings: the state, the Judge and the Epilogue (pure)', () => {
    it('reads the Chat as having reached its first recorded Ending, and otherwise watches the ready ones', () => {
        expect(endingState([LIGHT, DARK, DRAFT], [])).toEqual({ reached: null, waiting: [LIGHT, DARK] });
        const reached = endingState([LIGHT, DARK], [{ endingId: 2, reason: 'He took the boat.', messageId: 9 }]);
        expect(reached).toEqual({ reached: { ending: DARK, reason: 'He took the boat.', messageId: 9 }, waiting: [] });
        expect(endingView(reached)).toEqual({ id: 2, name: 'An ending', reason: 'He took the boat.', messageId: 9 });
        // A record of an Ending the author removed is no Ending at all.
        expect(endingState([LIGHT], [{ endingId: 2, reason: '', messageId: 9 }])).toEqual({ reached: null, waiting: [LIGHT] });
        expect(endingView({ reached: null })).toBeNull();
    });

    it('asks the Judge only while an Ending waits, after the exchange, with its rule in the section', () => {
        expect(judgeEndingSection({ waiting: [] })).toBeNull();
        const section = judgeEndingSection({ waiting: [LIGHT, DARK] })!;
        expect(section).toContain('# Endings\nThe story has not reached an ending.');
        expect(section).toContain('1. The light returns — reached when: The lamp is lit again.\n2. An ending — reached when: Ash leaves the island for good.');
        expect(section).toContain('Ending rule: add "ending": {"reason": "...", "reached": 1}');
        expect(section).toContain('when in doubt, leave "ending" out');

        const input = JUDGE_FIXTURE_INPUTS[0];
        const without = buildJudgePrompt(input);
        expect(buildJudgePrompt({ ...input, endingSection: null })).toEqual(without);
        const withSection = buildJudgePrompt({ ...input, endingSection: section, detailsSection: '# Place, weather and outfits' });
        // The system message, and with it the cached prefix, never changes.
        expect(withSection.messages[0].content).toBe(without.messages[0].content);
        expect(withSection.messages[1].content).toBe(`${without.messages[1].content}\n\n${section}\n\n# Place, weather and outfits`);
        expect(buildJudgePrompt({ ...input, endingSection: section }).maxTokens).toBe(without.maxTokens + 80);
    });

    it('reads the answer loosely and takes only a waiting Ending', () => {
        expect(readJudgedEnding({ reason: ' The lamp burns. ', reached: 1 })).toEqual({ reached: 1, reason: 'The lamp burns.' });
        expect(readJudgedEnding({ reached: '1' })).toBeNull();
        expect(readJudgedEnding(null)).toBeNull();
        expect(readJudgedEnding([1])).toBeNull();

        const waiting = { reached: null, waiting: [LIGHT, DARK] };
        expect(applyEnding(waiting, null)).toEqual({ reached: null, rejected: [] });
        expect(applyEnding(waiting, { reached: 2, reason: 'He took\n the boat.' })).toEqual({ reached: { endingId: 2, reason: 'He took the boat.' }, rejected: [] });
        expect(applyEnding(waiting, { reached: 3, reason: '' })).toEqual({ reached: null, rejected: ['Ending: no waiting Ending numbered 3'] });
        expect(applyEnding({ reached: { ending: LIGHT, reason: '', messageId: 1 }, waiting: [] }, { reached: 1, reason: '' }).rejected).toEqual([
            'Ending: one is already reached in this Chat',
        ]);
        expect(applyEnding(waiting, { reached: 1, reason: 'x'.repeat(400) }).reached!.reason).toHaveLength(240);
    });

    it("words the Epilogue for the Ending reached, or for an end of the user's own", () => {
        const reached = promptEpilogue({ reached: { ending: LIGHT, reason: '', messageId: 1 } });
        expect(reached).toEqual({ endingName: 'The light returns', note: 'Tell of the first ship to pass safely.' });
        const told = epilogueInstruction('Ash', reached);
        expect(told).toContain('(The story ends here. Ash does nothing new.) Write the epilogue');
        expect(told).toContain('The story has reached its ending: "The light returns".');
        expect(told).toContain('What the author wants the epilogue to tell: Tell of the first ship to pass safely.');
        expect(told).toContain('give Ash no line of speech and no new decision');
        expect(told).toContain('About 150 to 300 words.');

        const own = epilogueInstruction('Ash', promptEpilogue({ reached: null }));
        expect(own).toContain('Ash has chosen to end the story at this point.');
        expect(own).not.toContain('What the author wants');
        expect(epilogueFinalInstruction('Ash')).toContain('Write the epilogue now');
    });
});

interface Message {
    id: number;
    kind: 'user' | 'ai';
    epilogue?: boolean;
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

interface Chat {
    id: number;
    ending: { id: number; name: string; reason: string; messageId: number } | null;
    messages: Message[];
}

interface Ending {
    id: number;
    name: string;
    condition: string;
    epilogue: string;
}

const NO_OPS = '{"operations":[]}';

function judgement(ending?: Record<string, unknown>): string {
    return JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' }, ...(ending ? { ending } : {}) });
}

describe('Endings: authoring and play (HTTP)', () => {
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

    async function createStory(endings = true): Promise<{ storyId: number; light: number; dark: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse.', opening: '@Mira: Boots off, keeper.' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short.' }).expect(201);
        if (!endings) return { storyId, light: 0, dark: 0 };
        await t.http
            .post(`/api/stories/${storyId}/endings`)
            .send({ name: 'The light returns', condition: 'The lamp is lit again.', epilogue: 'Tell of the first ship to pass safely.' })
            .expect(201);
        // One with no condition yet: never asked about.
        await t.http.post(`/api/stories/${storyId}/endings`).send({ name: 'Unfinished' }).expect(201);
        const story = await t.http.post(`/api/stories/${storyId}/endings`).send({ name: 'Into the dark', condition: 'Ash leaves the island for good.' }).expect(201);
        const list = story.body.endings as Ending[];
        return { storyId, light: list[0].id, dark: list[2].id };
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

    function script(reply: string, judge: string = judgement()): void {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function play(storyId: number, chatId: number, text: string, judge: string = judgement()): Promise<Chat> {
        script(`@Mira: ${text} Heard.`, judge);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text }).expect(201);
        return settled(storyId, chatId);
    }

    function lastCall(kind: 'turn' | 'judge'): TextCompletionRequest {
        const calls = t.gateway.textCalls(kind);
        return calls[calls.length - 1];
    }
    const judged = () => lastCall('judge').messages[1].content;
    const chatPath = (storyId: number, chatId: number) => `/api/stories/${storyId}/chats/${chatId}`;

    it('adds, changes and removes Endings one at a time, up to six, and Duplicate copies them', async () => {
        const created = await t.http.post('/api/stories').send({ title: 'Endings' }).expect(201);
        const storyId = created.body.id as number;
        expect(created.body.endings).toEqual([]);

        const added = await t.http.post(`/api/stories/${storyId}/endings`).send({}).expect(201);
        const [ending] = added.body.endings as Ending[];
        expect(ending).toMatchObject({ name: '', condition: '', epilogue: '' });

        const named = await t.http.patch(`/api/stories/${storyId}/endings/${ending.id}`).send({ name: 'The light returns' }).expect(200);
        expect(named.body.endings[0]).toMatchObject({ name: 'The light returns', condition: '' });
        const whole = await t.http
            .patch(`/api/stories/${storyId}/endings/${ending.id}`)
            .send({ condition: 'The lamp is lit again.', epilogue: 'Tell of the first ship.' })
            .expect(200);
        expect(whole.body.endings[0]).toEqual({ id: ending.id, name: 'The light returns', condition: 'The lamp is lit again.', epilogue: 'Tell of the first ship.' });

        const missing = await t.http.patch(`/api/stories/${storyId}/endings/${ending.id + 1000}`).send({ name: 'x' }).expect(404);
        expect(missing.body.error.code).toBe('404.003.028');
        await t.http.delete(`/api/stories/${storyId}/endings/${ending.id + 1000}`).expect(404);
        await t.http.patch(`/api/stories/${storyId}/endings/${ending.id}`).send({ name: 5 }).expect(400);

        for (let n = 2; n <= 6; n++) await t.http.post(`/api/stories/${storyId}/endings`).send({ name: `Ending ${n}` }).expect(201);
        const full = await t.http.post(`/api/stories/${storyId}/endings`).send({}).expect(422);
        expect(full.body.error).toMatchObject({ code: '422.003.029', message: 'A Story can have at most 6 Endings.' });

        const copy = await t.http.post(`/api/stories/${storyId}/duplicate`).expect(201);
        expect((copy.body.endings as Ending[]).map(({ name, condition, epilogue }) => ({ name, condition, epilogue }))).toEqual([
            { name: 'The light returns', condition: 'The lamp is lit again.', epilogue: 'Tell of the first ship.' },
            ...[2, 3, 4, 5, 6].map((n) => ({ name: `Ending ${n}`, condition: '', epilogue: '' })),
        ]);
        expect((copy.body.endings as Ending[]).every((copied) => copied.id !== ending.id)).toBe(true);

        const removed = await t.http.delete(`/api/stories/${storyId}/endings/${ending.id}`).expect(200);
        expect((removed.body.endings as Ending[]).map((left) => left.name)).toEqual(['Ending 2', 'Ending 3', 'Ending 4', 'Ending 5', 'Ending 6']);
    });

    it('a Story without Endings asks the Judge nothing, and its Chats have none', async () => {
        const { storyId } = await createStory(false);
        const chat = await createChat(storyId);
        expect(chat.ending).toBeNull();
        const played = await play(storyId, chat.id, 'One.', judgement({ reason: 'Made up.', reached: 1 }));
        expect(judged()).not.toContain('# Endings');
        expect(played.ending).toBeNull();
        const list = await t.http.get(`/api/stories/${storyId}/chats`).expect(200);
        expect(list.body.endings).toEqual({ total: 0, found: [] });
        expect(list.body.chats[0].ending).toBeNull();
    });

    it('the Judge is asked about the ready Endings until the Chat reaches one; the Narrator is never told them', async () => {
        const { storyId, light } = await createStory();
        const chat = await createChat(storyId);

        const first = await play(storyId, chat.id, 'I trim the wick.');
        expect(judged()).toContain('# Endings\nThe story has not reached an ending.');
        expect(judged()).toContain('1. The light returns — reached when: The lamp is lit again.\n2. Into the dark — reached when: Ash leaves the island for good.');
        expect(judged()).not.toContain('Unfinished');
        expect(judged().indexOf('# LATEST EXCHANGE')).toBeLessThan(judged().indexOf('# Endings'));
        expect(judged().indexOf('# Endings')).toBeLessThan(judged().indexOf('# Place, weather and outfits'));
        expect(first.ending).toBeNull();

        // A number that names no waiting Ending changes nothing.
        expect((await play(storyId, chat.id, 'I fetch oil.', judgement({ reason: 'No.', reached: 5 }))).ending).toBeNull();

        const lit = await play(storyId, chat.id, 'I light the lamp.', judgement({ reason: 'Ash lit the lamp.', reached: 1 }));
        expect(lit.ending).toEqual({ id: light, name: 'The light returns', reason: 'Ash lit the lamp.', messageId: lit.messages.at(-1)!.id });

        // Reached: the Judge is not asked again, whatever it says.
        const after = await play(storyId, chat.id, 'I watch the beam.', judgement({ reason: 'Again.', reached: 2 }));
        expect(judged()).not.toContain('# Endings');
        expect(after.ending).toMatchObject({ id: light, messageId: lit.messages.at(-1)!.id });

        // No turn was ever told an Ending: they are found, not steered toward.
        for (const turn of t.gateway.textCalls('turn')) {
            const prompt = JSON.stringify(turn.messages);
            expect(prompt).not.toContain('The light returns');
            expect(prompt).not.toContain('Ash leaves the island');
        }

        const other = await createChat(storyId);
        const list = await t.http.get(`/api/stories/${storyId}/chats`).expect(200);
        expect(list.body.endings).toEqual({ total: 2, found: [{ id: light, name: 'The light returns' }] });
        const byId = new Map((list.body.chats as Array<{ id: number; ending: unknown }>).map((item) => [item.id, item.ending]));
        expect(byId.get(chat.id)).toEqual({ id: light, name: 'The light returns' });
        expect(byId.get(other.id)).toBeNull();
    });

    it('takes the Ending back with the reply that reached it: Regenerate, an edit and Reset; a Branch keeps it only from that reply on', async () => {
        const { storyId, light, dark } = await createStory();
        const chat = await createChat(storyId);
        const one = await play(storyId, chat.id, 'One.');
        const lit = await play(storyId, chat.id, 'I light the lamp.', judgement({ reason: 'Ash lit the lamp.', reached: 1 }));
        expect(lit.ending?.id).toBe(light);

        const { body: before } = await t.http.post(`${chatPath(storyId, chat.id)}/messages/${one.messages.at(-1)!.id}/branch`).expect(201);
        expect(before.ending).toBeNull();
        const { body: at } = await t.http.post(`${chatPath(storyId, chat.id)}/messages/${lit.messages.at(-1)!.id}/branch`).expect(201);
        expect(at.ending).toEqual({ id: light, name: 'The light returns', reason: 'Ash lit the lamp.', messageId: at.messages.at(-1).id });

        // Again: the new reply reaches another Ending, since the first is no longer reached.
        script('@Mira: Then go.', judgement({ reason: 'Ash took the boat.', reached: 2 }));
        await t.http.post(`${chatPath(storyId, chat.id)}/messages/${lit.messages.at(-1)!.id}/regenerate`).expect(200);
        const again = await settled(storyId, chat.id);
        expect(judged()).toContain('1. The light returns');
        expect(again.ending).toMatchObject({ id: dark, name: 'Into the dark', reason: 'Ash took the boat.' });

        script('@Mira: Morning.');
        const edited = await t.http.patch(`${chatPath(storyId, chat.id)}/messages/${one.messages[1].id}`).send({ text: 'Good morning.' }).expect(200);
        expect(edited.body.ending).toBeNull();
        await settled(storyId, chat.id);

        await play(storyId, chat.id, 'I light the lamp.', judgement({ reason: 'Lit.', reached: 1 }));
        const reset = await t.http.post(`${chatPath(storyId, chat.id)}/reset`).expect(200);
        expect(reset.body.ending).toBeNull();
        // The Branch is its own Chat: it still has its Ending.
        expect((await getChat(storyId, at.id)).ending?.id).toBe(light);
    });

    it('removing an Ending takes it from the Chats that reached it, which can then reach another', async () => {
        const { storyId, light, dark } = await createStory();
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'I light the lamp.', judgement({ reason: 'Lit.', reached: 1 }));
        await t.http.delete(`/api/stories/${storyId}/endings/${light}`).expect(200);
        expect((await getChat(storyId, chat.id)).ending).toBeNull();

        const left = await play(storyId, chat.id, 'I take the boat.', judgement({ reason: 'Gone.', reached: 1 }));
        expect(judged()).toContain('1. Into the dark — reached when: Ash leaves the island for good.');
        expect(left.ending).toMatchObject({ id: dark, name: 'Into the dark' });
    });

    it('writes the Epilogue for the Ending reached, as an AI Message the story can go on after', async () => {
        const { storyId } = await createStory();
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'I light the lamp.', judgement({ reason: 'Ash lit the lamp.', reached: 1 }));

        script('Years on, the beam still swept the reef.\n\n@Mira: Still here, keeper.');
        const closed = await t.http.post(`${chatPath(storyId, chat.id)}/epilogue`).expect(200);
        const epilogue = (closed.body as Chat).messages.at(-1)!;
        expect(epilogue).toMatchObject({ kind: 'ai', epilogue: true });
        expect((closed.body as Chat).messages.filter((message) => message.epilogue)).toHaveLength(1);
        expect((closed.body as Chat).ending?.name).toBe('The light returns');

        const call = lastCall('turn');
        const asked = call.messages.at(-2)!;
        const last = call.messages.at(-1)!;
        expect(asked.role).toBe('user');
        expect(asked.content).toContain('(The story ends here. Ash does nothing new.) Write the epilogue');
        expect(asked.content).toContain('The story has reached its ending: "The light returns".');
        expect(asked.content).toContain('What the author wants the epilogue to tell: Tell of the first ship to pass safely.');
        expect(last.content).toContain('Write the epilogue now');
        expect(last.content).not.toContain('Write the next turn now');
        expect(call.maxTokens).toBeGreaterThanOrEqual(900);
        await settled(storyId, chat.id);

        // One Epilogue at a time: Again is the way to another.
        const twice = await t.http.post(`${chatPath(storyId, chat.id)}/epilogue`).expect(409);
        expect(twice.body.error).toMatchObject({ code: '409.004.029', message: 'The story already has its epilogue. Use Again to write it anew, or play on.' });

        script('The lamp burned on for forty winters.');
        await t.http.post(`${chatPath(storyId, chat.id)}/messages/${epilogue.id}/regenerate`).expect(200);
        const again = await settled(storyId, chat.id);
        expect(lastCall('turn').messages.at(-2)!.content).toContain('The story has reached its ending: "The light returns".');
        expect(again.messages.at(-1)).toMatchObject({ id: epilogue.id, epilogue: true });

        // A Branch carries the mark; and the story plays on after it as before.
        const { body: branch } = await t.http.post(`${chatPath(storyId, chat.id)}/messages/${epilogue.id}/branch`).expect(201);
        expect(branch.messages.at(-1)).toMatchObject({ epilogue: true });
        const on = await play(storyId, chat.id, 'I climb once more.');
        expect(lastCall('turn').messages.at(-1)!.content).toContain('Write the next turn now');
        expect(lastCall('turn').messages.at(-2)!.content).toBe('I climb once more.');
        expect(on.messages.at(-1)).toMatchObject({ epilogue: false });
        // The Epilogue is behind it now, so another can be asked for.
        script('And so it ended twice.');
        await t.http.post(`${chatPath(storyId, chat.id)}/epilogue`).expect(200);
    });

    it("writes an Epilogue for an end of the user's own choosing, in any Story, and not while a Message waits for its reply", async () => {
        const { storyId } = await createStory(false);
        const chat = await createChat(storyId);
        await play(storyId, chat.id, 'I sit by the lamp.');

        script('The island kept its quiet.');
        const closed = await t.http.post(`${chatPath(storyId, chat.id)}/epilogue`).expect(200);
        expect((closed.body as Chat).messages.at(-1)).toMatchObject({ epilogue: true });
        expect((closed.body as Chat).ending).toBeNull();
        const asked = lastCall('turn').messages.at(-2)!.content;
        expect(asked).toContain('Ash has chosen to end the story at this point.');
        expect(asked).not.toContain('has reached its ending');
        await settled(storyId, chat.id);

        // A failed turn leaves the user's Message waiting: Retry is the way on, not an Epilogue.
        const other = await createChat(storyId);
        t.gateway.scriptText('turn', new ProviderOutageError());
        await t.http.post(`${chatPath(storyId, other.id)}/messages`).send({ text: 'Hello?' }).expect(502);
        expect((await getChat(storyId, other.id)).messages.at(-1)!.kind).toBe('user');
        const refused = await t.http.post(`${chatPath(storyId, other.id)}/epilogue`).expect(409);
        expect(refused.body.error.code).toBe('409.004.013');
        expect(t.gateway.textCalls('turn').filter((call) => call.messages.at(-2)?.content.includes('Write the epilogue'))).toHaveLength(1);
    });
});

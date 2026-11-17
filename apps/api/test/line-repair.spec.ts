import { repeatedOpenings, sentencesOf } from '../src/manager/chat/speech/repeated-openings.js';
import { vi } from 'vitest';

import { SpeechRepairManagerService } from '../src/manager/chat/speech/speech-repair.service.js';
import {
    acceptRepair,
    buildRepairPrompt,
    judgeRepair,
    quotedTerms,
    REPAIR_LOG_TEXT_CAP,
    REPAIR_TIMEOUT_MS,
    RepairInput,
    repairLogLine,
    spokenPart,
} from '../src/manager/chat/speech/speech-repair.js';
import { ModelGateway } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Line repair (.scratch/natural-speech/line-repair.md): the repeated-sentence habit found in code,
 * the repair's prompt and when its answer is taken, then a turn through HTTP with the fake gateway.
 */

describe('Line repair: the habit, found in code (pure)', () => {
    it.each([
        'I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg.',
        "You're going to watch. You're going to wait. And you're going to find out exactly what I decided.",
        "No. No, you don't get to apologize. You don't get to be sorry and then hand me back my plan.",
        "You don't touch, you don't talk, you don't do the forehead thing.",
        'You\'re always reaching, always tugging, always breaking something of mine.',
        'I loved you when you came back. I loved you when you poked me. I loved you at dawn.',
    ])('finds it in: %s', (line) => {
        expect(repeatedOpenings(line).length).toBeGreaterThan(0);
    });

    it.each([
        'Fine. The plan. Stage one. Sit down on the furs.',
        'Oh—oh, the jugs. Yes. I mean, no.',
        'Tavri. Breathe.',
        "I know. I'm sorry. Come here.",
        'Sit. Watch. You\'ll see.',
        "Cows? Sweetheart, look around. Do we look like we need cows?",
        // Said again for weight (Chat 2, 2026-11-16): a repair read it as two people and changed who was in trouble.
        "She's counting. Tavri, she's counting. He's in so much trouble.",
        'No. No. No.',
        // Starting over, as Tavri's Voice asks (Chat 2): a repair smoothed the stammer away.
        "I can't—I can't breathe—Tavri, tell Morra I'm dying—",
    ])('leaves plain talk alone: %s', (line) => {
        expect(repeatedOpenings(line)).toEqual([]);
    });

    it('names the run it found, whole', () => {
        expect(repeatedOpenings('Fine. I had stages. I had a sequence. Sit.')).toEqual(['I had stages. I had a sequence.']);
        expect(sentencesOf('Wait— Stop. Now!')).toEqual(['Wait—', 'Stop.', 'Now!']);
    });
});

const INPUT: RepairInput = {
    speakerName: 'Nara',
    voice: 'Short, sure sentences.',
    line: 'I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg.',
    found: ['I had a whole speech ready. I had stages. I had a sequence.'],
};

describe('Line repair: what is asked, and what is taken (pure)', () => {
    it('asks for the one line said aloud, in their voice, meaning kept, each thing once', () => {
        const prompt = buildRepairPrompt(INPUT);
        const [system, user] = prompt.messages.map((message) => message.content);
        expect(system).toContain('so it sounds like a real person talking, not like a script');
        expect(system).toContain('Written: "I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg." Spoken: "I had a whole speech ready. Stages and everything. You were going to beg."');
        expect(user).toContain('Character: Nara. How Nara talks: Short, sure sentences.');
        expect(user).toContain('The line, as written:\n"I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg."');
        expect(user).toContain('these sentences open the same way:\n- "I had a whole speech ready. I had stages. I had a sequence."');
        expect(user).toContain('changing as little as you can.');
        expect(user).toContain('Keep every other sentence word for word.');
        expect(user).toContain('"I" stays Nara, and "you" stays whoever Nara is talking to.');
        expect(user).toContain("Add no names, nicknames or ways of addressing anyone that the line doesn't already use.");
        expect(user).toContain('no "Nara:" label');
        expect(user.endsWith('Answer with only the line.')).toBe(true);
    });

    it('takes a better line without its label, quotes, fence or asides; refuses one empty, much longer or no better', () => {
        expect(acceptRepair('I had a whole speech ready. Stages and everything. You were going to beg.', INPUT)).toBe('I had a whole speech ready. Stages and everything. You were going to beg.');
        expect(acceptRepair('Nara: "I had a speech ready. Stages and all."', INPUT)).toBe('I had a speech ready. Stages and all.');
        expect(acceptRepair('```\n*sighs* I had a speech ready. Stages and all.\n```', INPUT)).toBe('I had a speech ready. Stages and all.');
        expect(acceptRepair('   ', INPUT)).toBeNull();
        expect(acceptRepair(`${INPUT.line} ${'and more '.repeat(20)}`, INPUT)).toBeNull();
        expect(acceptRepair('I had a plan. I had stages. I had a sequence. I had more.', INPUT)).toBeNull();
        expect(acceptRepair('Fine.\n@Kai: Me too.', INPUT)).toBeNull();
    });

    it('refuses a repair that turns the line around, or brings in a name the card quotes', () => {
        // Seen on Chat 2's real lines (2026-11-16).
        const line = "You can't say that. I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg.";
        const input = { speakerName: 'Nara', line, voice: 'Calls the user "traveller" until they earn a name.' };
        expect(acceptRepair('You had a speech ready, traveller. Stages. A sequence. You were supposed to beg.', input)).toBeNull();
        expect(acceptRepair("You can't say that. I had a whole speech ready, traveller. Stages, a sequence. I was going to make you beg.", input)).toBeNull();
        expect(acceptRepair("You can't say that. I had a whole speech ready. Stages, a sequence. I was going to make you beg.", input)).toBe(
            "You can't say that. I had a whole speech ready. Stages, a sequence. I was going to make you beg.",
        );
        expect(quotedTerms('Calls anyone younger "child" or "little one", and teases her daughter.')).toEqual(['child', 'little one']);
    });

    it('names the guard that refused the answer', () => {
        const line = "You can't say that. I had a whole speech ready. I had stages. I had a sequence. I was going to make you beg.";
        const input = { speakerName: 'Nara', line, voice: 'Calls the user "traveller" until they earn a name.' };
        expect(judgeRepair('I had a whole speech ready. Stages and everything.', INPUT)).toEqual({ line: 'I had a whole speech ready. Stages and everything.', refused: null });
        expect(judgeRepair('  *sighs*  ', INPUT)).toEqual({ line: null, refused: 'empty' });
        expect(judgeRepair('Fine.\n@Kai: Me too.', INPUT)).toEqual({ line: null, refused: "wrote another speaker's line" });
        expect(judgeRepair(`${INPUT.line} ${'and more '.repeat(20)}`, INPUT)).toEqual({ line: null, refused: 'too long' });
        expect(judgeRepair('I had a plan. I had stages. I had a sequence. I had more.', INPUT)).toEqual({ line: null, refused: 'no better' });
        expect(judgeRepair('You had a speech ready. Stages. A sequence. You were supposed to beg.', input)).toEqual({ line: null, refused: 'lost all "I"' });
        expect(judgeRepair("Can't say that. I had a whole speech ready. Stages, a sequence. I was going to make Ash beg.", input)).toEqual({ line: null, refused: 'lost all "you"' });
        expect(judgeRepair("You can't say that, traveller. I had a whole speech ready. Stages, a sequence. I was going to make you beg.", input)).toEqual({
            line: null,
            refused: 'added a quoted Voice term',
        });
    });

    it('logs each repair on one line: the line as written, and the line kept or the raw answer and why', () => {
        const kept = repairLogLine(3, { speaker: 'Nara', part: 1, written: '*sighs* I had stages. I had a sequence.', repaired: '*sighs* Stages and all.', answer: 'Stages and all.', reason: null, error: null });
        expect(kept).toBe('Chat 3: Line repair kept {"speaker":"Nara","part":1,"written":"*sighs* I had stages. I had a sequence.","repaired":"*sighs* Stages and all."}');
        const refused = repairLogLine(3, { speaker: 'Nara', part: 0, written: 'I had stages. I had a sequence.', repaired: null, answer: 'Fine.\n@Kai: — —', reason: "wrote another speaker's line", error: null });
        expect(refused).toBe(`Chat 3: Line repair refused (wrote another speaker's line) {"speaker":"Nara","part":0,"written":"I had stages. I had a sequence.","answer":"Fine.\\n@Kai: — —"}`);
        const late = repairLogLine(3, { speaker: 'Nara', part: 0, written: 'x'.repeat(2000), repaired: null, answer: null, reason: 'timeout', error: 'no answer within 10000 ms' });
        expect(late).not.toContain('\n');
        expect(late).toContain('"answer":null,"error":"no answer within 10000 ms"');
        expect(late).toContain(`"written":"${'x'.repeat(REPAIR_LOG_TEXT_CAP)}…(2000 chars)"`);
    });

    it('sends only the spoken words, keeping an opening stage direction apart', () => {
        expect(spokenPart('*still not turning* I can hear you. I can hear you thinking.')).toEqual({
            aside: '*still not turning* ',
            spoken: 'I can hear you. I can hear you thinking.',
        });
        expect(spokenPart('I had stages. I had a sequence.')).toEqual({ aside: '', spoken: 'I had stages. I had a sequence.' });
        expect(spokenPart('I had stages. *she sighs* I had a sequence.').spoken).toBeNull();
    });
});

describe('Line repair: the call, and why a line was kept as written', () => {
    const answering = (completeText: () => Promise<{ text: string }>) =>
        new SpeechRepairManagerService({ completeText } as unknown as ModelGateway);

    afterEach(() => {
        vi.useRealTimers();
    });

    it('passes on the raw answer and the guard that refused it', async () => {
        const service = answering(async () => ({ text: 'I had a plan. I had stages. I had a sequence. I had more.' }));
        expect(await service.repair(INPUT, { chatId: 1 })).toEqual({ line: null, reason: 'no better', answer: 'I had a plan. I had stages. I had a sequence. I had more.', error: null });
        const kept = answering(async () => ({ text: 'Nara: I had a whole speech ready. Stages and everything.' }));
        expect(await kept.repair(INPUT, { chatId: 1 })).toEqual({
            line: 'I had a whole speech ready. Stages and everything.',
            reason: null,
            answer: 'Nara: I had a whole speech ready. Stages and everything.',
            error: null,
        });
    });

    it('tells a failed call from a late one', async () => {
        const failed = answering(async () => {
            throw new Error('upstream 500');
        });
        expect(await failed.repair(INPUT, { chatId: 1 })).toEqual({ line: null, reason: 'error', answer: null, error: 'upstream 500' });

        vi.useFakeTimers();
        const late = answering(() => new Promise(() => {}));
        const pending = late.repair(INPUT, { chatId: 1 });
        await vi.advanceTimersByTimeAsync(REPAIR_TIMEOUT_MS);
        expect(await pending).toEqual({ line: null, reason: 'timeout', answer: null, error: `no answer within ${REPAIR_TIMEOUT_MS} ms` });
    });
});

const NO_OPS = '{"operations":[]}';
const NO_CHANGE = JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'not yet' } });

describe('Line repair: the turn (HTTP)', () => {
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
        const created = await t.http.post('/api/stories').send({ title: 'The Camp' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A summer camp.', opening: '@Nara: Tea?' }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'A traveller.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Nara', appearance: 'Tall.', personality: 'Warm.', voice: 'Short, sure sentences.' }).expect(201);
        const chat = (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body;
        // Thoughts are tested on their own (character-minds.spec.ts); this is about the reply.
        await t.http.patch(`/api/stories/${storyId}/chats/${chat.id}`).send({ characterThoughts: false }).expect(200);
        return { storyId, chatId: chat.id as number };
    }

    async function play(storyId: number, chatId: number, reply: string, repairs: string[]) {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        for (const repair of repairs) t.gateway.scriptText('speech_repair', repair);
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Well?' }).expect(201);
        return (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body.messages.at(-1).parts as Array<{ kind: string; text: string }>;
    }

    it('keeps a line with the habit said again, asks nothing for one without, and keeps a line as written when the repair fails or is no better', async () => {
        const { storyId, chatId } = await createChat();

        // The habit: the line alone is sent back, and the repaired one is kept.
        const repaired = await play(storyId, chatId, 'She folds her arms.\n\n@Nara: I had a whole speech ready. I had stages. I had a sequence.', [
            'I had a whole speech ready. Stages and everything.',
        ]);
        expect(repaired).toEqual([
            { kind: 'narration', text: 'She folds her arms.' },
            expect.objectContaining({ kind: 'speech', text: 'I had a whole speech ready. Stages and everything.' }),
        ]);
        const call = t.gateway.textCalls('speech_repair').at(-1)!;
        expect(call.messages[1].content).toContain('Character: Nara. How Nara talks: Short, sure sentences.');
        expect(call.messages[1].content).toContain('"I had a whole speech ready. I had stages. I had a sequence."');
        // The next turn's history reads the repaired line.
        const plain = await play(storyId, chatId, '@Nara: Sit. Watch.', []);
        expect(plain.at(-1)!.text).toBe('Sit. Watch.');
        expect(t.gateway.textCalls('speech_repair')).toHaveLength(1);
        expect(JSON.stringify(t.gateway.textCalls('turn').at(-1)!.messages)).toContain('Stages and everything.');

        // An opening stage direction stays on screen; only the spoken words are sent.
        const directed = await play(storyId, chatId, '@Nara: *not turning* You go. You stay. You decide.', ['Go or stay. Your call.']);
        expect(directed.at(-1)!.text).toBe('*not turning* Go or stay. Your call.');
        expect(t.gateway.textCalls('speech_repair').at(-1)!.messages[1].content).toContain('The line, as written:\n"You go. You stay. You decide."');

        // No better: kept as written. Failed (nothing scripted): kept as written, and the turn goes through.
        const worse = await play(storyId, chatId, '@Nara: I had a plan. I had stages. I had a sequence.', ['I had a plan. I had stages. I had a sequence. I had more.']);
        expect(worse.at(-1)!.text).toBe('I had a plan. I had stages. I had a sequence.');
        const failed = await play(storyId, chatId, '@Nara: You go. You stay. You decide.', []);
        expect(failed.at(-1)!.text).toBe('You go. You stay. You decide.');
    });
});

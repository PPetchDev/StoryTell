import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { rollBlock, rollOutcome, ROLL_TARGETS } from '../src/manager/chat/roll.js';
import { buildTurnPrompt, TurnPromptInput } from '../src/manager/chat/turn/prompt.js';
import { Difficulty, Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { Dice } from '../src/service/dice/dice.js';
import { TextCompletionRequest } from '../src/service/model-gateway/model-gateway.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Rolls (.scratch/roll/spec.md): a d20 the app throws for one User Message. The outcome and the
 * prompt first, as pure logic; then through the HTTP API with the dice and the fake gateway scripted.
 */

describe('Roll: the outcome and the prompt (pure)', () => {
    it('needs 8, 11 or 14 by Difficulty, and a 20 and a 1 are critical whatever the number', () => {
        expect(ROLL_TARGETS).toEqual({ [Difficulty.Easy]: 8, [Difficulty.Normal]: 11, [Difficulty.Hard]: 14 });
        expect(rollOutcome({ value: 11, target: 11 })).toBe('success');
        expect(rollOutcome({ value: 10, target: 11 })).toBe('failure');
        expect(rollOutcome({ value: 19, target: 11 })).toBe('success');
        expect(rollOutcome({ value: 2, target: 11 })).toBe('failure');
        expect(rollOutcome({ value: 20, target: 11 })).toBe('critical_success');
        expect(rollOutcome({ value: 1, target: 8 })).toBe('critical_failure');
    });

    it('tells the Narrator how the attempt turned out, as final, without dice in the story', () => {
        const success = rollBlock({ value: 14, target: 11 }, 'Ash')!;
        expect(success).toContain('The dice were thrown for what Ash attempts in their latest message: a success (14, needing 11 or more). It works.');
        expect(success).toContain("the result is final, so don't soften or reverse it.");
        expect(success).toContain('If the message attempts nothing that could fail, ignore this.');
        expect(success).toContain('Never mention dice, a roll or numbers in the story');
        expect(rollBlock({ value: 5, target: 11 }, 'Ash')).toContain('a failure (5, needing 11 or more). It does not work, or works only at a cost or with a complication');
        expect(rollBlock({ value: 20, target: 14 }, 'Ash')).toContain('a critical success (a natural 20). It works, and better than hoped');
        expect(rollBlock({ value: 1, target: 8 }, 'Ash')).toContain('a critical failure (a natural 1). It goes wrong');
        expect(rollBlock(null, 'Ash')).toBeNull();
    });

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
        history: [{ role: 'assistant', text: '@Mira: The door is locked.' }],
        userText: 'I pick the lock.',
        present: ['Mira'],
        ...overrides,
    });

    it('sits after "Where things stand" and before the Nudge and the Cue, in the trailing message only', () => {
        const prompt = buildTurnPrompt(input({ roll: { value: 14, target: 11 }, nudge: 'Mira', cue: 'Keep it tense.' }));
        const trailing = prompt.messages.at(-1)!.content;
        expect(trailing.indexOf('Where things stand:')).toBeLessThan(trailing.indexOf('The dice were thrown'));
        expect(trailing.indexOf('The dice were thrown')).toBeLessThan(trailing.indexOf('would like to hear from Mira'));
        expect(trailing.indexOf("The user's cue")).toBeLessThan(trailing.indexOf('Write the next turn now.'));
        expect(prompt.messages.slice(0, -1).some((message) => message.content.includes('dice'))).toBe(false);
        expect(buildTurnPrompt(input({ roll: null }))).toEqual(buildTurnPrompt(input()));
    });
});

interface Roll {
    value: number;
    target: number;
    outcome: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    roll?: Roll | null;
    judge?: { status: string } | null;
    memory?: { status: string } | null;
}

interface Chat {
    id: number;
    rollTarget: number;
    awaitingReply: boolean;
    messages: Message[];
}

const JUDGEMENT = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"not yet"}}';
const NO_OPS = '{"operations":[]}';

describe('Roll: through the HTTP API', () => {
    let t: TestApp;
    let dice: Dice;

    beforeAll(async () => {
        t = await startTestApp();
        dice = t.app.get(Dice);
    });

    afterEach(() => {
        t.gateway.reset();
        dice.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function createStory(difficulty?: string): Promise<number> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http
            .patch(`/api/stories/${storyId}`)
            .send({ setting: 'A lighthouse.', opening: '@Mira: The door is locked.', ...(difficulty ? { difficulty } : {}) })
            .expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Guarded.', voice: 'Short sentences.' })
            .expect(201);
        return storyId;
    }

    async function createChat(storyId: number): Promise<Chat> {
        return (await t.http.post(`/api/stories/${storyId}/chats`).expect(201)).body as Chat;
    }

    async function settled(storyId: number, chatId: number): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = (await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
            const last = [...chat.messages].reverse().find((message) => message.kind === 'ai' && message.judge);
            if (!last || (last.judge?.status !== 'pending' && last.memory?.status !== 'pending')) return chat;
            if (Date.now() > deadline) throw new Error('The background calls did not settle in time');
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    function script(reply = '@Mira: Hm.'): void {
        t.gateway.scriptText('turn', { text: reply, model: 'glm-5.3' });
        t.gateway.scriptText('judge', JUDGEMENT);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function send(storyId: number, chatId: number, body: Record<string, unknown>): Promise<Chat> {
        script();
        await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send(body).expect(201);
        return settled(storyId, chatId);
    }

    const trailing = () => {
        const calls: TextCompletionRequest[] = t.gateway.textCalls('turn');
        return calls[calls.length - 1].messages.at(-1)!.content;
    };

    it('throws the dice on the server for a Message sent with a Roll, keeps the result on it, and tells the Narrator', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        expect(chat.rollTarget).toBe(11);

        dice.script(14);
        const played = await send(storyId, chat.id, { text: 'I pick the lock.', roll: true });
        expect(played.messages.at(-2)).toMatchObject({ kind: 'user', text: 'I pick the lock.', roll: { value: 14, target: 11, outcome: 'success' } });
        expect(trailing()).toContain('a success (14, needing 11 or more). It works.');
        // Nothing of it in the history or the user's own message as the model reads them.
        const turn = t.gateway.textCalls('turn').at(-1)!;
        expect(turn.messages.slice(0, -1).some((message) => message.content.includes('dice'))).toBe(false);

        // Without a Roll, and with `roll: false`: no dice, no block.
        const plain = await send(storyId, chat.id, { text: 'I step inside.' });
        expect(plain.messages.at(-2)!.roll).toBeNull();
        expect(trailing()).not.toContain('dice');
        const off = await send(storyId, chat.id, { text: 'I look around.', roll: false });
        expect(off.messages.at(-2)!.roll).toBeNull();

        // A Continue has no User Message, so no Roll: the earlier one is not read again.
        script();
        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/continue`).expect(200);
        expect(trailing()).not.toContain('dice');
        await settled(storyId, chat.id);

        await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages`).send({ text: 'x', roll: 'yes' }).expect(400);
    });

    it("needs the number the Story's Difficulty sets, and a 20 and a 1 are critical", async () => {
        const storyId = await createStory('hard');
        const chat = await createChat(storyId);
        expect(chat.rollTarget).toBe(14);
        dice.script(13, 20, 1);
        expect((await send(storyId, chat.id, { text: 'I jump.', roll: true })).messages.at(-2)!.roll).toEqual({ value: 13, target: 14, outcome: 'failure' });
        expect(trailing()).toContain('a failure (13, needing 14 or more)');
        expect((await send(storyId, chat.id, { text: 'I jump again.', roll: true })).messages.at(-2)!.roll).toEqual({ value: 20, target: 14, outcome: 'critical_success' });
        expect(trailing()).toContain('a critical success (a natural 20)');
        expect((await send(storyId, chat.id, { text: 'Once more.', roll: true })).messages.at(-2)!.roll).toEqual({ value: 1, target: 14, outcome: 'critical_failure' });

        // The Message keeps the number it had to reach, whatever the Story's Difficulty becomes.
        await t.http.patch(`/api/stories/${storyId}`).send({ difficulty: 'easy' }).expect(200);
        const later = await settled(storyId, chat.id);
        expect(later.rollTarget).toBe(8);
        expect(later.messages.at(-2)!.roll).toEqual({ value: 1, target: 14, outcome: 'critical_failure' });
    });

    it('throws once: a Retry, Again and an edit of the Message all read the same Roll', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        const base = `/api/stories/${storyId}/chats/${chat.id}`;

        // The turn fails after the Roll was thrown and stored; Retry writes to the same one.
        dice.script(5, 19);
        t.gateway.scriptText('turn', new ProviderOutageError('DeepInfra answered 503.'));
        await t.http.post(`${base}/messages`).send({ text: 'I pick the lock.', roll: true }).expect(502);
        const failed = (await t.http.get(base).expect(200)).body as Chat;
        expect(failed.awaitingReply).toBe(true);
        expect(failed.messages.at(-1)!.roll).toEqual({ value: 5, target: 11, outcome: 'failure' });

        script();
        await t.http.post(`${base}/retry`).expect(200);
        expect(trailing()).toContain('a failure (5, needing 11 or more)');
        const retried = await settled(storyId, chat.id);

        script('@Mira: Still locked.');
        await t.http.post(`${base}/messages/${retried.messages.at(-1)!.id}/regenerate`).expect(200);
        expect(trailing()).toContain('a failure (5, needing 11 or more)');
        await settled(storyId, chat.id);

        script('@Mira: No.');
        const edited = await t.http.patch(`${base}/messages/${retried.messages.at(-2)!.id}`).send({ text: 'I force the lock.' }).expect(200);
        expect(trailing()).toContain('a failure (5, needing 11 or more)');
        expect((edited.body as Chat).messages.at(-2)).toMatchObject({ text: 'I force the lock.', roll: { value: 5, target: 11, outcome: 'failure' } });
        await settled(storyId, chat.id);

        // None of those threw the dice again: the next Roll is the second scripted one.
        expect((await send(storyId, chat.id, { text: 'I knock.', roll: true })).messages.at(-2)!.roll).toMatchObject({ value: 19, outcome: 'success' });
    });

    it('a Branch keeps the Rolls of the Messages it copies', async () => {
        const storyId = await createStory();
        const chat = await createChat(storyId);
        dice.script(17);
        const played = await send(storyId, chat.id, { text: 'I pick the lock.', roll: true });
        const { body: branch } = await t.http.post(`/api/stories/${storyId}/chats/${chat.id}/messages/${played.messages.at(-1)!.id}/branch`).expect(201);
        expect((branch as Chat).messages.at(-2)!.roll).toEqual({ value: 17, target: 11, outcome: 'success' });
    });

    it('rolls 1 to 20 when nothing is scripted', () => {
        const thrown = Array.from({ length: 400 }, () => dice.roll(20));
        expect(Math.min(...thrown)).toBeGreaterThanOrEqual(1);
        expect(Math.max(...thrown)).toBeLessThanOrEqual(20);
        expect(new Set(thrown).size).toBeGreaterThan(10);
    });
});

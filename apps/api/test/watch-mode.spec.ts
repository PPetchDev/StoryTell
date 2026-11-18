import { AddressInfo } from 'node:net';

import webpush from 'web-push';

import { ProviderOutageError } from '../src/errors/model-gateway.errors.js';
import { ChatManagerService } from '../src/manager/chat/chat.service.js';
import { buildTurnPrompt, continueInstruction, TurnPromptInput, watchInstruction } from '../src/manager/chat/turn/prompt.js';
import { Pov, ReplyLength, Tense } from '../src/model/story/entities/story.entity.js';
import { PushAlertsManagerService, watchAlertBody } from '../src/manager/push/push-alerts.service.js';
import { UsageRecordModelService } from '../src/model/usage-record/usage-record.service.js';
import { FakePushSender } from '../src/service/push/fake-push-sender.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Watch mode (.scratch/watch-mode/spec.md): the story plays on by itself for a number of replies,
 * written by the API one after another. Through the HTTP API with the fake gateway.
 */

interface Part {
    kind: 'narration' | 'speech';
    text: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    parts: Part[];
    judge?: { status: 'pending' | 'done' | 'failed' } | null;
    memory?: { status: 'pending' | 'done' | 'failed' } | null;
}

interface Chat {
    id: number;
    title: string;
    messages: Message[];
    awaitingReply: boolean;
}

interface Watch {
    id: string;
    replies: number;
    done: number;
    status: 'running' | 'ended';
    ended: { reason: string; message: string | null } | null;
}

interface StreamEvent {
    event: string;
    data: any;
}

const OPENING = '@Mira: The lamp went out an hour ago.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';
const VAPID = webpush.generateVAPIDKeys();
const PHONE = { endpoint: 'https://fcm.googleapis.com/fcm/send/watch-phone', keys: { p256dh: 'p256dh-watch', auth: 'auth-watch' } };

/** A turn's prompt input, as the Cue's tests build one. */
function promptInput(overrides: Partial<TurnPromptInput> = {}): TurnPromptInput {
    return {
        story: {
            setting: 'A lighthouse.',
            pov: Pov.Second,
            tense: Tense.Present,
            replyLength: ReplyLength.Medium,
            characters: [
                { name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short.', exampleLines: [], background: '', secrets: '' },
                { name: 'Tomas', appearance: 'Short.', personality: 'Lazy.', voice: 'Grumbles.', exampleLines: [], background: '', secrets: '' },
            ],
        },
        identity: { name: 'Ash', description: 'The keeper.' },
        scene: null,
        bonds: [],
        arcs: [],
        memories: [],
        history: [{ role: 'assistant', text: '@Mira: The lamp is out.' }],
        userText: null,
        present: ['Mira', 'Tomas'],
        ...overrides,
    };
}

const reply = (n: number) => `Rain lashes the glass.\n\n@Mira: Number ${n}, Tomas. Trim the wick.\n\n@Tomas: Again? Fine.`;

describe('Watch mode', () => {
    let t: TestApp;
    let origin: string;
    let push: FakePushSender;
    let alerts: PushAlertsManagerService;

    beforeAll(async () => {
        t = await startTestApp({ vapid: { publicKey: VAPID.publicKey, privateKey: VAPID.privateKey, subject: 'https://storytell.invalid' } });
        push = t.app.get(FakePushSender);
        alerts = t.app.get(PushAlertsManagerService);
        const server = t.app.getHttpServer();
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        await t.http.put('/api/push/subscription').send(PHONE).expect(204);
    });

    afterEach(async () => {
        await alerts.idle();
        push.reset();
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function playableChat(): Promise<{ storyId: number; chatId: number; base: string }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short sentences.' }).expect(201);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Tomas', appearance: 'Short.', personality: 'Lazy.', voice: 'Grumbles.' }).expect(201);
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        const chatId = chat.body.id as number;
        const base = `/api/stories/${storyId}/chats/${chatId}`;
        // No Thoughts or Diary entries: each reply makes exactly the turn, the Judge and Memory calls.
        await t.http.patch(base).send({ characterThoughts: false, autoDiary: false }).expect(200);
        return { storyId, chatId, base };
    }

    async function getChat(base: string): Promise<Chat> {
        return (await t.http.get(base).expect(200)).body as Chat;
    }

    /** One reply of Watch: its turn, Judge and Memory. */
    function scriptStep(n: number, judge = NO_CHANGE, turn: Record<string, unknown> = {}): void {
        t.gateway.scriptText('turn', { text: reply(n), ...turn });
        t.gateway.scriptText('judge', judge);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    async function watchState(base: string): Promise<{ watch: Watch | null; perReplyUsd: number | null }> {
        return (await t.http.get(`${base}/watch`).expect(200)).body;
    }

    /** Polls the Watch until it has ended, and the background calls of its last reply with it. */
    async function ended(base: string): Promise<Watch> {
        const deadline = Date.now() + 10_000;
        for (;;) {
            const { watch } = await watchState(base);
            if (watch?.status === 'ended') {
                await t.app.get(ChatManagerService).backgroundIdle(Number(base.split('/').at(-1)));
                return watch;
            }
            if (Date.now() > deadline) throw new Error(`The Watch never ended: ${JSON.stringify(watch)}`);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    async function chatWhen(base: string, ready: (chat: Chat) => boolean): Promise<Chat> {
        const deadline = Date.now() + 10_000;
        for (;;) {
            const chat = await getChat(base);
            if (ready(chat)) return chat;
            if (Date.now() > deadline) throw new Error(`The Chat never got there: ${chat.messages.length} Messages`);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /** Reads the Watch's event stream to its end. */
    async function follow(base: string): Promise<StreamEvent[]> {
        const response = await fetch(`${origin}${base}/watch`, { headers: { Accept: 'text/event-stream' } });
        expect(response.headers.get('content-type')).toMatch(/^text\/event-stream/);
        const text = await response.text();
        return text
            .split('\n\n')
            .map((block) => {
                let event = 'message';
                const data: string[] = [];
                for (const line of block.split('\n')) {
                    if (line.startsWith('event:')) event = line.slice(6).trim();
                    else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
                }
                return data.length > 0 ? { event, data: JSON.parse(data.join('\n')) } : null;
            })
            .filter((event): event is StreamEvent => event !== null);
    }

    const aiTexts = (chat: Chat) => chat.messages.filter((message) => message.kind === 'ai').map((message) => message.parts.map((part) => part.text).join(' '));

    it('writes the replies asked for, one Continue at a time with the watch instruction, each judged and remembered', async () => {
        const { base } = await playableChat();
        for (const n of [1, 2, 3]) scriptStep(n);

        const started = await t.http.post(`${base}/watch`).send({ replies: 3 }).expect(201);
        expect(started.body).toMatchObject({ replies: 3, done: 0, status: 'running', ended: null });

        const watch = await ended(base);
        expect(watch).toMatchObject({ replies: 3, done: 3, status: 'ended', ended: { reason: 'finished', message: null } });
        const chat = await getChat(base);
        expect(chat.messages.map((message) => message.kind)).toEqual(['ai', 'ai', 'ai', 'ai']);
        expect(aiTexts(chat).slice(1).map((text) => /Number (\d)/.exec(text)?.[1])).toEqual(['1', '2', '3']);
        for (const message of chat.messages.slice(1)) {
            expect(message.judge?.status).toBe('done');
            expect(message.memory?.status).toBe('done');
        }
        const turns = t.gateway.textCalls('turn');
        expect(turns).toHaveLength(3);
        for (const turn of turns) {
            const closing = String(turn.messages.at(-1)?.content);
            expect(closing).toContain(watchInstruction('Ash'));
            expect(closing).not.toContain(continueInstruction('Ash'));
            expect(turn.stop).toEqual(expect.arrayContaining(['\nAsh:']));
        }
        // Each turn read the reply before it: they ran one after another.
        expect(String(turns[2].messages.map((message) => message.content).join('\n'))).toContain('Number 2');
        expect(t.gateway.textCalls('judge')).toHaveLength(3);
        expect(t.gateway.textCalls('memory_extraction')).toHaveLength(3);
    });

    it('streams the Watch: the Watch at once, each reply as it is written, the count, and the end', async () => {
        const { base } = await playableChat();
        scriptStep(1, NO_CHANGE, { pieceSize: 6, pieceDelayMs: 15 });
        scriptStep(2, NO_CHANGE, { pieceSize: 6, pieceDelayMs: 15 });

        await t.http.post(`${base}/watch`).send({ replies: 2 }).expect(201);
        const events = await follow(base);

        expect(events[0]).toEqual({ event: 'watch', data: { watch: expect.objectContaining({ status: 'running', replies: 2 }) } });
        const counts = events.filter((event) => event.event === 'watch').map((event) => event.data.watch.done);
        expect(counts.at(-1)).toBe(2);
        expect(counts).toContain(1);
        expect(events.at(-1)?.data.watch).toMatchObject({ status: 'ended', ended: { reason: 'finished' } });
        const parts = events.filter((event) => event.event === 'parts');
        expect(parts.length).toBeGreaterThan(2);
        // The last reply so far before the count went to 1 is the first reply as stored.
        const firstCount = events.findIndex((event) => event.event === 'watch' && event.data.watch.done === 1);
        const lastBefore = events.slice(0, firstCount).filter((event) => event.event === 'parts').at(-1);
        const chat = await chatWhen(base, (each) => each.messages.length === 3);
        expect(lastBefore?.data.parts).toEqual(chat.messages[1].parts);

        // Once ended, the stream answers the ended Watch and closes.
        const again = await follow(base);
        expect(again).toEqual([{ event: 'watch', data: { watch: expect.objectContaining({ status: 'ended', done: 2 }) } }]);
    });

    it('stops at once on DELETE: the reply being written is not stored, those before it stay, and the Watch is forgotten', async () => {
        const { base } = await playableChat();
        scriptStep(1);
        scriptStep(2, NO_CHANGE, { pieceSize: 2, pieceDelayMs: 40 });
        scriptStep(3);

        await t.http.post(`${base}/watch`).send({ replies: 3 }).expect(201);
        // Stopped while the second reply is written.
        await chatWhen(base, (chat) => chat.messages.length === 2);
        const deadline = Date.now() + 5_000;
        while (t.gateway.textCalls('turn').length < 2 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));
        await new Promise((resolve) => setTimeout(resolve, 60));
        await t.http.delete(`${base}/watch`).expect(204);

        const chat = await getChat(base);
        expect(chat.messages).toHaveLength(2);
        expect(aiTexts(chat)[1]).toContain('Number 1');
        expect(await watchState(base)).toMatchObject({ watch: null });
        // The lock is free: the next turn runs.
        t.gateway.reset();
        scriptStep(9);
        await t.http.post(`${base}/continue`).send({}).expect(200);
        // A Stop sends no alert, and no step did.
        await alerts.idle();
        expect(push.sends.filter((send) => send.payload.body.startsWith('Watch'))).toEqual([]);
    });

    it('stops when the user sends a message, and the message is answered as usual', async () => {
        const { base } = await playableChat();
        scriptStep(1, NO_CHANGE, { pieceSize: 2, pieceDelayMs: 40 });

        await t.http.post(`${base}/watch`).send({ replies: 5 }).expect(201);
        const deadline = Date.now() + 5_000;
        while (t.gateway.textCalls('turn').length < 1 && Date.now() < deadline) await new Promise((resolve) => setTimeout(resolve, 10));

        t.gateway.scriptText('turn', '@Mira: You speak at last.');
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
        const sent = await t.http.post(`${base}/messages`).send({ text: 'I clear my throat.' }).expect(201);

        const kinds = (sent.body as Chat).messages.map((message) => message.kind);
        expect(kinds).toEqual(['ai', 'user', 'ai']);
        expect(JSON.stringify((sent.body as Chat).messages[2].parts)).toContain('You speak at last');
        expect(await watchState(base)).toMatchObject({ watch: null });
    });

    it('ends with one alert when it finishes, and none for each reply', async () => {
        const { base } = await playableChat();
        scriptStep(1);
        scriptStep(2);
        await t.http.post(`${base}/watch`).send({ replies: 2 }).expect(201);
        await ended(base);
        await alerts.idle();
        const chat = await getChat(base);
        expect(push.sends.map((send) => send.payload.body)).toEqual([watchAlertBody('finished', chat.title)]);
        expect(watchAlertBody('finished', 'Chat 2')).toBe('Watch done · Chat 2');
        expect(watchAlertBody('needs_you', 'Chat 2')).toBe('Watch stopped: the story needs you · Chat 2');
    });

    it('stops by itself when the reply reaches an Ending', async () => {
        const { storyId, base } = await playableChat();
        const story = await t.http.post(`/api/stories/${storyId}/endings`).send({ name: 'The light returns', condition: 'The lamp is lit again.' }).expect(201);
        expect(story.body.endings).toHaveLength(1);
        scriptStep(1);
        scriptStep(2, JSON.stringify({ bond_changes: [], arc_steps: [], scene: { move_on: false, reason: 'no' }, ending: { reason: 'The lamp burns.', reached: 1 } }));
        scriptStep(3);

        await t.http.post(`${base}/watch`).send({ replies: 3 }).expect(201);
        const watch = await ended(base);

        expect(watch).toMatchObject({ done: 2, ended: { reason: 'ending' } });
        expect((await getChat(base)).messages).toHaveLength(3);
        await alerts.idle();
        expect(push.sends.map((send) => send.payload.body)).toEqual([expect.stringMatching(/^Watch stopped: the story needs you · /)]);
    });

    it('stops by itself when the Judge offers a Roll, and when a Sudden event begins', async () => {
        const offer = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"},"roll_offer":{"stakes":"Can you climb the stair?","stat":null}}';
        const rolls = await playableChat();
        // An offer comes only after six written replies.
        for (const n of [1, 2, 3, 4, 5]) scriptStep(n);
        scriptStep(6, offer);
        scriptStep(7);
        await t.http.post(`${rolls.base}/watch`).send({ replies: 10 }).expect(201);
        expect(await ended(rolls.base)).toMatchObject({ done: 6, ended: { reason: 'roll_offer' } });
        t.gateway.reset();

        const events = await playableChat();
        await t.http
            .post(`/api/stories/${events.storyId}/sudden-events`)
            .send({ name: 'The storm', trigger: 'The storm hits.', gauge: 'Nerve', turns: 3, success: 'They hold.', failure: 'They flee.' })
            .expect(201);
        scriptStep(1, '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"no"},"sudden_event":{"start":1,"reason":"The storm hits."}}');
        scriptStep(2);
        await t.http.post(`${events.base}/watch`).send({ replies: 3 }).expect(201);
        expect(await ended(events.base)).toMatchObject({ done: 1, ended: { reason: 'sudden_event' } });

        // While it is under way, Watch can't start: the user must play it.
        const refused = await t.http.post(`${events.base}/watch`).send({ replies: 3 }).expect(409);
        expect(refused.body.error.code).toBe('409.004.161');
    });

    it('stops by itself on a failed reply, with its message, and when text credit runs out', async () => {
        const { base } = await playableChat();
        scriptStep(1);
        t.gateway.scriptText('turn', new ProviderOutageError('The host is down.'));
        await t.http.post(`${base}/watch`).send({ replies: 3 }).expect(201);
        const failed = await ended(base);
        expect(failed).toMatchObject({ done: 1, ended: { reason: 'failed', message: expect.stringContaining('The host is down') } });
        expect((await getChat(base)).messages).toHaveLength(2);

        t.gateway.reset();
        const credit = await playableChat();
        t.gateway.scriptText('turn', { text: reply(1) });
        t.gateway.scriptText('judge', NO_CHANGE);
        // Credit runs out once the first reply is written, before the second.
        t.gateway.scriptText('memory_extraction', NO_OPS);
        await t.http.post(`${credit.base}/watch`).send({ replies: 3 }).expect(201);
        await chatWhen(credit.base, (chat) => chat.messages.length === 2);
        t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: null } } as never);
        const out = await ended(credit.base);
        expect(out).toMatchObject({ done: 1, ended: { reason: 'credit' } });
        expect(out.ended?.message).toBeTruthy();
    });

    it('refuses a second Watch, one while a message awaits its reply, and a bad number of replies', async () => {
        const { base } = await playableChat();
        scriptStep(1, NO_CHANGE, { pieceSize: 2, pieceDelayMs: 30 });
        await t.http.post(`${base}/watch`).send({ replies: 1 }).expect(201);
        const second = await t.http.post(`${base}/watch`).send({ replies: 3 }).expect(409);
        expect(second.body.error.code).toBe('409.004.160');
        await ended(base);

        for (const replies of [0, 11, 2.5, 'five']) {
            const bad = await t.http.post(`${base}/watch`).send({ replies }).expect(400);
            expect(bad.body.error.code).toBe('400.000.000');
        }

        // A failed send leaves its message waiting: Retry is the way on, not Watch.
        t.gateway.scriptText('turn', new ProviderOutageError('Down.'));
        await t.http.post(`${base}/messages`).send({ text: 'Hello?' }).expect(502);
        const waiting = await t.http.post(`${base}/watch`).send({ replies: 3 }).expect(409);
        expect(waiting.body.error.code).toBe('409.004.013');

        // Another Story's path to this Chat answers as not found.
        await t.http.get(`/api/stories/999999/chats/${base.split('/').at(-1)}/watch`).expect(404);
        await t.http.delete(`/api/stories/999999/chats/${base.split('/').at(-1)}/watch`).expect(404);
    });

    it("estimates a reply's cost from the Chat's last replies", async () => {
        const { base } = await playableChat();
        expect(await watchState(base)).toEqual({ watch: null, perReplyUsd: null });

        for (const n of [1, 2, 3, 4, 5, 6, 7]) scriptStep(n);
        await t.http.post(`${base}/watch`).send({ replies: 7 }).expect(201);
        await ended(base);
        // The fake gateway records no usage: the costs the real one would, each named for its reply.
        const replies = (await getChat(base)).messages.slice(1);
        const usage = t.app.get(UsageRecordModelService);
        const costs = [0.5, 0.01, 0.03, 0.02, 0.01, 0.03, 0.0];
        for (const [index, message] of replies.entries()) {
            if (costs[index] === 0) continue;
            await usage.record({
                kind: 'turn',
                pool: 'text',
                model: 'glm-5.3',
                host: 'deepinfra',
                promptTokens: 1000,
                completionTokens: 50,
                images: null,
                costUsd: costs[index],
                storyId: null,
                chatId: Number(base.split('/').at(-1)),
                messageId: message.id,
            });
        }

        // The last five replies with a cost: the oldest (0.5) is past them, and the one with none counts not at all.
        const { perReplyUsd } = await watchState(base);
        expect(perReplyUsd).toBeCloseTo(0.02, 6);
    });

    it('keeps the Role in the background: the watch instruction names the Role and forbids writing for it', () => {
        const instruction = watchInstruction('Ash');
        expect(instruction).toContain('Ash stays in the background');
        expect(instruction).toContain('Do not write anything Ash says, thinks, feels, decides or does.');
        const watched = buildTurnPrompt(promptInput({ watch: true }));
        const continued = buildTurnPrompt(promptInput());
        expect(String(watched.messages.at(-1)?.content)).toContain(watchInstruction('Ash'));
        expect(String(watched.messages.at(-1)?.content)).not.toContain(continueInstruction('Ash'));
        expect(String(continued.messages.at(-1)?.content)).toContain(continueInstruction('Ash'));
        // A user's message is never replaced by it.
        expect(String(buildTurnPrompt(promptInput({ userText: 'Hi.', watch: true })).messages.at(-1)?.content)).not.toContain(watchInstruction('Ash'));
        // The standing rule that every Character is an adult stays.
        expect(String(watched.messages[0].content)).toContain('All characters are adults.');
    });
});

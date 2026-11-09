import { AddressInfo } from 'node:net';

import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { TEST_KEYS } from './harness/gateway-under-test.js';
import { eventStream, fixture, streamFixture } from './harness/recorded-fetch.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * Streaming replies (spec: .scratch/streaming/spec.md). A turn asked for with
 * `Accept: text/event-stream` answers server-sent events: `parts` while the reply is written,
 * then `done` with the same body the JSON answer has, or `error`. Through the HTTP API with the
 * fake gateway streaming a scripted reply in pieces.
 */

interface Part {
    kind: 'narration' | 'speech';
    characterId?: number | null;
    speakerName?: string;
    text: string;
}

interface Message {
    id: number;
    kind: 'user' | 'ai';
    text?: string;
    parts?: Part[];
    judge?: { status: 'pending' | 'done' | 'failed' } | null;
    memory?: { status: 'pending' | 'done' | 'failed' } | null;
}

interface Chat {
    id: number;
    messages: Message[];
    awaitingReply: boolean;
    rolledBack?: Record<string, number>;
}

interface StreamEvent {
    event: string;
    data: any;
}

const OPENING = 'The lamp went out an hour ago.';
const NO_CHANGE = '{"bond_changes":[],"arc_steps":[],"scene":{"move_on":false,"reason":"nothing yet"}}';
const NO_OPS = '{"operations":[]}';

const REPLY = `Rain lashes the glass.

@Mira: You're late, keeper. Boots off.

She slides the logbook across the table.`;

describe('Streaming replies', () => {
    let t: TestApp;
    let origin: string;

    beforeAll(async () => {
        t = await startTestApp();
        const server = t.app.getHttpServer();
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterEach(() => {
        t.gateway.reset();
    });

    afterAll(async () => {
        await t.close();
    });

    async function playableChat(): Promise<{ storyId: number; chatId: number; miraId: number }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        const mira = await t.http
            .post(`/api/stories/${storyId}/characters`)
            .send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short sentences.' })
            .expect(201);
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        return { storyId, chatId: chat.body.id as number, miraId: mira.body.id as number };
    }

    async function getChat(storyId: number, chatId: number): Promise<Chat> {
        const { body } = await t.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200);
        return body as Chat;
    }

    /** The background calls a stored reply starts, scripted to change nothing. */
    function scriptBackground(): void {
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    /**
     * Asks for a turn as the Chat screen does, with `Accept: text/event-stream`, and reads the
     * events until the stream ends. `onEvent` may abort the request, as Stop does.
     */
    async function streamTurn(
        method: string,
        path: string,
        body?: unknown,
        onEvent?: (event: StreamEvent, abort: () => void) => void,
    ): Promise<{ status: number; contentType: string; events: StreamEvent[]; json?: any }> {
        const controller = new AbortController();
        const response = await fetch(`${origin}${path}`, {
            method,
            headers: { Accept: 'text/event-stream', ...(body ? { 'Content-Type': 'application/json' } : {}) },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const contentType = response.headers.get('content-type') ?? '';
        if (!contentType.startsWith('text/event-stream')) {
            return { status: response.status, contentType, events: [], json: await response.json() };
        }
        const events: StreamEvent[] = [];
        const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
        let buffer = '';
        try {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) break;
                buffer += value;
                let end: number;
                while ((end = buffer.indexOf('\n\n')) >= 0) {
                    const block = buffer.slice(0, end);
                    buffer = buffer.slice(end + 2);
                    const event = parseEvent(block);
                    if (!event) continue;
                    events.push(event);
                    onEvent?.(event, () => controller.abort());
                }
            }
        } catch (error) {
            if (!controller.signal.aborted) throw error;
        }
        return { status: response.status, contentType, events };
    }

    function parseEvent(block: string): StreamEvent | undefined {
        let event = 'message';
        const data: string[] = [];
        for (const line of block.split('\n')) {
            if (line.startsWith(':')) continue;
            if (line.startsWith('event:')) event = line.slice(6).trim();
            else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (data.length === 0) return undefined;
        return { event, data: JSON.parse(data.join('\n')) };
    }

    function partsEvents(events: StreamEvent[]): Part[][] {
        return events.filter((event) => event.event === 'parts').map((event) => event.data.parts as Part[]);
    }

    describe('a streamed send', () => {
        it('gives growing parts events, then done with the Chat, and the stored reply equals the last parts', async () => {
            const { storyId, chatId, miraId } = await playableChat();
            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 6, pieceDelayMs: 25 });
            scriptBackground();

            const { status, contentType, events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: 'Evening.' });

            expect(status).toBe(201);
            expect(contentType).toMatch(/^text\/event-stream/);
            const parts = partsEvents(events);
            expect(parts.length).toBeGreaterThan(2);
            const lengths = parts.map((each) => JSON.stringify(each).length);
            expect(lengths).toEqual([...lengths].sort((a, b) => a - b));
            expect(events[events.length - 1].event).toBe('done');

            const done = events[events.length - 1].data as Chat;
            const reply = done.messages[done.messages.length - 1];
            expect(done.messages[1]).toMatchObject({ kind: 'user', text: 'Evening.' });
            expect(reply.parts).toEqual([
                { kind: 'narration', text: 'Rain lashes the glass.' },
                { kind: 'speech', characterId: miraId, speakerName: 'Mira', text: "You're late, keeper. Boots off.", emotion: null },
                { kind: 'narration', text: 'She slides the logbook across the table.' },
            ]);
            expect(parts[parts.length - 1]).toEqual(reply.parts);
            expect((await getChat(storyId, chatId)).messages[2].parts).toEqual(reply.parts);
        });

        it('never shows an unfinished @Name: line as narration first', async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', { text: '@Mira: Boots off.', pieceSize: 2 });
            scriptBackground();

            const { events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: 'Evening.' });

            for (const parts of partsEvents(events)) {
                expect(parts.every((part) => part.kind === 'speech')).toBe(true);
            }
        });
    });

    describe('the guard while streaming', () => {
        it.each([
            ['Ash:', 'Ash: It is only me, Mira.'],
            ['@Ash:', '@Ash: It is only me, Mira.'],
            ['*Ash*:', '*Ash*: It is only me, Mira.'],
            ['You:', 'you : It is only me, Mira.'],
        ])('never sends a %s line split across pieces, ends the call there, and stores the reply before it', async (_label, userLine) => {
            const { storyId, chatId, miraId } = await playableChat();
            const text = `Ashes drift past the window.\n\n@Mira: Who's there?\n${userLine}\n\nMira lowers the lamp.`;
            // The user line starts at 50: the piece over 39–51 ends two characters into it. Pieces
            // slower than the 100 ms parts interval each give their own event.
            t.gateway.scriptText('turn', { text, pieceSize: 13, pieceDelayMs: 120 });
            scriptBackground();

            const { events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: 'Evening.' });

            for (const event of events) {
                expect(JSON.stringify(event.data)).not.toContain('only me');
                expect(JSON.stringify(event.data)).not.toContain('lowers the lamp');
            }
            const expected = [
                { kind: 'narration', text: 'Ashes drift past the window.' },
                { kind: 'speech', characterId: miraId, speakerName: 'Mira', text: "Who's there?", emotion: null },
            ];
            const parts = partsEvents(events);
            // Not even the start of the line shows: every event is the stored reply, cut shorter.
            for (const each of parts) {
                expect(each.length).toBeLessThanOrEqual(expected.length);
                each.forEach((part, index) => {
                    expect(part.kind).toBe(expected[index].kind);
                    expect(expected[index].text.startsWith(part.text)).toBe(true);
                });
            }
            expect(parts[parts.length - 1]).toEqual(expected);
            expect(events[events.length - 1].event).toBe('done');
            const done = events[events.length - 1].data as Chat;
            expect(done.messages[2].parts).toEqual(expected);
            const call = t.gateway.calls.find((each) => each.method === 'streamText');
            expect(call).toMatchObject({ stopped: true });
        });
    });

    describe('Stop', () => {
        /** Waits until the streamed call has seen the request close. */
        async function stoppedCall(): Promise<void> {
            const deadline = Date.now() + 5_000;
            while (!t.gateway.calls.some((call) => call.method === 'streamText' && call.stopped)) {
                if (Date.now() > deadline) throw new Error('The streamed call was never stopped');
                await new Promise((resolve) => setTimeout(resolve, 10));
            }
        }

        /** Retries `send` while the stopped turn still holds the lock, then answers it. */
        async function onceUnlocked<T extends { status: number; json?: any }>(send: () => Promise<T>): Promise<T> {
            const deadline = Date.now() + 5_000;
            for (;;) {
                const answer = await send();
                if (answer.json?.error?.code !== '409.004.004') return answer;
                if (Date.now() > deadline) throw new Error('The turn lock was never released');
                await new Promise((resolve) => setTimeout(resolve, 20));
            }
        }

        it('stores nothing new, keeps the User Message awaiting Retry, and the next turn goes through', async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 4, pieceDelayMs: 30 });

            const { events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: 'Evening.' }, (event, abort) => {
                if (event.event === 'parts') abort();
            });
            await stoppedCall();

            expect(events.map((event) => event.event)).toEqual(['parts']);
            const chat = await getChat(storyId, chatId);
            expect(chat.messages).toHaveLength(2);
            expect(chat.messages[1]).toMatchObject({ kind: 'user', text: 'Evening.' });
            expect(chat.awaitingReply).toBe(true);

            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 40 });
            scriptBackground();
            const retried = await onceUnlocked(() => streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/retry`));
            expect(retried.events[retried.events.length - 1].event).toBe('done');
            const after = await getChat(storyId, chatId);
            expect(after.messages).toHaveLength(3);
            expect(after.awaitingReply).toBe(false);
        });

        it('while the send still waits on the last reply\'s background calls, stores no User Message', async () => {
            const { storyId, chatId } = await playableChat();
            // The last reply's judge is held, so the next send waits for it in its gate.
            let releaseJudge: () => void = () => {};
            const judgeHeld = new Promise<void>((resolve) => (releaseJudge = resolve));
            const original = t.gateway.completeText.bind(t.gateway);
            t.gateway.completeText = async (request) => {
                if (request.kind === 'judge') await judgeHeld;
                return original(request);
            };
            try {
                t.gateway.scriptText('turn', 'Waves boom below.');
                scriptBackground();
                await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/continue`);
                t.gateway.scriptText('turn', REPLY);

                const controller = new AbortController();
                const sent = fetch(`${origin}/api/stories/${storyId}/chats/${chatId}/messages`, {
                    method: 'POST',
                    headers: { Accept: 'text/event-stream', 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: 'Evening.' }),
                    signal: controller.signal,
                }).catch(() => undefined);
                await new Promise((resolve) => setTimeout(resolve, 200));
                controller.abort();
                await sent;
                // The judge settles after the Stop, inside the send's wait: the gate then passes.
                await new Promise((resolve) => setTimeout(resolve, 200));
                releaseJudge();
                await new Promise((resolve) => setTimeout(resolve, 600));

                const chat = await getChat(storyId, chatId);
                expect(chat.messages.map((message) => message.kind)).toEqual(['ai', 'ai']);
                expect(t.gateway.textCalls('turn')).toHaveLength(1);
            } finally {
                releaseJudge();
                t.gateway.completeText = original;
            }
        });

        it('on a Regenerate after a Continue, keeps the reply it had, judged again', async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', 'Waves boom below.');
            scriptBackground();
            const continued = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/continue`);
            const reply = (continued.events[continued.events.length - 1].data as Chat).messages[1];

            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 4, pieceDelayMs: 30 });
            scriptBackground();
            await onceUnlocked(() =>
                streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages/${reply.id}/regenerate`, undefined, (event, abort) => {
                    if (event.event === 'parts') abort();
                }),
            );
            await stoppedCall();

            const chat = await getChat(storyId, chatId);
            expect(chat.messages.map((message) => message.id)).toEqual([chat.messages[0].id, reply.id]);
            expect(JSON.stringify(chat.messages[1].parts)).toContain('Waves boom below.');
            expect(chat.awaitingReply).toBe(false);
        });
    });

    describe('a failure partway', () => {
        it('gives an error event with the typed error after some parts, and stores nothing', async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 4, failAfterPieces: 5 });

            const { status, events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: 'Evening.' });

            expect(status).toBe(201);
            expect(partsEvents(events).length).toBeGreaterThan(0);
            const last = events[events.length - 1];
            expect(last.event).toBe('error');
            expect(last.data).toEqual({ error: { code: '502.001.001', message: expect.any(String) } });
            const chat = await getChat(storyId, chatId);
            expect(chat.messages).toHaveLength(2);
            expect(chat.awaitingReply).toBe(true);
        });
    });

    describe('errors before the turn starts', () => {
        it('answer plain JSON with their status, before any stream', async () => {
            const { storyId, chatId } = await playableChat();

            const empty = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: '   ' });
            expect(empty).toMatchObject({ status: 422, contentType: expect.stringMatching(/^application\/json/), json: { error: { code: '422.004.005' } } });

            const noRetry = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/retry`);
            expect(noRetry).toMatchObject({ status: 409, json: { error: { code: '409.004.003' } } });

            t.gateway.setRemainingCredit({ text: { remainingUsd: 0, limitUsd: 22 } });
            const noCredit = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/continue`);
            expect(noCredit).toMatchObject({ status: 402, json: { error: { code: '402.001.003' } } });
            expect(t.gateway.textCalls('turn')).toHaveLength(0);
        });
    });

    describe('every turn streams', () => {
        it('Continue streams, and stores the last parts', async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 8 });
            scriptBackground();

            const { status, events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/continue`);

            expect(status).toBe(200);
            const parts = partsEvents(events);
            expect(parts.length).toBeGreaterThan(1);
            const done = events[events.length - 1];
            expect(done.event).toBe('done');
            expect((done.data as Chat).messages[1].parts).toEqual(parts[parts.length - 1]);
        });

        it('Regenerate streams, and done carries the rollback counts', async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', 'Waves boom below.');
            scriptBackground();
            const continued = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/continue`);
            const old = (continued.events[continued.events.length - 1].data as Chat).messages[1];

            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 8 });
            scriptBackground();
            const { status, events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages/${old.id}/regenerate`);

            expect(status).toBe(200);
            expect(partsEvents(events).length).toBeGreaterThan(1);
            const done = events[events.length - 1].data as Chat;
            expect(done.rolledBack).toEqual({ memoryChanges: 0, bondChanges: 0, arcSteps: 0, sceneAdvances: 0 });
            expect(done.messages).toHaveLength(2);
            // The same Message, its new reply the second Reply version.
            expect(done.messages[1]).toMatchObject({ id: old.id, versions: { current: 2, count: 2 } });
            expect(JSON.stringify(done.messages[1].parts)).toContain('Boots off');
        });

        it("a User Message edit streams its fresh reply; an AI Message edit, which runs no turn, answers JSON", async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', 'Waves boom below.');
            scriptBackground();
            const sent = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: 'Evening.' });
            const user = (sent.events[sent.events.length - 1].data as Chat).messages[1];

            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 8 });
            scriptBackground();
            const edited = await streamTurn('PATCH', `/api/stories/${storyId}/chats/${chatId}/messages/${user.id}`, { text: 'Good evening.' });

            expect(edited.status).toBe(200);
            expect(partsEvents(edited.events).length).toBeGreaterThan(1);
            const done = edited.events[edited.events.length - 1].data as Chat;
            expect(done.messages[1]).toMatchObject({ kind: 'user', text: 'Good evening.' });
            expect(done.rolledBack).toBeDefined();
            const reply = done.messages[2];

            scriptBackground();
            const aiEdit = await streamTurn('PATCH', `/api/stories/${storyId}/chats/${chatId}/messages/${reply.id}`, { text: 'The waves.' });
            expect(aiEdit).toMatchObject({ status: 200, contentType: expect.stringMatching(/^application\/json/) });
            expect(aiEdit.json.messages[2].parts).toEqual([{ kind: 'narration', text: 'The waves.' }]);
        });
    });

    describe('with the real gateway against a recorded OpenRouter stream', () => {
        let real: TestApp;
        let realOrigin: string;

        beforeAll(async () => {
            // Routed by URL: the send flow reads credit before the turn, and the stopped
            // stream's bill is read from the generation endpoint afterwards.
            const routed: FetchLike = async (url, init) => {
                const json = (body: unknown, status = 200) =>
                    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
                if (url.endsWith('/credits')) return json(fixture('openrouter/credits.json'));
                if (url.endsWith('/billing/balance')) return json(fixture('venice/balance.json'));
                if (url.includes('/generation?id=')) return json(fixture('openrouter/generation-stopped.json'));
                return new Response(eventStream(streamFixture('openrouter/stream-turn.sse'), 3, init.signal ?? undefined), {
                    status: 200,
                    headers: { 'content-type': 'text/event-stream' },
                });
            };
            real = await startTestApp({ modelGateway: 'real', fetch: routed, providerKeys: TEST_KEYS });
            const server = real.app.getHttpServer();
            await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
            realOrigin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        });

        afterAll(async () => {
            await real.close();
        });

        it('Stop keeps the User Message awaiting Retry and records what the stopped generation billed in Usage', async () => {
            const created = await real.http.post('/api/stories').send({ title: 'Real' }).expect(201);
            const storyId = created.body.id as number;
            await real.http.patch(`/api/stories/${storyId}`).send({ setting: 'An island.', opening: OPENING }).expect(200);
            await real.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The keeper.' }).expect(200);
            await real.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short sentences.' }).expect(201);
            const chatId = (await real.http.post(`/api/stories/${storyId}/chats`).expect(201)).body.id as number;

            const saved = origin;
            origin = realOrigin;
            try {
                const { events } = await streamTurn('POST', `/api/stories/${storyId}/chats/${chatId}/messages`, { text: 'Hello?' }, (event, abort) => {
                    if (event.event === 'parts') abort();
                });
                expect(partsEvents(events)[0]).toEqual([{ kind: 'narration', text: 'The keeper' }]);
            } finally {
                origin = saved;
            }

            const deadline = Date.now() + 5_000;
            let usage: any;
            do {
                await new Promise((resolve) => setTimeout(resolve, 20));
                usage = (await real.http.get('/api/usage').expect(200)).body;
            } while (usage.pools.text.calls === 0 && Date.now() < deadline);
            expect(usage.pools.text).toMatchObject({ calls: 1, spentUsd: 0.000187 });
            const chat = (await real.http.get(`/api/stories/${storyId}/chats/${chatId}`).expect(200)).body as Chat;
            expect(chat.messages).toHaveLength(2);
            expect(chat.awaitingReply).toBe(true);
        });
    });

    describe('without Accept: text/event-stream', () => {
        it('a turn answers JSON as before, through the unstreamed call', async () => {
            const { storyId, chatId } = await playableChat();
            t.gateway.scriptText('turn', REPLY);
            scriptBackground();

            const { body, headers } = await t.http.post(`/api/stories/${storyId}/chats/${chatId}/messages`).send({ text: 'Evening.' }).expect(201);

            expect(headers['content-type']).toMatch(/^application\/json/);
            expect((body as Chat).messages).toHaveLength(3);
            expect(t.gateway.calls.filter((call) => call.method === 'streamText')).toHaveLength(0);
        });
    });
});

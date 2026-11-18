import { randomUUID } from 'node:crypto';
import { AddressInfo } from 'node:net';

import { startTestApp, TestApp } from './harness/test-app.js';

/**
 * A reply survives the phone sleeping (.scratch/resume-reply/spec.md). A streamed turn is
 * written to the end whatever happens to its request; the client picks it up again by its
 * turn id with `GET …/turns/:turnId`, and stops it with `POST …/turns/:turnId/stop`.
 * Through the HTTP API with the fake gateway streaming a scripted reply in pieces.
 */

interface Part {
    kind: 'narration' | 'speech';
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

/** Slow enough that a test can drop the stream and pick it up while the reply is still written. */
const SLOW = { text: REPLY, pieceSize: 4, pieceDelayMs: 40 };

describe('Resuming a reply', () => {
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

    async function playableChat(): Promise<{ storyId: number; chatId: number; base: string }> {
        const created = await t.http.post('/api/stories').send({ title: 'The Lighthouse' }).expect(201);
        const storyId = created.body.id as number;
        await t.http.patch(`/api/stories/${storyId}`).send({ setting: 'A lighthouse, 1890s.', opening: OPENING }).expect(200);
        await t.http.patch(`/api/stories/${storyId}/role`).send({ name: 'Ash', description: 'The new keeper.' }).expect(200);
        await t.http.post(`/api/stories/${storyId}/characters`).send({ name: 'Mira', appearance: 'Tall.', personality: 'Dry.', voice: 'Short sentences.' }).expect(201);
        const chat = await t.http.post(`/api/stories/${storyId}/chats`).expect(201);
        const chatId = chat.body.id as number;
        return { storyId, chatId, base: `/api/stories/${storyId}/chats/${chatId}` };
    }

    async function getChat(base: string): Promise<Chat> {
        const { body } = await t.http.get(base).expect(200);
        return body as Chat;
    }

    function scriptBackground(): void {
        t.gateway.scriptText('judge', NO_CHANGE);
        t.gateway.scriptText('memory_extraction', NO_OPS);
    }

    /** Polls the stored Chat until `ready` holds. */
    async function chatWhen(base: string, ready: (chat: Chat) => boolean): Promise<Chat> {
        const deadline = Date.now() + 5_000;
        for (;;) {
            const chat = await getChat(base);
            if (ready(chat)) return chat;
            if (Date.now() > deadline) throw new Error(`The Chat never got there: ${JSON.stringify(chat.messages.map((m) => m.kind))}`);
            await new Promise((resolve) => setTimeout(resolve, 20));
        }
    }

    /**
     * Reads a streamed answer's events. `until` may end the reading early: the request is then
     * closed, as a phone that sleeps or loses its connection closes it.
     */
    async function read(
        method: string,
        path: string,
        { turnId, body, until }: { turnId?: string; body?: unknown; until?: (event: StreamEvent) => boolean } = {},
    ): Promise<{ status: number; contentType: string; events: StreamEvent[] }> {
        const controller = new AbortController();
        const response = await fetch(`${origin}${path}`, {
            method,
            headers: {
                Accept: 'text/event-stream',
                ...(turnId ? { 'X-Turn-Id': turnId } : {}),
                ...(body ? { 'Content-Type': 'application/json' } : {}),
            },
            body: body ? JSON.stringify(body) : undefined,
            signal: controller.signal,
        });
        const contentType = response.headers.get('content-type') ?? '';
        const events: StreamEvent[] = [];
        if (!response.body || !contentType.startsWith('text/event-stream')) {
            await response.arrayBuffer();
            return { status: response.status, contentType, events };
        }
        const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
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
                    if (until?.(event)) {
                        controller.abort();
                        return { status: response.status, contentType, events };
                    }
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

    const partsOf = (events: StreamEvent[]): Part[][] => events.filter((event) => event.event === 'parts').map((event) => event.data.parts as Part[]);
    const firstParts = (event: StreamEvent) => event.event === 'parts';

    it('a turn whose request closed mid-reply is still written, stored once, and its background calls run', async () => {
        const { base } = await playableChat();
        t.gateway.scriptText('turn', SLOW);
        scriptBackground();

        const dropped = await read('POST', `${base}/messages`, { turnId: randomUUID(), body: { text: 'Evening.' }, until: firstParts });
        expect(dropped.events.map((event) => event.event)).toEqual(['parts']);

        const chat = await chatWhen(base, (each) => each.messages[2]?.judge?.status === 'done' && each.messages[2]?.memory?.status === 'done');
        expect(chat.messages.map((message) => message.kind)).toEqual(['ai', 'user', 'ai']);
        expect(JSON.stringify(chat.messages[2].parts)).toContain('logbook');
        expect(chat.awaitingReply).toBe(false);
        expect(t.gateway.calls.filter((call) => call.method === 'streamText')).toEqual([expect.objectContaining({ stopped: false })]);
        expect(t.gateway.textCalls('judge')).toHaveLength(1);
        expect(t.gateway.textCalls('memory_extraction')).toHaveLength(1);
    });

    it('picked up while it is written: the reply so far at once, then the rest, then done with the stored reply', async () => {
        const { base } = await playableChat();
        t.gateway.scriptText('turn', SLOW);
        scriptBackground();
        const turnId = randomUUID();
        const dropped = await read('POST', `${base}/messages`, { turnId, body: { text: 'Evening.' }, until: firstParts });
        const shownBefore = partsOf(dropped.events)[0];

        const resumed = await read('GET', `${base}/turns/${turnId}`);

        expect(resumed.status).toBe(200);
        expect(resumed.contentType).toMatch(/^text\/event-stream/);
        const parts = partsOf(resumed.events);
        // The first event is the reply so far, at least what the dropped stream had shown.
        expect(resumed.events[0].event).toBe('parts');
        expect(JSON.stringify(parts[0]).length).toBeGreaterThanOrEqual(JSON.stringify(shownBefore).length);
        expect(parts.length).toBeGreaterThan(1);
        const done = resumed.events[resumed.events.length - 1];
        expect(done.event).toBe('done');
        const stored = (await getChat(base)).messages;
        expect(stored).toHaveLength(3);
        expect((done.data as Chat).messages[2].parts).toEqual(stored[2].parts);
        expect(parts[parts.length - 1]).toEqual(stored[2].parts);
        expect(t.gateway.textCalls('turn')).toHaveLength(1);
    });

    it('picked up after it ended: its last parts and done at once', async () => {
        const { base } = await playableChat();
        t.gateway.scriptText('turn', { text: REPLY, pieceSize: 8, pieceDelayMs: 10 });
        scriptBackground();
        const turnId = randomUUID();
        await read('POST', `${base}/messages`, { turnId, body: { text: 'Evening.' }, until: firstParts });
        const stored = await chatWhen(base, (chat) => chat.messages.length === 3);

        const resumed = await read('GET', `${base}/turns/${turnId}`);

        expect(resumed.events.map((event) => event.event)).toEqual(['parts', 'done']);
        expect(resumed.events[0].data.parts).toEqual(stored.messages[2].parts);
        expect((resumed.events[1].data as Chat).messages).toHaveLength(3);
    });

    it('picked up after it failed: the typed error, with the User Message awaiting Retry', async () => {
        const { base } = await playableChat();
        t.gateway.scriptText('turn', { text: REPLY, pieceSize: 4, pieceDelayMs: 20, failAfterPieces: 6 });
        const turnId = randomUUID();
        await read('POST', `${base}/messages`, { turnId, body: { text: 'Evening.' }, until: firstParts });
        await new Promise((resolve) => setTimeout(resolve, 300));

        const resumed = await read('GET', `${base}/turns/${turnId}`);

        const last = resumed.events[resumed.events.length - 1];
        expect(last).toEqual({ event: 'error', data: { error: { code: '502.001.001', message: expect.any(String) } } });
        const chat = await getChat(base);
        expect(chat.messages).toHaveLength(2);
        expect(chat.awaitingReply).toBe(true);
    });

    it('a turn the API does not know, or another Chat\'s, answers 204', async () => {
        const first = await playableChat();
        const second = await playableChat();
        t.gateway.scriptText('turn', { text: REPLY, pieceSize: 40 });
        scriptBackground();
        const turnId = randomUUID();
        await read('POST', `${first.base}/messages`, { turnId, body: { text: 'Evening.' } });

        expect((await read('GET', `${first.base}/turns/${randomUUID()}`)).status).toBe(204);
        expect((await read('GET', `${second.base}/turns/${turnId}`)).status).toBe(204);
        expect((await read('GET', `${first.base}/turns/${turnId}`)).status).toBe(200);
    });

    it('a turn request sent again with the same id writes no second reply: it follows the first', async () => {
        const { base } = await playableChat();
        t.gateway.scriptText('turn', SLOW);
        scriptBackground();
        const turnId = randomUUID();
        await read('POST', `${base}/messages`, { turnId, body: { text: 'Evening.' }, until: firstParts });

        const again = await read('POST', `${base}/messages`, { turnId, body: { text: 'Evening.' } });

        expect(again.status).toBe(201);
        expect(again.events[again.events.length - 1].event).toBe('done');
        const chat = await getChat(base);
        expect(chat.messages.map((message) => message.kind)).toEqual(['ai', 'user', 'ai']);
        expect(t.gateway.textCalls('turn')).toHaveLength(1);
    });

    describe('Stop', () => {
        it('stops a turn whose request already closed: nothing stored, Retry, and a resume hears it was stopped', async () => {
            const { base } = await playableChat();
            t.gateway.scriptText('turn', SLOW);
            const turnId = randomUUID();
            await read('POST', `${base}/messages`, { turnId, body: { text: 'Evening.' }, until: firstParts });

            const stop = await fetch(`${origin}${base}/turns/${turnId}/stop`, { method: 'POST' });

            // Answered once the turn has unwound: the Chat read next is settled and unlocked.
            expect(stop.status).toBe(204);
            const chat = await getChat(base);
            expect(chat.messages).toHaveLength(2);
            expect(chat.awaitingReply).toBe(true);
            expect(t.gateway.calls.filter((call) => call.method === 'streamText')).toEqual([expect.objectContaining({ stopped: true })]);
            const resumed = await read('GET', `${base}/turns/${turnId}`);
            expect(resumed.events[resumed.events.length - 1]).toEqual({ event: 'stopped', data: {} });

            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 40 });
            scriptBackground();
            const retried = await read('POST', `${base}/retry`, { turnId: randomUUID() });
            expect(retried.events[retried.events.length - 1].event).toBe('done');
        });

        it('after the turn ended changes nothing', async () => {
            const { base } = await playableChat();
            t.gateway.scriptText('turn', { text: REPLY, pieceSize: 40 });
            scriptBackground();
            const turnId = randomUUID();
            await read('POST', `${base}/messages`, { turnId, body: { text: 'Evening.' } });

            const stop = await fetch(`${origin}${base}/turns/${turnId}/stop`, { method: 'POST' });
            const unknown = await fetch(`${origin}${base}/turns/${randomUUID()}/stop`, { method: 'POST' });

            expect([stop.status, unknown.status]).toEqual([204, 204]);
            expect((await getChat(base)).messages).toHaveLength(3);
            expect((await read('GET', `${base}/turns/${turnId}`)).events.at(-1)?.event).toBe('done');
        });
    });
});

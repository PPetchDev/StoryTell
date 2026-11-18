import type { Request, Response } from 'express';

import { errorResponse } from '../../filter/app-error.filter.js';
import { TurnStream } from '../../manager/chat/turn/turn-stream.js';
import { MessagePartResponse, untaggedPartResponse } from '../../model/chat/entities/message-part.entity.js';
import { LiveTurn, LiveTurns, TurnEnd } from './live-turns.js';

/** The least time between two `parts` events; the last one before `done` is never held. */
const PARTS_INTERVAL_MS = 100;
/** A comment on an open stream this often, so the client can tell a quiet stream from a dead one. */
const PING_INTERVAL_MS = 15_000;

/** A turn request asking for server-sent events instead of the JSON answer. */
function wantsStream(request: Request): boolean {
    return (request.headers.accept ?? '').includes('text/event-stream');
}

/**
 * Answers a turn endpoint (spec: streaming replies, "The wire format"). Without
 * `Accept: text/event-stream` it answers JSON with `status`, exactly as before. With it, the
 * turn runs with a `TurnStream`, and once the turn starts the answer becomes server-sent
 * events: `parts` while the reply is written, then `done` with the JSON body, `error`, or
 * `stopped`. An error before the turn starts, or a turn that never starts (an AI Message edit),
 * still answers plain JSON.
 *
 * The turn is kept in `turns` under the client's `X-Turn-Id` (.scratch/resume-reply/spec.md):
 * its request closing does not stop it, so it is written, stored and followed by its background
 * calls whatever happens to the client, which can pick it up again with `followTurn`. Only a
 * Stop (`LiveTurns.stop`) aborts it. A request whose turn id is already known runs no turn:
 * it follows that one, so a re-sent request never writes a second reply.
 */
export async function answerTurn<T>(
    request: Request,
    response: Response,
    status: number,
    turns: LiveTurns,
    chatId: number,
    run: (stream?: TurnStream) => Promise<T>,
): Promise<void> {
    if (!wantsStream(request)) {
        response.status(status).json(await run());
        return;
    }

    const id = turns.idOf(request.headers['x-turn-id']);
    const known = turns.find(id, chatId);
    if (known) return followTurn(known, response, status);

    const turn = turns.start(id, chatId);
    const events = new EventWriter(response, status);
    const unlisten = turn.listen({ parts: (parts) => events.parts(parts) });
    try {
        const body = await run({
            signal: turn.stop.signal,
            onStart: () => events.open(),
            // Shaped as the stored parts are answered, so the last `parts` equals the stored Message.
            onParts: (parts) => turn.setParts(parts.map(untaggedPartResponse)),
        });
        turn.finish({ event: 'done', body });
        if (events.opened) events.end('done', body);
        else if (!gone(response)) response.status(status).json(body);
    } catch (error) {
        if (turn.stop.signal.aborted) {
            turn.finish({ event: 'stopped', body: {} });
            events.end('stopped', {});
            return;
        }
        const failure = errorResponse(error);
        turn.finish({ event: 'error', body: failure.body });
        // Before the stream begins, it answers as JSON with its status, as the filter would.
        if (events.opened) events.end('error', failure.body);
        else if (!gone(response)) response.status(failure.status).json(failure.body);
    } finally {
        unlisten();
        events.close();
    }
}

/**
 * Answers a known turn as server-sent events (.scratch/resume-reply/spec.md, "Resume"): its reply
 * so far at once, each new `parts`, then its end. An ended turn answers its last `parts` and its
 * end at once. The request closing only stops the following, never the turn.
 */
export function followTurn(turn: LiveTurn, response: Response, status = 200): Promise<void> {
    const events = new EventWriter(response, status);
    events.open();
    if (turn.parts) events.parts(turn.parts);
    if (turn.end) {
        events.end(turn.end.event, turn.end.body);
        return Promise.resolve();
    }
    return new Promise((resolve) => {
        const finish = () => {
            unlisten();
            events.close();
            response.off('close', finish);
            resolve();
        };
        const unlisten = turn.listen({
            parts: (parts) => events.parts(parts),
            end: (end: TurnEnd) => {
                events.end(end.event, end.body);
                finish();
            },
        });
        response.on('close', finish);
    });
}

/** The client closed the request, or its connection dropped. */
function gone(response: Response): boolean {
    return response.destroyed || response.writableEnded;
}

/** Writes the events of one streamed turn, sending `parts` at most every PARTS_INTERVAL_MS. */
class EventWriter {
    opened = false;
    private lastSentAt = 0;
    private lastSent = '';
    private pending: string | undefined;
    private timer: NodeJS.Timeout | undefined;
    private ping: NodeJS.Timeout | undefined;

    constructor(
        private readonly response: Response,
        private readonly status: number,
    ) {}

    open(): void {
        if (this.opened) return;
        this.opened = true;
        if (gone(this.response)) return;
        this.response.status(this.status);
        this.response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        // No proxy may hold the events back or compress them into one late chunk.
        this.response.setHeader('Cache-Control', 'no-cache, no-transform');
        this.response.setHeader('X-Accel-Buffering', 'no');
        this.response.flushHeaders();
        this.response.write(': stream\n\n');
        this.ping = setInterval(() => this.comment('ping'), PING_INTERVAL_MS);
        this.ping.unref();
    }

    parts(parts: MessagePartResponse[]): void {
        this.open();
        const data = JSON.stringify({ parts });
        if (data === this.lastSent) {
            this.pending = undefined;
            return;
        }
        this.pending = data;
        if (this.timer) return;
        const wait = this.lastSentAt + PARTS_INTERVAL_MS - Date.now();
        if (wait <= 0) this.flush();
        else this.timer = setTimeout(() => this.flush(), wait);
    }

    end(event: TurnEnd['event'], body: unknown): void {
        this.open();
        this.flush();
        this.write(event, JSON.stringify(body));
        this.close();
        if (!gone(this.response)) this.response.end();
    }

    /** Stops the timers; nothing more is written. */
    close(): void {
        this.clearTimer();
        clearInterval(this.ping);
        this.ping = undefined;
    }

    private clearTimer(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
    }

    private flush(): void {
        this.clearTimer();
        if (this.pending === undefined) return;
        this.write('parts', this.pending);
        this.lastSent = this.pending;
        this.lastSentAt = Date.now();
        this.pending = undefined;
    }

    private comment(text: string): void {
        if (gone(this.response)) return;
        this.response.write(`: ${text}\n\n`);
    }

    private write(event: string, data: string): void {
        if (gone(this.response)) return;
        this.response.write(`event: ${event}\ndata: ${data}\n\n`);
    }
}

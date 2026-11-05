import type { Request, Response } from 'express';

import { errorResponse } from '../../filter/app-error.filter.js';
import { TurnStream } from '../../manager/chat/turn/turn-stream.js';
import { ReplyPart } from '../../manager/chat/turn/reply-parser.js';

/** The least time between two `parts` events; the last one before `done` is never held. */
const PARTS_INTERVAL_MS = 100;

/** A turn request asking for server-sent events instead of the JSON answer. */
function wantsStream(request: Request): boolean {
    return (request.headers.accept ?? '').includes('text/event-stream');
}

/**
 * Answers a turn endpoint (spec: streaming replies, "The wire format"). Without
 * `Accept: text/event-stream` it answers JSON with `status`, exactly as before. With it, the
 * turn runs with a `TurnStream`, and once the turn starts the answer becomes server-sent
 * events: `parts` while the reply is written, then `done` with the JSON body, or `error`.
 * An error before the turn starts, or a turn that never starts (an AI Message edit), still
 * answers plain JSON. A request closed mid-turn aborts it, and nothing more is written.
 */
export async function answerTurn<T>(
    request: Request,
    response: Response,
    status: number,
    run: (stream?: TurnStream) => Promise<T>,
): Promise<void> {
    if (!wantsStream(request)) {
        response.status(status).json(await run());
        return;
    }

    const stop = new AbortController();
    const onClose = () => {
        if (!response.writableEnded) stop.abort();
    };
    response.on('close', onClose);
    const events = new EventWriter(response, status);
    try {
        const body = await run({
            signal: stop.signal,
            onStart: () => events.open(),
            onParts: (parts) => events.parts(parts),
        });
        if (stop.signal.aborted) return;
        if (events.opened) events.end('done', body);
        else response.status(status).json(body);
    } catch (error) {
        if (stop.signal.aborted) return;
        // Before the stream begins, the filter answers it as JSON with its status.
        if (!events.opened) throw error;
        events.end('error', errorResponse(error).body);
    } finally {
        events.cancel();
        response.off('close', onClose);
    }
}

/** Writes the events of one streamed turn, sending `parts` at most every PARTS_INTERVAL_MS. */
class EventWriter {
    opened = false;
    private lastSentAt = 0;
    private lastSent = '';
    private pending: string | undefined;
    private timer: NodeJS.Timeout | undefined;

    constructor(
        private readonly response: Response,
        private readonly status: number,
    ) {}

    open(): void {
        if (this.opened) return;
        this.opened = true;
        this.response.status(this.status);
        this.response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        // No proxy may hold the events back or compress them into one late chunk.
        this.response.setHeader('Cache-Control', 'no-cache, no-transform');
        this.response.setHeader('X-Accel-Buffering', 'no');
        this.response.flushHeaders();
        this.response.write(': stream\n\n');
    }

    parts(parts: ReplyPart[]): void {
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

    end(event: 'done' | 'error', body: unknown): void {
        this.flush();
        this.write(event, JSON.stringify(body));
        this.response.end();
    }

    cancel(): void {
        clearTimeout(this.timer);
        this.timer = undefined;
    }

    private flush(): void {
        this.cancel();
        if (this.pending === undefined) return;
        this.write('parts', this.pending);
        this.lastSent = this.pending;
        this.lastSentAt = Date.now();
        this.pending = undefined;
    }

    private write(event: string, data: string): void {
        if (this.response.writableEnded || this.response.destroyed) return;
        this.response.write(`event: ${event}\ndata: ${data}\n\n`);
    }
}

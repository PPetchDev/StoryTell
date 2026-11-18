import type { Response } from 'express';

import type { MessagePartResponse } from '../../model/chat/entities/message-part.entity.js';
import type { WatchRun, WatchView } from './watch-runs.js';

/** The least time between two `parts` events, as on a turn stream. */
const PARTS_INTERVAL_MS = 100;
/** A comment on the open stream this often, as on a turn stream. */
const PING_INTERVAL_MS = 15_000;

/**
 * Answers `GET …/watch` as server-sent events (.scratch/watch-mode/spec.md, "API"): `watch` with
 * the Watch now and on each change, `parts` with the reply so far while a step is written, and the
 * end once a `watch` event showed it ended; a step under way sends its reply so far at once. With no Watch, or an ended one, one `watch` event and
 * the end. Closing the request only stops the following, never the Watch.
 */
export function followWatch(run: WatchRun | undefined, response: Response, replySoFar?: MessagePartResponse[]): Promise<void> {
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Cache-Control', 'no-cache, no-transform');
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    const gone = () => response.destroyed || response.writableEnded;
    const write = (event: string, data: unknown) => {
        if (!gone()) response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    if (!gone()) response.write(': stream\n\n');

    const watchOf = (view: WatchView | null) => ({ watch: view });
    if (!run || run.ended) {
        write('watch', watchOf(run?.view() ?? null));
        response.end();
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        let pending: MessagePartResponse[] | undefined;
        let lastSentAt = 0;
        let timer: NodeJS.Timeout | undefined;
        const flush = () => {
            clearTimeout(timer);
            timer = undefined;
            if (!pending) return;
            write('parts', { parts: pending });
            pending = undefined;
            lastSentAt = Date.now();
        };
        const ping = setInterval(() => {
            if (!gone()) response.write(': ping\n\n');
        }, PING_INTERVAL_MS);
        ping.unref();

        const finish = () => {
            unlisten();
            clearTimeout(timer);
            clearInterval(ping);
            response.off('close', finish);
            if (!gone()) response.end();
            resolve();
        };
        const unlisten = run.listen({
            watch: (view) => {
                // The last of a step's reply goes before the Watch that counts it.
                flush();
                write('watch', watchOf(view));
                if (view.status === 'ended') finish();
            },
            parts: (parts) => {
                pending = parts;
                if (timer) return;
                const wait = lastSentAt + PARTS_INTERVAL_MS - Date.now();
                if (wait <= 0) flush();
                else timer = setTimeout(flush, wait);
            },
        });
        response.on('close', finish);
        write('watch', watchOf(run.view()));
        // A step under way: its reply so far at once, as a resumed turn answers.
        if (replySoFar) write('parts', { parts: replySoFar });
    });
}

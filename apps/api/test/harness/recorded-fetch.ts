import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FetchLike } from '../../src/service/model-gateway/real/http.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

/** A recorded, synthetic server-sent event stream from test/fixtures, split into its events. */
export function streamFixture(name: string): string[] {
    return readFileSync(path.join(FIXTURES, name), 'utf8')
        .split('\n\n')
        .filter((event) => event.trim() !== '')
        .map((event) => `${event}\n\n`);
}

/** A recorded, synthetic provider response from test/fixtures (never played text). */
export function fixture(name: string): unknown {
    return JSON.parse(readFileSync(path.join(FIXTURES, name), 'utf8'));
}

export interface RecordedResponse {
    status?: number;
    headers?: Record<string, string>;
    /** A JSON body, or a fixture file name under test/fixtures. */
    json?: unknown;
    fixture?: string;
    /** Raw bytes with their content type, as Venice's multi-edit answers. */
    bytes?: Buffer;
    contentType?: string;
    /**
     * A server-sent event stream: a fixture name under test/fixtures, each event sent as its
     * own chunk. With `hangAfter`, only that many events are sent, and the body then waits
     * until the request is aborted, failing as `fetch` does.
     */
    sse?: string;
    hangAfter?: number;
}

export interface RecordedRequest {
    url: string;
    method: string;
    headers: Record<string, string>;
    /** The parsed JSON body, when there was one. */
    body: any;
}

export type ResponseScript = RecordedResponse | ((request: RecordedRequest) => RecordedResponse);

/**
 * A `fetch` that answers from a script, in order, and records what it was asked. A call
 * past the end of the script fails the test.
 */
export function recordedFetch(script: ResponseScript[]) {
    const requests: RecordedRequest[] = [];
    const remaining = [...script];

    const fetchImpl: FetchLike = async (url, init) => {
        const request: RecordedRequest = {
            url,
            method: init.method ?? 'GET',
            headers: (init.headers ?? {}) as Record<string, string>,
            body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
        };
        requests.push(request);
        const next = remaining.shift();
        if (!next) throw new Error(`recordedFetch: no response scripted for ${request.method} ${url}`);
        return toResponse(typeof next === 'function' ? next(request) : next, init.signal ?? undefined);
    };

    return { fetch: fetchImpl, requests, pending: () => remaining.length };
}

function toResponse(recorded: RecordedResponse, signal?: AbortSignal): Response {
    const status = recorded.status ?? 200;
    if (recorded.sse) {
        return new Response(eventStream(streamFixture(recorded.sse), recorded.hangAfter, signal), {
            status,
            headers: { 'content-type': 'text/event-stream', ...recorded.headers },
        });
    }
    if (recorded.bytes) {
        return new Response(new Uint8Array(recorded.bytes), {
            status,
            headers: { 'content-type': recorded.contentType ?? 'image/jpeg', ...recorded.headers },
        });
    }
    const json = recorded.fixture ? fixture(recorded.fixture) : recorded.json;
    return new Response(JSON.stringify(json ?? {}), {
        status,
        headers: { 'content-type': 'application/json', ...recorded.headers },
    });
}

/** A fetch that fails as the network would, for the outage mapping. */
export const unreachableFetch: FetchLike = async () => {
    throw new TypeError('fetch failed');
};

/** A body that sends `events` one chunk each, or the first `hangAfter` and then waits for `signal`. */
export function eventStream(events: string[], hangAfter?: number, signal?: AbortSignal): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const sent = hangAfter === undefined ? events : events.slice(0, hangAfter);
    let next = 0;
    return new ReadableStream<Uint8Array>({
        pull(controller) {
            if (next < sent.length) {
                controller.enqueue(encoder.encode(sent[next++]));
                return;
            }
            if (hangAfter === undefined) {
                controller.close();
                return;
            }
            return new Promise<void>((resolve) => {
                const fail = () => {
                    controller.error(new DOMException('This operation was aborted', 'AbortError'));
                    resolve();
                };
                if (signal?.aborted) fail();
                else signal?.addEventListener('abort', fail, { once: true });
            });
        },
    });
}

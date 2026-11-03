import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FetchLike } from '../../src/service/model-gateway/real/http.js';

const FIXTURES = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../fixtures');

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
        return toResponse(typeof next === 'function' ? next(request) : next);
    };

    return { fetch: fetchImpl, requests, pending: () => remaining.length };
}

function toResponse(recorded: RecordedResponse): Response {
    const status = recorded.status ?? 200;
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

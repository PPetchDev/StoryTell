/** The API could not be reached at all: the PC is off, the API is down, or no network. */
export class ApiUnreachableError extends Error {
    constructor() {
        super("Can't reach the Storytell API.");
    }
}

/** The API answered with a typed error. Route on `code` (catalogue: docs/error-codes.md). */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        readonly code: string,
        message: string,
    ) {
        super(message);
    }
}

interface ErrorBody {
    error: { code: string; message: string };
}

function isErrorBody(body: unknown): body is ErrorBody {
    return (
        typeof body === 'object' &&
        body !== null &&
        'error' in body &&
        typeof (body as ErrorBody).error?.code === 'string'
    );
}

/** A browser sends at most 64 KB of keepalive bodies at once; a bigger write goes as a plain one. */
const KEEPALIVE_MAX = 60_000;

/**
 * A write made while the page is hidden (the tab switched away, the app closed: autosave sends
 * what is waiting then) is a keepalive request, so it still reaches the API after the page is
 * gone (audit H1).
 */
function keepaliveFor(init?: RequestInit): boolean {
    if (!init?.method || init.method === 'GET' || typeof document === 'undefined') return false;
    if (document.visibilityState !== 'hidden') return false;
    return init.body === undefined || init.body === null || (typeof init.body === 'string' && init.body.length < KEEPALIVE_MAX);
}

/**
 * Every request goes straight to the network: the app is online-only, with no cached data
 * and nothing queued (spec: "PWA"), but for the autosaved edits ConnectionBoundary holds through an outage.
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            ...init,
            keepalive: init?.keepalive || keepaliveFor(init),
            cache: 'no-store',
            headers: { Accept: 'application/json', ...init?.headers },
        });
    } catch {
        throw new ApiUnreachableError();
    }

    return readJsonAnswer<T>(response);
}

/** Sent on `window` when an API answer says the session ran out (.scratch/sign-in/spec.md: "Web"). */
export const SIGNED_OUT_EVENT = 'storytell:signed-out';
const SIGN_IN_REQUIRED = '401.010.001';

/** A typed API error, after telling the sign-in gate when it says the session is gone. */
function apiError(status: number, code: string, message: string): ApiError {
    if (code === SIGN_IN_REQUIRED && typeof window !== 'undefined') window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
    return new ApiError(status, code, message);
}

/** An API answer read as JSON: the body, or its typed error. */
async function readJsonAnswer<T>(response: Response): Promise<T> {
    if (response.status === 204) return undefined as T;
    const body: unknown = await response.json().catch(() => undefined);
    if (response.ok && body !== undefined) return body as T;
    if (isErrorBody(body)) {
        throw apiError(response.status, body.error.code, body.error.message);
    }
    // The API always answers in JSON, and its errors always carry a code. Anything else came
    // from the proxy in front of it, which means the API itself was not there.
    throw new ApiUnreachableError();
}

/** The user stopped a streamed request (its signal aborted). Not a failure to show. */
export class StreamStoppedError extends Error {
    constructor() {
        super('Stopped.');
    }
}

/** A stream broke off before its answer: the connection dropped, or the phone slept. */
export class StreamBrokenError extends Error {
    constructor() {
        super('The reply was cut off. Try again.');
    }
}

export interface StreamOptions {
    /** Aborting it stops the request: the call then rejects with StreamStoppedError. */
    signal: AbortSignal;
    /** Each event before the answer, in order. */
    onEvent(event: string, data: unknown): void;
}

/**
 * A JSON write that asks for server-sent events (spec: streaming replies, "The wire format").
 * Each event goes to `onEvent` until `done`, whose data is the answer, or `error`, whose data
 * is a typed error. An answer that is not a stream (an error before the stream began, a write
 * that runs no turn, or a proxy that buffered it) is read as `apiSend` reads it.
 */
export async function apiSendStream<T>(
    method: 'POST' | 'PATCH',
    path: string,
    body: object | undefined,
    { signal, onEvent }: StreamOptions,
): Promise<T> {
    const write = jsonWrite(method, body);
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            ...write,
            cache: 'no-store',
            signal,
            headers: { Accept: 'text/event-stream, application/json', ...write.headers },
        });
    } catch {
        if (signal.aborted) throw new StreamStoppedError();
        throw new ApiUnreachableError();
    }
    if (!(response.headers.get('content-type') ?? '').startsWith('text/event-stream') || !response.body) {
        return readJsonAnswer<T>(response);
    }

    try {
        for await (const { event, data } of serverSentEvents(response.body)) {
            if (event === 'done') return data as T;
            if (event === 'error') {
                if (!isErrorBody(data)) throw new StreamBrokenError();
                throw apiError(Number(data.error.code.slice(0, 3)), data.error.code, data.error.message);
            }
            onEvent(event, data);
        }
    } catch (caught) {
        if (signal.aborted) throw new StreamStoppedError();
        if (caught instanceof ApiError) throw caught;
        throw new StreamBrokenError();
    }
    if (signal.aborted) throw new StreamStoppedError();
    throw new StreamBrokenError();
}

/** The events of a server-sent event stream, their data parsed as JSON. Comments are skipped. */
async function* serverSentEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ event: string; data: unknown }> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
        for (;;) {
            const { value, done } = await reader.read();
            if (done) return;
            buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, '\n');
            let end: number;
            while ((end = buffer.indexOf('\n\n')) >= 0) {
                const block = buffer.slice(0, end);
                buffer = buffer.slice(end + 2);
                let event = 'message';
                const data: string[] = [];
                for (const line of block.split('\n')) {
                    if (line.startsWith('event:')) event = line.slice(6).trim();
                    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
                }
                if (data.length > 0) yield { event, data: JSON.parse(data.join('\n')) as unknown };
            }
        }
    } finally {
        await reader.cancel().catch(() => {});
    }
}

/**
 * A POST answered with audio (a voice sample, a Read aloud item): the audio as a Blob, or the
 * typed error the API answered with instead. Aborting `signal` rejects with an AbortError.
 */
export async function apiAudio(path: string, signal?: AbortSignal): Promise<Blob> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, { method: 'POST', cache: 'no-store', signal });
    } catch (error) {
        if (signal?.aborted) throw error;
        throw new ApiUnreachableError();
    }
    if (response.ok && (response.headers.get('content-type') ?? '').startsWith('audio/')) return response.blob();
    return readJsonAnswer<never>(response);
}

/** A JSON write. `body` is sent as the request body; a 204 answer resolves to `undefined`. */
export function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: object): Promise<T> {
    return apiFetch<T>(path, jsonWrite(method, body));
}

/** A write's method, and its body as JSON when it has one. */
function jsonWrite(method: string, body: object | undefined): RequestInit {
    return {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    };
}

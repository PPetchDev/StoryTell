import {
    ApiError,
    ApiUnreachableError,
    StreamBrokenError,
    StreamStoppedError,
    TurnLostError,
    apiError,
    isErrorBody,
    jsonWrite,
    readJsonAnswer,
    serverSentEvents,
} from './api';

/** An open stream with no byte for this long is taken as dead (the API pings every 15 s). */
const SILENT_MS = 40_000;
/** Attempts in a row that bring nothing before the turn is given up. */
const MAX_FAILURES = 5;
/** The wait after the first failed attempt; it doubles after each, up to MAX_BACKOFF_MS. */
const BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 8_000;

export interface ResumableTurnOptions {
    /** Aborting it is ■ Stop: the turn is stopped on the API, and the call rejects with StreamStoppedError. */
    signal: AbortSignal;
    /** Each event before the answer, in order: `parts` with the whole reply so far. */
    onEvent(event: string, data: unknown): void;
}

/** How one attempt at reading the turn ended, when it did not end the turn. */
type Broken = { kind: 'broken'; progressed: boolean; nudged: boolean };
type Lost = { kind: 'lost' };

/**
 * A turn write that asks for server-sent events (spec: streaming replies, "The wire format") and
 * survives the phone sleeping or the connection dropping (.scratch/resume-reply/spec.md).
 *
 * The turn gets an id, sent as `X-Turn-Id`. The API writes the turn to the end whatever happens
 * to the request, so when the stream breaks, when the page is visible again, when the browser
 * goes offline and online, or when an open stream falls silent, the turn is picked up again with
 * `GET <chat>/turns/<id>`: the reply so far, then the rest live, or the finished answer. Nothing
 * is ever written twice. ■ Stop stops it with `POST <chat>/turns/<id>/stop`.
 *
 * Answers with `done`'s data; rejects with the typed error of `error`, StreamStoppedError on a
 * Stop, TurnLostError when the API no longer knows the turn, and, after MAX_FAILURES attempts in
 * a row that bring nothing, StreamBrokenError (a stream had begun) or ApiUnreachableError (none
 * had). An answer that is not a stream (an error before the stream began, a write that runs no
 * turn, or a proxy that buffered it) is read as `apiSend` reads it.
 */
export async function resumableTurn<T>(
    method: 'POST' | 'PATCH',
    path: string,
    body: object | undefined,
    { signal, onEvent }: ResumableTurnOptions,
): Promise<T> {
    const turnId = newTurnId();
    const chatPath = /^\/stories\/\d+\/chats\/\d+/.exec(path)?.[0];
    let attempt: AbortController | null = null;
    /** Set when the page's own watchers dropped the attempt: no failure, and no wait before the next. */
    let nudged = false;
    const nudge = () => {
        if (!attempt || attempt.signal.aborted) return;
        nudged = true;
        attempt.abort();
    };
    let wasHidden = document.visibilityState === 'hidden';
    const onVisibility = () => {
        if (document.visibilityState === 'hidden') wasHidden = true;
        else if (wasHidden) {
            // The old connection may be dead without saying so: read the turn afresh.
            wasHidden = false;
            nudge();
        }
    };
    const onStop = () => attempt?.abort();
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('offline', nudge);
    window.addEventListener('online', nudge);
    signal.addEventListener('abort', onStop);

    /** Reads one attempt's stream to its end. */
    const read = async (response: Response, current: AbortController): Promise<T | Broken> => {
        let progressed = false;
        let silence: ReturnType<typeof setTimeout> | undefined;
        const alive = () => {
            clearTimeout(silence);
            silence = setTimeout(() => current.abort(), SILENT_MS);
        };
        alive();
        try {
            for await (const { event, data } of serverSentEvents(response.body!, alive)) {
                progressed = true;
                if (event === 'done') return data as T;
                if (event === 'stopped') throw new StreamStoppedError();
                if (event === 'error') {
                    if (!isErrorBody(data)) throw new StreamBrokenError();
                    throw apiError(Number(data.error.code.slice(0, 3)), data.error.code, data.error.message);
                }
                onEvent(event, data);
            }
        } catch (caught) {
            if (caught instanceof ApiError || caught instanceof StreamStoppedError || caught instanceof StreamBrokenError) throw caught;
            // A network error, or the attempt dropped: picked up again below.
        } finally {
            clearTimeout(silence);
        }
        return { kind: 'broken', progressed, nudged };
    };

    /** The turn request itself. */
    const ask = async (current: AbortController): Promise<T | Broken> => {
        const write = jsonWrite(method, body);
        let response: Response;
        try {
            response = await fetch(`/api${path}`, {
                ...write,
                cache: 'no-store',
                signal: current.signal,
                headers: { Accept: 'text/event-stream, application/json', 'X-Turn-Id': turnId, ...write.headers },
            });
        } catch {
            // It may have arrived: the next attempt asks the API.
            return { kind: 'broken', progressed: false, nudged };
        }
        if (!isEventStream(response)) return readJsonAnswer<T>(response);
        return read(response, current);
    };

    /** The turn picked up again by its id. */
    const resume = async (current: AbortController): Promise<T | Broken | Lost> => {
        let response: Response;
        try {
            response = await fetch(`/api${chatPath}/turns/${turnId}`, {
                cache: 'no-store',
                signal: current.signal,
                headers: { Accept: 'text/event-stream' },
            });
        } catch {
            return { kind: 'broken', progressed: false, nudged };
        }
        if (response.status === 204) return { kind: 'lost' };
        if (!isEventStream(response)) {
            // The proxy answered for an API that is restarting: try again in a moment.
            try {
                return await readJsonAnswer<T>(response);
            } catch (caught) {
                if (caught instanceof ApiUnreachableError) return { kind: 'broken', progressed: false, nudged: false };
                throw caught;
            }
        }
        return read(response, current);
    };

    let began = false;
    let failures = 0;
    try {
        for (let first = true; ; first = false) {
            if (signal.aborted) throw new StreamStoppedError();
            if (!first) {
                // A failed attempt waits, longer each time; then the page must be visible and online.
                if (failures > 0) await pause(Math.min(BACKOFF_MS * 2 ** (failures - 1), MAX_BACKOFF_MS), signal);
                await untilReachable(signal);
                if (signal.aborted) throw new StreamStoppedError();
            }
            const current = new AbortController();
            attempt = current;
            nudged = false;
            const outcome = first || !chatPath ? await ask(current) : await resume(current);
            attempt = null;
            if (signal.aborted) throw new StreamStoppedError();
            if (!isBroken(outcome) && !isLost(outcome)) return outcome;
            if (isLost(outcome)) throw new TurnLostError();
            if (outcome.progressed) began = true;
            if (outcome.progressed || outcome.nudged) failures = 0;
            else if (++failures >= MAX_FAILURES) throw began ? new StreamBrokenError() : new ApiUnreachableError();
        }
    } catch (caught) {
        if (signal.aborted || caught instanceof StreamStoppedError) {
            if (signal.aborted && chatPath) await stopOnApi(`${chatPath}/turns/${turnId}/stop`);
            throw new StreamStoppedError();
        }
        throw caught;
    } finally {
        attempt = null;
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('offline', nudge);
        window.removeEventListener('online', nudge);
        signal.removeEventListener('abort', onStop);
    }
}

function isBroken(outcome: unknown): outcome is Broken {
    return typeof outcome === 'object' && outcome !== null && (outcome as Broken).kind === 'broken';
}

function isLost(outcome: unknown): outcome is Lost {
    return typeof outcome === 'object' && outcome !== null && (outcome as Lost).kind === 'lost';
}

function isEventStream(response: Response): boolean {
    return (response.headers.get('content-type') ?? '').startsWith('text/event-stream') && response.body !== null;
}

/**
 * ■ Stop on the API, waited for so the Chat read next is settled. If it can't get through, the
 * reply may still be written; the next read of the Chat shows it.
 */
async function stopOnApi(path: string): Promise<void> {
    try {
        await fetch(`/api${path}`, { method: 'POST', cache: 'no-store' });
    } catch {
        // Offline: nothing more to do here.
    }
}

/** A turn id the API takes (letters, digits, `-`): one per turn, never reused. */
function newTurnId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

/** Waits `ms`, or less when `signal` aborts. */
function pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
        const done = () => {
            clearTimeout(timer);
            signal.removeEventListener('abort', done);
            resolve();
        };
        const timer = setTimeout(done, ms);
        signal.addEventListener('abort', done);
    });
}

/** Waits until the page is visible and the browser online, or `signal` aborts. */
function untilReachable(signal: AbortSignal): Promise<void> {
    const ready = () => document.visibilityState !== 'hidden' && navigator.onLine !== false;
    if (ready() || signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
        const check = () => {
            if (!ready() && !signal.aborted) return;
            document.removeEventListener('visibilitychange', check);
            window.removeEventListener('online', check);
            signal.removeEventListener('abort', check);
            resolve();
        };
        document.addEventListener('visibilitychange', check);
        window.addEventListener('online', check);
        signal.addEventListener('abort', check);
    });
}

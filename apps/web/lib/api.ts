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

/**
 * Every request goes straight to the network: the app is online-only, with no cached data
 * and nothing queued (spec: "PWA").
 */
export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
    let response: Response;
    try {
        response = await fetch(`/api${path}`, {
            ...init,
            cache: 'no-store',
            headers: { Accept: 'application/json', ...init?.headers },
        });
    } catch {
        throw new ApiUnreachableError();
    }

    if (response.status === 204) return undefined as T;
    const body: unknown = await response.json().catch(() => undefined);
    if (response.ok && body !== undefined) return body as T;
    if (isErrorBody(body)) {
        throw new ApiError(response.status, body.error.code, body.error.message);
    }
    // The API always answers in JSON, and its errors always carry a code. Anything else came
    // from the proxy in front of it, which means the API itself was not there.
    throw new ApiUnreachableError();
}

/** A JSON write. `body` is sent as the request body; a 204 answer resolves to `undefined`. */
export function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: object): Promise<T> {
    return apiFetch<T>(path, {
        method,
        headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

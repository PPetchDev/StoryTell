/**
 * The small slice of `fetch` the provider clients use. Injected so contract tests can replay
 * recorded responses, and so a test app can run the real gateway without a network.
 */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export type SleepFn = (ms: number) => Promise<void>;

export const defaultSleep: SleepFn = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Thrown when the network itself failed; the clients map it to an outage. */
export class NetworkError extends Error {}

export async function sendRequest(
    fetchImpl: FetchLike,
    url: string,
    init: RequestInit,
): Promise<Response> {
    try {
        return await fetchImpl(url, init);
    } catch (error) {
        throw new NetworkError(`Could not reach ${new URL(url).host}: ${(error as Error).message}`);
    }
}

export const MAX_RETRIES = 3;

/**
 * 429 and 503 are answered before any inference runs, so retrying can't bill twice. They are
 * retried on the same host only: switching host would be the silent fallback the spec
 * forbids.
 */
export function isRetryable(status: number): boolean {
    return status === 429 || status === 503;
}

/** Honours `Retry-After` (seconds, capped at 30 s), else backs off 1 s, 2 s, 4 s. */
export function retryDelayMs(attempt: number, retryAfterHeader: string | null): number {
    const retryAfter = Number(retryAfterHeader);
    if (retryAfterHeader && Number.isFinite(retryAfter) && retryAfter > 0) {
        return Math.min(retryAfter * 1000, 30_000);
    }
    return 1000 * 2 ** attempt;
}

export async function readJson(response: Response): Promise<Record<string, any> | undefined> {
    try {
        return (await response.json()) as Record<string, any>;
    } catch {
        return undefined;
    }
}

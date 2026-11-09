import { FetchLike } from '../model-gateway/real/http.js';

/** A scripted answer for one address. */
export interface FakePage {
    /** 200 by default. */
    status?: number;
    /** `text/html; charset=utf-8` by default. */
    contentType?: string;
    /** The body as text (UTF-8), or `bodyBase64` for other bytes. */
    body?: string;
    bodyBase64?: string;
    /** A redirect's target, sent as `Location`. */
    location?: string;
}

/**
 * The page fetcher the app uses with the fake model gateway (the e2e setup), so no e2e reaches
 * the network: it answers only the addresses scripted through the testing controls
 * (`POST /api/testing/fake-gateway/page`), and fails any other as an unreachable host would.
 */
export class FakePageFetcher {
    private readonly pages = new Map<string, FakePage>();
    readonly requested: string[] = [];

    script(url: string, page: FakePage): void {
        this.pages.set(new URL(url).href, page);
    }

    reset(): void {
        this.pages.clear();
        this.requested.length = 0;
    }

    readonly fetch: FetchLike = async (url) => {
        this.requested.push(url);
        const page = this.pages.get(url);
        if (!page) throw new TypeError('fetch failed');
        const body = page.bodyBase64 !== undefined ? Buffer.from(page.bodyBase64, 'base64') : (page.body ?? '');
        return new Response(new Uint8Array(Buffer.from(body)), {
            status: page.status ?? 200,
            headers: {
                'content-type': page.contentType ?? 'text/html; charset=utf-8',
                ...(page.location ? { location: page.location } : {}),
            },
        });
    };
}

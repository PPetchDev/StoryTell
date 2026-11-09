import { PageFetchError } from '../../errors/story.errors.js';
import { FetchLike } from '../../service/model-gateway/real/http.js';
import { htmlToText } from './html-to-text.js';
import { checkPageAddress } from './page-address.js';

/** Spec: "Fetching". */
export const PAGE_FETCH_TIMEOUT_MS = 15_000;
export const PAGE_MAX_BYTES = 2 * 1024 * 1024;
export const PAGE_MAX_REDIRECTS = 5;

/** A fetched page as the Add sheet takes it. */
export interface FetchedPage {
    title: string;
    text: string;
    /** The address the text came from, after any redirects. */
    url: string;
}

/** The types taken: a web page, or plain text. */
const TAKEN_TYPES = ['text/html', 'text/plain'];

/** The charset a `Content-Type` value names, if any. */
function charsetOf(contentType: string): string | undefined {
    return /;\s*charset\s*=\s*"?([^";\s]+)"?/i.exec(contentType)?.[1];
}

/** The charset a page's `<meta>` names in its first few kilobytes, read as Latin-1 so any byte reads. */
function metaCharset(bytes: Uint8Array): string | undefined {
    const head = new TextDecoder('latin1').decode(bytes.subarray(0, 4096));
    return (
        /<meta\b[^>]*\bcharset\s*=\s*["']?([^"'\s/>;]+)/i.exec(head)?.[1] ??
        undefined
    );
}

/** The body as text in the charset the header or a meta tag names (so Thai `windows-874` pages read), else UTF-8. */
function decodeBody(bytes: Uint8Array, contentType: string, html: boolean): string {
    const label = charsetOf(contentType) ?? (html ? metaCharset(bytes) : undefined) ?? 'utf-8';
    let decoder: TextDecoder;
    try {
        decoder = new TextDecoder(label.toLowerCase());
    } catch {
        decoder = new TextDecoder('utf-8');
    }
    return decoder.decode(bytes);
}

/** The body, refused past the cap, read no further than it. */
async function readCapped(response: Response): Promise<Uint8Array> {
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > PAGE_MAX_BYTES) {
        await response.body?.cancel().catch(() => {});
        throw new PageFetchError('The page is over 2 MB.');
    }
    if (!response.body) return new Uint8Array();
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > PAGE_MAX_BYTES) {
            await reader.cancel().catch(() => {});
            throw new PageFetchError('The page is over 2 MB.');
        }
        chunks.push(value);
    }
    const bytes = new Uint8Array(total);
    let at = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, at);
        at += chunk.byteLength;
    }
    return bytes;
}

/** Why a fetch itself failed, in words: a timeout, or no answer at all. */
function networkFailure(error: unknown, url: URL): PageFetchError {
    const name = (error as { name?: string })?.name;
    if (name === 'TimeoutError' || name === 'AbortError') {
        return new PageFetchError(`The page took longer than ${PAGE_FETCH_TIMEOUT_MS / 1000} seconds to answer.`);
    }
    return new PageFetchError(`Couldn't reach ${url.host}: the PC may be offline, or the address is wrong.`);
}

/**
 * Fetches a web page's text (.scratch/documents/spec.md: "Fetching") through the injected page
 * fetcher: 15 s, a 2 MB body, and redirects followed by hand, at most 5, each checked by the
 * address rule before it is fetched. Only `text/html` and `text/plain` are taken. Stores nothing
 * and spends nothing. Throws `InvalidPageAddressError` or `PageFetchError` saying which.
 */
export async function fetchPage(address: string, fetchImpl: FetchLike): Promise<FetchedPage> {
    let url = checkPageAddress(address);
    const signal = AbortSignal.timeout(PAGE_FETCH_TIMEOUT_MS);
    for (let redirects = 0; ; redirects++) {
        let response: Response;
        try {
            response = await fetchImpl(url.href, {
                method: 'GET',
                redirect: 'manual',
                signal,
                headers: { Accept: 'text/html, text/plain;q=0.9', 'User-Agent': 'Storytell AI (page fetch for a Document)' },
            });
        } catch (error) {
            throw networkFailure(error, url);
        }

        if (response.status >= 300 && response.status < 400 && response.headers.has('location')) {
            await response.body?.cancel().catch(() => {});
            if (redirects >= PAGE_MAX_REDIRECTS) throw new PageFetchError(`The page redirects more than ${PAGE_MAX_REDIRECTS} times.`);
            url = checkPageAddress(response.headers.get('location')!, url);
            continue;
        }
        if (response.status < 200 || response.status >= 300) {
            await response.body?.cancel().catch(() => {});
            throw new PageFetchError(`The page answered ${response.status}${response.statusText ? ` ${response.statusText}` : ''}.`);
        }

        const contentType = response.headers.get('content-type') ?? '';
        const type = contentType.split(';')[0].trim().toLowerCase();
        if (!TAKEN_TYPES.includes(type)) {
            await response.body?.cancel().catch(() => {});
            throw new PageFetchError(`That address is not a web page or plain text (it is ${type || 'of no stated type'}).`);
        }

        let bytes: Uint8Array;
        try {
            bytes = await readCapped(response);
        } catch (error) {
            if (error instanceof PageFetchError) throw error;
            throw networkFailure(error, url);
        }
        const html = type === 'text/html';
        const body = decodeBody(bytes, contentType, html);
        const page = html ? htmlToText(body) : { title: '', text: body.replace(/\r\n?/g, '\n').trim() };
        if (page.text === '') throw new PageFetchError('The page has no text to take.');
        return { title: page.title || titleFromUrl(url), text: page.text, url: url.href };
    }
}

/** A page with no title is named after the last part of its path, or its host. */
function titleFromUrl(url: URL): string {
    const last = url.pathname.split('/').filter(Boolean).at(-1);
    if (!last) return url.hostname;
    try {
        return decodeURIComponent(last).replace(/\.(html?|txt|md)$/i, '');
    } catch {
        return last;
    }
}

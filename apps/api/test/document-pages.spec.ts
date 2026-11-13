import { InvalidPageAddressError } from '../src/errors/story.errors.js';
import { decodeEntities, htmlToText, pageTitle } from '../src/manager/document/html-to-text.js';
import { checkPageAddress, guardedPageFetch, isThisPc } from '../src/manager/document/page-address.js';
import { FetchLike } from '../src/service/model-gateway/real/http.js';
import { startTestApp, TestApp } from './harness/test-app.js';

/** Thai text in windows-874 (TIS-620) bytes: each Thai character U+0E01–U+0E5B is one byte, 0xA1–0xFB. */
function windows874(text: string): Buffer {
    return Buffer.from([...text].map((char) => {
        const code = char.codePointAt(0)!;
        if (code < 0x80) return code;
        if (code >= 0x0e01 && code <= 0x0e5b) return code - 0x0e00 + 0xa0;
        throw new Error(`Not in windows-874: ${char}`);
    }));
}

const THAI = 'ประภาคารบนหน้าผาทางทิศเหนือ';

// Spec: Documents, "Files and web pages", "HTML to text".
describe('Web pages (pure)', () => {
    describe('HTML to text', () => {
        it('takes the <article>, else the <main>, else the <body>', () => {
            const page = (inner: string) => `<html><head><title>T</title></head><body><p>Body text.</p>${inner}</body></html>`;
            expect(htmlToText(page('<main><p>Main text.</p><article><p>Article text.</p></article></main>')).text).toBe('Article text.');
            expect(htmlToText(page('<main><p>Main text.</p></main>')).text).toBe('Main text.');
            expect(htmlToText(page('')).text).toBe('Body text.');
        });

        it('drops scripts, styles, menus, headers, footers, asides and forms with their content', () => {
            const { text } = htmlToText(`<body>
                <header><h1>Site banner</h1><nav><a href="/">Home</a></nav></header>
                <script>var x = "<p>not text</p>";</script><style>p { color: red }</style>
                <noscript>Turn on JavaScript</noscript><template><p>Hidden</p></template><svg><text>Logo</text></svg>
                <p>The lighthouse stands on Gull Point.</p>
                <aside>Related pages</aside><form><label>Search</label><input></form>
                <footer>© Example Wiki</footer>
            </body>`);
            expect(text).toBe('The lighthouse stands on Gull Point.');
        });

        it('makes blocks line breaks, headings keep a #, list items a -', () => {
            const { text } = htmlToText(`<article>
                <h1>Gull Point</h1><p>A cape in the north.</p>
                <h2>Keepers</h2>
                <ul><li>Oren, the first</li><li>Mara</li></ul>
                <div>One line</div><div>Another<br>broken line</div>
                <blockquote>A saying.</blockquote>
                <table><tr><td>Year</td><td>1902</td></tr><tr><td>Height</td><td>30 m</td></tr></table>
            </article>`);
            expect(text).toBe(
                ['# Gull Point', 'A cape in the north.', '## Keepers', '- Oren, the first\n- Mara', 'One line\nAnother\nbroken line', 'A saying.', 'Year 1902\nHeight 30 m'].join('\n\n'),
            );
        });

        it('decodes named and numeric entities and collapses whitespace', () => {
            expect(decodeEntities('Tom &amp; Jerry &lt;3 &quot;hi&quot; &#39;x&#39; &#x1F600; &mdash; &hellip; &unknown;')).toBe('Tom & Jerry <3 "hi" \'x\' 😀 — … &unknown;');
            expect(htmlToText('<p>  Fog&nbsp;&nbsp;lies   on\n\n  the <b>harbour</b>.  </p>').text).toBe('Fog lies on the harbour.');
        });

        it('takes the title trimmed of a trailing site name', () => {
            expect(pageTitle('<title>Gull Point - Harbour Wiki</title>')).toBe('Gull Point');
            expect(pageTitle('<title> Gull Point | Fandom </title>')).toBe('Gull Point');
            expect(pageTitle('<title>Tom &amp; Jerry</title>')).toBe('Tom & Jerry');
            expect(pageTitle('<title>Self-made keepers</title>')).toBe('Self-made keepers');
            expect(pageTitle('<p>no title</p>')).toBe('');
        });

        it('reads a Thai page', () => {
            const { title, text } = htmlToText(`<html><head><title>${THAI} - วิกิ</title></head><body><article><h2>ประวัติ</h2><p>${THAI}สร้างขึ้นนานมาแล้ว</p></article></body></html>`);
            expect(title).toBe(THAI);
            expect(text).toBe(`## ประวัติ\n\n${THAI}สร้างขึ้นนานมาแล้ว`);
        });
    });

    describe('the address rule', () => {
        it.each([
            ['ftp://example.org/page', 'not an http or https address'],
            ['file:///C:/notes.txt', 'not an http or https address'],
            ['javascript:alert(1)', 'not an http or https address'],
            ['https://user:secret@example.org/', 'carries a user name or password'],
            ['https://user@example.org/', 'carries a user name or password'],
            ['http://localhost:4001/api/stories', 'names this PC itself'],
            ['http://LOCALHOST./', 'names this PC itself'],
            ['http://api.localhost/', 'names this PC itself'],
            ['http://127.0.0.1/', 'names this PC itself'],
            ['http://127.45.6.7:8080/', 'names this PC itself'],
            ['http://127.1/', 'names this PC itself'],
            ['http://2130706433/', 'names this PC itself'],
            ['http://[::1]/', 'names this PC itself'],
            ['http://[0:0:0:0:0:0:0:1]/', 'names this PC itself'],
            ['http://[::ffff:127.0.0.1]/', 'names this PC itself'],
            ['http://[::ffff:7f00:1]/', 'names this PC itself'],
            // Members may fetch pages too (.scratch/accounts/spec.md), so nothing on the server's own networks.
            ['http://10.0.0.5/', 'names a private network address'],
            ['http://172.16.3.4/', 'names a private network address'],
            ['http://192.168.1.1/', 'names a private network address'],
            ['http://169.254.169.254/opc/v2/instance/', 'names a private network address'],
            ['http://0.0.0.0:4000/', 'names a private network address'],
            ['http://100.100.248.12:3001/', 'names a private network address'],
            ['http://[fd00::1]/', 'names a private network address'],
            ['http://[fe80::1]/', 'names a private network address'],
            ['http://[::]/', 'names a private network address'],
            ['http://[::ffff:10.0.0.1]/', 'names a private network address'],
            ['http://224.0.0.1/', 'names a private network address'],
            ['not a url', 'is not a web address'],
        ])('refuses %s', (address, reason) => {
            expect(() => checkPageAddress(address)).toThrow(InvalidPageAddressError);
            expect(() => checkPageAddress(address)).toThrow(reason);
        });

        it.each(['https://en.wikipedia.org/wiki/Lighthouse', 'http://example.org:8080/a?b=c#d', 'https://th.wikipedia.org/wiki/ประภาคาร', 'http://128.0.0.1/', 'http://[::ffff:8.8.8.8]/'])(
            'allows %s',
            (address) => {
                expect(checkPageAddress(address)).toBeInstanceOf(URL);
            },
        );

        it('refuses a name that resolves to a private address, on the real fetcher', async () => {
            let fetched = 0;
            const fetchImpl = async () => {
                fetched++;
                return new Response('ok');
            };
            const privateDns = guardedPageFetch(fetchImpl, async () => [{ address: '10.1.2.3', family: 4 }]);
            await expect(privateDns('http://intranet.example/', {})).rejects.toThrow('names a private network address');
            const metadata = guardedPageFetch(fetchImpl, async () => [{ address: '93.184.216.34', family: 4 }, { address: '169.254.169.254', family: 4 }]);
            await expect(metadata('http://sneaky.example/', {})).rejects.toThrow('names a private network address');
            expect(fetched).toBe(0);
            const publicDns = guardedPageFetch(fetchImpl, async () => [{ address: '93.184.216.34', family: 4 }]);
            await expect(publicDns('http://example.org/', {})).resolves.toBeInstanceOf(Response);
            expect(fetched).toBe(1);
        });

        it('checks a redirect resolved against the address before it', () => {
            expect(checkPageAddress('/next', new URL('https://example.org/a/b')).href).toBe('https://example.org/next');
            expect(() => checkPageAddress('http://localhost/admin', new URL('https://example.org/'))).toThrow('The page redirects to http://localhost/admin, which names this PC itself.');
            expect(isThisPc('example.localhost.org')).toBe(false);
        });
    });
});

/** A scripted page fetcher: answers per address, records each, never opens a socket. */
function scriptedPages(pages: Record<string, () => Response | Promise<Response>>) {
    const requested: Array<{ url: string; init: RequestInit }> = [];
    const fetch: FetchLike = async (url, init) => {
        requested.push({ url, init });
        const page = pages[url];
        if (!page) throw new TypeError('fetch failed');
        return page();
    };
    return { fetch, requested };
}

const html = (body: string, headers: Record<string, string> = {}) => () =>
    new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
const redirect = (location: string, status = 302) => () => new Response(null, { status, headers: { location } });

describe('Fetching a web page', () => {
    let t: TestApp;
    const pages: Record<string, () => Response | Promise<Response>> = {};
    const scripted = scriptedPages(pages);
    let storyId: number;

    beforeAll(async () => {
        t = await startTestApp({ pageFetch: scripted.fetch });
        storyId = (await t.http.post('/api/stories').send({ title: 'The Harbour' }).expect(201)).body.id;
    });

    afterEach(() => {
        t.gateway.reset();
        scripted.requested.length = 0;
        for (const key of Object.keys(pages)) delete pages[key];
    });

    afterAll(async () => {
        await t.close();
    });

    const fetchPage = (url: string) => t.http.post(`/api/stories/${storyId}/documents/fetch-page`).send({ url });

    it('answers the title, the text and the address, with no gateway call and nothing stored', async () => {
        pages['https://wiki.example/Gull_Point'] = html(
            '<html><head><title>Gull Point - Harbour Wiki</title></head><body><nav>Home</nav><article><h1>Gull Point</h1><p>A cape &amp; a light.</p></article></body></html>',
        );

        const { body } = await fetchPage('https://wiki.example/Gull_Point').expect(200);

        expect(body).toEqual({ title: 'Gull Point', text: '# Gull Point\n\nA cape & a light.', url: 'https://wiki.example/Gull_Point' });
        expect(t.gateway.calls).toEqual([]);
        expect(scripted.requested[0].init).toMatchObject({ method: 'GET', redirect: 'manual' });
        expect(scripted.requested[0].init.signal).toBeInstanceOf(AbortSignal);
        expect((await t.http.get(`/api/stories/${storyId}`).expect(200)).body.documents).toEqual([]);
    });

    it('decodes a windows-874 Thai page by its header, and by its meta tag', async () => {
        const body = windows874(`<html><head><title>${THAI}</title></head><body><p>${THAI}</p></body></html>`);
        pages['https://th.example/by-header'] = () => new Response(new Uint8Array(body), { headers: { 'content-type': 'text/html; charset=windows-874' } });
        const meta = windows874(`<html><head><meta http-equiv="Content-Type" content="text/html; charset=tis-620"><title>${THAI}</title></head><body><p>${THAI}</p></body></html>`);
        pages['https://th.example/by-meta'] = () => new Response(new Uint8Array(meta), { headers: { 'content-type': 'text/html' } });

        for (const url of ['https://th.example/by-header', 'https://th.example/by-meta']) {
            const { body: page } = await fetchPage(url).expect(200);
            expect(page).toMatchObject({ title: THAI, text: THAI });
        }
    });

    it('decodes a UTF-8 Thai page and takes plain text as it is', async () => {
        pages['https://th.example/utf8'] = html(`<meta charset="utf-8"><title>${THAI}</title><p>${THAI}</p>`, { 'content-type': 'text/html' });
        pages['https://notes.example/keepers.txt'] = () => new Response('Keepers:\r\n\r\nOren\r\n', { headers: { 'content-type': 'text/plain; charset=utf-8' } });

        expect((await fetchPage('https://th.example/utf8').expect(200)).body).toMatchObject({ title: THAI, text: THAI });
        expect((await fetchPage('https://notes.example/keepers.txt').expect(200)).body).toEqual({
            title: 'keepers',
            text: 'Keepers:\n\nOren',
            url: 'https://notes.example/keepers.txt',
        });
    });

    it('follows up to 5 redirects by hand, checking each, and answers the final address', async () => {
        pages['https://a.example/1'] = redirect('/2', 301);
        pages['https://a.example/2'] = redirect('https://b.example/3');
        pages['https://b.example/3'] = html('<title>Final</title><p>Arrived.</p>');

        const { body } = await fetchPage('https://a.example/1').expect(200);

        expect(body).toEqual({ title: 'Final', text: 'Arrived.', url: 'https://b.example/3' });
        expect(scripted.requested.map((request) => request.url)).toEqual(['https://a.example/1', 'https://a.example/2', 'https://b.example/3']);
    });

    describe('refusals, each saying which', () => {
        it.each([
            ['the scheme', 'ftp://example.org/page', 'is not an http or https address'],
            ['credentials', 'https://user:secret@example.org/', 'carries a user name or password'],
            ['loopback', 'http://127.0.0.1:4001/api/stories', 'names this PC itself'],
            ['localhost', 'http://localhost:4001/', 'names this PC itself'],
        ])('refuses %s up front, never reaching the fetcher', async (_, url, reason) => {
            const { body } = await fetchPage(url).expect(422);

            expect(body.error.code).toBe('422.003.019');
            expect(body.error.message).toContain(reason);
            expect(body.error.message).toContain('Paste');
            expect(scripted.requested).toEqual([]);
        });

        it('refuses a redirect onto loopback without fetching it', async () => {
            pages['https://evil.example/'] = redirect('http://[::1]:4001/api/stories');

            const { body } = await fetchPage('https://evil.example/').expect(422);

            expect(body.error.code).toBe('422.003.019');
            expect(body.error.message).toContain('redirects to http://[::1]:4001/api/stories, which names this PC itself');
            expect(scripted.requested.map((request) => request.url)).toEqual(['https://evil.example/']);
        });

        it('refuses more than 5 redirects', async () => {
            for (let n = 0; n < 7; n++) pages[`https://loop.example/${n}`] = redirect(`/${n + 1}`);

            const { body } = await fetchPage('https://loop.example/0').expect(502);

            expect(body.error.code).toBe('502.003.020');
            expect(body.error.message).toContain('redirects more than 5 times');
            expect(scripted.requested).toHaveLength(6);
        });

        it.each([
            ['a type other than HTML or plain text', () => new Response('%PDF', { headers: { 'content-type': 'application/pdf' } }), 'not a web page or plain text (it is application/pdf)'],
            ['a body over 2 MB', () => new Response(new Uint8Array(2 * 1024 * 1024 + 1).fill(97), { headers: { 'content-type': 'text/plain' } }), 'over 2 MB'],
            [
                'a declared length over 2 MB',
                () => new Response('small', { headers: { 'content-type': 'text/html', 'content-length': String(3 * 1024 * 1024) } }),
                'over 2 MB',
            ],
            ['a non-2xx answer', () => new Response('Not here', { status: 404, statusText: 'Not Found', headers: { 'content-type': 'text/html' } }), 'answered 404 Not Found'],
            ['a page with no text', html('<html><body><script>app()</script></body></html>'), 'no text to take'],
            [
                'a timeout',
                () => {
                    throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
                },
                'longer than 15 seconds',
            ],
            [
                'an unreachable host',
                () => {
                    throw new TypeError('fetch failed');
                },
                "Couldn't reach page.example",
            ],
        ])('refuses %s', async (_, answer, reason) => {
            pages['https://page.example/'] = answer;

            const { body } = await fetchPage('https://page.example/').expect(502);

            expect(body.error.code).toBe('502.003.020');
            expect(body.error.message).toContain(reason);
            expect(body.error.message).toContain("Paste the page's text instead.");
            expect(t.gateway.calls).toEqual([]);
        });
    });

    it('answers 404 for a Story that does not exist, without fetching', async () => {
        pages['https://wiki.example/x'] = html('<p>x</p>');
        await t.http.post('/api/stories/999999/documents/fetch-page').send({ url: 'https://wiki.example/x' }).expect(404);
        expect(scripted.requested).toEqual([]);
    });
});

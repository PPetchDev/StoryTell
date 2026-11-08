# 08 — A Document from a web page

**Status:** ready-for-agent

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "Files and web pages": the Add Document sheet gets an address field with "Fetch". The API fetches the page and answers its title and plain text; it stores nothing and spends nothing.
- `POST /api/stories/:storyId/documents/fetch-page` with `{ url }`.
- The page fetcher is injected, like the Model Gateway's `fetch`: a `PAGE_FETCH` provider (Node's `fetch` by default) that the API tests override with a scripted fake. With the fake model gateway, a fake page fetcher scripted through the testing controls (`POST /api/testing/fake-gateway/page`) answers instead, so neither tests nor e2e reach the network.
- The address rule refuses non-http(s) addresses, credentials and the PC itself (`localhost`, `*.localhost`, loopback addresses), and is applied again to every redirect, followed by hand, at most 5.
- A 15 s timeout and a 2 MB body cap; only `text/html` and `text/plain`; the charset from the header or a meta tag, so `windows-874` Thai pages read.
- HTML becomes plain text through a pure, dependency-free function, and the title loses a trailing " - Site name".
- The text and title fill the sheet; the author trims and taps Add, with the source `web` and the URL kept. The card shows the address as a link.

**Blocked by:** [02 — Add a pasted Document to a Story](02-add-pasted-documents.md)

- [ ] Pure tests for HTML to text: `<article>`, then `<main>`, then `<body>`; script, style, nav, header, footer, aside and form dropped; block breaks, headings as `#`, list items as `-`; named and numeric entities; the title trimmed; a Thai page.
- [ ] Pure tests for the address rule: schemes, credentials, `localhost`, `*.localhost`, `127.0.0.0/8`, `::1` and `::ffff:127.0.0.1` refused; ordinary addresses allowed.
- [ ] API tests through the scripted page fetcher (no socket, never the internet):
  - [ ] a page answers title, text and URL; `windows-874` and UTF-8 Thai decode;
  - [ ] each refusal maps to `InvalidPageAddressError` or `PageFetchError` with a message that says which: scheme, credentials, loopback, a redirect onto loopback, more than 5 redirects, wrong type, over 2 MB, non-2xx, timeout;
  - [ ] an address refused up front, and a redirect target refused, never reach the fetcher;
  - [ ] fetch-page makes no gateway call.
- [ ] The two new errors take the next free codes in domain 003 and are listed in `docs/error-codes.md`.
- [ ] The sheet: the address field with Fetch and a "Fetching…" state; errors shown in the sheet with the advice to paste the text instead.
- [ ] e2e at 390px: script a page through the testing controls, fetch it, see title and text filled, add it, and see its card link to the address.
- [ ] No new npm dependency, and the existing suites stay green.

# Spec: Documents

Status: ready-for-agent
Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).
Decision: [Attaching files and web pages for the AI to look things up](../sillytavern-gaps/issues/08-data-bank-rag.md) (option B, small form)
Builds on: [Spec: Lore](../lore/spec.md), [Spec: Storytell AI MVP](../storytell-mvp/spec.md) ("Model Gateway", "Prompt assembly")
Research: [Samplers, extra play models, and embeddings](../../docs/research/models-samplers-embeddings.md) §3, [Text LLMs for adult roleplay](../../docs/research/text-llm-for-adult-roleplay.md) (DeepInfra and OpenRouter terms)
ADR: [0001 Live Postgres is an installed service](../../docs/adr/0001-live-postgres-is-an-installed-service.md) (why an extension would need installing there), [0003 Backups are full copies](../../docs/adr/0003-backups-are-full-copies-encrypted-by-rclone-crypt.md)

## Problem Statement

Some Stories lean on a body of text the author already has: a wiki page about a setting, a chapter of a novel, pages of the author's own worldbuilding notes. Lore can't hold it. Each entry has to be written by hand as a short note with keywords, and a long text would mean dozens of entries that still miss whatever no keyword names. Pasting it into the Setting sends all of it on every turn, burying what matters under what doesn't and costing tokens each time. So the author either spends an evening turning a document into Lore, or the Narrator never learns what the document says.

## Solution

A Story can have **Documents**: longer texts the author pastes in, loads from a .txt or .md file on the phone, or takes from a web page whose address they give. On Add, the app splits the Document into passages of a few hundred words and works out each passage's meaning as a list of numbers, once. That is one small paid call, a fraction of a cent, made only because the author tapped Add.

On every turn of any of the Story's Chats, the latest exchange is turned into numbers the same way and compared with every passage. The few passages closest in meaning reach the Narrator, under a cap, right after the Lore. Suggested replies and Write for me reuse the passages the last turn found, with no call of their own. Like Lore, a Document is common knowledge in the world, shared by all the Story's Chats. The Memory drawer shows which passages the last turn used, next to the Lore in play. A Story without Documents plays exactly as before and makes no extra call.

## User Stories

1. As an author, I want to attach a Document to a Story, so that the Narrator can draw on a text too long to be Lore.
2. As an author, I want to paste text as a Document, so that I can bring in anything I can copy.
3. As an author, I want to load a .txt or .md file from my phone as a Document, so that I don't have to open and copy it first.
4. As an author, I want to give a web page's address and have the app fetch its text, so that I can use a wiki page about my setting.
5. As an author, I want to see and trim the text before I add it, so that menus, footers and junk from a web page don't become part of my world.
6. As an author, I want each Document to have a title, filled in from the file name or the page title, that I can change, so that I can tell my Documents apart.
7. As an author, I want to see roughly how many passages a Document will make and that adding it costs less than a cent, so that I know what I'm spending.
8. As an author, I want adding a Document to be the only thing that spends credit on it, on my tap, so that nothing is spent behind my back.
9. As an author, I want an Add that fails to leave nothing half-made, so that I can just try again.
10. As an author, I want a Document over the size limit refused with a plain message, so that I know to split or trim it.
11. As an author, I want a page that can't be fetched (offline, not found, not a web page, too large) explained plainly, so that I can paste the text instead.
12. As an author, I want to see a Story's Documents listed in the Story editor with title, source and size, so that I know what the Narrator can draw on.
13. As an author, I want to read a Document's text in the editor, so that I can check what was taken from a page.
14. As an author, I want to remove a Document, so that the Narrator stops using it.
15. As an author, I want a Document's text to stay as added, so that its passages always match what it says; to change it I remove it and add it again.
16. As an author, I want Duplicate Story to copy the Documents without paying to process them again, so that a copy is complete and free.
17. As an author, I want deleting a Story to delete its Documents, so that nothing is left over.
18. As an author, I want Documents to never block playing, so that a Story plays with or without them.
19. As a player, I want the Narrator to know what my Documents say about whatever is happening now, so that the story stays true to the source.
20. As a player, I want passages found by meaning, not by keywords, so that a moment that never names the thing still brings it up.
21. As a player, I want only passages that are truly close to the moment sent, so that unrelated text doesn't distract the Narrator.
22. As a player, I want Document passages capped at about 1,000 tokens a turn, so that the prompt never swells without bound.
23. As a player, I want a Story without Documents to make no extra call and send exactly the prompt it sent before, so that nothing costs more for Stories that don't use them.
24. As a player, I want the search on each turn to be logged as usage like every other call, so that the Usage page shows what it costs.
25. As a player, I want the turn to go ahead without Documents if the search fails at the embedding host, so that a hiccup there never stops play; and when the search is refused because my text credit has run out, I want the same out-of-credit message a turn gives, not a turn that pretends nothing happened.
26. As a player, I want Documents to be common knowledge in the world, so that every Character knows them as a local would.
27. As a player, I want Suggested replies and Write for me to know the same passages as the last turn, so that what is written for me fits the source, without another call.
28. As a player, I want to see in the Memory drawer which Documents and passages the last turn used, next to the Lore in play, so that I can tell retrieval works.
29. As a player, I want the drawer to tell me when the last turn's search failed, so that I know why a Document was not used.
30. As a player, I want a long Chat's Story so far to make room for Documents, so that a turn with passages never pushes Messages out without warning.
31. As a user, I want my Documents in the daily backup, so that they are safe like everything else.
32. As a Thai-speaking author, I want Documents in Thai to work as well as English ones, so that I can use Thai sources; until that is checked, I want to know it's untested.
33. As a user, I want my Document text sent only to the same trusted host as my story text, with no fallback, so that adult material doesn't reach a host that forbids or keeps it.

## Implementation Decisions

### The Model Gateway learns embeddings

- **Interface:** the gateway gains `embedTexts({ kind, inputs, servedFor })`, answering `{ vectors, model, usage: { promptTokens }, costUsd }`.
  - There is one vector per input, in order.
  - Callers never name the model.
  - Failures reject with the existing typed errors (outage, out of text credit, refusal).
- **Call kinds:** one new call-kind type for embeddings, as the sibling specs type theirs: `EmbeddingCallKind = 'document_embedding' | 'document_search'`, part of `CallKind` and not of `TextCallKind`, so `completeText` can't be asked for one and `embedTexts` takes only these.
  - `document_embedding`: passages on Add.
  - `document_search`: one query per turn.
  - Both are in the text pool. The Usage DTO's kind list and the web's call-kind labels gain them: "Document adding" and "Document search".
- **Model:** the app's name is `bge-m3`. It is OpenRouter's `baai/bge-m3`, sent with `provider: { only: ['deepinfra'], allow_fallbacks: false }` to `POST /embeddings` with `encoding_format: 'float'`.
  - It has 1,024 dimensions, 8k input, and a list price of $0.01 per million tokens.
  - It sits in the model table beside the text models.
  - DeepInfra is chosen for the same reason as chat: its terms carry no adult clause, and its privacy policy says it does not store or train on inference data.
- **Usage:** one UsageRecord per call, with the cost OpenRouter reports. If the response carries no cost, the list price times the prompt tokens is recorded, as image calls record list prices. Every embedding call is in the text pool and is gated by text credit, like a turn.
- **Fake gateway:** answers embeddings without scripting, deterministically. It hashes each input's words (Latin words, and Thai as character pairs) into a fixed-size unit vector under the model `fake/embedding-model`. Text that shares words then scores high, so tests can rely on what is retrieved. It records the calls, and can be scripted to fail with a gateway error for a kind.

### A Document and its passages

- **Ownership:** a Document belongs to the Story, shared by all its Chats, like Lore. No Chat's rewind or Reset touches it. Deleting the Story deletes its Documents (cascade).
- **`story_document` table:**

  | Column | Content |
  |---|---|
  | `story_id` | `ON DELETE CASCADE` |
  | `title` | text |
  | `source` | `pasted`, `file` or `web` |
  | `source_name` | the file name or the page URL; null for pasted |
  | `text` | the plain text as added |
  | `characters` | count of the text's characters |
  | `embedding_model` | the model every one of its passages was embedded with |
  | `position` | add order |
  | `created_at` | when it was added |

- **`document_passage` table:**

  | Column | Content |
  |---|---|
  | `document_id` | `ON DELETE CASCADE` |
  | `story_id` | so a turn reads one Story's passages without a join |
  | `position` | its place in the Document |
  | `text` | the passage |
  | `embedding` | a plain `real[]` of the model's dimensions, stored unit-length so cosine similarity is a dot product |

  No pgvector. It is a Postgres extension, and the live database is PostgreSQL from the EDB installer running as a Windows service (ADR 0001), so pgvector would have to be installed into that service on the PC, and into the embedded PostgreSQL that dev and the tests start, for one feature whose at most 1,000 vectors per Story don't need an index. A plain array and a dot product in the API are enough.
- **Limits:**
  - a Document's text is 1 to 200,000 characters after trimming;
  - a Story has at most 20 Documents and at most 1,000 passages in all;
  - an Add over any limit is refused before any call.
- **Splitting into passages** is a pure function:
  - Line endings are normalised and runs of blank lines collapsed.
  - Paragraphs are packed into passages of about 400 estimated tokens (the app's `estimateTokens`), at most 500.
  - A paragraph longer than the most is split at sentence ends (`.`, `!`, `?`, `…`, Thai's spaces between sentences), and failing those, at the most.
  - Each passage after the first opens with the last ~60 estimated tokens of the one before, taken as whole sentences where possible, so a fact split across a boundary is still found.
  - Markdown is kept as written.
- **Adding:**
  - `POST /api/stories/:storyId/documents` with `{ title, text, source, sourceName? }`.
  - The text is split, then embedded in batches of at most 32 passages, each batch one `document_embedding` call with `servedFor.storyId`.
  - Only once every batch has answered does one transaction store the Document and its passages, with the model the gateway named.
  - Any failure stores nothing. A batch that already answered stays logged, since it was billed. The gateway's typed error is answered as is.
  - The call is synchronous: a full-size Document is about 140 passages and 5 calls, a few seconds.
  - It answers the whole Story, like every editor write.
- **Other routes**, each answering the whole Story:
  - `PATCH /api/stories/:storyId/documents/:documentId` with `{ title }`; only the title can change.
  - `DELETE /api/stories/:storyId/documents/:documentId`.
  - `GET /api/stories/:storyId/documents/:documentId` answers `{ id, title, source, sourceName, text }`, for reading.
- **The Story response** gains `documents: [{ id, title, source, sourceName, characters, passages, createdAt }]` in add order, without text or vectors. The Story's full read loads Documents but never passages.
- **New errors.** Each takes the next free code in the Story authoring domain (003) at the time it lands, listed in `docs/error-codes.md`:
  - `DocumentNotFoundError` (404);
  - `EmptyDocumentError` (422, nothing but whitespace);
  - `DocumentTooLargeError` (413, over 200,000 characters);
  - `DocumentLimitError` (422, a 21st Document, or past 1,000 passages);
  - `InvalidPageAddressError` (422);
  - `PageFetchError` (502).
- **Duplicate Story** copies every Document with its passages and vectors, in the same transaction as the rest. It makes no call.
- **Backups:** nothing to do. A backup is a whole-database `pg_dump` (ADR 0003), so the two tables travel with it. A full-size Document adds about 0.6 MB of vectors to the dump.

### Files and web pages

- **A .txt or .md file is read in the browser.** The text fills the same text box as a paste; the title comes from the file name without its extension; the source is `file`. There is no upload route and no new dependency.
  - The browser refuses a file over 1 MB, or one that isn't .txt or .md, before reading it.
  - Text that doesn't decode as UTF-8 shows "Couldn't read this file as text".
- **A web page is fetched by the API**, with no storage and no paid call: `POST /api/stories/:storyId/documents/fetch-page` with `{ url }` answers `{ title, text, url }`.
  - **Refused as `InvalidPageAddressError`:** an address that isn't `http:` or `https:`, carries credentials, or names the PC itself (`localhost`, a name ending in `.localhost`, or a loopback address: `127.0.0.0/8`, `::1`, and `::ffff:127.x.x.x`).
  - **The page fetcher is injected**, as the Model Gateway's `fetch` is (`GATEWAY_FETCH`, a `FetchLike` provider the test app overrides): a new `PAGE_FETCH` provider of the same `FetchLike` shape, Node's built-in `fetch` by default.
    - The API tests override it with a scripted fake, so no test opens a socket, and loopback can stay refused with no test-only exception.
    - With the fake model gateway (the e2e setup), the module provides a fake page fetcher instead, scripted through the existing testing controls (`POST /api/testing/fake-gateway/page` with an address and the answer to give), so no e2e reaches the network either.
  - **Fetching:**
    - through the page fetcher, with a 15 s timeout, a 2 MB cap on the body, and redirects followed by hand (`redirect: 'manual'`), at most 5: each `Location` is resolved against the address before it and checked by the same address rule before it is fetched, so a page can't redirect the API onto the PC itself;
    - only `text/html` and `text/plain` are taken;
    - the charset comes from the header or a meta tag through `TextDecoder`, so Thai pages in `windows-874` read too.
  - **HTML to text** is a pure function, with no new dependency:
    1. Take `<article>`, else `<main>`, else `<body>`.
    2. Drop `script`, `style`, `noscript`, `template`, `svg`, `nav`, `header`, `footer`, `aside` and `form`.
    3. Block elements (`p`, `div`, `li`, `h1`–`h6`, `br`, `tr`, `blockquote`, `section`) become line breaks; headings and list items keep a leading `#` or `-`.
    4. Remaining tags are stripped, named and numeric entities decoded, and whitespace collapsed.
    5. The title is the page's `<title>`, trimmed of a trailing " - Site name".
  - Any network failure, non-2xx answer, wrong type, oversize body or empty result is a `PageFetchError` whose message says which, and suggests pasting the text instead.
  - The fetched text fills the text box. The author reads, trims and taps Add, and only that spends credit (as `source: web`, `sourceName` the URL).

### Each turn: the search

- **When it runs:** in the Chat manager's turn writing, before the turn prompt is built: every send, Retry, Continue, Regenerate and User Message edit.
  - It runs only when the Story has at least one passage. A Story with none makes no call, and its prompts are byte-for-byte what they are today.
  - This one tiny `document_search` call per turn (about 500 tokens, about $0.000005) is part of the turn the user asked for. That is the decision's "each turn the passages closest to the latest exchange reach the Narrator". It is logged as its own UsageRecord with `servedFor` Story and Chat, and is never made outside a turn.
- **The query:** the Lore scan window, the user's new message (none on a Continue) and the 4 newest Messages before it, AI Messages as their `@Name:` text, newest first. It is joined with blank lines and cut to about 1,500 estimated tokens from the newest end.
- **The vectors:**
  - A Story's passage vectors are read from the database once and kept in memory, keyed by Story, until a Document of that Story is added or removed, or the Story is deleted. That is at most 1,000 × 1,024 floats, about 4 MB, for one user.
  - Passages whose Document's `embedding_model` differs from the model that answered the query are skipped and logged. Re-embedding is out of scope.
- **Selection** is a pure function over plain inputs, like `selectLore`:
  1. Score every passage by cosine similarity with the query.
  2. Drop those under the floor (`DOCUMENT_MIN_SIMILARITY`, 0.45 to start, tunable, see Further Notes).
  3. Take the highest first, at most 4 passages, while they fit under `DOCUMENT_CAP_TOKENS` (1,000 estimated tokens). One that doesn't fit is skipped while the rest are still tried.
- **Scores in the log:** each search logs one line at the Nest logger's debug level: the Story and Chat ids, the floor, and the 5 highest scores, each with its Document title and passage position, marked when it was sent. No passage or query text goes in the log. This is how the floor is tuned (ticket 09), and it costs nothing.
- **The prompt block:**
  - It goes in the trailing system message, after the Lore block, in the one order every spec shares (integration: "The trailing system message of a turn"): **Lore → Documents → Author's note → Where things stand → Nudge → the final instruction.** The Author's note and the Nudge come from other specs; whichever lands second keeps this order and tests it.
  - Its heading reads: "# From the Story's Documents (passages that bear on this moment: common knowledge of this world, so every Character knows them as anyone living there would; use what fits, never quote them as documents)".
  - Each passage follows as `## <Document title>` and its text, in score order.
  - With nothing selected, there is no block.
  - The system message, and with it the cached prefix, is the same with and without Documents.
- **Budget:** every place the integration names reserves the block. It counts towards the turn budget. The Story so far trigger reserves the Documents cap (plus its heading) when the Story has any passage, beside the Lore reserve, so a turn with passages never pushes Messages out without warning. The prompt layers gain the Story's passage count, or a "has Documents" flag, for this. Suggested replies and Write for me subtract their whole final message, Documents block included, from the token budget before choosing how much history to keep (Suggested replies already subtract their instruction with the Lore in it today), so the block never pushes their prompt over the budget.
- **A failed search:**
  - **A refusal, outage or unreadable answer from the embedding host:** the turn goes ahead without Documents, logs a warning and records the failure.
  - **Out of text credit:** the turn fails with the gateway's `OutOfCreditError('text')`, exactly as if the turn's own call had been refused, with nothing stored. The turn's gate refuses only when the remaining credit is known and at or below zero, so a balance that is unknown, or too small for the call, still reaches the search; and OpenRouter's 402 (balance, key limit or the per-request reservation) becomes `OutOfCreditError('text')`. Failing is chosen over playing on because the search and the turn draw on the same OpenRouter key and balance: a balance that can't cover a $0.000005 search can't cover the turn's call either, so playing on would make a call that is refused anyway and leave the drawer saying the search failed when the real cause is credit. The user gets the out-of-credit message a turn already gives.
- **What a turn used:** the AI Message it writes records `documentPassages`, a jsonb of `{ status: 'found' | 'failed', passageIds: number[] }`, or null when the Story had no Documents.
  - Regenerate and a User Message edit overwrite it with their own search.
  - Choosing an older Reply version keeps the newest search's record. A known small inaccuracy, accepted.
  - Reset deletes the Messages, and the records with them.
  - A Branch copies each Message with its record (integration: "Build order rule"). Branch lands first; the ticket that adds the column extends Branch's copy to carry it, with a test.
- **Suggested replies and Write for me:** they reuse the passages the newest AI Message recorded (still existing ones only), as the same block, after the Lore block and before the Author's note and their own instruction (integration: Lore → Documents → Author's note → their own instruction). No search call. Write for me does not exist yet ([Spec: Write for me](../write-for-me/spec.md)); whichever of the two lands second adds the block to Write for me, with a test (integration: "Write for me's inputs").
- **Out of the first version:** the Story assistant, Story drafting, the Judge, Memory extraction, Snapshots and the Story so far don't read Documents.

### Documents in play

- `GET /api/stories/:storyId/chats/:chatId/documents` answers `{ hasDocuments, status: 'none' | 'found' | 'failed', passages: [{ documentId, documentTitle, position, excerpt }] }`.
  - The passages are those the newest AI Message recorded that still exist, in the order sent.
  - `excerpt` is the passage's first ~160 characters.
  - `status` is `none` when no turn has searched yet.
  - It makes no model call.
- **Memory drawer:** a "Documents in play" card under "Lore in play", shown only when `hasDocuments`. It lists each passage as its Document's title and excerpt, re-read when the Chat changes, as the Lore card is. It shows "None close enough to the last turn" for an empty `found`, and "The last turn's search failed, so it used no Documents" for `failed`.

### Story editor

- The **Lore** tab gains a **Documents** section below the Lore entries, headed with one line: "Longer texts the Narrator looks things up in by meaning. Adding one costs less than a cent."
  - Each Document shows as a card with its title (editable, autosaved), its source (Pasted, file name, or the page's address as a link), its size (characters and passages), "Read" (opens its text read-only in a sheet) and "Remove". Remove asks for a confirmation, since adding the Document again costs a call.
  - "+ Add Document" opens a sheet with three ways in: a text box to paste into, "Load a .txt or .md file", and an address field with "Fetch".
  - Below the sheet's editable title and text sits a live estimate: "About N passages · less than $0.01".
  - "Add" sends the Document. While it works, the sheet shows "Adding…" and its buttons are disabled.
  - On an error, the sheet keeps the text and shows the message.
- **Usage page:** a non-zero amount under one cent shows as "<$0.01" instead of "$0.00", so Document search spend is visible as more than nothing.

## Testing Decisions

- Test only external behaviour: what the gateway receives and records, the API's answers, the prompt a turn sends, and what the editor and Memory drawer show. No test reaches a paid API or the open internet.
- **Contract tests** through the real gateway on a scripted `fetch` (prior art: the OpenRouter contract tests, with a new synthetic embeddings fixture):
  - the embeddings body: model `baai/bge-m3`, the inputs, `encoding_format`, pinned to DeepInfra without fallbacks;
  - vectors back in input order;
  - one UsageRecord per call under its kind, with the reported cost, or the list-price fallback when none;
  - error mapping as for chat.
- **Pure tests:**
  - **splitting:** size bounds, sentence and hard splits, the overlap, Thai text;
  - **HTML to text:** article preference, dropped elements, block breaks, entities, title trimming;
  - **selection:** the similarity floor, highest first, the 4-passage and token caps with skip-and-try-the-rest, and skipping another model's passages;
  - **the turn prompt:** the block's place after Lore and before "Where things stand" (and before the Author's note once it exists), the unchanged system message, and no block when nothing is selected;
  - **the Suggested replies prompt:** the block after Lore and before the instruction, and its tokens taken from the history budget (a long history keeps fewer Messages with the block than without);
  - **the Story so far reserve:** with and without Documents.
- **API tests** through the fake gateway (prior art: the Lore API tests, the Duplicate Story tests, and the Story so far and Suggested replies tests):
  - adding a Document stores its passages and answers the Story, with `documents` in it;
  - the limits and empty text are refused before any call;
  - a failing embedding batch stores nothing;
  - rename, read and remove work;
  - a turn whose message shares words with a passage carries it in the trailing system message, and an unrelated passage is absent;
  - a Story without Documents makes no `document_search` call and sends the same prompt as before;
  - a search failing at the host (outage, refusal) still plays the turn and Documents in play says `failed`;
  - a search refused for text credit fails the turn with `OutOfCreditError('text')`, stores no Message, makes no turn call, and the next send after credit returns plays normally;
  - each search logs its top scores at debug level, without passage text;
  - Suggested replies carry the last turn's passages with no search call;
  - a Branch carries each copied Message's record;
  - Duplicate copies Documents and passages with no call, and deleting the Story removes them;
  - fetch-page through a scripted page fetcher (never a socket): a page becomes title and text; each refusal (scheme, credentials, loopback, a redirect onto loopback, more than 5 redirects, wrong type, oversize, non-2xx, timeout) maps to its error; an address refused up front never reaches the fetcher.
- **e2e (Playwright, 390px with touch, prior art: the Lore e2e):**
  - paste a Document in the Lore tab's Documents section and add it; it lists with its passage count and survives a reload;
  - load a .txt file through the file picker;
  - fetch a page scripted through the testing controls' fake page fetcher, and add it;
  - after a turn that mentions its subject, the Memory drawer's Documents in play lists it;
  - remove it with confirmation.
- **Schema:** the schema test that checks migrations against the entities covers the two new tables and the Message column.

## Out of Scope

- pgvector or any vector index, and any embedding provider other than `bge-m3` on DeepInfra.
- Re-embedding Documents when the embedding model changes (passages of another model are skipped and logged), and a "re-embed" button.
- Editing a Document's text in place, Documents per Chat or app-wide, and PDF, Word, EPUB or YouTube sources.
- Retrieving from Chat history or Memories by meaning.
- Documents for the Story assistant, Story drafting, the Judge, Memory extraction, Snapshots and the Story so far. The assistant does not even list them.
- Turning a Document into Lore entries.
- A per-Document on/off switch, and per-Document caps.
- JavaScript-rendered pages, and pages behind a login: the author pastes those.

## Further Notes

- **Open risk, Thai retrieval:** whether `bge-m3` finds the right Thai passages, and whether 0.45 is a good floor for either language, is unverified. Ticket 09 checks it on real text with real calls, a fraction of a cent, run by the user, reading the scores from the debug log. The fallback the research names is `qwen/qwen3-embedding-8b` on DeepInfra at the same price. Switching means changing the model table entry and re-adding Documents, since stored passages carry their model.
- **Thai and the token estimate:** `estimateTokens` counts four characters per token, which undercounts Thai. A Thai passage of "400 tokens" may be well over 400 real tokens: still far under `bge-m3`'s 8k input, but the 1,000-token Documents cap may hold up to about twice that for Thai. Accepted for this version.
- **Latency:** the search adds one short call, a few hundred milliseconds, before a turn's stream starts, and only on Stories with Documents.
- Open question: should Documents be a tab of their own in the Story editor? Recommended: no, a section of the Lore tab. Both are what the world knows, and the phone's tab row is already seven wide.
- Open question: should Documents in play run a fresh search, as Lore in play reruns its match? Recommended: no. Show what the last turn used, so opening the drawer never spends.
- Open question: should a failed search fail the turn instead? Recommended: no, for failures at the embedding host. Documents add to a turn and never gate it; the drawer says when it failed. Out of text credit is the one exception (see "A failed search"), because there the turn's own call would fail too.
- Branch ([Spec: Branch](../branch/spec.md)) copies Messages; ticket 04 here makes that copy carry `documentPassages`, so a Branch's drawer shows what its last turn used.
- Glossary: the term **Document** is already in `CONTEXT.md`, and its **Duplicate** entry already lists Documents. "Passage" is used as plain English for a piece of a Document. If it should become a defined term, it belongs under Document.

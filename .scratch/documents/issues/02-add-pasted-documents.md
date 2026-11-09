# 02 — Add a pasted Document to a Story

**Status:** done

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "A Document and its passages" and "Story editor": the author pastes text into the Lore tab's new Documents section and taps Add.
- The API splits it into passages, embeds them in batches (spending a fraction of a cent, logged as `document_embedding`), and only then stores the Document and its passages in one transaction.
- The Documents section lists each Document as a card with its title, source and size (characters and passages).
- Renaming, reading, removing and Duplicate come in ticket 03.

Covers:
- the `story_document` and `document_passage` tables and migration (`real[]` vectors, no pgvector);
- the pure splitter;
- `POST /api/stories/:storyId/documents` (taking `source` and `sourceName`, so tickets 07 and 08 add no route), and `documents` on the Story response;
- the limits and `EmptyDocumentError`, `DocumentTooLargeError`, `DocumentLimitError`.

**Blocked by:** [01 — Embeddings in the Model Gateway](01-gateway-embeddings.md)

- [x] Pure tests for the splitter:
  - [x] about 400 and at most 500 estimated tokens per passage;
  - [x] paragraph packing, then sentence splits, then hard splits;
  - [x] the ~60-token overlap;
  - [x] Thai text.
- [x] API tests through the fake gateway:
  - [x] Add stores the passages, records the gateway's model, and answers the Story with `documents` (no text, no vectors);
  - [x] empty text, over 200,000 characters, a 21st Document and past 1,000 passages are refused before any call;
  - [x] a batch that fails stores nothing.
- [x] The new errors take the next free codes in domain 003 and are listed in `docs/error-codes.md`.
- [x] The Lore tab's Documents section: the explanation line; the "+ Add Document" sheet with title, text, the live "About N passages · less than $0.01" estimate, and Add with "Adding…" and disabled buttons; errors shown in the sheet with the text kept; a card per Document with title, "Pasted" and its size.
- [x] e2e at 390px: paste and add a Document, see its passage count, reload and still see it.
- [x] The schema test passes with the new tables, and the existing suites stay green.

# 04 — Documents reach the Narrator

**Status:** done

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "Each turn: the search": on every turn of a Story that has Documents, the latest exchange is embedded in one `document_search` call. The closest passages above the similarity floor, at most 4 under about 1,000 tokens, go into the trailing system message after the Lore block, in the shared order Lore → Documents → Author's note → Where things stand → Nudge → the final instruction.
- A Story without Documents makes no call and sends exactly the prompt it sent before.
- A search failing at the embedding host lets the turn go ahead without Documents. A search refused for text credit fails the turn with `OutOfCreditError('text')`, as the turn's own call would.
- Each search logs its 5 top similarity scores at debug level (Document title and passage position, no text), so ticket 09 can tune the floor.
- The AI Message records which passages it used, or that the search failed. A Branch carries the record with each copied Message.
- The Story so far trigger reserves room for the block.

Covers:
- the pure selection and block;
- the in-memory per-Story vector cache, invalidated on Document add or remove and on Story deletion;
- the `documentPassages` column on Message and its migration, and Branch's copy carrying it.

**Blocked by:** [02 — Add a pasted Document to a Story](02-add-pasted-documents.md), [Branch 02 — Branch a Chat from a reply](../../branch/issues/02-branch-a-chat.md) (Branch lands before per-Message data; integration: "Build order rule")

- [x] Pure tests:
  - [x] the selection: floor, highest first, at most 4, the token cap with skip-and-try-the-rest, another model's passages skipped;
  - [x] the query window: the user's message plus the 4 newest Messages, newest first, cut to about 1,500 tokens;
  - [x] the block after Lore and before "Where things stand" (and before the Author's note, if it exists when this lands); the system message unchanged with and without Documents; no block when none is selected;
  - [x] the Story so far reserve with and without Documents.
- [x] API tests through the fake gateway, turns:
  - [x] a turn whose message shares words with a passage carries it, and an unrelated one is absent;
  - [x] every turn path searches once, recorded with the Story and Chat: send, Retry, Continue, Regenerate, User Message edit;
  - [x] a Story with no Documents makes no `document_search` call and sends the same prompt as before;
  - [x] a Document added after a turn is found on the next turn, and a removed one's passages are not.
- [x] API tests through the fake gateway, failures:
  - [x] a scripted outage or refusal still plays the turn, logs a warning and records `failed`;
  - [x] a scripted out-of-text-credit failure answers `OutOfCreditError('text')`, stores no Message, and makes no turn call.
- [x] Each search logs one debug line with the floor and the 5 top scores with Document title and position, and no passage or query text (checked with a captured logger).
- [x] The AI Message's `documentPassages` is `found` with ids, `failed`, or null for a Story without Documents; a Branch's copied Messages carry it (test); the schema test covers the column.
- [x] The existing suites stay green, including every prompt test for Stories without Documents.

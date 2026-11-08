# 05 — Documents in play in the Memory drawer

**Status:** ready-for-agent

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "Documents in play": the player can see which Documents and passages the last turn used, and when its search failed.
- `GET /api/stories/:storyId/chats/:chatId/documents` answers `{ hasDocuments, status, passages }` from the newest AI Message's record, with no model call.
- The Memory drawer gains a "Documents in play" card under "Lore in play", shown only when the Story has Documents, re-read when the Chat changes as the Lore card is.

**Blocked by:** [04 — Documents reach the Narrator](04-documents-reach-the-narrator.md)

- [ ] API tests: `hasDocuments` false for a Story without Documents; `status` `none` before any turn has searched, `found` with the passages (Document title, position, ~160-character excerpt) in the order sent, `failed` after a failed search; a removed Document's passages drop out; no gateway call.
- [ ] The card lists each passage as its Document's title and excerpt, "None close enough to the last turn" for an empty `found`, and "The last turn's search failed, so it used no Documents" for `failed`; it is absent for a Story without Documents.
- [ ] e2e at 390px: after a turn that mentions a Document's subject, the drawer lists it; after a turn whose search is scripted to fail through the testing controls, the drawer says so.
- [ ] The web's types mirror the new DTO, and the existing suites stay green.

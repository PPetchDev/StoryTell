# 03 — Rename, read and remove Documents; Duplicate copies them

**Status:** ready-for-agent

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "Other routes", "Duplicate Story" and "Story editor": a Document added in ticket 02 can be renamed, read and removed, and it travels with its Story.
- The card's title is editable and autosaves; "Read" opens the text read-only in a sheet; "Remove" asks for a confirmation (adding it again costs a call) and removes it.
- Duplicate Story copies every Document with its passages and vectors in the same transaction, with no call. Deleting the Story deletes them by cascade.

Covers `PATCH`, `GET` and `DELETE /api/stories/:storyId/documents/:documentId`, `DocumentNotFoundError`, and the Duplicate Story copy.

**Blocked by:** [02 — Add a pasted Document to a Story](02-add-pasted-documents.md)

- [ ] API tests through the fake gateway:
  - [ ] rename changes only the title and answers the Story; read answers `{ id, title, source, sourceName, text }`; remove answers the Story without it;
  - [ ] an unknown id, or one of another Story, is `DocumentNotFoundError` (next free 404 in domain 003, listed in `docs/error-codes.md`);
  - [ ] Duplicate copies Documents and passages, vectors included, with no `document_embedding` call;
  - [ ] deleting the Story removes its Documents and passages.
- [ ] The card: editable title (autosaved), Read sheet, Remove with confirmation.
- [ ] e2e at 390px: rename a Document and see the name after a reload; read its text; remove it with confirmation.
- [ ] The existing suites stay green, including the Duplicate Story tests.

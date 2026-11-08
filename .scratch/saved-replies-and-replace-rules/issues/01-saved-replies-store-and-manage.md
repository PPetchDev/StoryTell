# 01 — Saved replies: store and manage

**Status:** ready-for-agent

**What to build:** Saved replies exist and can be managed. The user adds, edits and removes app-wide Saved replies in a new "Saved replies" card in Settings, and a Story's own in a new "Saved replies" folding card in the Story editor's Style tab (no new editor tab, per [integration](../../sillytavern-gaps/integration.md)), all autosaved. The Chat detail lists the lines the composer's tray will show. Per the spec's "Saved replies: storage and API": the `saved_reply` table, the app-wide and per-Story routes, `savedReplies` on the Story response and on the Chat detail, the errors, and Duplicate Story copying them.

**Blocked by:** None — can start immediately

Part of: [Spec: Saved replies and Replace rules](../spec.md)

- [ ] Migration adds `saved_reply` (nullable `story_id` with cascade, `text`, `position`, `created_at`).
- [ ] App-wide routes answer the app-wide list; per-Story routes answer the whole Story with `savedReplies`; blank text, over 1,000 characters, a 51st line, and unknown ids are refused with the spec's errors (new domain in `docs/error-codes.md`).
- [ ] The Chat detail carries `savedReplies` with `scope`, the Story's first then the app-wide ones, each in add order.
- [ ] Deleting a Story removes its Saved replies; Duplicate Story copies them (API test).
- [ ] Settings shows a "Saved replies" card; the Story editor's Style tab shows a "Saved replies" folding card (`FoldingCard`); both add, edit (autosave) and remove, and survive a reload. The editor still has seven tabs.
- [ ] API tests and the Saved replies management e2e from the spec's Testing Decisions pass; the existing suites stay green.

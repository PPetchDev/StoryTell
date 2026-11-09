# 02 — Write for me

**Status:** ready-for-agent

**What to build:** ✍️ in the composer's tool row writes the user's next Message in English as the worn Role or Persona, from the composer's draft (Thai, notes, half a line) or from nothing, and replaces the draft with it; Undo brings the draft back. One play-model call under the new text call kind `write_for_me`, logged in the text pool and shown on the Usage page as "Write for me". Nothing is stored in the Chat. Per the spec's "Write for me" decisions: the endpoint and its gate, the prompt mirroring Suggested replies with the fixed short length and its inputs (Sampling, Lore, Documents, and later the Author's note), the answer reading with the Character-line guard, and the composer's wait, cancel, error and Undo behaviour.

**Blocked by:** 01 — Composer tool row

Part of: [Spec: Write for me and Thai reading](../spec.md)

- [ ] `POST /api/stories/:storyId/chats/:chatId/write-for-me` with `{ draft }` (empty allowed, at most 4,000 characters) answers `{ text }`, stores nothing and starts no background call.
- [ ] Refused with `TurnInProgressError` during a turn and `OutOfCreditError` (text) when text credit is out, both with no call; not blocked by a pending or failed background call.
- [ ] The prompt's first message is the turn's system message unchanged; the last is a `user` message holding, in order, Lore → Documents → Author's note (each only when present) → the instruction with the worn identity's name, the Story's point of view and tense, the delimited draft (or the from-nothing wording), the never-for-Characters rule and the short length. Every block is reserved in the history budget.
- [ ] **Sampling:** if [Sampling per play model](../../models-and-samplers/issues/02-sampling-per-play-model.md) has landed, `write_for_me` is a sampled kind and carries the play model's set values (contract test); if not, that ticket adds it.
- [ ] **Lore:** the Lore block comes from the one Lore selection entry point the turn and Suggested replies call ([Lore in play says why](../../lore-triggers/issues/01-lore-in-play-says-why.md)) at the point after the newest Message, if it has landed (else today's `exchangeLore`, as Suggested replies use it, and that ticket moves Write for me over with the other callers); an API test shows a Lore entry the latest exchange brings up in the last message.
- [ ] **Documents:** if [Suggested replies and Write for me use the passages](../../documents/issues/06-suggested-replies-and-write-for-me-use-the-passages.md) has landed, the passages the newest AI Message recorded go in as the turn's Documents block with no search call (API test); if not, that ticket adds them, with a test.
- [ ] **Author's note:** not added here; [Write for me reads the Author's note](../../authors-note/issues/03-write-for-me-reads-the-note.md) adds it after this ticket (unless that ticket says this one may take it).
- [ ] The answer drops a code fence and a leading identity label and is cut at the first `@` line; an empty result is `UnreadableWriteForMeError` (next free `502.004.0NN`, listed in `docs/error-codes.md`).
- [ ] Through the real gateway (recorded fetch) the call goes to the play model with stop string `\n@` where supported, and one UsageRecord of kind `write_for_me` lands in the text pool; the Usage page labels it "Write for me".
- [ ] Web: ✍️ ("Write for me") is disabled while a turn is written, a write is in flight, sending is blocked, or (once Dictation's mic exists) a recording or transcription runs — its own rule, not a copy of ⚡'s; while waiting the box is read-only and "Writing for you…" shows; a second tap cancels and the late answer is dropped.
- [ ] Web: the result replaces the draft; "↶ Undo" shows while the box holds exactly the result and restores the earlier draft (empty included); any change to the box hides it; a failure shows "Couldn't write it, try again" and leaves the draft.
- [ ] Pure tests for the prompt and the answer reading, API tests and e2e as listed in the spec's Testing Decisions pass; the existing suites stay green.

## Comments

**2026-11-09, from Documents ticket 06.** [Documents 06](../../documents/issues/06-suggested-replies-and-write-for-me-use-the-passages.md) landed before Write for me existed, so it wired the passages into Suggested replies only. Per [integration](../../sillytavern-gaps/integration.md) "Write for me's inputs", **this ticket owes the Documents block**, with a test. How Suggested replies do it, to copy:
- `ChatManagerService.suggestReplies` reads the passages the newest AI Message recorded, still existing ones only, with no search call: `await this.documentSearch.recorded(story.id, newestAiMessage(chat)?.documentPassages ?? null)`, and hands them in as `documentPassages` (a `PromptLayersInput` field).
- `buildSuggestionsPrompt` puts `documentsBlock(input.documentPassages ?? [])` after the Lore block and before the Author's note, and the history budget is what is left after the whole last message, so the block is reserved there.
- The API checks to mirror are in `apps/api/test/documents-in-turns.spec.ts` ("Suggested replies"): the newest AI Message's passages are carried with no `document_search` call; a removed Document's passages drop out; a `failed` or null record gives no block; a Story without Documents sends the same prompt as before. The pure budget check is in `apps/api/test/document-search.spec.ts` ("the Suggested replies prompt").

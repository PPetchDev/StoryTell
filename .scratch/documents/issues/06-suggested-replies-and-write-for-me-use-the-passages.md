# 06 — Suggested replies and Write for me use the last turn's passages

**Status:** done

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "Suggested replies and Write for me" and "Budget": what is written for the player knows the same passages as the last turn, with no search call.
- Suggested replies put the passages the newest AI Message recorded (still existing ones only) in the Documents block, after the Lore block and before the Author's note (when it exists) and their instruction.
- The block is taken from their history budget: the whole final message, Documents included, is subtracted before the history is chosen.
- Write for me does the same once it exists ([Spec: Write for me](../../write-for-me/spec.md)). If it exists when this lands, this ticket adds the block to it with a test; if not, Write for me's own ticket owes it (integration: "Write for me's inputs").

**Blocked by:** [04 — Documents reach the Narrator](04-documents-reach-the-narrator.md)

- [x] Pure tests: the Suggested replies prompt has the block after Lore and before the instruction; with a long history it keeps fewer Messages with the block than without, and never goes over the budget.
- [x] API tests through the fake gateway: Suggested replies carry the newest AI Message's passages with no `document_search` call; a removed Document's passages drop out; a `failed` or null record gives no block; a Story without Documents sends the same prompt as before.
- [ ] (n/a: Write for me does not exist yet) If Write for me exists: the same three API checks for Write for me, and its history budget takes the block.
- [x] The existing Suggested replies tests stay green.

## Comments

**2026-11-09.** Write for me is not built yet, so this ticket wired the passages into Suggested replies only, and the "If Write for me exists" item does not apply. Write for me's own ticket now owes the block, with a test: see the Comments of [Write for me 02](../../write-for-me/issues/02-write-for-me.md).

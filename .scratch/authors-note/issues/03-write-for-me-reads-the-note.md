# 03 — Write for me reads the Author's note

**Status:** ready-for-agent

Part of: [Spec: Author's note](../spec.md)

**What to build:** When the user taps ✍️ Write for me in a Chat with an Author's note, the line it writes follows the user's direction. Write for me's closing message carries the Chat's Author's note, in the same block and words the turn uses, in the order **Lore → Documents → Author's note → its own instruction**, and its history budget reserves the note's tokens. A Chat with no note sends Write for me exactly what it sent before. This ticket always owns the change ([integration](../../sillytavern-gaps/integration.md), "Write for me's inputs").

**Blocked by:** [01 — Write an Author's note from the Chat menu, and every turn follows it](01-authors-note-in-turns-and-the-chat-menu.md); [write-for-me 02 — Write for me](../../write-for-me/issues/02-write-for-me.md).

- [ ] API test (fake gateway): a Write for me call on a Chat with a note carries the block after the Lore and before its instruction; on a Chat without one it carries none.
- [ ] Pure prompt test: where the budget is tight, a long note trims one more old Message from Write for me's history.
- [ ] The whole API suite stays green.

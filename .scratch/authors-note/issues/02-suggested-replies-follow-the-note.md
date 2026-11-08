# 02 — Suggested replies follow the Author's note

**Status:** ready-for-agent

Part of: [Spec: Author's note](../spec.md)

**What to build:** When the user taps ⚡ in a Chat with an Author's note, the three suggestions follow that direction. The suggestions' closing message carries the same block and words the turn uses, in the order **Lore → Documents → Author's note → the suggestions instruction**. Their recent history is kept to the budget left after the system message and that closing message, so the note's tokens are reserved there too. A Chat with no note sends Suggested replies exactly what it sent before.

**Blocked by:** [01 — Write an Author's note from the Chat menu, and every turn follows it](01-authors-note-in-turns-and-the-chat-menu.md).

- [ ] API test (fake gateway): Suggested replies on a Chat with a note carry the block after the Lore and before their instruction; without a note they carry none and equal today's prompt.
- [ ] Pure prompt test: where the budget is tight, a long note trims one more old Message from the Suggested replies history.
- [ ] The whole API suite stays green.

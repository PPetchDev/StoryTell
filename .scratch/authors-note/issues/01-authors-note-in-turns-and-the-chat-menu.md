# 01 — Write an Author's note from the Chat menu, and every turn follows it

**Status:** ready-for-agent

Part of: [Spec: Author's note](../spec.md)

**What to build:** The user opens the Chat menu, writes an Author's note for this Chat, and from the next turn on the Narrator reads it every turn. Follow the spec's Implementation Decisions:

- Storage and API: a `chat.authors_note` column (text, not null, default empty); `PUT /api/stories/:storyId/chats/:chatId/authors-note` with `{ text }`, at most 1,000 characters, trimmed, answering the Chat; `authorsNote` on the Chat detail. No turn lock and no wait for background calls.
- Turns: every turn (send, Retry, Continue, Regenerate, a User Message edit) carries the note's block in its trailing system message in the one order **Lore → Documents → Author's note → Where things stand → Nudge → the final instruction**; the system message stays identical. The turn budget and the Story so far trigger count it. The judge, Memory extraction, the Story so far writer and the Snapshot writer never see it.
- Chat state: edits, Regenerate and Reset keep it; a Branch carries it, through a step added to [Branch's copy](../../branch/issues/02-branch-a-chat.md).
- Web: an "Author's note" row in the Chat menu after the existing rows, its quiet line the note's first line cut to fit, or "None: steer this Chat in your own words". A tap opens a sheet in place of the menu, like Rename: a textarea (placeholders "Keep it a slow burn." "It rains all day."), a count "N / 1,000", and Save, Clear and Cancel. The textarea stops input at 1,000 characters (`maxLength`), so typing stops there and a longer paste is cut to 1,000. Save and Clear run as a write, with the usual busy state and error line. The row is disabled while a turn or write is in flight.

**Blocked by:** [Branch 02 — Branch a Chat from a reply](../../branch/issues/02-branch-a-chat.md) (Branch's copy, which this extends).

- [ ] Pure prompt tests: the block sits after the Lore block and before "Where things stand" and the final instruction; with no note, or only whitespace, there is no block and the prompt equals today's; the system message is identical with and without a note; a long note trims one more old Message where the budget is tight; the Story so far coverage reserves the note's tokens.
- [ ] API tests (fake gateway): PUT saves, trims and answers `authorsNote`; over 1,000 characters is a 400; a send, a Continue and a Regenerate each carry the note; the judge's and the extraction's calls do not; a User Message edit and Reset keep it; saving while a turn is in flight succeeds and that turn's prompt holds the old note; a Branch carries the note.
- [ ] A Chat with no note sends exactly the prompts it sent before (turn, judge, extraction).
- [ ] e2e (390 px): writing a note shows its first line in the menu and survives a reload; Clear makes the row say None; typing past 1,000 characters stops at 1,000 and the count reads "1,000 / 1,000".
- [ ] Typecheck, the whole API suite and the whole e2e suite pass.

# Regenerate: ↺ Again on the newest reply

Type: task
Status: ready-for-agent
Blocked by: 05
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variant D: ↺ Again).

## What to build

Per the spec's "Regenerate" section.

- **API:**
  - A regenerate endpoint for a Chat's newest Message. It is refused on a User Message, on the Opening (model "author"), and under the send gate.
  - It rolls the ledger back from the Message's position, as an edit does, clears the Message's Snapshot links and deletes it.
  - It then runs a turn: the previous User Message's turn, or a Continue turn when the previous Message is an AI Message.
  - It reports the rollback count.
  - If the turn fails, the previous User Message is left awaiting Retry, or the Chat ends at the previous AI Message.
- **Client:**
  - ↺ Again sits in the newest reply's action row, never on the Opening. It replaces the reply in place, with the writing indicator.
  - The existing rollback notice shows when the count is above zero.

## Acceptance criteria

- [ ] API tests:
  - the newest AI Message is replaced
  - its scripted Bond, Arc, Scene advance and AI-added Memory are rolled back, while a user-written Memory stays
  - the rerun prompt is the previous User Message's turn
  - after a Continue reply, Again continues
  - it is refused on the Opening and on a User Message
  - Snapshot links are cleared, and the Gallery keeps the Snapshot
  - a failed turn leaves the User Message awaiting Retry
- [ ] Playwright: Again on the newest reply shows a different scripted reply in its place, with the Message count unchanged.
- [ ] The full suites pass.

## User stories covered

25–29.

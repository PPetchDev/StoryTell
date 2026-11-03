# Edit an earlier Message and reset a Chat

Type: task
Status: ready-for-agent
Blocked by: 24
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

Message-level rewind before any background state exists. Ticket 27 adds rollback of Bond, Arc and Scene changes, and ticket 28 adds Memory.

- **Edit User Message N.** Messages after N are deleted permanently and N's text is overwritten, with no version history. Then the AI writes a fresh reply.
- **Edit AI Message N.** The edit UI shows the Message as `@Name:` text. Messages after N are deleted, and the edited text is re-split into parts by the same parser. The Chat then waits for the user: no new AI reply.
- **Reset a Chat.** The title and worn identity are kept. Every Message is cleared, the current Opening is copied in again as Message 1, and the Chat returns to the first Scene or free play.
- Both actions ask for confirmation before discarding later Messages.

## Acceptance criteria

- [ ] API tests:
  - editing a User Message deletes later Messages and triggers exactly one new turn
  - editing an AI Message re-splits its parts and triggers no turn
  - reset keeps the title and identity and re-copies the current Opening, so an Opening edited after the Chat started appears only after reset
- [ ] Playwright: edit an earlier User Message and see the later Messages gone and a new reply.

## User stories covered

69–72, 76, and 77 (Messages part).

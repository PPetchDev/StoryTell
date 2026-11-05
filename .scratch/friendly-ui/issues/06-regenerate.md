# Regenerate: ↺ Again on the newest reply

Type: task
Status: done
Blocked by: 05
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: the prototype on branch `prototype/friendly-ui` (Chat variant D: ↺ Again), deleted on 2026-11-05 once all 12 tickets shipped.

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

- [x] API tests:
  - the newest AI Message is replaced
  - its scripted Bond, Arc, Scene advance and AI-added Memory are rolled back, while a user-written Memory stays
  - the rerun prompt is the previous User Message's turn
  - after a Continue reply, Again continues
  - it is refused on the Opening and on a User Message
  - Snapshot links are cleared, and the Gallery keeps the Snapshot
  - a failed turn leaves the User Message awaiting Retry
- [x] Playwright: Again on the newest reply shows a different scripted reply in its place, with the Message count unchanged.
- [x] The full suites pass.

## User stories covered

25–29.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-06-regenerate-4bbb4c`, not merged.
  - **API:**
    - `POST /stories/:storyId/chats/:chatId/messages/:messageId/regenerate` answers 200 with the Chat plus `rolledBack`, the same shape as an edit (`EditMessageResponseBodyDTO`).
    - The order of checks: the turn lock first (mid-turn the Message may already be deleted, so a second tap gets `409.004.004`, not a 404), then the Message (404), then the new `409.004.014` `NotRegenerableError` unless it is the Chat's newest Message, an AI Message and not the Opening, then send's gate (`requireSendable`).
    - Inside the turn lock: `ledger.rollbackFrom(position)`, `snapshotModel.clearMessageLinks`, the new `chatModel.deleteMessage`, then `writeTurn` on the reloaded Chat. The rollback-then-turn steps are a new private `rewindAndWrite`, which a User Message edit now uses too. `writeTurn` picks the User Message's turn or a Continue from the new last Message, as ticket 05 set up.
    - A failed turn answers with the gateway's error. The old reply is gone: a User Message before it awaits Retry, otherwise the Chat ends at the previous AI Message.
    - For merging with ticket 07: the controller and service additions are one block each, right after `editMessage` (`ChatApiController.regenerate`, `ChatManagerService.regenerateMessage` and `rewindAndWrite`). The only change outside that block is `editMessage`'s User Message branch, which now calls `rewindAndWrite`.
  - **Client:**
    - ↺ Again comes first in the newest reply's action row. It shows only when that reply is the newest Message, not the Opening, and sending isn't blocked.
    - A tap hides the old reply (`replacing` in `chat-thread.tsx`) while the writing indicator shows in its place, then shows the new one. The old reply comes back on screen only after the turn settles, so it never flashes back first.
    - The existing rollback notice shows the counts when any is above zero. The Memory drawer and Snapshots re-read after Again, also after a failed one.
    - No new styles: the button uses the row's `.action` class. A new `isOpening(message)` in `lib/chat.ts` holds the Opening rule for the thread's label and for Again. `chat-composer.tsx` is untouched.
  - **Tests:**
    - New `apps/api/test/regenerate.spec.ts`, 10 tests: replaced in place, with the rerun prompt equal to the first turn's; Bond, Arc, Scene advance and an AI-added Memory rolled back, with counts, while a user-written Memory stays; after a Continue reply it continues; a failed turn leaves the User Message awaiting Retry, or ends at the previous AI Message; refused mid-turn; refused on the Opening, a User Message, an older reply, an unknown id, with text credit out, on a non-playable Story, and while the reply's judge has failed (until it is retried).
    - `snapshots.spec.ts`: Again clears the reply's Snapshot link and the Gallery keeps the Snapshot.
    - New `apps/web/e2e/regenerate.spec.ts` at 390×844 with touch: no Again on the Opening; Again is first in the row; a tap shows the second scripted reply in place with 3 Messages before and after (also after a reload); the notice reads "Rolled back: 1 Bond change."
  - **Verified:** `npm run typecheck` is clean. `npm run test:api` passed 286 of 286 (21 files). `npm run test:e2e` passed 47 of 47 on ports 3501/3502, after the review fixes.
  - **Review:** `/code-review` against master.
    - Fixed:
      - the duplicated rollback-then-turn tail, now `rewindAndWrite`
      - the repeated `'author'` string, now `isOpening`
      - the method name, now `regenerateMessage`, beside `editMessage`
      - a missing test for the background-call gate
    - Left as is:
      - `EditResult` / `EditedChat` / `EditMessageResponseBodyDTO` keep their names for Regenerate's answer too. Renaming them would touch many files during parallel work.
      - "reply" in the error text, as in the existing copy and the spec.
      - A failed turn gives no rollback notice, the same as a failed edit.
  - **Not done / notes:**
    - The writing indicator during Again is not asserted in Playwright: the fake gateway can't hold a text reply. The API test holds one to check the turn lock.
    - Again is refused while the reply's own background call has failed (send's gate, as the spec says). Retrying that call first, or editing, is the way on.
    - Not looked at on the real Android phone.

# Continue: the story goes on with one tap

Type: task
Status: done
Blocked by: 02
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variant D: tap ▶ with the composer empty).

## What to build

Per the spec's "Continue" section.

- **API:**
  - A continue endpoint on a Chat, with the same gate as send. No User Message is stored.
  - The turn prompt's final user-role message is the continue instruction: the worn identity does nothing new, and the rule against writing their words or actions still holds.
  - The guard, parser and stop strings run as for any turn.
  - The reply is stored as an AI Message, both background calls start, and last played is bumped.
  - A failure stores nothing.
  - It is refused while a User Message is awaiting its reply.
- **Client:** while the composer is empty or whitespace, its send button shows ▶ and calls Continue. The writing indicator and error line are the same as for a send.

## Acceptance criteria

- [x] API tests:
  - Continue stores one AI Message and no User Message
  - it works right after the Opening, and after another AI Message
  - the recorded prompt ends with the continue instruction and includes the previous AI Message
  - the background calls run
  - the guard cuts a line written as the worn identity
  - it is refused while a User Message awaits its reply, while a turn is in flight, with text credit out, and on a non-playable Story
  - a failed call stores nothing
- [x] Playwright: tap ▶ twice from the Opening, and see two new AI replies and no user line.
- [x] `docs/error-codes.md` is updated for any new error.
- [x] The full suites pass.

## User stories covered

20–24.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-05-continue-a59cbd`, not merged.
  - **API:**
    - `POST /stories/:storyId/chats/:chatId/continue` answers 200 with the Chat.
    - It uses send's gate (`requireSendable`: playable, text credit, the turn lock, the previous reply's background calls). It is also refused with the new `409.004.013` `AwaitingReplyError` while a User Message awaits its reply.
    - No User Message is stored. A failed call stores nothing and leaves `lastPlayedAt` as it was.
  - **One turn path, for Regenerate (ticket 06):**
    - `writeTurn` now decides the kind of turn from the Chat's last Message. A User Message gets that Message's turn. An AI Message (the Opening included) gets a Continue turn, built from the whole history.
    - So Regenerate only has to delete the newest AI Message and call `writeTurn`. When the Message before it is an AI Message, the new reply is a Continue reply.
  - **Prompt:**
    - `buildTurnPrompt` takes `userText: null` for a Continue. The user-role message (layer 11) is then `continueInstruction(identity)`.
    - The instruction says the worn identity does nothing new and waits, the story goes on from where it stands, and nothing the identity says, thinks, feels, decides or does may be written.
    - The trailing system instruction and the Rules layer's NEVER line stay as they are, so the prompt ends `user: <continue instruction>`, then `system: <final instruction>`.
    - The guard, parser and stop strings are unchanged.
    - If the manual battery shows the model acting for the user, tune `continueInstruction`.
  - **Background calls:**
    - The judge and Memory extraction already ran on a reply with no User Message before it. Their "LATEST EXCHANGE" printed an empty `Ash: ` line.
    - It now reads `(Ash did nothing new; the story went on.)`, so the judge doesn't read a blank line from the user.
    - New `manager/chat/exchange.ts` (`exchangeUserText`, `exchangeUserLine`) holds the "User Message before this reply" lookup the turn, the judge and extraction share.
  - **Client:**
    - While the box is empty or whitespace, the composer's button is ▶ `Continue`, which calls `chatApi.continue`. Text turns it back into `Send`.
    - ▶ is disabled while a turn or another write is in flight, while sending is blocked, and while a User Message awaits its reply (Retry shows then).
    - Enter on an empty box does nothing, so a stray keypress never continues the story.
    - The writing indicator and error line are the ones a send uses (`runTurn`), with no pending user line.
    - `chat-screen.tsx` gained only `continueStory` and one prop. `chat-top-bar.tsx` is untouched.
  - **Tests:**
    - `chats.spec.ts` › Continue, 9 tests:
      - right after the Opening
      - after another AI Message, with the recorded prompt asserted
      - background calls run, and the exchange has no user line
      - the guard cuts an `@Ash:` line
      - a failed call stores nothing
      - refused while awaiting a reply, with text credit out and when not playable, while a turn is in flight, and while the previous judge failed (until it is retried)
    - The slow-gateway stub is now one `holdTextCalls` helper.
    - New `e2e/continue.spec.ts` at 390px with touch: tap ▶ twice from the Opening, see two replies and no user line, also after a reload.
    - `composer-and-actions.spec.ts` now expects ▶ on the empty box instead of a disabled Send.
  - **Verified:**
    - `npm run typecheck` is clean.
    - `npm run test:api` passed 272 of 272.
    - `npm run test:e2e` passed 39 of 39.
    - `/code-review` against master ran, and its findings are fixed: "scene" wording that clashed with the Scene term, the duplicated lookup, the duplicated test stub, and a background-gate test.
  - **Not done / notes:**
    - Continue quality against the real play model (the manual battery) is not checked.
    - Not looked at on the real Android phone.
    - The worktree needed its own `npm ci`. Without it, Turbopack can't find `next` above the worktree root and the e2e web server never starts.

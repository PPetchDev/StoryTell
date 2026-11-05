# Suggested replies (⚡)

Type: task
Status: done
Blocked by: 05
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variant D: ⚡).

## What to build

Per the spec's "Suggested replies" section.

- **API:**
  - A suggestions endpoint on a Chat. It returns exactly three items, each with a kind (`action`, `speech` or `move`) and text. Nothing is stored in the Chat.
  - One play-model call under a new text call kind, recorded in usage in the text pool. Its prompt has the turn's layers and history, plus an instruction to write as the worn identity, in the Story's point of view and tense.
  - The output is parsed as strict JSON. Unparseable output is a typed error.
  - It is refused while a turn is in flight or with text credit out. It does not wait for background calls.
  - The fake gateway and its test control route accept the new kind. Any database enum of call kinds gets its migration.
- **Client:**
  - ⚡ on the composer's left asks, shows a loading state, then three cards above the composer.
  - Tapping a card replaces the composer text; nothing sends.
  - Tapping ⚡ again, or sending, closes the cards.
  - An error shows "Couldn't suggest replies, try again".

## Acceptance criteria

- [x] API tests:
  - three items, one of each kind
  - nothing stored
  - usage recorded under the new kind, in the text pool
  - the prompt names the worn identity, and after a Persona swap it names the Persona
  - unparseable output gives the typed error
  - refused while a turn is in flight, and with text credit out
- [x] Playwright: tap ⚡, pick the second card, edit its text, send, and see the edited line in the thread.
- [x] The Usage page lists the new call kind's spend in plain words.
- [x] The full suites pass.

## User stories covered

30–35.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-07-suggested-replies-cd7e45`, not merged.
  - **API:**
    - `POST /stories/:storyId/chats/:chatId/suggestions` answers 200 with `{ suggestions: [{ kind, text }] }`: exactly three, in the order `action`, `speech`, `move`. Nothing is stored and no background call starts.
    - One play-model call under the new text call kind `suggested_replies`, in JSON mode, no stop strings, `max_tokens` 400. It is recorded in usage in the text pool like every text call. `usage_record.kind` is a `text` column, so no migration was needed.
    - The prompt is the turn's system message (layers 1–9, the same text a turn gets), the whole history trimmed to the turn's budget, then a system instruction: step outside the story, write three short options as the worn identity in the Story's point of view and tense, and answer with only a JSON object. `buildTurnPrompt` now shares `systemPrompt`, `recentHistory` and `povAndTense` from `turn/prompt.ts`, with the same output.
    - The output is read strictly in `suggestions/suggestions-prompt.ts`. It must have exactly three suggestions, one of each kind, each with text. Anything else is the new `502.004.014` `UnreadableSuggestionsError`. Like the judge's parser, it finds the JSON object inside surrounding text, so a code fence still reads.
    - Gate: `409.004.004` while a turn is in flight, `402.001.003` with text credit out. It never waits for, and is not blocked by, the previous reply's background calls.
    - The logic lives in `SuggestedRepliesManagerService`. `ChatManagerService` gained only `suggestReplies()` (the gate and the prompt layers) and two read helpers. `writeTurn` is untouched, for the ticket 06 merge.
    - The fake gateway and its control route are keyed on `TextCallKind`, so they took the new kind with no change.
  - **Usage:** `/api/usage` pools gain `byKind`, the spend and calls per call kind, most spent first. The Usage page lists them under "Spent this month" in plain words (`CALL_KIND_LABEL` in `lib/types.ts`), e.g. "Suggested replies: $0.01 (3 calls)".
  - **Client** (`chat-composer.tsx` only; `chat-screen.tsx` and `chat-thread.tsx` are untouched):
    - ⚡ sits left of the box (`aria-label="Suggest replies"`, `aria-pressed`). It is disabled while a turn or another write is in flight or sending is blocked.
    - A tap shows "Thinking up replies…", then three cards above the box, each tagged Do, Say or Bold move.
    - A card replaces the box's text and sends nothing. The cards stay open so another can be tried; ⚡ again, Send or ▶ Continue closes them, and so does any new Message (they are never kept across turns). An answer that arrives after they were closed is dropped.
    - Any failure but an unreachable API shows "Couldn't suggest replies, try again"; an unreachable API shows the can't-connect screen.
    - Styles live in `chat-composer.module.css` and `app/usage/usage.module.css`. No new tokens.
  - **Tests:**
    - New `apps/api/test/suggested-replies.spec.ts`, 16 tests:
      - three of the three kinds, ordered
      - nothing stored and no background call
      - the prompt shares the turn's system message and history, and names the worn identity, point of view and tense
      - after a Persona swap it names the Persona
      - six kinds of unreadable output give `502.004.014`, and a fenced object still reads
      - refused with text credit out and while a turn is in flight
      - not blocked by a failed judge
      - 404 for another Story's Chat
      - through the real gateway: GLM-5.3 in JSON mode with no stop strings, the UsageRecord under `suggested_replies` in the text pool, and `/api/usage` `byKind`
    - `usage.spec.ts` also pins `byKind`.
    - New `apps/web/e2e/suggested-replies.spec.ts` at 390×844 with touch:
      - ⚡ first fails and shows the error, and ⚡ again closes it
      - then three cards: picking replaces the text and sends nothing; the second card is edited and sent; the edited line shows in the thread, the cards close, and nothing is kept after a reload
      - the Usage page lists the per-kind spend in plain words, served a known `/api/usage` (the fake gateway writes no UsageRecords)
  - **Verified:** `npm run typecheck` is clean. `npm run test:api` passed 291 of 291 (21 files). `npm run test:e2e` passed 48 of 48 on ports 3511/3512.
  - **Review:** `/code-review` against master. The spec axis found no defects. Fixed from the standards axis:
    - `writeTurn` is back as it was, to keep the ticket 06 merge easy
    - the error-codes row's missing `|`
    - an unused `tokenBudget`
    - `calls()` renamed `callCount()`
    - the Usage label for turns is "Turns", since "reply" is an Avoid word in `CONTEXT.md`

    Left as is:
    - the JSON-object regex and `isObject` repeat the judge's, memory's and snapshot's parsers. That is a shared helper for later.
    - the web `CallKind` union and its labels mirror the API by hand, as the repo's other web types do
  - **Follow-ups / not done:**
    - Once ticket 06 is merged, `writeTurn` can use `promptLayersFor` and `promptHistory` and drop its own copy.
    - Suggestion quality against the real play model (the manual battery: the three must be distinct, and the Rules layer's NEVER line must not stop the model) is not checked.
    - Not looked at on the real Android phone.

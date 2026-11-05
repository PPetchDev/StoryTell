# One-row composer and the newest reply's action row

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variant D).

## What to build

- **Composer:**
  - One auto-growing row (up to about 5 lines), with a placeholder that names the worn identity.
  - The send icon on the right, disabled while the box is empty for now (ticket 05 turns the empty state into ▶).
  - Enter sends, and Shift+Enter makes a new line.
  - The camera and hint field go.
- **Action row** under the newest AI Message while no turn is in flight: ✎ Edit and 📷 Snapshot. Ticket 06 adds ↺ Again.
- **Older Messages:** the Edit pill goes. Tapping a Message shows its Edit, with the existing rewind confirmation. A second tap, or a tap elsewhere, hides it.
- **Snapshot sheet:** 📷 opens a bottom sheet with an optional hint and "Take Snapshot". It uses the existing Snapshot create on the latest AI Message. Pending, failure with Retry, and out-of-image-credit behave as now.
- **While a turn is in flight,** all actions are hidden.

## Acceptance criteria

- [x] Playwright: take a Snapshot from the action row with a hint, and see the pending placeholder become the image.
- [x] Playwright: tap an older User Message, choose Edit, confirm the rewind, and see a new reply.
- [x] Playwright: no Message shows an Edit button until it is tapped, and the newest AI Message shows its action row.
- [x] The existing snapshot, edit-and-reset and play e2e specs are updated to the new controls.
- [x] The full suites pass.

## User stories covered

17, 36–39.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-02-composer-actions-678e5a`, not merged.
  - **Composer** (`chat-composer.tsx`):
    - One auto-growing row, from one line up to about five, then it scrolls. It re-fits when the window is resized.
    - The placeholder is "Write as <identity>…". The round send icon button (`aria-label="Send"`) is disabled while the box is empty, a turn is in flight, or sending is blocked.
    - Enter sends and Shift+Enter is a new line where a fine pointer is present (`any-pointer: fine`, a physical keyboard). On a phone's on-screen keyboard Enter is a new line and the button sends, per the spec's "on a physical keyboard".
    - An Enter that confirms an input-method word (Thai) never sends: `isComposing`, or keyCode 229 on Safari.
    - The camera and hint field are gone. A Snapshot start failure shows as an alert above the box.
    - Comments mark the spots for ⚡ (ticket 07, left of the box) and ▶ Continue (ticket 05, the send button's empty state).
  - **Action row** (`chat-thread.tsx`):
    - `role="group"` "Message actions" holds ✎ Edit and 📷 Snapshot under the latest AI Message (the Opening counts), while no turn, write or edit is in flight. A comment marks where ↺ Again goes first (ticket 06).
    - Its Snapshots now render inside the Message's article, above the row.
  - **Older Messages:**
    - No Edit pill. A tap on the Message shows its Edit; a second tap, a tap anywhere else, or a turn starting hides it.
    - A tap on a link or button inside it, or a drag that selects text, doesn't toggle it.
    - A tapped Message is focusable, and Enter or Space toggles it.
    - The existing rewind confirmation is unchanged.
  - **Snapshot sheet** (`snapshot-sheet.tsx`, on `components/sheet/`):
    - The "Take a Snapshot" sheet has an optional hint and a "Take Snapshot" button. It calls the existing Snapshot create on the latest AI Message, then closes.
    - The placeholder, failure with Retry and Dismiss, and the retake are unchanged.
    - With image credit out, the sheet shows the existing note and the button is disabled.
  - **Styles:**
    - All in CSS modules: `chat-composer`, `chat-thread`, `snapshot-sheet` and `message-snapshots` (margin).
    - The dead `.camera` rules left `globals.css` (brace balance checked). No new tokens.
  - **Tests:**
    - New `e2e/composer-and-actions.spec.ts`, two tests at 390×844 with touch:
      - only the newest reply has the action row, and no Edit shows until a Message is tapped (second tap and tap elsewhere hide it)
      - one row that grows to about five lines and then scrolls; Enter on the phone is a new line; the button sends; no action shows while the reply is written; the new reply carries the row
    - One desktop test: Shift+Enter is a new line and Enter sends.
    - `snapshots.spec.ts` now runs at 390 with touch. It takes the Snapshot from the action row's sheet with a hint, and checks that the hint reached the image-prompt call.
    - `edit-and-reset.spec.ts` now runs at 390 with touch. It taps the older User Message to reveal Edit, then confirms the rewind.
    - `play-a-chat`, `chat-reading` and `dashboard` needed no change: Send keeps its name, and the newest reply's Edit is in its row.
  - **Verified:** `npm run typecheck` is clean. `npm run test:api` passed 263/263 (20 files). `npm run test:e2e` passed 31/31 on ports 3441/3442.
  - **Review:** `/code-review` against master. Fixed:
    - Enter on a phone keyboard
    - the Safari input-method Enter
    - the repeated Edit button
    - the names (`ActionRow`, "Message actions", `newestAiMessage`) and the sheet copy ("picture" became "Snapshot"), per CONTEXT.md
    - a `#fff` that became `--accent-text`
    - the Message anchor id helper
    - the Sheet moved into its own file
    - re-fitting on resize
    - text selection toggling Edit
    - a looser grow test

    Left as is:
    - the hint check on the fake's recorded calls (as `reference-image.spec.ts` does)
    - the article toggle has no ARIA "expanded" state (not valid on an article)
    - the image-credit note shows only in the sheet
  - **For merging:** ticket 04 also touches how Snapshots show in the thread. This branch moves `MessageSnapshots` inside the Message's article and changes its top margin in `message-snapshots.module.css`.
  - **Not done:** looking at it on the real Android phone (by hand, per the spec). The Gallery's empty text still says "Take one with the camera in a Chat" (`components/snapshot/`, out of scope here), for ticket 04 or 12.

# Story assistant as a half-height sheet that shows its changes

Type: task
Status: done
Blocked by: 09
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: the prototype on branch `prototype/friendly-ui` (Story editor variants A and D: the Assistant button), deleted on 2026-11-05 once all 12 tickets shipped.

## What to build

- **The Assistant panel becomes a non-modal bottom sheet,** about half the screen tall, with a close button. The editor above it stays usable and has enough room at the bottom to scroll fields above the sheet.
- **Applying a change set:**
  - The editor switches to the first changed field's tab, scrolls it into view above the sheet and highlights it.
  - Each applied change in the transcript is a link to its field.
- **Unchanged:** Undo, the removal warning path, and failures.

## Acceptance criteria

- [x] Playwright at 390px: with the editor on the Story tab, a scripted change set to a Character's field switches to Characters, and that field is visible above the sheet and highlighted.
- [x] Playwright: after moving away, tapping the change's link in the transcript returns to the field, and Undo still reverts it.
- [x] The existing story-assistant e2e spec is updated.
- [x] The full suites pass.

## User stories covered

65–67.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-10-assistant-sheet-86df20`, not merged.
  - **Sheet** (`components/sheet/`): a new `modeless` option, plus an optional `title` in the grip row.
    - A modeless sheet is `--sheet-half` (50dvh) tall, with no dimming and no focus trap. A tap on the page doesn't close it.
    - Escape closes it while focus is inside. On close, focus goes back to the opener only if focus was last in the sheet.
    - The modal path is unchanged for its existing callers.
  - **Assistant** (`story-assistant-sheet.tsx`, `story-assistant.module.css`):
    - The old panel is now a modeless sheet named "Assistant", with Close.
    - The transcript scrolls inside the sheet, with the composer at the bottom. The hint shows only while the conversation is empty.
    - Its styles moved out of `globals.css` into the module.
  - **Applying a change set:**
    - Once an answer lands, the editor renders it (`flushSync`), switches to the first changed field's tab, scrolls the field into view and lights it with ticket 09's flash.
    - Focus stays with the sheet.
    - An answer that lands after its conversation was closed only updates the Story, as before.
  - **Links:** each applied change in the transcript is a chip-style button that goes to its field and focuses it.
    - An addition goes to its first field.
    - A removal, or an undone addition, is plain text.
  - **Above the sheet:**
    - The editor leaves `--sheet-half` of room at its end while the sheet is open.
    - It sets scroll padding on `<html>`: the sticky header's measured height always, and the sheet's height while open. Jumps, Tab and the browser's own focus scrolling all land between the two.
    - A field too tall for that band shows from its top.
  - **Jump targets:**
    - `placeOfField` in `editor-tabs.ts` maps any field the assistant can set to its tab and DOM id.
    - The POV, tense and reply-length segments and Example lines got ids and the flash.
    - Example lines also got the lasting "changed by the assistant" mark.
  - **Unchanged:** Undo, the removal confirmation and the failure with Retry.
  - **Tests:**
    - `e2e/story-assistant.spec.ts` now runs at 390×844 with touch.
    - New test: from the Story tab, a change to Tomas's Secrets switches to Characters, with the field marked and inside the band between the tabs and the sheet. After moving to the Story tab, the change's link returns to the field, focused and above the sheet, and Undo reverts it.
    - The existing test uses the dialog and follows the change links instead of clicking tabs.
  - **Verified:**
    - `npm run typecheck` is clean.
    - `npm run test:api` passed 275/275 (20 files).
    - `npm run test:e2e` passed 47/47 on ports 3521/3522.
    - The landed state was checked in a 390px screenshot.
  - **Review:** `/code-review` against master. Fixed:
    - the "At least one Character" link no longer focused Add Character (it failed `story-editor.spec`)
    - a late answer jumping the editor after the sheet was closed
    - tall fields centred past the band
    - the header height measured only once
    - the modeless close relying on focus landing on the body
    - the title's margin reaching into the Sheet's layout (now Sheet's `title`)
    - the missing changed mark on Example lines
    - naming (`openSheet`/`closeSheet`, `header`, `onAppliedRef`)

    Left as is:
    - a link focuses its field, which opens the keyboard on a phone, as the status box's links do
    - the latest-callback ref pattern repeated across the focus hooks
  - **Not done:** looking at it on the real Android phone, by hand per the spec.

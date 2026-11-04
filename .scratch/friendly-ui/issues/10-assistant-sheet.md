# Story assistant as a half-height sheet that shows its changes

Type: task
Status: ready-for-agent
Blocked by: 09
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Story editor variants A and D: the Assistant button).

## What to build

- **The Assistant panel becomes a non-modal bottom sheet,** about half the screen tall, with a close button. The editor above it stays usable and has enough room at the bottom to scroll fields above the sheet.
- **Applying a change set:**
  - The editor switches to the first changed field's tab, scrolls it into view above the sheet and highlights it.
  - Each applied change in the transcript is a link to its field.
- **Unchanged:** Undo, the removal warning path, and failures.

## Acceptance criteria

- [ ] Playwright at 390px: with the editor on the Story tab, a scripted change set to a Character's field switches to Characters, and that field is visible above the sheet and highlighted.
- [ ] Playwright: after moving away, tapping the change's link in the transcript returns to the field, and Undo still reverts it.
- [ ] The existing story-assistant e2e spec is updated.
- [ ] The full suites pass.

## User stories covered

65–67.

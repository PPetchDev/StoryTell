# One-row composer and the newest reply's action row

Type: task
Status: ready-for-agent
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

- [ ] Playwright: take a Snapshot from the action row with a hint, and see the pending placeholder become the image.
- [ ] Playwright: tap an older User Message, choose Edit, confirm the rewind, and see a new reply.
- [ ] Playwright: no Message shows an Edit button until it is tapped, and the newest AI Message shows its action row.
- [ ] The existing snapshot, edit-and-reset and play e2e specs are updated to the new controls.
- [ ] The full suites pass.

## User stories covered

17, 36–39.

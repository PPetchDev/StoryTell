# The Memory drawer shows and edits the Story so far

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Story so far](../spec.md)

## What to build

Per the spec's "Web" decision: a "Story so far" card above the List/Graph switch in the Memory drawer.

- With none, it reads "Not needed yet: the whole Chat still fits."
- Otherwise it shows the text, "Covers the first N Messages" and who wrote it, with an Edit button that saves through the PUT.
- When the last update failed, it shows one quiet line that it will try again on the next turn.

## Acceptance criteria

- [x] A Playwright e2e test (390px, touch) shows "Not needed yet" on a short Chat. On a seeded one it shows the text and count, and an edit saves and reads back as written by you.
- [x] Web typecheck and the full e2e suite stay green.

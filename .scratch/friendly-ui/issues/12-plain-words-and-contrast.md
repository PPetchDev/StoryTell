# Plain words on the Dashboard, and readable contrast

Type: task
Status: ready-for-agent
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)

## What to build

- **Dashboard wording:**
  - Background-call statuses read "Up to date", "Updating…" and "Couldn't update — Retry".
  - The sections are titled "How the Characters feel", "How they've changed" and "Where the story is".
  - No internal words ("judge", "extraction", "Done") remain anywhere in the UI.
- **Contrast pass:**
  - Every text colour and background pair in the app meets WCAG AA: 4.5:1 for body text, 3:1 for large text and icons.
  - Muted text and disabled states are raised wherever they fall short.
  - Destructive buttons use the danger style, are quieter than primary actions, and always confirm.

## Acceptance criteria

- [ ] A Playwright check that none of "judge", "extraction" or "Done" appears as visible text on the Dashboard page.
- [ ] Each colour pair and its measured ratio is listed in this ticket's Comments.
- [ ] The existing dashboard e2e spec is updated.
- [ ] The full suites pass.

## User stories covered

72–74.

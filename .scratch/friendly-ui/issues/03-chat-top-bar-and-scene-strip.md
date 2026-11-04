# Thin Chat top bar, ⋯ menu and Scene strip

Type: task
Status: ready-for-agent
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variants A and D).

## What to build

- **Top bar:** back to the Story's Chat list, the Chat title with "as <identity>" under it, and ⋯.
- **⋯ menu,** a bottom sheet holding:
  - Memory (opens the existing drawer)
  - Dashboard
  - Gallery
  - Rename
  - the identity swap (the existing picker)
  - "Show Scene strip", while the strip is hidden
  - Reset, in the danger style, with a confirm dialog using the existing wording
- **Scene strip** under the top bar:
  - shows the current Scene's name and goal, from the existing Dashboard data, or "Free play"
  - refreshes after each turn settles
  - hides on tap, remembered per device, with a safe fallback to shown
- **The old header area goes.** Hiding the main nav on this route belongs to ticket 08.

## Acceptance criteria

- [ ] Playwright at 390px: the top bar is a single row, about 56px tall at most.
- [ ] Playwright: Reset through ⋯ asks first. Cancel keeps the Messages, and Reset clears them.
- [ ] Playwright: the strip shows the Scene name. After a turn where the scripted judge moves the Chat on, it shows the next Scene. Hiding it survives a reload.
- [ ] Memory, Dashboard, Gallery, Rename and the identity swap all work from the menu, and their existing e2e specs are updated.
- [ ] The full suites pass.

## User stories covered

40–42, 44, 45.

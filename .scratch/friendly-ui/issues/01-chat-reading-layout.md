# Chat reads like a novel

Type: task
Status: ready-for-agent
Blocked by: none
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variants A and D).

## What to build

The Chat thread's look and its scrolling, so later tickets can build on it.

- **Split the Chat screen into three components:** a top bar, the thread, and the composer. This lets tickets 02, 03 and 05 work on separate files. The existing top area stays as it is for now; ticket 03 replaces it.
- **Book rendering:**
  - Narration is plain paragraphs in the bundled book face.
  - Speech shows the stamped speaker name and a left bar, both in the Character's colour.
  - User Messages are a tinted right-aligned bubble, with `*…*` in italics.
  - The Edit pill stays on every Message for now; ticket 02 replaces it.
- **Character colours:** a fixed palette with readable contrast, picked from the Character's position in the Story. Unknown speakers get a neutral colour.
- **Text size:** S / M / L in Settings, stored per device, with a safe fallback to M. It applies to story text only.
- **Scrolling:**
  - The thread is its own scroll area between the top bar and the composer.
  - It opens at the end.
  - It follows the end whenever a Message is added or replaced, or the writing indicator appears or goes.
- **Send feedback:**
  - The composer clears and the user's line shows at once (optimistic).
  - The writing indicator sits where the reply will appear.
  - A failed turn keeps the line, with the existing error and Retry.
- **Snapshots in the thread** are shown whole (contain), never cropped.
- **Styles:** new tokens for surfaces, lines and danger go in the global token block. Component styles go in per-component stylesheets.

## Acceptance criteria

- [ ] Playwright at 390px:
  - opening a long Chat shows the newest reply fully above the composer
  - after Send, the composer is empty and the user's line is visible before the reply arrives
  - the reply ends up in view
- [ ] Playwright: changing the text size in Settings changes the Chat's story text size, and survives a reload.
- [ ] Two Characters' speech carries two different colours, and the same Character keeps its colour in a second Chat of the Story.
- [ ] Existing e2e specs that relied on the old card layout are updated.
- [ ] `npm run typecheck`, `npm run test:api` and the browser suite pass.

## User stories covered

1–13, 18, 19.

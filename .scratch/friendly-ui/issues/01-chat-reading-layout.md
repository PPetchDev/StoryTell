# Chat reads like a novel

Type: task
Status: done
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

- [x] Playwright at 390px:
  - opening a long Chat shows the newest reply fully above the composer
  - after Send, the composer is empty and the user's line is visible before the reply arrives
  - the reply ends up in view
- [x] Playwright: changing the text size in Settings changes the Chat's story text size, and survives a reload.
- [x] Two Characters' speech carries two different colours, and the same Character keeps its colour in a second Chat of the Story.
- [x] Existing e2e specs that relied on the old card layout are updated.
- [x] `npm run typecheck`, `npm run test:api` and the browser suite pass.

## User stories covered

1–13, 18, 19.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-01-chat-reading-1fb4aa`, not merged.
  - **Split:**
    - `components/chat/chat-screen.tsx` keeps the state and handlers.
    - `chat-top-bar.tsx` holds the old breadcrumbs, title, identity picker, Memory and Reset, unchanged for ticket 03.
    - `chat-thread.tsx` holds the Messages, the Edit pill and edit box (unchanged for ticket 02), Snapshots and the writing indicator.
    - `chat-composer.tsx` holds the notices, error and Retry, the camera and the box, for tickets 02, 05 and 07.
    - `message-body.tsx` (`MessageBody`, `UserLine`) is the story-text rendering ticket 09's Opening preview can reuse.
  - **Look:**
    - The book face is Literata via `next/font/google`, self-hosted at build time (`lib/book-face.ts`).
    - Speech is a `group` named by its speaker, with a bar and name in `--speaker-colour`.
    - `lib/character-colour.ts` holds an 8-colour palette, each colour ≥7.7:1 on the background, picked by the Character's position in the Story's cast.
      - Unknown speakers get a neutral colour.
      - The Chat page loads the Story with the Chat to get the cast.
    - The user bubble renders `*…*` as `<em>`.
    - Thread Snapshots show whole, at full width with `object-fit: contain`.
    - The writing indicator shows dots.
  - **Text size:**
    - `lib/text-size.ts`: S, M or L in localStorage, read through `useSyncExternalStore`. Blocked or full storage keeps the choice for the tab only, with M as the fallback.
    - `components/text-size-setting.tsx` adds the control to Settings, as its own card for ticket 11 to keep.
  - **Scrolling:**
    - The Chat fills the screen below whatever the shell shows. `chat-screen.module.css` sets `:global(.page):has(> .screen)` to `100dvh`, flex.
    - The thread scrolls on its own.
    - It follows the end when the count, the newest Message's id or text, the optimistic line or the writing indicator changes.
    - A ResizeObserver keeps the end while the user reads there, as Snapshots load and notices come and go.
    - A `#message-N` link still lands on its Message.
  - **Send:**
    - The composer clears and the line shows at once.
    - On a failed turn the stored line stays with the existing error and Retry.
    - If the API never stored the line, its text goes back in the composer.
  - **Styles:**
    - New tokens `--surface-raised`, `--line`, `--accent-soft`, `--accent-line` and `--danger` are in the `:root` block.
    - Everything else is in CSS modules. The global chat rules they replace were removed, and brace balance was checked.
    - `.speaker` and `.message-text` stay global, because the dashboard, Memory drawer and assistant still use them.
  - **Harness fix:**
    - The e2e Next server now runs with `turbopackFileSystemCacheForDev` off (`NEXT_DEV_FS_CACHE=off` in `playwright.config.ts`).
    - Before the fix, a dev cache left by the previous run made the next run's first page reload in a loop. The HMR socket showed `restart` then `reloadPage: "HMR hash mismatch"`. It was cured by deleting `.next-e2e`, and with the cache off two back-to-back runs were clean.
  - **Tests:**
    - New `e2e/chat-reading.spec.ts` (5 tests at 390×844 with touch):
      - the newest reply fully above the composer on open
      - an optimistic send whose line and indicator show before the held reply, which lands in view, with `*…*` italics
      - two colours, and the same colour in a second Chat
      - text size L from Settings, with controls unchanged, surviving a reload
      - an in-place edit of the newest reply refollowing the end
    - `snapshots.spec.ts` asserts `object-fit: contain`.
    - `play-a-chat`, `edit-and-reset`, `cast-changes` and `personas` moved from `.speaker`/`.speech` to the speech groups.
  - **Verified:** `npm run typecheck` is clean. `npm run test:api` passed 254/254 (19 files). `npm run test:e2e` passed 24/24 on ports 3411/3412.
  - **Review:** `/code-review` against master. Fixed:
    - an AI Message edit not refollowing the end (test added)
    - a text-size write failure being ignored when storage could still be read
    - the `Cast` type
    - naming
    - the contrast comment

    Left as is:
    - "thread" and "bubble" names, which are the spec's own words
    - the `.page` override, noted for ticket 08
    - the Gallery still crops, which is for ticket 04
  - **Not done:** looking at it on the real Android phone, and measuring contrast with a checker; both are by hand per the spec.

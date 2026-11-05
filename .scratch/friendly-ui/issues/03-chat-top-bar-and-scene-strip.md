# Thin Chat top bar, ⋯ menu and Scene strip

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: the prototype on branch `prototype/friendly-ui` (Chat variants A and D), deleted on 2026-11-05 once all 12 tickets shipped.

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

- [x] Playwright at 390px: the top bar is a single row, about 56px tall at most.
- [x] Playwright: Reset through ⋯ asks first. Cancel keeps the Messages, and Reset clears them.
- [x] Playwright: the strip shows the Scene name. After a turn where the scripted judge moves the Chat on, it shows the next Scene. Hiding it survives a reload.
- [x] Memory, Dashboard, Gallery, Rename and the identity swap all work from the menu, and their existing e2e specs are updated.
- [x] The full suites pass.

## User stories covered

40–42, 44, 45.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-03-top-bar-cc5bd0`, not merged.
  - **Top bar** (`components/chat/chat-top-bar.tsx`):
    - One row, at most 56px: a back icon link ("Back to Chats") to the Story's Chat list, the Chat title (`h1`) with "as <identity>" under it, and ⋯ ("Chat menu").
    - The old header goes: the breadcrumbs, the inline picker, and the Memory and Reset buttons.
  - **⋯ menu** (one `components/sheet/` Sheet):
    - Memory opens the existing drawer. Dashboard and Gallery are links.
    - Rename swaps the menu's rows for a title box in the same sheet, so the box takes focus at once. It saves through the existing `chatApi.rename`.
    - The existing identity picker stays open after a swap, so a keyboard user can arrow through the list.
    - "Show Scene strip" shows only while the strip is hidden.
    - "Reset Chat" comes last, in the danger colour, and opens the new `ConfirmDialog` with the old wording: "Clear every Message and start this Chat over from the Opening?"
    - Rename, the swap and Reset are disabled while a turn or write is in flight, as before.
  - **ConfirmDialog** (`components/sheet/confirm-dialog.tsx`): a centred `alertdialog`. Focus starts on Cancel. Escape or a tap outside cancels. It can be reused by tickets 09 and 12.
  - **`useModalFocus`** (new, `components/sheet/sheet.tsx`):
    - The Sheet and the dialog now share their focus rules through it.
    - It moves focus in an effect to an optional initial element. autoFocus didn't work here: a sheet that closes in the same commit hands focus back to its opener and steals it.
  - **Scene strip** (`components/chat/scene-strip.tsx`):
    - **What it shows:** 📍 the Scene name and 🎯 its goal, or "Free play".
    - **Where the goal comes from:**
      - The goal is the Scene's `situation`, which the API describes as "the situation or goal of the Scene".
      - The Dashboard data has only the Scene's id and name, so the name comes from the Chat's `currentScene`. The goal comes from the Story's Scenes, which the Chat page already loads and passes in as a new `scenes` prop.
      - The Chat is re-read until each turn's background calls settle, so the strip shows the judge's new Scene once the turn settles. This needs no extra fetch and no API change.
    - **Hiding:** a tap hides it.
  - **Per-device preference:**
    - New `lib/device-preference.ts` does the storage work: it reads storage safely and keeps a choice in the tab when storage refuses it. `lib/text-size.ts` now uses it too, with the same exports.
    - `lib/scene-strip.ts` stores `storytell.sceneStrip=hidden`. Blocked or empty storage shows the strip.
  - **Styles:**
    - CSS modules for the top bar, the strip and the dialog.
    - New `:root` tokens `--danger-soft` (#5a1f2b) and `--danger-text` (#ffd5db), for the danger button.
    - `chat-screen.module.css` drops the page's top padding to the safe-area inset on the Chat.
  - **`chat-screen.tsx`:** wiring only. Two imports, the `scenes` prop, `useSceneStripHidden()`, three new top-bar props, and the `<SceneStrip>` line.
  - **Tests:**
    - New `e2e/chat-top-bar.spec.ts`, four tests at 390×844 with touch:
      - the bar is at most 56px; Reset through ⋯ asks first, focus starts on Cancel, Cancel keeps the Messages and Reset clears them
      - the strip shows the Scene and goal, shows the next Scene after a scripted judge `move_on`, stays hidden after a reload, and comes back from ⋯
      - "Free play" in a Story with no Scenes
      - Rename from ⋯ focuses the box and keeps the new title after a reload
    - Updated to the menu: `autosave` (Memory), `dashboard` (Dashboard), `snapshots` (Reset and Gallery), `edit-and-reset` (Reset), `personas` (the identity swap, plus "as Rin" in the bar), and `play-a-chat` (the back link).
  - **Verified:** `npm run typecheck` is clean. `npm run test:api` passed 263/263 (20 files). `npm run test:e2e` passed 42/42 on ports 3481/3482. Screenshots at 390px were checked against prototype variant D.
  - **Review:** `/code-review` against master. Spec found nothing missing. Fixed from Standards:
    - the Rename box not getting focus
    - the keyboard identity swap closing the menu
    - the duplicated storage code (now `device-preference`)
    - the duplicated focus code (now `useModalFocus`)
    - the Scene lookup moved out of `chat-screen.tsx`
    - `aria-expanded` on ⋯
    - import order, long lines, and comments on the negative margins
  - **Left as is:**
    - The old `.chat-head`, `.identity-swap` and `.chat h1` rules in `globals.css` are now dead. They were left so parallel branches don't conflict in the shared file. The top bar's title uses a two-class selector so `.chat h1` can't win. Delete them in a cleanup once the wave is merged.
    - The Chat list's own Rename stays.
  - **For merging:** ticket 05 also edits `chat-screen.tsx`. This branch's edits there are the imports, the props line, one hook line after `blocked`, and the top-bar/strip block at the top of the JSX.
  - **Not done:** looking at it on the real Android phone, and measuring the new colour pair with a checker (by hand, per the spec). It works out to about 9.5:1.

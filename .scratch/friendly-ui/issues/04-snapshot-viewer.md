# Full-screen Snapshot viewer with swipe

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (any Chat variant: tap a Snapshot).

## What to build

- **One shared full-screen viewer** for the Chat and the Gallery, showing the image whole on black.
- **Moving through Snapshots:** a horizontal swipe, or the arrow keys, moves through the same list. In the Chat that's its Snapshots in thread order; in the Gallery it's the current filter.
- **Closing:** a downward swipe, Escape, or ×.
- **In the Gallery,** the viewer keeps the stored prompt, delete (with confirmation) and download.
- **Gallery thumbnails** show the whole image.

## Acceptance criteria

- [x] Playwright with touch at 390px: open the first of two Snapshots in a Chat, swipe left to see the second, then swipe down to get back to the Chat.
- [x] Playwright: the same in the Gallery, plus delete from the viewer.
- [x] The existing snapshots e2e spec passes, updated where it used the old viewer.

## User stories covered

13–16.

## Comments

- **2026-11-05, done** on branch `claude/friendly-ui-04-snapshot-viewer-68a4fe`.
  - **Built:**
    - **One shared viewer** (`components/snapshot/snapshot-viewer.tsx`, with its own CSS module) for the Chat and the Gallery. It shows the image whole on black, with a "1 / 2" count and a 44px × button.
    - **Gestures.** The image follows the finger. A sideways swipe of more than 50px moves to the next or previous Snapshot, with less give past either end. A downward swipe of more than 80px closes the viewer, and the backdrop fades as you drag.
    - **Keys.** The arrow keys step through the Snapshots, and Escape closes the viewer. Escape is ignored while the delete question is showing.
    - **Focus.** Focus moves to × on open, stays inside the viewer, and goes back to the thumbnail on close.
    - **Actions.** Below the image, in both places: when and who, Show prompt, Download, Retake (Chat only, while the Message is still in the Chat) and Delete with confirmation. The Gallery adds the jump to the Message or the "earlier version" mark.
    - **Chat:** the viewer swipes through the Chat's Snapshots in thread order (`inThreadOrder` in `lib/snapshot.ts`). In `chat-screen.tsx` only the viewer call changed.
    - **Gallery:** the viewer swipes through the current filter. Thumbnails are equal 2:3 black tiles with the whole image inside. The Gallery styles moved into `gallery.module.css`.
    - **Not changed:** `globals.css` is untouched, so its old snapshot and gallery rules are now dead. They were left in place to avoid merge conflicts at the file's tail; remove them after the wave merges. `keepFocusIn` is now exported from `components/sheet/sheet.tsx` so the viewer can reuse it.
  - **Tests:** `e2e/snapshot-viewer.spec.ts` runs at 390px with touch. Swipes are real CDP touch events.
    - **Chat:** opens the first of two Snapshots, swipes left to the second, then swipes down back to the Chat.
    - **Gallery:** the same through the filter, plus the arrow keys, the prompt and download, delete after confirming, and closing with a swipe down and with Escape.
    - **Existing spec:** `snapshots.spec.ts` passes without changes. Its "Close" and "Show prompt" buttons keep their names.
  - **Verified:**
    - `npm run typecheck` is clean.
    - `npm run test:api` passed 263/263 (20 files).
    - `npm run test:e2e` passed 30/30 on ports 3451/3452.
    - One earlier full run lost its API process partway through. A rerun passed in full.
  - **Review:** `/code-review` against master. Fixed:
    - focus trap and return
    - Escape during the delete question
    - right-button drags and lost pointer capture
    - prompt overscroll
    - thread-order helper
    - naming
    - the empty-state text

    Left as is:
    - pinch-zoom is blocked inside the viewer by `touch-action: none`, which swiping needs
    - the module styles the global `.button`/`.confirm` classes inside the action row
  - **Not done:** looking at it on the real Android phone, which is by hand per the spec.

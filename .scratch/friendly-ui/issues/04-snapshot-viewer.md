# Full-screen Snapshot viewer with swipe

Type: task
Status: ready-for-agent
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

- [ ] Playwright with touch at 390px: open the first of two Snapshots in a Chat, swipe left to see the second, then swipe down to get back to the Chat.
- [ ] Playwright: the same in the Gallery, plus delete from the viewer.
- [ ] The existing snapshots e2e spec passes, updated where it used the old viewer.

## User stories covered

13–16.

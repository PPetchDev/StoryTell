# A Cover the author sets for a Story

Type: feature
Status: done

## What to build

The user asked to set a cover for a Story ("ทำให้มันสามารถตั้ง cover ให้กับ story ได้ด้วย"). They chose every recommended option:

- **Where it comes from:** a Snapshot of the Story's Gallery, a Character's Reference image, or a picture uploaded from the phone. No generation, since each try costs money.
- **Where it shows:** the Home card (grid, Continue row and the card's sheet) and a banner at the top of the Story editor. A tap on the banner opens the Cover sheet.
- **Crop:** a focus point (`{ x, y }`, fractions of the picture's width and height), used as the CSS background position, so the point stays in view in every box shape (3:4 card, wide sheet, square Continue row).
- **Without a Cover:** as before. Home shows the newest Snapshot, or else the Story's gradient.

## Acceptance criteria

- [x] Migration `StoryCover1763600000000`: `cover_snapshot_id` (FK, SET NULL), `cover_character_id` (FK, SET NULL), `cover_image_path`, `cover_focus` jsonb, and a CHECK that at most one picture is set.
- [x] `PUT/DELETE /api/stories/:id/cover`, `PUT /cover/upload` (multipart `image`, 15 MB max, type read from the bytes), `PUT/DELETE /cover/focus`. Typed errors are listed in docs/error-codes.md.
- [x] Only an uploaded Cover owns its file. Replacing or clearing it, or deleting the Story, deletes that file. A Snapshot or Reference image is only pointed at, and its file is never touched.
- [x] A Character's Cover follows their Reference image when it is replaced, and goes when it is removed. Deleting the Snapshot that is the Cover clears the Cover.
- [x] An editor save never writes the Cover columns, so an older copy can't put back an older Cover.
- [x] Vitest: `apps/api/test/story-cover.spec.ts`. Playwright (390px, touch): `apps/web/e2e/story-cover.spec.ts`.
- [x] CONTEXT.md term **Cover**.

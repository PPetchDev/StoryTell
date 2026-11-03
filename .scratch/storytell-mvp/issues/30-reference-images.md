# Reference images for Characters

Type: task
Status: ready-for-agent
Blocked by: 18, 20, 21
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Generate candidates.** On the Character page, "Generate Reference image" makes 4 candidates: full-body, neutral pose, plain background, in the Story's Image style, drawn from Appearance. The author picks one. Its file is stored in the image folder, and its relative path is stored on the Character. Unpicked candidates are discarded.
- **Replace.** A new pick replaces the old Reference image and deletes the old file.
- **Offer to regenerate.** Editing Appearance or Image style shows an offer to regenerate, which is never forced.
- **Hidden in play.** The Reference image is shown only on the Character page: never in play, cast lists or the Gallery.
- **Credit.** Out of image credit blocks generation with a clear message; play is unaffected. Each image writes a UsageRecord in the image pool.
- **Deletes.** Deleting a Story or a Character deletes its Reference image file.

## Acceptance criteria

- [ ] API tests with the fake gateway:
  - 4 candidates are returned, and picking one stores exactly one file
  - re-picking replaces and deletes the old file
  - Story and Character deletion removes the file
  - out of image credit returns a typed error
  - the image-pool UsageRecords are written
- [ ] Playwright: generate, pick, and see the image on the Character page only.

## User stories covered

38–42.

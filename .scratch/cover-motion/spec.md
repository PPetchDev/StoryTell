# A moving Cover

Status: ready-for-human

The user wanted a Story's Cover to move, like a short looping animation on Home. A Cover could
already be a WebP, but two places flattened it to one frame:
- Home's thumbnails were made by sharp from the first frame only.
- The editor re-encoded every upload as a JPEG in the browser.

## Decisions

1. **An animated WebP is the moving Cover.** No new file type, column or endpoint: the existing
   `PUT /api/stories/:storyId/cover/upload` already takes WebP. A clip (for example, an image-to-video
   result) is turned into a looping animated WebP before it is uploaded.
2. **Thumbnails keep every frame.** The image store reads the file whole (so nothing holds it open
   on Windows), and when it has more than one page, it resizes all of them (`animated: true`). A
   still picture is made exactly as before, turned upright first.
3. **The editor sends an animated WebP as it is.** `preparedForUpload` spots one by its `RIFF…WEBP`
   header and an `ANIM` chunk near the start. A canvas would keep only the first frame, so it skips
   the re-encode for these files. Every other picture is re-encoded as JPEG as before, which also
   drops its metadata.
4. Where a Cover is shown full size (the editor, a Chat's Backdrop), the browser plays the original.

## Not in scope

- Video files (MP4/WebM) as a Cover.
- A setting to stop the motion. The browser's own reduced-motion handling is all there is.

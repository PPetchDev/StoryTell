# Spec: Upload a Reference image

Status: ready-for-agent

## Problem Statement

A Character's Reference image could only be generated. The author of The Moonfox of Selvaria already had approved portraits of every princess, drawn elsewhere in the look they wanted. To use one, they had to regenerate until something close came out, paying for each round, and the drawing model's style differed from their pictures. On 2026-11-20 the author asked for both: Generate, and Upload.

## Solution

- **Upload a picture** on the Character card, beside Generate. The author picks a PNG, JPEG or WebP from their own files, and it becomes the Reference image at once.
- **It is treated like a picked candidate.**
  - It replaces the Reference image and its file.
  - It resets the face square, so the Portrait goes back to the default until a face is picked again.
  - Expressions drawn from the old image read as outdated, so Draw all redraws them (.scratch/expression-drawing/spec.md).
- **The phone gets it ready first,** as it does for a Cover. It is turned upright, cut down to the Cover's longest side, and re-encoded as JPEG, which drops the photo's metadata. A see-through PNG gets a dark background behind it.
- **Refused, changing nothing:**
  - a file that is not a picture: the type is read from the bytes, not the name;
  - a request with no file;
  - a file over 15 MB;
  - a Character that is not in the Story.
- The hint without an Appearance now says either way works: write the Appearance to generate one, or upload your own picture.

## User Stories

1. As an author with my own picture of a Character, I want to make it their Reference image, so that their Portrait, Snapshots and Expressions start from the look I chose.
2. As an author, I want an upload to replace the old image as a new pick does, so that nothing is left over.
3. As an author on a 360px phone, I want the upload button to fit beside Generate.

## Implementation Decisions

- `PUT /stories/:storyId/characters/:characterId/reference-image/upload`, multipart field `image`, at most 15 MB. It answers the whole Story.
- It goes through the same `replaceReferenceImage` as a picked candidate, so files, the face square and cut-outs work as they do now.
- Error codes, the same as other picture uploads:
  - 415.002.009: not a PNG, JPEG or WebP;
  - 400.002.008: no file;
  - 413.002.010: over the limit;
  - 404: an unknown Character.
- The web button sits beside Generate and is unavailable while a round is generating or being picked.

## Testing Decisions

- API: `apps/api/test/reference-upload.spec.ts`. It covers:
  - the type read from the bytes;
  - the image is served;
  - a second upload replaces the file and resets the face;
  - the refusals change nothing.
- e2e: `apps/web/e2e/reference-upload.spec.ts`, at 360px. The author uploads a picture on the Characters tab and it shows as the Reference image.

## Out of Scope

- Cropping or editing the picture before upload. The face square is picked afterwards as usual.
- Uploading a Reference image for the Role or a Persona.

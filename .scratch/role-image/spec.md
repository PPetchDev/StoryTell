# Role image

Status: ready-for-human
Builds on: [Persona image](../persona-image/spec.md), which listed "A picture for a Story's Role" as out of scope.

The user plays Rin as a Story's Role, not as a Persona, and wanted Rin's picture (tails hidden)
on the Story. A Story could hold a picture only as its Cover. A Persona can have a picture, but
wearing one replaces the Role, so the Role's sections and placeholders no longer apply.

## Decisions

1. **The Role owns its picture**: a nullable `role.image_path`, the file at
   `role-images/story-<id>/picture-<random>.<ext>`, a fresh name for each upload. Replacing it,
   clearing it and deleting the Story each delete the file. Duplicate gives the copy a file of its
   own. The Role answers with `imagePath`.
2. **Upload** is `PUT /api/stories/:storyId/role/image`, a multipart form with the picture as
   `image`: at most 15 MB, PNG, JPEG or WebP read from its bytes. It answers with the Story.
   `DELETE` on the same path clears the picture, and is not an error when there is none. The
   errors are the image ones: no file `400.002.008`, not a picture `415.002.009`, too large
   `413.002.010`.
3. **Whose it is**: the path sits in a Story's folder, so it is served only to that Story's
   Account. The image-folder rule needs no change for this.
4. **In a Chat**: the Chat answers with `roleImagePath`. A user's line written as the Role (no
   Persona) shows it, round, 36 px, from the 320 px thumbnail, where the initial was. A line written
   as a Persona shows that Persona's picture as before. Without a picture, the initial shows.
5. **The editor**: a "Picture" card at the top of the Role tab with "Add a picture",
   "Change picture" and "Remove picture" (which asks first). The photo is made ready in the browser
   as a Cover's is: upright, at most 2,048 px, re-encoded, with its metadata dropped.
6. **No model reads it.**

## Not in scope

- Carrying the picture in a Character card.
- A picture in the identity swap menu, the Visual novel view, the Transcript or the Book.

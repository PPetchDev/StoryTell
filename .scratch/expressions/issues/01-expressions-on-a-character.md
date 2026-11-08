# 01 — Expressions on a Character: upload, square and remove

**Status:** ready-for-agent

**What to build:** The author gives a Character pictures for the seven emotions by uploading them in the Story editor, picks each one's square or keeps the Portrait's, and removes them. Duplicate copies them, and removing the Character or deleting the Story deletes their files. Per the spec's "The emotions", "Storage" (the `character_expression` table), "Authoring API" (upload, crop, remove, Reference image changes, removal, Duplicate) and "In the Story editor" (all but Draw):

- the `Emotion` and `ExpressionEmotion` types, defined in the API and mirrored in the web's types (there is no shared package);
- the migration;
- `expressions` on each Character in the Story response, with `outdated`;
- `ExpressionNotFoundError`;
- the Expressions section on the Character card: seven rows with thumbnail, Upload, Pick the face / Reset and Remove.

No drawing and no Chat display yet.

**Part of:** [Spec: Expressions](../spec.md)

**Blocked by:** None — can start immediately.

- [ ] API tests:
  - upload stores and answers the Expression; a wrong type and too big are refused with the Cover upload's codes;
  - a second upload replaces the file;
  - crop set and reset;
  - remove;
  - 404 for a missing Expression, and 400 for an emotion outside the seven;
  - removing the Character, and deleting the Story, delete the files;
  - Duplicate copies each Expression to a file of its own.
- [ ] e2e at 390px: uploading a Happy picture fills its row's thumbnail and survives a reload; Remove empties it after the confirm.
- [ ] `docs/error-codes.md` lists `ExpressionNotFoundError`, with the next free code at implementation time.
- [ ] A Story without Expressions answers and behaves as before. Typecheck and the whole suites stay green.

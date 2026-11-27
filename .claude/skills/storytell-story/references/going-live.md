# Putting a Story on live

Live is https://storytell.duckdns.org. Write to it only after the user says yes in this conversation, and say what will be written first. Another Claude session may be deploying. If it has said so, wait for its "done" message before writing.

## Why Chrome

The API needs the owner's sign-in. A direct `curl` gets 401. The user's Chrome is signed in to live, so the writes run as page scripts there:

1. Open any live page in the user's Chrome. Use the claude-in-chrome tools, and load them in one ToolSearch call.
2. Replace the page body with a temporary `<input type=file>`.
3. Load the files into it with the `file_upload` tool:
   - a payload JSON built from the draft;
   - the pictures.

   Each call takes at most about 10 MB: about 5 Expression files, or 6 Qwen PNGs.
4. A page script reads the input and `fetch`es `/api/...` with the session cookie.

Build the payload with a small Node script in the scratchpad. It parses the draft's sections and tables into the request bodies below. The old `parse-draft.mjs` and `build-payload.mjs` are gone, so write new ones.

## Order of calls

All routes are under `/api`. `:id` is the Story id from step 1.

1. `POST /stories`: Title, Setting, Opening, Style, Image style, Opening questions.
2. `PATCH /stories/:id/role`: name, description, sections and stats. Send the full sections list, because it replaces the old one.
3. `POST /stories/:id/characters`, once per Character. Then add her Secrets in two calls, a POST and then a PATCH, under `/stories/:id/characters/:cid/secrets`. The story response calls them `secretList`.
4. `POST /stories/:id/starting-bonds`, `/scenes`, `/sudden-events`, `/endings` (at most 6), `/lore`.
5. `POST /stories/:id/places`, once per Place: `{name, looks}`.
6. Pictures, each a multipart field `image`, a PNG, JPEG or WebP of at most 15 MB:
   - Character Reference: `PUT /stories/:id/characters/:cid/reference-image/upload`.
   - Reference cut-out: `PUT …/reference-image/cutout`.
   - Expressions: `PUT /stories/:id/characters/:cid/expressions/:emotion`.
   - Their cut-outs: `PUT …/expressions/:emotion/cutout`, or POST with `?with=own` or `?with=soft` to have the app cut them out.
   - Face square: `PUT …/expressions/:emotion/crop` for each Expression, and `PUT …/reference-image/portrait` for the Reference.
   - Role image: `PUT /stories/:id/role/image`.
   - Role Expressions: `PUT /stories/:id/role/expressions/:emotion`.
   - Cover: `PUT /stories/:id/cover/upload`. Afterwards, check that `?w=320` and `?w=640` still hold an `ANIM` chunk for a moving Cover.
   - Place pictures: `PUT /stories/:id/places/:pid/pictures/:light` (day, evening or night).

Before relying on a route, check it in `apps/api/src/api/**/*.controller.ts`. The app changes often.

## After writing

- Open each editor tab of the new Story in Chrome and check every section is there.
- Close the tab you used.
- Tell the user the Story's number and what is still empty.
- Back up anything you replace on live first. The VM keeps backups in `/srv/storytell/backup/`; see `memory/oracle-live-vm.md`.

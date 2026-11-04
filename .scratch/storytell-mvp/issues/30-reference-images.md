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

## Comments

**Built (agent, 2026-11-04).** On branch `claude/busy-wozniak-260d5b`, on top of master f34df02 (tickets 19–22, 24). `Status:` is left for the user.

- **Routes** (`apps/api/src/api/reference-image/`, under `/api/stories/:storyId/characters/:characterId/reference-image`):
  - `POST .../candidates` → 201 `{ candidates: [{ id }], failed, failureMessage }`. Four `reference_image` calls run in parallel with one prompt; the images are held in memory (one round per Character, replaced by the next round, dropped after 30 minutes or past 12 rounds) and never written to the image folder. If some of the four fail, the ones that came back are returned with `failed` and the first failure's message; if all fail, the typed error is the answer.
  - `GET .../candidates/:candidateId` → the candidate's bytes (`Cache-Control: no-store`).
  - `PUT .../reference-image` `{ candidateId }` → 200 whole Story. The file goes to `IMAGE_DIR/reference-images/story-<id>/character-<id>-<token>.<ext>` (a fresh name per pick, so browsers never show the replaced one from cache), the path is written on the Character, the old file is deleted after the new one is recorded, and the round is dropped.
  - `DELETE .../reference-image` → 200 whole Story, file deleted. (Small addition beyond the ticket: a way back to "drawn from text alone" without removing the Character.)
- **Prompt** (`apps/api/src/manager/reference-image/prompt.ts`): one adult Character, full-body, neutral relaxed standing pose facing the viewer, plain single-colour background, no text; `Art style: <Image style>` (default "realistic, natural lighting" when empty); the Appearance restated in full ("every trait of which must be shown exactly as written"). Name included when set.
- **Modules:** `ReferenceImageManagerService` (generation, held rounds, credit check) → `StoryManagerService.replaceReferenceImage` / `removeReferenceImage` (file write, path, old-file delete), so the Story authoring module owns the file along with `deleteStory` and `removeCharacter`, which now delete the files. `ImageStoreService` gained `write`, `remove` and `extensionFor`.
- **Credit:** generation first asks the gateway's remaining image credit and refuses with `402.001.004` when it is known and 0, without a call; a 402 from Venice maps to the same code. The Chat path is untouched, so play goes on (test: a Chat starts with image credit at 0). Each answered image is one image-pool UsageRecord from the real gateway: `reference_image`, `qwen-image-3`, `venice`, 1 image, $0.04 list, the Story id.
- **Data:** migration `1762900000000-CharacterReferenceImage` adds `character.reference_image_path` (text, NULL). `CharacterResponse` carries `referenceImagePath` (string | null).
- **Errors** (domain 002): `404.002.003` `ReferenceCandidateNotFoundError` (picked, replaced, expired, or never made), `422.002.004` `NoAppearanceError`.
- **Frontend:** `apps/web/components/story-editor/reference-image.tsx` (new, its own component) under the Appearance field of the Character card: the current image (`/api/images/<path>`, 2:3, 12rem), "Generate Reference image" (4 candidates in a grid, "Use candidate N", "Generate again", "Discard candidates"), the out-of-credit message ("Play is unaffected") with Retry, and "Remove Reference image" after confirming. Pending field edits are flushed before a round, so the prompt uses what was just typed; a pick runs through the autosave chain and replaces the Story. **Offer to regenerate:** once the Appearance or the Image style differs from what the current image was made from (as this page saw it), a notice offers "Generate a new one" / "Not now"; it is never forced. `character-card.tsx`, `story-editor.tsx`, `lib/story.ts`, `globals.css` (appended), `migration/index.ts` and the Story response DTO got small append-style edits; `entities.ts`, the Chat code and `manager/story-drafting/` are untouched.
- **Hidden in play:** the path travels in the Story response, but only the Character card renders it; the home list, the Chat list and the Chat screen show no image (the Playwright test checks all three).

**Verified:**
- `npm run typecheck`: clean for both apps.
- `npm run test:api`: 139 passed (126 before + 13 in `test/reference-images.spec.ts`): 4 candidates with one prompt carrying the Appearance, Image style, full-body, neutral pose and plain background; nothing in the image folder until a pick, then exactly one file holding the picked bytes, served at `/api/images/<path>`, and the round gone (404.002.003 for every candidate, the picked one included); re-pick replaces and deletes the old file; a newer round discards the older one and a candidate belongs to its Character; empty Appearance → 422.002.004 with no call; the default style; Character delete, Story delete (two Characters) and Remove delete the files; out of credit known from the provider → 402.001.004 without a call; Venice 402 → 402.001.004 and a Chat still starts; a partial round (3 of 4) keeps the three; all failed → 502.001.001; through the real gateway on recorded Venice answers, four image-pool UsageRecords at $0.04 against the Story and `GET /api/usage` showing $0.16, 4 calls.
- `npm run test:e2e` (on `E2E_WEB_PORT=3121` / `E2E_API_PORT=4121`, since 3101/4101 had just been used by another worktree): 10 passed (9 before + `e2e/reference-image.spec.ts`): generate, four candidate images loaded, nothing stored yet, pick candidate 2, the image on the Character page with its `/api/images/reference-images/...` src loaded, four `reference_image` calls with the Appearance and Image style in the prompt, editing Appearance shows the offer, "Not now" dismisses it with the image kept and no new call, it survives a reload, and no Reference image on the home screen, the Chat list or a Chat.
- **Venice smoke, one round through the built gateway with the key from `.env` (2026-11-04):** 4 × `qwen-image-3`, JPEG, 176–190 KB each, 7.8–9.3 s per image, 9.3 s wall clock for the round (they run in parallel), $0.16 at list price, 4 UsageRecords. Prompt: Mira, "ink wash, muted colours". All four are full-body, neutral standing pose, facing the viewer, plain beige background, the same woman: black hair tied back, grey-green eyes, dark wool coat over a grey knit jumper, worn boots. The scar is on the left eyebrow in all four; in one it is drawn as a fresh red cut rather than faint and old (what ticket 18 saw too). The four are close variations of one composition rather than four different takes, which is fine for picking a face. The files stayed in the session scratchpad, outside the repo.

**Not verified / notes:**
- Candidate rounds live in the API process: an API restart drops them, and the page then says "Those candidates are gone. Generate again to pick one." No file is ever left behind.
- The offer to regenerate compares against the look as the page loaded or last picked; nothing records what the stored image was drawn from, so a reload clears the offer. Storing that would need another column; left out, as the ticket asked for the path column only.
- Image credit still reads as unknown without `VENICE_ADMIN_KEY`, so the pre-check only blocks when the balance is readable; the provider's 402 covers the rest.
- A round costs $0.16 (four separate Venice calls, so four seeds); the UI says "Generating 4 candidates…" while it runs, about 10 s.
- For ticket 31: a Character's Reference image is `character.referenceImagePath`, readable with `ImageStoreService.open(path)`; `MAX_REFERENCE_IMAGES` is 3 per Snapshot.

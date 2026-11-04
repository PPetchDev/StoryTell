# Write a Story by hand

Type: task
Status: resolved
Blocked by: 19
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

The Story editor without AI: create, edit, autosave and delete a full Story.

- **Story:**
  - Title, Setting, Opening
  - Style: POV (1st/2nd/3rd), tense (past/present), reply length (short/medium/long), Image style (free text)
- **Role** (exactly one): Name and Description, required.
- **Characters** (1–6, ordered and reorderable):
  - Name, Appearance, Personality, Voice
  - Example lines (an ordered list)
  - Background, Secrets (one text block), Arc directions (one text block)
- **StartingBonds:** from a Character toward the Role or another Character, with a label and a description. At most one per direction. A Character with none starts as a stranger.
- **Scenes** (ordered and reorderable): name, situation/goal, move-on condition. Only the last Scene may leave the condition empty.
- **Autosave**, with no draft/published state.
- **Playable status** is derived and lists the missing required fields.
- **Delete Story** after confirmation, removing everything under it. Chats, Gallery and Reference images don't exist yet; extend the cascade in the tickets that add them.
- A Stories list on the home screen.

## Acceptance criteria

- [x] API tests:
  - playable status flips exactly when every required field is filled
  - a 7th Character is rejected
  - only the last Scene may leave its condition empty
  - a second StartingBond in the same direction is rejected
  - reordering persists
  - deleting a Story removes it and everything under it
- [x] Playwright: create a Story by hand, see it become playable, reload, and the edits persist.

## User stories covered

4, 11–28, 36 (partial cascade).

## Comments

**Built (agent, 2026-11-04).** On branch `claude/dazzling-wiles-340acc`, on top of master with ticket 19. `Status:` is left for the user to close.

- **Schema:** migration `1762400000000-StoryAuthoring` (timestamp kept well apart from ticket 20's) adds the Story's Setting, Opening and Style columns (`pov`, `tense`, `reply_length` as enums with defaults 2nd person / past / medium, `image_style` text) and the tables `role`, `character`, `starting_bond` and `scene`, all `ON DELETE CASCADE` from `story`. Characters and Scenes carry a `position`. `starting_bond.to_character_id` is NULL for "toward the Role", and `UNIQUE NULLS NOT DISTINCT (from_character_id, to_character_id)` plus a check against self-bonds back the manager's rules in the database.
- **Entities** (`apps/api/src/model/story/entities/`): `StoryEntity`, `RoleEntity`, `CharacterEntity`, `StartingBondEntity`, `SceneEntity`, each with `toResponse()`. Relations use string targets and `import type`, because NestJS 12 is ESM with `isolatedModules` and TypeORM's `Relation<T>` otherwise trips TS1272. Nothing auto-loads; `StoryModelService.findFull()` opts into the four relations and sorts the lists by position.
- **Rules** live in `StoryManagerService` (`apps/api/src/manager/story/`), with `playable.ts` as the pure derivation. A Story is born with its Role. Playable needs: title, Setting, Opening, Role name and description, at least one Character, each Character's name, appearance, personality and voice, each Scene's name and situation, and each Scene's move-on condition except the last one's. Whitespace counts as empty. Optional: Image style, example lines, background, secrets, Arc directions, StartingBonds and Scenes. The Scene rule ("only the last may leave the condition empty") and the Role's required fields are reported through the playable status rather than rejected on write, so autosave never fights the author mid-sentence; the 7th Character (`422.003.005`), a duplicate StartingBond direction (`409.003.006`), a self-bond (`422.003.007`) and a bad reorder (`422.003.008`) are rejected. Codes are in `docs/error-codes.md` under domain 003.
- **API** (`/api/stories`): `GET` list (summaries with `playable`), `POST`, `GET/PATCH/DELETE :storyId`, `PATCH :storyId/role`, `POST/PATCH/DELETE` for `characters`, `starting-bonds` and `scenes`, and `PUT :storyId/characters/order` and `PUT :storyId/scenes/order` that take every id in the new order. Every write answers with the whole Story plus `playable` and `missing: [{ field, label }]`, and bumps the Story's `updatedAt`. `DELETE :storyId` is 204 and cascades through the database; ticket 24 extends the cascade to Chats, and the Gallery and Reference images follow in theirs.
- **Frontend:** the home screen lists Stories with a Playable pill and a New Story button; `/stories/[id]` is the editor (`apps/web/components/story-editor/`). Field edits are debounced 600 ms per field and sent one after another (`autosave.ts`); structural changes (add, remove, reorder, Bonds) flush pending edits first and then replace the local Story with the API's answer. A status line shows Unsaved changes / Saving… / Saved / Couldn't save. Characters, Scenes and example lines reorder with up/down buttons. Removing a Character or Scene and deleting the Story confirm in place (no browser dialog), and deleting returns to the home screen.

**Verified:**
- `npm run typecheck`: clean for both apps.
- `npm run test:api`: 33 passed (12 from ticket 19 + 21 new in `test/story-authoring.spec.ts`): create and list; 404 for an unknown Story; every Story, Style and Role field saved, a Style value outside its set rejected; the missing list on a fresh Story; playable flips exactly when the last required field is filled and back when one is emptied; optional fields not needed; every Character field with example lines in order; the 7th Character rejected; removing a Character removes its StartingBonds both ways; a second StartingBond in the same direction rejected (toward the Role and toward a Character are separate directions); self-bond and cross-Story bond rejected; Bond edit and remove; only the last Scene may leave its condition empty (including after a reorder); Scene name and situation required; Scene remove; Character and Scene reorder persist and a non-permutation is rejected; `updatedAt` bumps on nested edits; delete removes the Story and every row under it and leaves other Stories alone.
- `npm run test:e2e`: 5 passed (4 from ticket 19 + `story-editor.spec.ts`): create a Story from the home screen, fill it by hand, watch the missing list shrink and the status turn Playable, add Scenes and see the move-on rule, reload with every edit intact, see it listed as Playable, then delete it after confirming.
- `npm run dev` and a look at the editor in the browser.

**Notes for later tickets:**
- Ticket 22 can build drafting on `StoryManagerService` (the same `*Fields` inputs the DTOs implement) and reuse `playableStatus()`; ticket 24 should reject send on `playable === false` with the `missing` labels.
- The merge with ticket 20 touches `migration/index.ts`, `entities.ts` and `docs/error-codes.md` (domain 003 taken here).
- The editor keeps what the author typed and takes only the status from field saves, so a save answer never overwrites a later keystroke. Edits made while a structural change is in flight are the one gap.

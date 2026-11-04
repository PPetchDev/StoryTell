# Draft a Story from an idea, and rewrite a field

Type: task
Status: resolved
Blocked by: 20, 21
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Draft from idea.** On "New Story", the user types an idea of any length. One play-model call (GLM-5.3) returns a structured Story:
  - every required field: Title, Setting, Opening, Style, Role, and 1–6 Characters
  - optional fields (Scenes, Secrets, StartingBonds, Arc directions) only when the idea implies them

  The backend validates the shape before saving. An invalid result shows an error with Retry.
- **Rewrite this field.** A button on every field regenerates just that field, with the whole Story as context.
- Both calls write UsageRecords against the Story.

## Acceptance criteria

- [ ] API tests with the fake gateway:
  - a valid draft is saved and is playable
  - optional fields absent from the draft stay empty
  - an invalid draft (0 or 7 Characters, a bad Style value, unparseable output) is not saved and returns a typed error
  - a field rewrite changes only that field
  - a gateway outage returns an error with Retry, never a silent model switch
- [ ] Playwright: idea → draft → playable Story on screen.

## User stories covered

1, 2, 3, 5.

## Comments

**Built (agent, 2026-11-04).** On branch `claude/stoic-lewin-6d7998`, on top of master with tickets 19, 20 and 21. `Status:` is left for the user.

- **Draft from idea.** `POST /api/stories/draft` with `{ idea }` (any length up to 50k characters; blank → `422.005.003`). The manager (`apps/api/src/manager/story-drafting/`) creates the Story first so the call's UsageRecord points at it, makes one `story_draft` call in JSON mode (`maxTokens` 8000, `servedFor.storyId`), and validates the answer in `draft-schema.ts` before anything is written: title, Setting, Opening, Role name and description, 1–6 Characters each with name, appearance, personality and voice; Style values in their sets (defaults when absent); optional fields (Image style, example lines, background, secrets, Arc directions, StartingBonds, Scenes) only when present. StartingBonds name Characters (`from`, `toward` or `"role"`); unknown names, a self-bond or two in one direction are invalid. A draft that fails is not saved (the born Story is deleted again) and answers `502.005.002` (invalid) or `502.005.001` (no JSON object); a code fence or sentence around the object, and one wrapping key (`{"story": {...}}`), are tolerated. A valid draft is written through `StoryManagerService` (same rules as the editor), so it answers with `playable` and `missing` like every authoring write. The raw model text of a failed draft goes to the API log (warn).
- **Rewrite this field.** `POST /api/stories/:id/rewrite` with `{ target: story | role | character | startingBond | scene, id?, field }` makes one `field_rewrite` call with the whole Story rendered as text plus the field's current value, and writes the answer to that field only (`updateStory`/`updateRole`/…); fences and wrapping quotes are stripped, an empty answer is `502.005.001`, a non-text field `422.005.004`. Rewritable: title, setting, opening, imageStyle; role name/description; Character name, appearance, personality, voice, background, secrets, arcDirections; Bond label/description; Scene name, situation, moveOnCondition.
- **Prompts** (`prompts.ts`): both calls share a frame that says the Story is adult fiction between fictional adults for one consenting adult reader, with every Character and the Role adults, and describes each field in the glossary's words (Story, Setting, Opening, Style, Role, Character, StartingBond, Scene, Arc directions, Snapshot). The draft prompt gives the exact JSON shape and asks for the idea's language; the rewrite prompt asks for the new text only.
- **Error codes:** new domain `005` in `docs/error-codes.md` (`502.005.001`, `502.005.002`, `422.005.003`, `422.005.004`). Ticket 24 takes `004`.
- **Frontend.** "New Story" on the home screen opens a panel (region "New Story") with an Idea textarea, "Draft from idea", "Start blank" (the ticket 21 path) and Cancel; a failed draft shows the API's message with Retry on the same idea, and a successful one opens the editor. Every text field in the editor (`TextField`) has a small Rewrite button (named by `title`, e.g. "Rewrite Setting", so field labels stay unique for tests); it goes through the autosave chain after pending edits (`commit` now takes an `onError`), shows "Rewriting…", replaces the Story with the answer, and on failure shows the message with Retry under that field. `lib/story.ts` gained `storyApi.draft` and `storyApi.rewrite`.
- **E2E harness:** the API's output is now kept in `apps/web/test-results/api.log` after a run (it used to be discarded), because one earlier run lost the API mid-suite without a trace and the cause could not be read. It did not recur in the two runs since.
- README has a "Story drafting" section. No migration was needed.

**Verified:**
- `npm run typecheck`: clean for both apps.
- `npm run test:api`: 98 passed (80 before + 18 in `test/story-drafting.spec.ts`): a valid draft saved and playable, served for the Story, in JSON mode; the prompt carries the idea, the adult-fiction line and the glossary words; optional fields absent stay empty; optional fields, Bonds by name (toward the Role and a Character, case-insensitive) and Scenes in order saved; a fenced draft read; 0 Characters, 7 Characters, `pov: "fourth"`, a blank required field, a Bond to a stranger or to itself, and two unparseable outputs each rejected with their code and nothing saved; a blank idea rejected without a call; an outage passed through as `502.001.001` with nothing saved, exactly one call of one kind and no reply left scripted; a rewrite of the Setting changes only that field and sends the whole Story; rewrites of a Character's voice, a Scene's situation, a Bond's label, the Role's name and the Image style each change that field only; a non-text field and unknown Character/Story refused without a call; an empty answer and an outage leave the field as it was; and, through the real gateway on recorded responses, one UsageRecord per call (`story_draft`, `field_rewrite`) with the Story's id and the fixture's cost.
- `npm run test:e2e`: 8 passed (6 before + 2 in `e2e/story-draft.spec.ts`): New Story → idea → a scripted outage shows the error with Retry → Retry drafts → the editor shows the drafted Title, Setting, Opening, Style, Role, Character with Secrets, Bond and Scene and reads Playable; both calls carried the idea; Rewrite Setting fails once with Retry under the field, then lands in that field only with "Saved" and survives a reload; the home list shows Playable. Second test: an invalid draft (0 Characters) shows the error, saves nothing, and Retry on the same idea succeeds. The ticket 21 editor test now clicks "Start blank".
- **Manual drafts with the real key (2026-11-04, GLM-5.3 on DeepInfra through the built API, `.data/manual-draft.mjs`, not committed):**
  1. First call: HTTP 502 `502.005.002` "the Story needs a title" after 2.1 s, $0.000581. The answer was short and the raw text was not yet logged, so its shape is unknown; the warn log for failed drafts and the one-key unwrap were added after it.
  2. Second call, same idea (a lighthouse keeper, Mira who put the lamp out, her silent brother Tomas, three stages): HTTP 201 after 40.6 s, $0.00376, playable. Title "The Lamp Goes Dark at Widow's Reach"; a gothic Setting; a second-person Opening ending on Mira's line; Style second/past/medium with an Image style; Role "Edwin Hale" with a description; two Characters with appearance, personality, voice, 2–3 example lines, background, secrets and Arc directions each; one StartingBond each toward the Role; three Scenes with move-on conditions on the first two and none on the last. Text credit after: $4.528042.

**Not verified / notes:**
- The field rewrite was not run against the real model (one-call budget); it is covered by the fake and recorded-response tests only.
- The first real call's failure is unexplained (one short, title-less answer). If it recurs, the API log now holds the model's text.
- A rewrite replaces the whole Story in the editor when it lands (after pending edits are flushed), so text typed in another field during the call is the same gap ticket 21 noted for structural changes.
- The born-then-deleted Story of a failed draft leaves its `usage_record` row with a `story_id` that no longer exists, by design (records outlive what they served).

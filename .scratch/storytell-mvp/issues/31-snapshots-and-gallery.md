# Snapshots and the Gallery

Type: task
Status: ready-for-agent
Blocked by: 25, 28, 30
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Camera button** in the Chat, acting on the latest AI Message, with an optional one-line hint. Each press makes one Snapshot; there are no automatic ones.
- **Image prompt.** A V4 Flash call writes the prompt from the latest Messages, Appearance, Setting, Memory, Image style and the hint. It picks at most 3 Characters in frame, using the hint's names if it gives any. The prompt is always first-person from the user's point of view, never draws the user beyond glimpses such as hands, and depicts only fictional adult Characters.
- **Image call.** The image model makes one fixed 2:3 image, with the in-frame Characters' Reference images as references. A Character without one is drawn from text alone.
- **While it generates.** A transient job shows as a placeholder under the Message, and play continues. On success a Snapshot record is stored:
  - image path
  - prompt used
  - hint
  - image model and cost
  - Characters drawn (reference plus stamped name)
  - Chat link and Message link
  - created at

  On failure nothing is stored and the user gets an error with Retry, never a silent provider switch.
- **In the timeline.** Snapshots show inline under their Message, and a tap opens full screen, where the stored prompt is viewable. Retakes add more Snapshots to the same Message.
- **Gallery** per Story:
  - newest first, filterable by Chat
  - grid, full screen, delete (removes the record and its file), and download one image
  - items without a Message link are marked "from an earlier version of this Chat"; linked items jump to their Message
- **Links on edit, reset and delete.** Edit and reset clear the Message link of Snapshots of the edited or discarded Messages. Deleting a Chat clears both links. Removing a Character keeps the stamped name and clears that Character's link. Deleting a Story deletes its Gallery files.
- **Isolation.** Snapshots are never sent to the text model and never write ledger records.
- **Credit and usage.** Out of image credit disables only the camera. Both calls write UsageRecords: the prompt call in the text pool, the image in the image pool.

## Acceptance criteria

- [ ] API tests with the fake gateway:
  - a success stores the record and file with at most 3 Characters
  - the hint's names override the prompt writer's choice
  - a failure stores nothing
  - retakes attach to the same Message
  - edit, reset, Chat delete and Character removal clear the right links and keep the Gallery item
  - Snapshot delete removes the file
  - Story delete removes all files
  - the turn prompt never contains Snapshot data
  - out of image credit blocks only Snapshots
- [ ] Playwright: take a Snapshot, see the placeholder and then the image, reset the Chat, and find the Snapshot in the Gallery marked as from an earlier version.

## User stories covered

109–124, 131.

## Comments

- 2026-11-04: **Backend done, frontend not started (session hit its usage limit).** Committed on `claude/magical-raman-30a4ee`.
  - **Built (API):** migration `1763400000000-Snapshots` (`snapshot` with `story_id` CASCADE, `chat_id`/`message_id` SET NULL; `snapshot_character` with link SET NULL plus stamped name); `SnapshotModelService`; `SnapshotManagerService` (in-memory jobs: take → V4 Flash `snapshot_prompt` in JSON mode → image call with in-frame Reference images → file under `snapshots/story-N/` → record; failures keep the job with its typed error for Retry/dismiss, nothing stored); `manager/snapshot/prompt.ts` (hint names win, at most 3, first person from `wornIdentity`, non-archived Memory through `renderUser`, every in-frame Appearance restated server-side); routes `POST/GET stories/:id/chats/:chatId/snapshots`, `snapshot-jobs/:jobId/retry`, `DELETE snapshot-jobs/:jobId`, `GET stories/:id/gallery?chatId=`, `GET/DELETE stories/:id/snapshots/:id`, `GET .../download`; `ChatDetail.imageCreditOut`; AI Message edit clears its Snapshots' Message link (other cases via FK); Story delete removes Gallery files; error codes `404.002.005`, `404.002.006`, `409.002.007`.
  - **Decision to review:** the edit models need a base image, so a Snapshot with no Reference image in frame goes to the Settings model's text-to-image sibling (`seedream-v4` for `seedream-v4-edit`, $0.05, read from Venice `/models`; `qwen-image-3` for `qwen-edit-uncensored`). Chosen up front, recorded as the Snapshot's image model; not a fallback on failure.
  - **Verified:** `apps/api` typecheck clean; `test/snapshots.spec.ts` 19 passed (8 runs in a row green after fixing two order/isolation flakes); `cast-and-scene-changes.spec.ts › Remove a Character` 2 passed with the new Snapshot case; Venice contract gained a text-only Snapshot case (not run separately).
  - **Not done:** full `npm run test:api` run; frontend (camera button + hint, placeholder/error with Retry under the Message, inline Snapshots, full screen with prompt, Gallery page, `characterRemovalWarning` extended to Snapshots); Playwright test; `npm run test:e2e`; the real Venice round; `apps/web/lib` types for the new routes.
- 2026-11-04: **Ticket complete: frontend, browser test and a real Venice round.** This entry supersedes the "Not done" list above.
  - **Built (web):**
    - `lib/snapshot.ts`: types and client for the Snapshot routes.
    - Chat screen (`components/chat/snapshots.tsx`):
      - The camera: a one-line hint and "📷 Snapshot", acting on the latest AI Message. It is disabled while a turn or an edit is written, and when `imageCreditOut` it shows "Snapshots are off: image credit is used up. Play goes on."
      - A pulsing 2:3 placeholder under the Message while the job runs, polled every 1.5 s; play continues.
      - A failed job shows its error with Retry and Dismiss.
      - Snapshots show inline under their Message. An edit or reset re-reads them, so the ones whose Message went leave the timeline.
    - `components/snapshot/snapshot-viewer.tsx`: the full-screen view, with Show prompt, Download, Delete after confirming, and Retake of the same Message (added to it).
    - Gallery page `/stories/[id]/gallery` (`?chat=` pre-filters), linked from the Chats page and the Chat screen: newest-first grid, filter by Chat, full screen, delete, download. Unlinked items are marked "From an earlier version of this Chat"; linked ones get "Go to its Message →".
    - `characterRemovalWarning` now says "Past lines and Snapshots keep the name …".
  - **Test-only change:** a scripted fake image reply takes `delayMs`, so the browser test can see the placeholder.
  - **Prompt change after the real round:** the image prompt now also says no head, hair, back or shoulder of the user is in the foreground. The writer is told not to quote dialogue. Not re-tried against Venice.
  - **Verified:**
    - `npm run typecheck` is clean.
    - `npm run test:api`: 247 passed (18 files). Master had 227, plus 19 in `test/snapshots.spec.ts` and 1 Venice contract case. The Remove a Character case was extended, not added.
    - `npm run test:e2e` on ports 3801/4801: 17 passed (16 plus `e2e/snapshots.spec.ts`).
    - Two earlier full runs failed only `cant-connect.spec.ts` (2 tests). The page reload-looped on the first `goto('/')` while files in this worktree changed; it passed alone and in the final clean run.
  - **Real Venice round** (2026-11-04, 2 Snapshots, about $0.10 image and $0.0001 text):
    - **How it ran:** a scratch script ran the built `manager/snapshot/prompt.ts` and `RealModelGateway` with the keys from the main checkout's `.env`. It skipped the HTTP and database layers. The Story was the ticket 18 anime Mira, with her stored anime Reference image, plus a Kai with no reference. Style: "anime, soft colours, flat line art". Images stayed in the session scratchpad, not in git.
    - **Mira, with reference** (`seedream-v4-edit`):
      - The prompt call took 5.6 s ($0.0000675) and the image 24.4 s ($0.05).
      - The traits held: same face, the scar through the eyebrow, grey-green eyes, black hair tied back, olive skin and lean build.
      - Memory reached the image: the grey wool jumper under the oilskin coat, and the silver ring on a cord.
      - The setting held: the lamp room with its lens, rain, amber light.
      - Issue: the viewer showed as an out-of-focus head and shoulder in the foreground, over the shoulder rather than first person. This led to the prompt change above.
    - **Kai, text only** (`seedream-v4` via `/image/generate`):
      - The prompt call took 4.1 s ($0.000046) and the image 11.8 s ($0.05).
      - Red curls, freckles, pale blue eyes, the oilskin, the jetty and the boat all came out right. First person was correct, with only the viewer's hands at the frame edges.
      - Issue: "a gold front tooth" became a full gold grin, and he winks.
    - **UsageRecords:** one per call, in the right pools: `snapshot_prompt`/text/deepseek-v4-flash and `snapshot_image`/image with the model actually used.
  - **Not done:** a real round through the running app (HTTP plus database), and a retry of the tightened first-person wording against Venice.

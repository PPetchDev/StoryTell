# Branch a Chat from any Message

Type: grilling
Status: resolved
Blocked by: none

## Question

Should the user be able to copy a Chat up to any Message and play on from there as a new Chat, leaving the original untouched — and if so, what comes along with the copy?

## SillyTavern

"Branch" makes an unnamed copy of the chat up to the chosen message and opens it; "Checkpoint" makes a named copy and links the two so the user can jump back.

## Storytell today (checked 2026-11-08)

- The only way back is editing an earlier Message, which discards every Message after it (`CONTEXT.md` Message; `PATCH chats/:chatId/messages/:messageId`, `apps/api/src/api/chat/chat.controller.ts:138`). Reset empties the Chat. Reply versions exist only on the newest AI Message.
- The MVP map ruled "Branch on messages" out of scope; the swipe spec ruled out "Branching Chats from a version".
- A Chat's state lives in: `message` + `message_part` + `reply_version`; `memory` + `memory_known_by` + `memory_change`; `bond_change`; `arc_step`; `chat_arc_direction`; `scene_advance`; `time_change`; and on `chat` itself `current_scene_id`, `time_of_day`, `persona_id`, `story_so_far*` (`apps/api/src/model/chat`, `model/ledger`, `model/memory`). Every AI change already records its causing Message, and newest-first rollback exists for edit and Regenerate — so "copy everything, then roll the copy back past Message N" reuses machinery that works today.
- Snapshots point at `chat_id`/`message_id` through nullable links and belong to the Story's Gallery.

## Options

- **A. Branch only** — "Branch from here" on any Message makes "<title> (branch)" holding Messages 1…N with Memory, Bonds, Arcs, Scene and Time of day as they stood at N, and opens it. The original Chat is untouched. Story so far is copied only if it covers no Message past N, otherwise dropped (rewritten when needed). Snapshots stay where they are.
- **B. Branch + Checkpoints** — A, plus named checkpoints and a tree linking branches to their parent.
- **C. Not now.**

## Recommendation

A, now. It answers the concrete wish (replay "The Young Master" without deleting anything) with machinery that already exists; B's tree is navigation sugar a single player with a Chat list doesn't need yet.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: **Branch** (option A) — "Branch from here" on any Message copies the Chat up to it, with Memory, Bonds, Arcs, Scene and Time of day as they stood there (the Story so far comes along only if it covers nothing past that Message, since its history isn't kept; otherwise it is written afresh), into a new Chat that opens at once; the original is untouched. The new Chat shows which Chat it branched from (a link, not a tree). No named checkpoints.

Spec and tickets: [.scratch/branch/](../../branch/spec.md).

# Memory: extraction, the drawer and rollback

Type: task
Status: ready-for-agent
Blocked by: 27
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Extraction call.** A V4 Flash call in JSON mode after every turn, run in parallel with the judge. Its input is the latest user Message, the AI reply, the current Memory list (ids, Known by, locked flags) and the Characters present. It returns operations: add, update, delete, merge, archive, and add-to-Known-by. It has its own background status, which the send gate (ticket 27) also waits on.
- **Backend rules:**
  - Update, delete, merge and archive operations on locked Memories are ignored. Known-by additions on locked Memories are allowed.
  - Names are never removed from Known by by the AI.
  - Over the cap (~2k tokens, tunable), the call is asked to merge and archive. Locked Memories are never archived automatically.
  - A merge is recorded as deletes plus an add under one cause.
  - Every change goes into the ledger with before and after values and its causing Message.
- **Memory record:** text (with `{user}`), Known by, written by (AI or user), locked, archived, causing Message.
- **User actions**, not tied to a Message:
  - add, known by the Characters present
  - edit, which locks
  - delete
  - restore from Archived, which locks
- **Rollback.** An AI-added Memory from a discarded Message goes, even if the user has since edited it. Memories the user wrote from scratch stay. Updates, deletes, archiving and Known-by additions revert. Reset empties all Memory.
- **Prompt layer.** The Memory block carries every non-archived Memory with its Known-by tags, under the instruction that a Character knows only its tagged Memories. It is placed after the fixed layers and before recent Messages, in a stable order. `{user}` is rendered as the worn identity's name.
- **Memory drawer** on the Chat screen. Each Memory shows its text, Known-by chips, AI or user author, a lock on locked ones, and a jump-to-message link. Archived Memories sit in a collapsed section.
- **Toast.** A "Memory added" toast appears for each AI add when the status turns done. Tapping it opens that Memory.
- Extraction writes a UsageRecord.

## Acceptance criteria

- [ ] API tests with scripted extraction output:
  - locked Memories reject update, delete and archive but accept a Known-by addition
  - merge and archive are recorded and revert correctly
  - edit-rollback removes an AI-added Memory the user edited, and keeps one the user wrote from scratch
  - restoring from Archived locks the Memory
  - reset empties Memory
  - the prompt renders `{user}` as the current identity and omits archived Memories
- [ ] Playwright: a toast appears after a turn and opens the Memory; add a Memory by hand and see it locked; jump to its causing Message.
- [ ] The first real-model check of extraction quality and the cap is recorded in `## Comments`. This is a manual check, not automated.

## User stories covered

48, 61, 79–94.

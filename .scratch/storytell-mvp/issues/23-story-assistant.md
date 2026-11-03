# Story assistant with Undo

Type: task
Status: ready-for-agent
Blocked by: 22
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- An assistant chat beside the Story form. Each instruction ("give Mira a sister", "add Scenes") is one stateless call with the current Story plus the instruction. The call returns a structured set of field changes, which may add Characters or Scenes.
- The backend applies the changes straight to the Story. The client highlights the changed fields and offers Undo for each change.
- Undo lives only in the client while the page is open. Nothing about it is persisted. Undo restores field values; it can't bring back a removed Character.
- The assistant keeps no history. Each opening starts fresh.
- It is available on every Story, including ones with Chats. A change that would remove a Character or Scene goes through the same warning as a manual removal before it applies (see ticket 29 for the effects on Chats).

## Acceptance criteria

- [ ] API tests: applying an assistant change set updates only the named fields; adding a Character respects the 6-Character limit; a removal requires the confirmation flag.
- [ ] Playwright: give an instruction, see the changed fields highlighted, press Undo, and the fields return to their previous values.
- [ ] Reopening the assistant shows no previous conversation.

## User stories covered

6–10.

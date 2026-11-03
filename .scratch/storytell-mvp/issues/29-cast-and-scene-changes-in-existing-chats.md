# Cast and Scene changes reaching existing Chats

Type: task
Status: ready-for-agent
Blocked by: 27, 28
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

What happens to existing Chats when the author changes the Story, per the lifecycle table in the data model sketch:

- **Live edits.** Text edits reach Chats on their next turn. The Opening, StartingBonds and Arc directions apply only to new or reset Chats.
- **Add a Character.** It joins every Chat as a stranger. Its Arc directions are copied into each Chat.
- **Remove a Character** (after a warning). In every Chat:
  - deleted: its Bonds in both directions with their history, StartingBonds pointing at it, its Arc steps, its copied Arc directions, and its Reference image file once ticket 30 exists
  - it is dropped from every Known by; Memories left with nobody in Known by stay
  - speech parts keep its stamped name, and their Character link is cleared
- **Add Scenes.** A Chat in free play enters the first new Scene placed after the last Scene it finished. A Chat that never had Scenes enters the first Scene.
- **Reorder Scenes.** Each Chat stays on the same Scene.
- **Remove a Scene.** A Chat on it moves to the next Scene, or to free play if it was the last. SceneAdvances keep their stamped names.
- **Required field emptied.** Chats stay readable, and sending is blocked with a note naming the field.

## Acceptance criteria

- [ ] API tests cover each lifecycle row above across two Chats of one Story, including the Story assistant's removal path from ticket 23.
- [ ] Playwright: remove a Character, see the warning, and an existing Chat still shows that Character's old speech under its stamped name.

## User stories covered

29–35, 37.

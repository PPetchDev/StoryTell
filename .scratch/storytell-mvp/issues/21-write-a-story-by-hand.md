# Write a Story by hand

Type: task
Status: ready-for-agent
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

- [ ] API tests:
  - playable status flips exactly when every required field is filled
  - a 7th Character is rejected
  - only the last Scene may leave its condition empty
  - a second StartingBond in the same direction is rejected
  - reordering persists
  - deleting a Story removes it and everything under it
- [ ] Playwright: create a Story by hand, see it become playable, reload, and the edits persist.

## User stories covered

4, 11–28, 36 (partial cascade).

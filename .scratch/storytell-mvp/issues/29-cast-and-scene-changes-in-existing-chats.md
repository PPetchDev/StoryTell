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

- [x] API tests cover each lifecycle row above across two Chats of one Story, including the Story assistant's removal path from ticket 23.
- [x] Playwright: remove a Character, see the warning, and an existing Chat still shows that Character's old speech under its stamped name.

## User stories covered

29–35, 37.

## Comments

**Built (agent, 2026-11-04).** On branch `claude/recursing-feynman-ba4cff`, on top of master de293a1 (tickets 19–25, 27, 28, 30). `Status:` is left for the user.

- **What already happened by cascade (checked, not changed):** removing a Character deletes, in every Chat, its `bond_change` rows both ways with their history, its `arc_step` and `chat_arc_direction` rows, its `memory_known_by` rows (a Memory left with nobody stays, "known by no one" in the prompt), and StartingBonds from or toward it; speech parts keep `speaker_name` with `character_id` set NULL; `removeCharacter` deletes the Reference image file. The Chat screen already renders speech by the stamped `speakerName`.
- **Add a Character** (`StoryManagerService.addCharacter` → `joinChats`): the Character joins every Chat of the Story as a stranger (no Bonds seeded; StartingBonds added later reach only new or reset Chats) and, when its Arc directions are non-empty at the moment it is added, they are copied into each Chat through `LedgerModelService.seed(chatId, [], [direction])`. The Story assistant's add goes through the same method.
- **Scenes** (`StoryManagerService`, with `ChatModelService.moveOffScene`/`setScene` and `LedgerModelService.lastSceneAdvance`):
  - *Add* (`enterAddedScene`): each Chat in free play enters the new Scene when it is placed after the last Scene the Chat finished (its latest SceneAdvance's `from_scene_id`); a Chat that never finished a Scene, or whose last finished Scene is gone, enters it too. Chats on a Scene stay. Since Scenes are only ever appended (editor and assistant alike), every Chat in free play enters an added Scene today; the position check is there for the day Scenes can be inserted.
  - *Reorder*: nothing to do; Chats hold their Scene by id. The next move-on follows the new order.
  - *Remove*: before the delete, Chats on the Scene move to the next by position, or to free play if it was the last. The author's move records no SceneAdvance; existing SceneAdvances keep their stamped names with the Scene ids set NULL, and rolling back an advance whose `from` Scene is gone lands in free play.
- **Required field emptied:** unchanged code (`requireSendable` → `422.004.002` naming the fields; `GET` answers `playable: false` with `missing`); now tested across two Chats including the dashboard and Memory drawer reads.
- **Warning:** `ConfirmButton` takes an optional `warning` shown under the question. A Character's Remove says what goes in every Chat (`characterRemovalWarning(name)` in `apps/web/lib/story.ts`: Bonds both ways with history, Arc steps, Arc directions, Known-by entries, the Reference image; past lines keep the name; can't be undone); a Scene's Remove says where a Chat on it goes (`SCENE_REMOVAL_WARNING`). The Story assistant's removal confirmation text now says the same. The warning is shown whether or not the Story has Chats (the editor doesn't know the count).
- **Tests touched:** `chats.spec.ts › reset › keeps the title…` asserted the old behaviour (removing the Scene a Chat is on dropped it to free play); it now expects the next Scene.

**Verified:**
- `npm run typecheck`: clean for both apps.
- `npm run test:api`: 209 passed (199 before + 10 in `test/cast-and-scene-changes.spec.ts`, each across two Chats of one Story): live edits (Setting and Voice reach the next turn's prompt; the Opening, a StartingBond label and an Arc direction edited after start stay as they were in existing Chats and reach a reset and a new Chat); add a Character (a stranger on both dashboards with its copied Arc direction, no Bond rows, in the next prompt's cast and Arcs layer, its speech linked; one added without Arc directions copies nothing, and a StartingBond toward/from it added later reaches only a new Chat); remove a Character by `DELETE` and through the Story assistant (pending, Chats untouched, then applied): Bonds both ways (10 rows → 0), Arc steps, Arc directions, Known by, StartingBonds toward it all gone in both Chats, the Memory left with nobody kept, old speech `{speakerName: 'Kai', characterId: null}`, the next prompt without the Character and with "[known by no one]"; add Scenes (Chats without Scenes enter the first; a Chat that finished the last Scene enters the new one while another stays on its Scene; no SceneAdvance recorded; a Chat whose finished Scene was removed enters the new one); reorder (each Chat stays; the next move-on follows the new order); remove (next Scene, then free play after the last; stamped names kept with both Scene ids NULL; a rollback onto a removed Scene lands in free play); a required field emptied (both Chats readable, sending refused naming "Setting" and "Arrival: Situation", nothing stored, sending again once filled). Without the `StoryManagerService` changes, 4 of the 10 fail (add Character, both add-Scene cases, remove Scene).
- `npm run test:e2e` (ports 3701/4701): 15 passed (14 before + `e2e/cast-changes.spec.ts`: a Chat where Kai spoke; in the editor, Remove on Kai shows the warning, Cancel keeps him, Remove removes him; the Chat screen still shows "Welcome, keeper!" under "Kai" and "Hush." under "Mira").

**Not done / open:**
- **Arc directions of a Character added in the editor never reach existing Chats.** The editor's "Add Character" creates a blank Character, and the Arc directions are typed afterwards, by which time they count as an edit (copied only into new or reset Chats). The copy works for the Story assistant, which adds a Character with its fields. Closing this needs a spec decision, e.g. "a Character that joined after a Chat started has its Arc direction copied into that Chat the first time it is set", which would need a marker of who joined when.
- No real-model check (none needed). The warning text doesn't count the Story's Chats.

**For ticket 31 (Snapshots):** give the Snapshot record's Character link `ON DELETE SET NULL` beside a stamped name column (as `message_part.character_id` / `speaker_name` do), so removal keeps the name and clears the link with no code in `removeCharacter`; add a case to `test/cast-and-scene-changes.spec.ts › Remove a Character` (`expectKaiGone` runs for both the `DELETE` and the Story assistant paths), and, since Snapshots stay (spec: "Speech parts and Snapshots keep its stamped name"), extend `characterRemovalWarning`'s "Past lines keep the name" to Snapshots.

# Memory design

Type: grilling
Status: resolved
Blocked by: 04
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What goes into a Chat's Memory, when and how it is created (automatic summary vs extracted facts), how the user sees and edits it, and how it interacts with resetting a Chat?

Constraint: editing a message rewinds the Chat — see [What editing an earlier message does](15-editing-an-earlier-message.md); state from discarded messages must roll back.

## Answer

Grilled 2026-11-03.

**What a Memory is**
- One short fact the Chat carries forward: an event that happened ("Mira stole the map from Kai at the tavern"), a world detail that came up in play (a place, an item someone holds, a wound), something Characters learned about the user, or an open promise or plan.
- Never a feeling (that is a Bond), a change of personality (that is an Arc), or anything already in the Story or Character definition. "Kai saved Mira from the guards" is a Memory; "Mira now trusts Kai" is a Bond.
- No separate summary layer in the MVP: the fact list is the only memory of older turns, and key events are stored as facts. If play shows the order of events getting lost, add a user-visible "Story so far" summary later — never a hidden one.
- The user is written as `{user}` and shown and sent as the name of whichever Role or Persona is worn. A Persona switch changes nothing automatically; the Persona description in the fixed block outweighs older Memories, and the user fixes any that clash (see [When a Persona replaces a Role](14-persona-replacing-a-role.md)).

**Who writes it and when**
- After every turn a DeepSeek V4 Flash background call extracts Memory, separate from the Bond/Arc judge and run in parallel with it (one job per call keeps Memory and Bond apart). It gets the latest user message, the AI reply and the current Memory list, and returns only changes: add, update or delete. Each change is tied to the message that caused it.
- The user can add, edit and delete any Memory at any time. A Memory the user wrote or edited is locked: the AI reads it but never updates or deletes it. If the story changes it, the AI adds a new Memory instead.

**Known by**
- Every Memory carries the Characters who know it. The AI sets it to the Characters present at the event; a user-written Memory defaults to every Character. The Narrator knows all Memories.
- When a Character learns of something later, the extraction call adds them to Known by as an update tied to that message. Adding a name is allowed even on a locked Memory, since it doesn't change the user's text. Only the user removes names.
- Because [one call writes the whole turn](07-one-ai-turn-prototype.md), the prompt carries the full list with Known-by tags and an instruction that a Character knows only its own; it is not filtered per Character. Some leakage is accepted, as with Bonds.

**Size**
- Always sent every turn as a capped block (~2k tokens, roughly 50–60 short facts; tune in play), placed after the fixed Story and Character block and before recent messages, in a stable order so the prompt cache holds.
- Over the cap, the extraction call merges related facts and moves stale ones (kept promises, minor past events) to **Archived**. Archived Memories are not sent but stay visible and restorable. Locked Memories are never archived automatically.

**Editing a message and resetting**
- Editing message N rolls back every Memory change caused by a discarded message: added Memories go — even if the user has since edited them, because the event no longer happened — and updates, deletes, archiving and Known-by additions revert. Memories the user wrote from scratch stay. The user sees a short notice ("3 Memories rolled back").
- Resetting a Chat empties its Memory. There are no author-set starting Memories; what Characters should know from the start belongs in the Setting or Character definitions.

**Where the user sees it**
- A Memory drawer opened from the Chat screen, separate from the read-only Bond/Arc dashboard. Each Memory shows its text, Known-by chips, whether the AI or the user wrote it (a lock on locked ones) and a "jump to message" link to its cause. Archived sits in a collapsed section at the bottom.
- When the AI adds a Memory, a small "Memory added" toast appears; tapping it opens that Memory.

Untested: the extraction call's quality and the cap were not part of the turn prototype — check them in the first build.

Glossary: **Memory** now names what it holds and excludes, who knows it, who edits it, and that a Chat starts with none.

# Author's note for a Chat

Type: grilling
Status: resolved
Blocked by: none

## Question

Should a Chat carry a short, user-written direction the Narrator reads every turn ("keep it slow-burn", "it rains all day", "Mira is hiding something") — and how many of SillyTavern's knobs does it need?

## SillyTavern

Author's Note: per-chat text inserted every N messages at a chosen depth (or before/after the scenario), as system, user or assistant role; also per-character and default notes.

## Storytell today (checked 2026-11-08)

- No per-Chat direction. Nearby things: Setting and Style (per Story, every Chat), Scenes (per Story, ordered stages), Memory (facts, not directions), and the trailing system message each turn: Lore, then `stateReminder` and `turnFinalInstruction` (`apps/api/src/manager/chat/turn/prompt.ts:373-392`).
- The trailing system message is the one place that changes turn to turn without breaking the cached prefix (prompt.ts header comment), so a note there costs nothing in caching.

## Options

- **A. One note per Chat, every turn** — plain text, set from the Chat menu, sent in the trailing system message just before the final instruction. No depth, frequency or role knobs.
- **B. A + SillyTavern's knobs** (every N messages, depth, role).
- **C. Not needed** — the Setting, Scenes and editing the Story cover it.

## Recommendation

A now. It's the cheapest way to steer one playthrough without touching the Story all its Chats share; the knobs exist in SillyTavern to work around prompt layouts Storytell doesn't have.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: option A — one **Author's note** per Chat, plain text set from the Chat menu, sent every turn in the trailing system message before the state reminder. No depth, frequency or role knobs (they would break the cached prefix for nothing).

Spec and tickets: [.scratch/authors-note/](../../authors-note/spec.md).

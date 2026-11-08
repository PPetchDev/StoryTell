# Choosing who speaks in a group

Type: grilling
Status: resolved
Blocked by: none

## Question

Should the user be able to steer which Characters speak in a turn — ask one to answer, or keep one quiet?

## SillyTavern

Group chats: activation strategy (natural / list / pooled / manual), mute a member, force a member to talk now, auto-mode, allow self-responses.

## Storytell today (checked 2026-11-08)

- One turn call writes narration and `@Name:` lines and the Narrator picks the speakers ([How one AI turn behaves](../../storytell-mvp/issues/07-one-ai-turn-prototype.md)). "User-directed speaker choice (e.g. @mentions)" is MVP out of scope.
- The trailing system message already says who was in the latest exchange (`stateReminder`, `apps/api/src/manager/chat/turn/prompt.ts:383`); a hint there costs nothing.
- The user can already steer in prose ("I turn to Mira and wait for her answer").

## Options

- **A. Nudge** — tap a Character's name above the composer to ask the Narrator to give them a line this turn (a hint, not a guarantee).
- **B. A + sit out** — a Character stays out of a Chat's turns until brought back.
- **C. SillyTavern's full controls.**
- **D. No** — prose already steers.

## Recommendation

D for now; A is cheap if the Narrator keeps ignoring someone in practice. C fights the one-call Narrator design that beat per-speaker calls on cost and coherence.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: options A + B — **Nudge** (tap a Character above the composer to ask the Narrator to give them a line this turn; a hint, the Narrator still decides) and **Sitting out** (a Character kept out of a Chat's turns until brought back). Not SillyTavern's activation strategies or auto-mode: the Narrator writes everyone in one call, and repeated Continue stays user-driven.

Spec and tickets: [.scratch/speaker-controls/](../../speaker-controls/spec.md).

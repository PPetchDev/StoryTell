# Write the user's reply for them (Impersonate)

Type: grilling
Status: resolved
Blocked by: none

## Question

Beyond the three short Suggested replies, should the AI write one full reply for the user in the Role's voice — steered by whatever the user has already typed?

## SillyTavern

Impersonate: one button writes a whole message as the user's persona into the input box; if the box already has text, that text steers it.

## Storytell today (checked 2026-11-08)

- Suggested replies: ⚡ gives exactly three one-to-two-sentence options, one each of action, speech and move (`apps/api/src/manager/chat/suggestions/suggestions-prompt.ts:47`); they ignore what's in the composer. Continue never writes for the user.

## Options

- **A. Steered draft** — when the composer holds text (rough notes, Thai, half a line), a button rewrites it into one full reply in the Role's voice and in English, replacing the draft for the user to check and send. Empty composer: ⚡ stays as today.
- **B. Unsteered full reply** — one long reply from nothing.
- **C. Not needed** — Suggested replies are enough.

## Recommendation

A now, as the same feature as "Translate the draft" in [Writing in Thai while the story plays in English](07-translation.md): one button, "my draft → a full English reply as the Role".

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: options A + B as one feature, **Write for me**: a composer button that turns what's typed (Thai, notes, half a line) into one full English reply as the worn Role or Persona, replacing the draft for the user to check and send; on an empty composer it writes one from nothing. Suggested replies (⚡) stay as they are.

Spec and tickets: [.scratch/write-for-me/](../../write-for-me/spec.md).

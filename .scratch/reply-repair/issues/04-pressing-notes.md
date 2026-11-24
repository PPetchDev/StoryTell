# Pressing notes: the Judge records it, the next turn reads it once

Type: task
Status: ready-for-agent
Blocked by: 03
Needs: one real eval run before and after to finish (about $0.20; the user's go-ahead)
Spec: [Reply repair](../spec.md), "4. Pressing notes"

## What to build

When a reply has a Character press the user for something the user's Message was not about, the Judge says so in the call it already makes, the note is recorded against that reply, and the next turn is told once: who asked for what, that the user spoke of something else, and that the Character does not ask again in this reply and lets it show in what they do.

- One more field in the Judge's answer, sent in every judgement, so its system message never changes from call to call.
- A pressing note is a detail record of a new kind, recorded like a slip: Regenerate, Edit, another Reply version, Reset and Branch handle it with no code of their own. One migration adds the kind.
- The turn reads the notes of the newest AI Message only, in the closing user message's trailing blocks, with the slips.

## Acceptance criteria

- [ ] The Judge's request names the new field in every judgement, and its system message is byte for byte the same from call to call.
- [ ] A judgement with a note puts the line in the next turn's closing message, naming the Character and the thing.
- [ ] The turn after that does not hold it.
- [ ] Regenerate of the reply that pressed removes its note; choosing an older Reply version brings back that version's own.
- [ ] A note for a name not in the Story, or for the user's character, is dropped; at most two a reply are kept; a long one is cut to its limit.
- [ ] A judgement with no note leaves the turn prompt byte for byte what it was.
- [ ] The Story so far trigger reserves the line's room.
- [ ] The migration adds the kind and can be reverted.
- [ ] A Judge scene in the eval: the background model gives a note when the reply pressed, and none on small talk. Each has an answer it passes and one it must fail.
- [ ] Tests go through the HTTP API with the scripted model gateway, and the eval run with a scripted `fetch`, written red first.
- [ ] With the user's go-ahead: the played Chats are run before and after on the real model, and the pressing check's score for both is written into the prompt-evals spec, with what reading the Chats showed.

## Notes

- The rule added to the turn prompt on 2026-11-24 ("A Character asks for a thing once…") stays. The note names the thing; the rule says what to do about it.
- The played Chat in the eval does not run the Judge between its turns, so it will not show this piece working by itself. Either let a played Chat run the Judge between turns (say so in the prompt-evals spec), or measure with a turn scene whose history ends on a pressing reply and whose input carries the note. Pick one and write down why.

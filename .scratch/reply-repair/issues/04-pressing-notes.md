# Pressing notes: the Judge records it, the next turn reads it once

Type: task
Status: done
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

## Comments

Built 2026-11-24. Tests through the HTTP API with the scripted gateway and through the eval run, written red first; reviewed on two axes, and the findings fixed, each with a test that failed first. The real run is in the prompt-evals spec, "Pressing notes, measured".

- **A note is the record's Character and what they pressed for,** not `Character: what for` as the spec said: found in review, a Character's name may hold ": ", and the record already has a Character. A note names its Character as the Story names them now, and a note whose Character has left the Story is not told.
- **Found in review and decided:**
  - *A Continue, a Watch turn and an Epilogue are told nothing of a note,* and a note the Judge gives on a reply to no Message is dropped. The line says the user "spoke of something else"; with no Message that is not true.
  - *A note for a Character sitting out is dropped,* as their speech is.
  - *What was pressed for loses a full stop at its end,* so the line does not end in two.
  - *The Story so far trigger reserves room for two notes* (170 tokens), not one; the Judge's answer gets 90 more tokens, not 60.
- **"Choosing an older Reply version brings back that version's own" is not how the ledger works,** for a note or for a slip. Choosing a version takes the shown reply's records away and judges the chosen one again, so its note is the Judge's new answer about it. The first half holds and is tested: a Regenerate that does not press leaves nothing to tell.
- **The shape goes on after the Roll offer's.** The Roll offer is looked up by the Judge's system message as it stood, so a field added before it silently dropped the offer from the shape; an existing test caught it.
- **Measuring:** the turn scene with the note in its input was taken over a Judge inside the played Chat; why is in the prompt-evals spec.
- **Logged:** one API line for each note kept, and one for each dropped with why.
- **Not tested apart:** the migration's way back, Reset and Branch (the ledger's own code, which treats every kind alike), and the reserve's size.
- **Real run:** the Judge noted the pressing 5 of 5 and nothing on small talk 5 of 5; with the note the reply left it alone 5 of 5, without it 3 of 5 by the grader and 4 of 5 by eye.

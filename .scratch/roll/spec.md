# Spec: Roll

Status: ready-for-agent
Builds on: [Spec: Style controls](../style-controls/spec.md) (Difficulty), [Spec: Cue](../cue/spec.md) (a turn's own line in the trailing message)
Prior art: zeta's Dice events (docs/research/zeta-how-a-story-runs.md, section 3) and Isekai Zero's server-side d20.

Built 2026-11-15, with [Spec: Sudden events](../sudden-events/spec.md).

## Problem Statement

Whatever the user attempts, the Narrator decides whether it works, and a Narrator leans toward letting it. Difficulty tilts that, but it is still the same voice deciding, so a risk never feels like one, and the user can't choose to leave a moment to chance.

## Solution

A **Roll**: the user arms the dice for the Message they are about to send. The app throws a d20 on the server, against a number set by the Story's Difficulty, and the Narrator writes what the user attempted turning out that way. The Message shows what was thrown, the number it needed and how it came out.

## User Stories

1. As a player, I want to leave an attempt to the dice, so that a risk I take can really fail.
2. As a player, I want the app to throw the dice, not the model and not my browser, so that the result is honest.
3. As a player, I want to see the number, what it needed and the outcome on my Message, so that I know what the story is answering.
4. As a player, I want a 20 and a 1 to mean something more, so that the best and worst throws are felt.
5. As a player, I want the Roll to stay with its Message through Retry, Again and an edit, so that I can't roll again by asking for another reply.
6. As a player, I want to see what a Roll will need before I send it, and to take it back, so that I never roll by accident.
7. As an author, I want my Story's Difficulty to set how often a Roll succeeds, so that the dice fit the world I chose.

## Implementation Decisions

- **Sending.** The send request may carry `roll: true`. The app then throws one d20 with the server's own random source and stores the value and the number to reach on the User Message. Retry, Regenerate and a User Message edit take no `roll`: they read the one the Message has. A Continue has no User Message, so no Roll.
- **The number to reach** comes from the Story's Difficulty when the Message is sent: Easy 8, Normal 11, Hard 14 (65%, 50% and 35% of throws succeed). It is kept on the Message, so a later change of Difficulty does not rewrite old Rolls.
- **The outcome.** A 20 is a critical success and a 1 a critical failure, whatever the number; otherwise reaching the number is a success and falling short a failure. There is no bonus: the app has no character stats.
- **The prompt.** One block in the turn's trailing message, after "Where things stand" and any Sudden event, before the Nudge and the Cue: what the dice decided, that it is final for this reply, that a Message attempting nothing that could fail ignores it, and that dice and numbers never go in the story. The system message, and so the cached prefix, is unchanged; the history never mentions a Roll. The Story so far reserves room for the block.
- **A failure moves the story.** The wording asks for "does not work, or works only at a cost or with a complication", so a failed Roll is never a dead end.
- **The Chat.** A User Message's response carries its Roll (value, number to reach, outcome) or null, and the Chat carries the number a Roll sent now would need. A Branch copies the Rolls of the Messages it keeps.
- **The screen.** A dice toggle in the composer's box row, beside the microphone, with a line above the tools while it is armed saying what the next Message needs. The box row was "box · 🎤 · send slot" (.scratch/dictation/spec.md); the toggle makes it "box · 🎲 · 🎤 · send slot", which leaves the box a little over half of a 390px phone instead of about two thirds. A sixth tool chip was the other place for it, and would have wrapped the tool row onto a second line on every phone. It is sent with the next send only, and comes back with the draft if the API never stored the Message. The Message shows its Roll under its bubble, in words and numbers, in the thread and in the Visual novel view; while it is being sent it reads "Rolling…".
- **Tests script the dice.** The app's `Dice` takes scripted throws from tests and from the fake gateway's control route; nothing in play can.

## Testing Decisions

- API (`apps/api/test/roll.spec.ts`): the outcome and the block as pure logic, and its place in the prompt; then through HTTP: the stored Roll and the prompt, no Roll without the flag or on a Continue, the 400 for a non-boolean, the number by Difficulty and that it is kept, the criticals, one throw across a failed turn, Retry, Regenerate and an edit, Branch, and that an unscripted throw is 1 to 20.
- Browser (`apps/web/e2e/sudden-event-and-roll.spec.ts`, phone size): arming and taking it back, the line, the request body, the Message's Roll, the prompt, the next Message going without one, and a reload.

## Out of Scope

- Bonuses, stats, skills, advantage, or dice other than one d20.
- The Narrator or the Judge asking for a Roll ("offered at key moments"): only the user arms one. (Stats and the Judge's Roll offers came later: [Spec: Roll offers and Stats](../judge-rolls/spec.md).)
- Adding or changing a Roll on a Message already sent.
- The Roll in the Transcript, and in the Judge's or Memory extraction's prompts: they read the reply, which already shows the outcome.

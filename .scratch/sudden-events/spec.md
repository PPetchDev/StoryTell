# Spec: Sudden events

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the Background judge, the change ledger), [Spec: Story clock](../story-clock/spec.md) (a ledger record the Judge makes), [Spec: Style controls](../style-controls/spec.md)
Prior art: zeta's Sudden Event plugin (docs/research/zeta-how-a-story-runs.md, section 3).

Built 2026-11-15. The research doc filed turn-limited events under "at most worth it for an MVP"; the user asked for them on 2026-11-15, after the comparison with zeta and Isekai Zero showed every app of this kind adding a game layer.

## Problem Statement

A Story can say where the plot goes (Scenes) and how hard the world is (Difficulty), but nothing in it is ever at stake at a known moment. An interrogation, a chase or a first impression plays like any other exchange: the user can't see how it is going, can't lose it, and the author can't say "this is the moment that counts".

## Solution

A **Sudden event**: a moment of pressure the author writes on a Story. Each has a trigger in plain language ("Mira questions the user about the missing oil"), a **Gauge** ("Suspicion") and a direction, a number of replies, and what follows a success and a failure.

When the trigger happens in a Chat, the event begins. The Chat shows its name, the Gauge as a bar with the goal marked, and how many replies are left. Each reply moves the Gauge by how the user played it, with a sentence saying why. Reaching the goal is a success; the Gauge's far end, or running out of replies, is a failure. The Narrator plays the pressure while it runs and shows the outcome in the reply after it ends.

## User Stories

1. As an author, I want to write a moment where something is at stake, so that my Story has scenes the user can win or lose.
2. As an author, I want to say when it starts in a sentence, so that it begins where the story reaches it and not on a fixed turn.
3. As an author, I want to name what is measured and which way it must go, so that the same mechanism fits an interrogation (bring Suspicion down) and a courtship (bring Trust up).
4. As an author, I want to choose how many replies the user gets, so that I set how tight it is.
5. As an author, I want to write what follows a success and a failure, so that the outcome changes the story the way I meant.
6. As an author, I want an unfinished event to be ignored, never to block play, so that I can draft one without breaking my Story.
7. As a player, I want to see the Gauge, the goal and the replies left while it runs, so that I know what is at stake.
8. As a player, I want a sentence on why the Gauge moved, so that I can play better with the next reply.
9. As a player, I want the outcome to show in the story, so that winning or losing matters.
10. As a player, I want Again, an edit, a Reset and a Branch to treat the event like everything else the story changed, so that taking a reply back takes its move back.
11. As a player, I want a screen reader to hear the event begin, move and end, so that the bar is not the only way to follow it.
12. As the owner, I want it to cost no extra model call, so that a Story with events costs what it did.

## Implementation Decisions

- **A Story's Sudden events.** Up to 8, in the author's order, each with a name, a trigger, a Gauge name (at most 40 characters), a direction (`lower` or `raise`), replies (2 to 8, 4 by default) and the two outcome texts. One runs only once it has a trigger and a Gauge name; it is never "needed to play". Duplicate copies them. They are added, changed and removed one at a time, like Scenes, and each write answers with the whole Story.
- **The Gauge.** 0 to 100. Bring it down: it starts at 60, the goal is 20 or lower, 100 fails at once. Bring it up: it starts at 40, the goal is 80 or higher, 0 fails at once. One reply moves it at most 30. These are the same for every event: the author chooses the direction and the replies, not the numbers.
- **The Judge runs it, in the call it already makes.** A Story with an event that can start, or one under way, adds a section to the judge's user message, with its rule and its JSON field, so the system message never changes and a Story without events sends exactly the prompt it sent before. Waiting: the ready events that have not happened in this Chat, numbered, each with its trigger; the Judge may answer `"sudden_event": {"reason", "start": n}`. Under way: the Gauge, the goal, the failing end and the replies left; the Judge answers `"sudden_event": {"reason", "gauge": n}`.
- **Applying.** A start is taken only for a waiting event, and never while one is under way. Under way, every judged reply uses one of the user's replies, whatever the Judge said; the Gauge moves at most 30 and stays on its scale; then the event ends with the goal reached (also on the last reply), at the failing end, or with no replies left. What was not taken is logged, like other judge items.
- **The ledger.** Each step (start, move, success, failure) is a record against the AI Message whose judgement made it: the Gauge after it, the replies left, and the reason. A Chat's event state is read from its steps, the newest one saying what is under way, so there is no column to keep in step. Rollback deletes the steps of the Messages it rewinds (not counted in the rollback notice, like the Time of day); Reset clears them; Branch copies them and rolls back past its Message. An event runs once per Chat: one with any step no longer waits.
- **Removing an event** deletes its steps everywhere, so a Chat in the middle of it plays on without it. Editing one mid-run changes its words; the Gauge and the replies left stay.
- **The Narrator.** One block in the turn's trailing message, after "Where things stand": under way, the Gauge, the goal and the replies left, to play the pressure and not settle it; in the reply after it ended, the outcome and what the author wrote follows. An event that ended earlier is told no more. The Gauge and its numbers never go in the story. Suggested replies and Write for me do not read it. The Story so far reserves room for the block where the Story has a ready event.
- **The Chat.** The Chat response carries the event under way, or the one that ended with the newest AI Message, with its Gauge, start, goal, failing end, replies left and reason. The screen shows it in a banner under the Scene strip, with the Gauge as a meter, and says each change once to a screen reader. Numbers are shown: a Gauge is a game counter, unlike a Bond's levels.
- **No new play-model call, no new background call.** The judge's token cap rises by 100 while the section is there.

## Testing Decisions

- API (`apps/api/test/sudden-events.spec.ts`): the state read from steps, the Judge's section and its unchanged prompt without events, loose reading, every apply rule, and the Narrator's block, as pure logic; then authoring (defaults, each field, the limits, Duplicate) and play through HTTP with the fake gateway: start, moves, the step limit, success, both failures, a silent Judge, a second Chat, Regenerate, an edit, Reset, Branch and removing the event.
- Browser (`apps/web/e2e/sudden-event-and-roll.spec.ts`, phone size): the banner from start to end with its meter, the Narrator's prompt, and the editor's card: add, each field, reload, remove.

## Out of Scope

- The author setting the Gauge's start, goal or step, or more than one Gauge in an event.
- An event that can happen more than once in a Chat, or one tied to a Scene.
- The AI inventing events (zeta's Quests) and Endings.
- AI drafts, the Story assistant and Character cards writing or carrying Sudden events.
- A list of past events on the Dashboard, and the event in the wide-screen "At a glance" panel.
- Suggested replies and Write for me knowing the event's goal.

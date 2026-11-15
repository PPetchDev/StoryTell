# Spec: Place, Weather and Outfits

Status: ready-for-agent
Builds on: [Spec: Story clock](../story-clock/spec.md) (the Time of day: the same shape, a thing the Judge reads from each reply), [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the Background judge, the change ledger, Snapshots)
Prior art: zeta's Info Box (docs/research/zeta-how-a-story-runs.md, section 4: "Environment" and the per-Character fields). The user calls this one "Info Box lite".

Built 2026-11-15.

## Problem Statement

A Chat knows its Scene and its Time of day, but not where the story is standing, what the weather is doing, or what anyone is wearing. All three live only in the Messages, so over a long Chat the Narrator loses them: a coat taken off two replies ago is on again, the storm stops without a word, a Snapshot draws a Character in the clothes of their Appearance when the story changed them an hour ago. The user has nowhere to look either.

## Solution

The Chat keeps three more things about the story's present moment, read from each reply by the Judge, as the Time of day is:

- **Place:** where the story is now, in a few words.
- **Weather:** in a few words, once the story shows it.
- **Outfit:** what each Character is wearing now, in a short phrase.

Each starts unknown and is set when the story first makes it clear or changes it. The Narrator is reminded of them before every reply, a Snapshot is drawn with them, and the user sees them in the Scene strip and on a Character's profile.

This is the "lite" of zeta's Info Box: its mood, goal, relationship and inner-thoughts fields are left out on purpose, since a Bond shows only through behaviour and a Character's Secrets are not for the user to read.

## User Stories

1. As a player, I want the Narrator to remember what a Character is wearing, so that clothes don't change back by themselves.
2. As a player, I want the Narrator to remember where we are and what the weather is, so that the scene stays put.
3. As a player, I want a Snapshot to draw the Characters in what they are wearing now, so that the picture matches the story.
4. As a player, I want a retake of an earlier moment to be dressed as it was then, so that an old picture is not drawn in new clothes.
5. As a player, I want to see the Place at a glance and the rest with a tap, so that I can check where things stand without scrolling back.
6. As a player, I want a Character's profile to say what they are wearing now, so that I can tell it from what they usually wear.
7. As a player, I want Again, an edit, a Reset and a Branch to take these back with the reply that set them, so that they never describe a story that was undone.
8. As an author, I want to write nothing for this, so that every Story has it, old ones included.
9. As the owner, I want it to cost no extra model call, so that a turn costs what it did.

## Implementation Decisions

- **Three kinds of record, one ledger table.** Each change is a record against the AI Message whose judgement made it: its kind (Place, Weather, Outfit), the Character for an Outfit, and the new value. A Chat's current value of each is its newest record, so there is no column on the Chat to keep in step and rollback is deleting the records of the rewound Messages: the one before is current again. Reset clears them; Branch copies them and rolls back past its Message. They are not counted in the rollback notice, like the Time of day.
- **The Judge reads them, in the call it already makes.** The judge's user message ends with a section, after the exchange: what each is now ("not yet known" where it is not), then the rule and the JSON field `"details": {"place", "weather", "outfits": [{"character", "outfit"}]}`. It gives only what the latest exchange changed or first made clear. The system message does not change. The token cap rises by 120.
- **Applying.** A value is put on one line, without a closing full stop, and cut to 80 characters for a Place, 60 for the Weather and 160 for an Outfit. One equal to the current value, ignoring case, is not a change. An Outfit needs a Character of the cast who is not sitting out, and each takes one a turn. What was not taken is logged, like other judge items. The Judge cannot clear a value.
- **The Narrator.** "Where things stand" states the Place and the Weather after the Scene and the Time, and after "In the latest exchange" what those Characters are wearing, with "keep them dressed so until the story changes it". Outfits of Characters not in the exchange, or sitting out, are not restated. Nothing is said about what is not known, so a Chat that has none sends the reminder it sent before. Suggested replies and Write for me read the same reminder.
- **Snapshots.** The scene writer is given the Place, the Weather, and "Wearing right now" beside each Character's Appearance, as they stood at the Message the picture is of: only records of Messages up to it count.
- **The Chat.** The Chat response carries `place`, `weather` and `outfits` (by Character, in cast order). A removed Character's Outfit goes with them.
- **The screen.** The Scene strip shows the Place after the Scene and the Time; opened, it also shows the Weather and a line per Character with what they wear. A Character's profile has "Wearing now" above their Appearance. The wide-screen "At a glance" panel shows the Place and the Weather under where the story is, and each Character's Outfit under their feelings.
- **Nobody writes them.** No authoring, no starting values, no editing by the user: like the Time of day, a wrong one is corrected by the story saying otherwise.

## Testing Decisions

- API (`apps/api/test/details.spec.ts`): the current values, the Judge's section and the unchanged prompt without it, loose reading, every apply rule and the length cuts, the reminder and the Snapshot writer's input, as pure logic; then through HTTP with the fake gateway: a new Chat, values kept through quiet turns, the next prompts, Regenerate, an edit, Reset, Branch, sitting out, a removed Character, and a Snapshot prompt now and for an earlier Message. The tests that pin the judge's whole prompt and its token cap were updated for the section and the 120 tokens.
- Browser (`apps/web/e2e/info-box.spec.ts`, phone size): the strip closed and opened, the profile, the next turn's prompt, a change, and Again taking it back.

## Out of Scope

- A date or a calendar: the Chat still knows only the Time of day.
- The user's own outfit (a Snapshot is seen through their eyes), an inventory, a Character's mood, pose, goal, or anything zeta's Info Box shows of feelings and thoughts.
- Starting values written by the author, and the user editing a value.
- Automatic outfit pictures or Expressions per outfit.
- These in the Transcript and on the Dashboard.

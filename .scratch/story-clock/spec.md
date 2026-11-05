# Spec: Story clock (the time of day)

Status: done

## Problem Statement

Nothing in a Chat keeps track of when in the story it is. The Narrator reads the time of day off the recent Messages, if they mention it, so a scene that started at dusk can drift back to sunlight a few turns later. Snapshots suffer most: the scene writer guesses the light from a handful of Messages, and the user got daylight in night scenes. The user also has no way to see at a glance what time it is in the story.

## Solution

Each Chat has a **Time of day**: one of dawn, morning, noon, afternoon, evening or night, or none until the story makes it clear. The judge, which already runs after every turn, also reports when the time of day changes. The change is recorded in the ledger against the AI Message that caused it, like a Scene advance, so editing a Message or Regenerate puts the earlier time back. The Scene strip shows it, the turn prompt's "Where things stand" reminder states it, and the Snapshot scene writer gets it as a fact about the moment.

## User Stories

1. As a player, I want the story to remember that it is night, so that the Narrator doesn't bring back the sun a few turns later.
2. As a player, I want to see the time of day in the Scene strip, so that I know when in the story I am.
3. As a player, I want a Snapshot of a night scene to be dark, so that the picture matches the story.
4. As a player, I want the time to change only when the story moves it on, so that it doesn't flicker on every turn.
5. As a player who edits or regenerates a Message, I want the time it set taken back, so that the clock matches the Messages that remain.
6. As a player who resets a Chat, I want the clock cleared, so that the fresh start doesn't keep the old time.
7. As a player starting a Chat, I want no time shown until the story makes one clear, so that the app never invents one.

## Implementation Decisions

- **Domain term.** "Time of day" (glossary): where a Chat's story is in the day, one of six coarse values or none yet. It is Chat state set by the judge, not by the user or the author.
- **Values.** `dawn`, `morning`, `noon`, `afternoon`, `evening`, `night`. Six coarse values are enough for the light in a picture and for the Narrator; finer times ("ten past four") are left to the Messages.
- **The judge.** Its JSON gains `"time_of_day"`: one of the six when the latest exchange moved the time on, or null for unchanged. The judge's input shows the current time of day (or "not yet known"). The prompt says to report a time only when it changes or first becomes clear, and to read it from the story, not guess. Parsing tolerates a missing field, a null, and any other value, all of which mean unchanged, so older scripted replies still read.
- **Apply rule.** A reported time equal to the current one is dropped as no change. At most one change per turn.
- **Storage.** A new ledger record, TimeChange: the Chat, the causing AI Message, the time before (null when there was none) and after. The Chat also gets a `time_of_day` column holding the current value, so the Chat screen reads it without the ledger. Both come in one migration.
- **Rollback.** A rewind deletes the TimeChanges of the rewound Messages, newest first, and puts the Chat's time back to the one each change left. The rollback notice's counts are unchanged: a time of day is not something the user would count as lost, and leaving the counts alone keeps the notice and its tests as they are.
- **Reset and new Chats.** Reset deletes every TimeChange and clears the column. A new Chat starts with none.
- **Turn prompt.** The "Where things stand" reminder gains `Time: night.` after the Scene when a time is known; with none, it is exactly as before. The Story so far trigger measures the reminder with the time in it, so its arithmetic stays in step.
- **Snapshot.** The scene writer's input gains the time of day as a fact about the moment, with the instruction that the light must match it. With none, the prompt is as before.
- **API.** The Chat response gains `timeOfDay`, one of the six or null.
- **Web.** The Scene strip shows the time after the Scene's name, with an icon per value (🌅 dawn, 🌤️ morning, ☀️ noon, 🌇 afternoon, 🌆 evening, 🌙 night) and a visually hidden "Time:" for screen readers. With none, nothing shows.

## Testing Decisions

- Tests check behaviour at the existing seams: HTTP through the API with the fake Model Gateway (`apps/api/test/*.spec.ts`), pure prompt functions, and Playwright e2e at 390px with touch. Prior art: `judge.spec.ts` for the judge and its rollback, `turn-prompt-reminder.spec.ts` for the reminder, `snapshots.spec.ts` for the scene writer.
- **Judge (API).** The judge's prompt asks for `time_of_day` and shows the current time. A judgement with a time sets it on the Chat; a later one without the field, or with null, keeps it; one with the same value records nothing.
- **Rollback (API).** Editing the Message that set the time, or Regenerate of it, puts the earlier time back. Reset clears it. A new Chat has none.
- **Prompts (pure and API).** The reminder says `Time: night.` when there is a time, and nothing when there is none. The Snapshot writer's input carries the time.
- **Web (e2e).** A judge reply that sets night shows the night in the Scene strip.

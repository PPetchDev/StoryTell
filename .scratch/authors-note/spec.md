# Spec: Author's note

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md), [Spec: Lore](../lore/spec.md), [Spec: Story so far](../story-so-far/spec.md)
Decision: [Author's note for a Chat](../sillytavern-gaps/issues/03-authors-note.md) (option A)

Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

The user can steer a Story for all its Chats (the Setting, the Style, Scenes, Lore) but has no way to steer one playthrough. "Keep it a slow burn", "it rains all day", "Mira is hiding something": today that goes into the user's own lines, where it reads as the Role speaking and is gone a few turns later, or into the Story, where it changes every other Chat too. A long Chat drifts away from what the user wants, and nothing reminds the Narrator every turn.

## Solution

Each Chat has one **Author's note**: plain text the user writes from the Chat menu, which the Narrator reads on every turn as the user's standing direction for that Chat. It goes in the turn's trailing system message, after the Lore and the Documents and before "Where things stand", so the cached prefix never changes and the note costs only its own few tokens. Suggested replies and Write for me read it too, so their ideas follow the same direction. The note stays until the user changes or clears it: edits, Regenerate and Reset leave it alone, and a Branch copies it. There are no depth, frequency or role knobs.

## User Stories

1. As a player, I want to write an Author's note for a Chat from its menu, so that I can steer this playthrough in my own words.
2. As a player, I want the Narrator to read my note on every turn, so that the direction never fades in a long Chat.
3. As a player, I want the note to steer how the story goes without being quoted in it, so that the reply reads as story, not as my instruction echoed back.
4. As a player, I want the note to be one plain text box, so that there are no knobs to learn.
5. As a player, I want the note to belong to this Chat only, so that my other Chats of the same Story are not affected.
6. As a player, I want to see in the Chat menu whether a note is set, and how it starts, so that I remember what I asked for.
7. As a player, I want to change the note at any time between turns, so that I can steer again as the story moves.
8. As a player, I want to clear the note in one tap, so that the Narrator stops following it.
9. As a player, I want a note of only spaces to count as no note, so that an empty box sends nothing.
10. As a player, I want a limit on the note's length that I can see as I type, so that I keep it short and it never crowds the story out of the prompt.
11. As a player, I want the note to apply from the next turn when I change it while a reply is being written, so that a turn never changes direction halfway.
12. As a player, I want the note to apply to Continue and Again (Regenerate) as well as to a send, so that every turn follows it.
13. As a player, I want the note never to be able to make the Narrator write for my Role, so that the rule about my lines always holds.
14. As a player, I want Suggested replies to follow my note, so that the ideas fit the direction I set.
15. As a player, I want Write for me to follow my note, so that the line it writes for me fits the direction too.
16. As a player, I want the note left out of what decides Bonds, Arcs, Scenes, Time of day and Memory, so that a direction is never taken for something that happened.
17. As a player, I want the note left out of Snapshots and the Story so far, so that pictures and the account of events show only what happened.
18. As a player, I want editing a Message, Regenerate or choosing a Reply version to leave my note alone, so that it never rolls back with the story.
19. As a player, I want Reset to keep my note, as it keeps the title and the identity I wear, so that starting over keeps my direction.
20. As a player, I want a Branch to copy the note, so that the Branch is steered the same way until I change it there.
21. As a player, I want to write the note in Thai if I like, while the story stays in English, so that I can direct in my own language.
22. As a player, I want the note to cost no extra model call, so that steering is free apart from its own tokens.
23. As a player, I want a long Chat with a note never to push recent Messages out unexpectedly, so that the note is counted in the turn's budget and in when the Story so far is due.
24. As a player, I want backups to keep my notes, so that restoring a backup restores my direction.

## Implementation Decisions

- **Glossary:** "Author's note" is already in `CONTEXT.md`: the user's own standing direction for one Chat; it directs, and is never a fact (a Memory) or a stage of the plot (a Scene).
- **Storage:** a new `chat.authors_note` column, text, not null, default empty. One migration. It is Chat state outside the ledger, like the worn identity:
  - an edit, Regenerate or choosing a Reply version never touches it;
  - Reset keeps it;
  - a Branch copies it;
  - deleting the Chat deletes it.
- **Length cap:** 1,000 characters, about 250 tokens. The request DTO enforces it, and over the cap is the framework's `400.000.000`. The text is trimmed when saved, and whitespace only saves as empty (no note).
- **API:**
  - `PUT /api/stories/:storyId/chats/:chatId/authors-note` with `{ text: string }` answers the Chat (`ChatDetail`). Errors: `ChatNotFoundError` and validation. No new error codes.
  - It takes no turn lock and never waits for background calls: like swapping the worn identity, it may be saved while a turn is being written, and that turn finishes with the note it started with.
  - `ChatDetail` gains `authorsNote: string`, empty when none.
- **Turn prompt:**
  - The prompt layers input gains `authorsNote` (string or null). The manager fills it from the Chat for the turn, Suggested replies and Write for me ([ticket 03](issues/03-write-for-me-reads-the-note.md)).
  - The turn's trailing system message keeps the one order of [integration](../sillytavern-gaps/integration.md): **Lore → Documents → Author's note → Where things stand (it names who is Sitting out) → Nudge → the final instruction.** Each block appears only when it has something to say; the Author's note block appears when the note isn't empty.
  - The block reads as the user's direction for this Chat. It asks the Narrator to let it guide where the story goes and how it is told, never to quote it, and it states that it never overrides the rules about the worn identity (never write their words, thoughts or actions).
  - The system message is unchanged with or without a note, so the cached prefix holds.
- **Budget:**
  - The block is part of the trailing system message, so the turn's fixed cost counts it and recent Messages are trimmed around it as for Lore.
  - The Story so far trigger's fixed cost adds the note's own tokens, read from the Chat when the check runs, so a Chat with a note gets its Story so far in time.
  - Suggested replies keep their recent history to the budget left after the system message and their closing message. The note is part of that closing message, so their history budget reserves its tokens too. Write for me does the same ([ticket 03](issues/03-write-for-me-reads-the-note.md)).
  - The 1,000-character cap bounds all of them.
- **Suggested replies:** their closing message is **Lore → Documents → Author's note → the suggestions instruction**. The default is yes, because suggestions should follow the user's direction.
- **Write for me** ([write-for-me](../write-for-me/spec.md)): its closing message uses the same order, **Lore → Documents → Author's note → its own instruction**, for the same reason. [Ticket 03](issues/03-write-for-me-reads-the-note.md) always owns adding it, blocked by [write-for-me ticket 02](../write-for-me/issues/02-write-for-me.md).
- **Not sent to:** the judge, Memory extraction, the Story so far writer, the Snapshot writer, the Thai reading and the Transcript. A direction is not an event or a fact, and sending it there would invite the judge or extraction to record it as one.
- **Usage:** no new model call. The note only adds input tokens to calls that are already made and logged (`turn`, Suggested replies, Write for me). Nothing spends credit without a tap.
- **Modules:**
  - The turn prompt builder gains the block and its placement; the Story so far coverage counts it.
  - `ChatManagerService` passes the note into the layers it builds, for the turn and for Suggested replies, and gains `setAuthorsNote`.
  - The Chat model service gains a column update.
  - The Chat controller gains the route.
- **Web:**
  - The Chat menu gains an "Author's note" row after the existing rows, the first of the three new rows ([integration](../sillytavern-gaps/integration.md): Author's note · Who's in this Chat · Read replies aloud). Its quiet line shows the note's first line, cut to fit, or "None: steer this Chat in your own words".
  - The row opens a sheet in place of the menu (like Rename) with:
    - a textarea, with placeholder examples ("Keep it a slow burn." "It rains all day.");
    - a character count, "N / 1,000". The textarea stops input at 1,000 characters (`maxLength`): typing stops there and a longer paste is cut to 1,000, so Save never sends more than the API accepts;
    - Save, Clear and Cancel.
  - Save and Clear run as a write (the usual busy state and error line) and close the sheet. The row is disabled while a turn or write is in flight, like Rename.
- **Branch copy:** [Branch](../branch/spec.md) lands first and owns the one copy of a Chat. [Ticket 01](issues/01-authors-note-in-turns-and-the-chat-menu.md) adds the note to Branch's copy, blocked by [Branch ticket 02](../branch/issues/02-branch-a-chat.md), with a test that a Branch carries it.

## Testing Decisions

- Test only external behaviour: the messages the fake gateway receives, the API's answers, and what the Chat menu shows.
- **Pure prompt tests**, beside the existing reminder tests (prior art: `test/turn-prompt-reminder.spec.ts` builds the prompt from plain input):
  - with a note, the trailing system message holds the block after the Lore block (and after the Documents block, once Documents exist) and before "Where things stand", the Nudge line and the final instruction;
  - with none, or only whitespace, there is no block and the prompt equals today's;
  - the system message is identical with and without a note;
  - the note counts toward the budget: a long note trims one more old Message where the budget is tight;
  - the Story so far coverage reserves the note's tokens (prior art: `test/story-so-far.spec.ts`).
- **API tests** through HTTP with the fake gateway, in a new `authors-note` spec. Prior art: `test/chats.spec.ts` for routes, `test/suggested-replies.spec.ts`, `test/regenerate.spec.ts`, `test/judge.spec.ts`.
  - PUT saves, trims and answers `authorsNote`; over 1,000 characters is a 400.
  - A send, a Continue and a Regenerate each carry the note in the trailing message.
  - Suggested replies carry it after the Lore and before their instruction, and a long note trims one more old Message from their history where the budget is tight.
  - The judge's and the extraction's calls do not.
  - A User Message edit and Reset keep it.
  - A Branch carries it.
  - Saving while a turn is in flight succeeds, and that turn's prompt holds the old note.
- **e2e** (Playwright, 390px), a new `authors-note` spec. Prior art: `e2e/chat-top-bar.spec.ts` (menu rows and the Rename sheet).
  - Write a note from the Chat menu, see its first line in the menu, reload, and see it again.
  - Typing past 1,000 characters stops at 1,000, and the count reads "1,000 / 1,000".
  - Clear it, and the row says None.

## Out of Scope

- SillyTavern's knobs: insertion depth, every-N-messages frequency, role, position.
- Per-Character or per-Story default notes, and a default note for new Chats.
- The Story assistant writing or suggesting notes.
- A history of earlier notes, or rolling the note back with the story.
- Showing the note anywhere in the thread or the Scene strip.

## Further Notes

- The decision says "before the state reminder". The reminder and the final instruction are one block today, so "before Where things stand" also puts the note before the Nudge line and the final instruction. The Lore stays first, as the [Lore spec](../lore/spec.md) placed it, and the Documents follow it, as [integration](../sillytavern-gaps/integration.md) settles.
- Open question: should a non-empty note show a small marker on the Chat screen, outside the menu? Recommended answer: not now. The menu row shows it, and a marker can come later if the user forgets notes are on.
- Open question: should Reset clear the note? Recommended answer: no. It is the user's own text, kept like the title and the worn identity. Clearing is one tap.

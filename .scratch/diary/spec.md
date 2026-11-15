# Spec: Diary

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the change ledger, Bonds, Arcs, the Character profile), [Spec: Write for me](../write-for-me/spec.md) (a play-model call the user asks for, outside the story), [Spec: Place, Weather and Outfits](../info-box/spec.md) (the Place)
Prior art: zeta's Character Diary (docs/research/zeta-how-a-story-runs.md, section 5: "a paid diary showing a Character's private feelings and off-screen decisions").

Built 2026-11-15.

## Problem Statement

A Bond shows only through how a Character behaves, and the Dashboard states it in the app's words: a label, a description, four levels. The user never hears, in the Character's own voice, what they made of the last hour of the story: what they kept to themselves, what they noticed, what they are hoping for. That is the part of a Character a reader most wants and the Chat can't show without breaking the scene.

## Solution

Each Character keeps a **Diary** in each Chat. On a Character's profile the user asks for an entry; the Character writes one, in the first person and their own voice, about the story since their last entry. Entries are kept and listed newest first. A Character writes one entry per moment: after an entry, the story has to go on before the next.

The Diary is for the user to read. The Narrator never reads it, so nothing in it becomes a fact of the story.

## User Stories

1. As a player, I want to ask a Character for a diary entry, so that I hear what they thought of what just happened, in their words.
2. As a player, I want the entry to tell only of what happened in the story, so that it never contradicts the Chat or invents events.
3. As a player, I want each entry to follow on from the one before, so that the Diary reads as one voice over time.
4. As a player, I want to read a Character's earlier entries, so that I can see how they changed.
5. As a player, I want an entry to go when I take back the reply it told of, so that the Diary never describes a story that was undone.
6. As a player, I want a Branch to carry the Diary up to its Message, so that the new Chat starts with the past it shares.
7. As a player, I want to delete an entry I don't like and ask again, so that a poor one doesn't stay.
8. As a player, I want to be told plainly when there is nothing new to write about, so that I don't pay for the same entry twice.
9. As an author, I want the Diary never to tell a Character's Secrets or where their Arc is meant to go, so that it can't give my story away.
10. As an author, I want to write nothing for this, so that every Story has it.
11. As the owner, I want an entry to cost a model call only when someone asks, so that play costs what it did.
12. As a Member, I want an entry to count against my Monthly cap like any other request, so that the cap means what it says.

## Implementation Decisions

- **Written on request, one call.** Asking is one play-model call under its own call kind (`diary_entry`, text pool, the user's Sampling). Nothing writes an entry by itself. It is refused, before any call, while a turn is in flight and with text credit out, and a Member's is refused at their cap by the gateway as other requests are. Like Suggested replies it does not wait for the previous reply's background calls.
- **Written at the newest AI Message.** An entry is recorded against the Chat's newest AI Message (the Opening counts) and tells of the Messages after that Character's previous entry, up to it; a first entry tells of everything so far. An unanswered User Message after it is not told of. A Character who already has an entry at that Message is refused ("<Name> has already written about this. Play on, then ask again."). Each Character's Diary is their own: one writing does not stop another.
- **The turn lock is held while it is written**, so the Message it tells of can't be regenerated or rewound under it. A send meanwhile is refused as it is during a turn.
- **What the writer is told.** A prompt outside the story, with none of the play layers: the Setting; the Character's Personality, Voice and Background; their Arc steps so far; their own Bonds in words (label, description, levels in words), never anyone else's; their active Beliefs; their previous entry; the story since, in the Transcript's layout, the newest that fit about 6,000 tokens (the newest Message always, and a note when the older part is left out); and the Time of day and Place now.
- **What the writer is never told: the Character's Secrets and Arc direction.** The user reads every word of an entry, and a rule in a prompt is not a guarantee, so what must not be read is not sent. The cost is that an entry can't hint at a Secret; that is the intended trade. Arc steps are sent, since they are who the Character has already become and the story has shown it; the direction, which is where the author means them to go, is not.
- **The rules of an entry.** First person, past tense, the Character's voice, written as if nobody will read it. Only what they saw, heard or took part in; what it meant to them and what they hope, fear or intend. No new events, places or people, and nothing decided for the user. A Character who was not there (sitting out, or absent) writes their own thoughts, knowing nothing of what happened. 80 to 150 words of plain prose, no heading, date or signature.
- **Reading the answer.** Trimmed; a wrapping code fence, a leading `Name:` label and a "Diary entry" heading are taken off; cut at 2,400 characters. An empty answer is refused and nothing is kept.
- **Kept as a ledger record.** One table: the Chat, the Character, the Message, the text, and the **moment** it was written at (the Time of day and the Place then, in words: "Night, the lamp room"; none when the Chat knew neither). Rewinding its Message (Regenerate, another Reply version, an edit) deletes it with the Message's other records; Reset clears them; a Branch copies them and rolls back past its Message; a removed Character's go with them. They are not counted in the rollback notice.
- **No prompt reads the Diary.** Not the turn, the Judge, the extraction, Suggested replies or Write for me. It is not in the Transcript either.
- **API.** `GET /stories/:storyId/chats/:chatId/diary` lists every Character's entries, newest first. `POST …/chats/:chatId/characters/:characterId/diary` writes one and answers with it. `DELETE …/chats/:chatId/diary/:entryId` deletes one; the Character may then write about that moment again. The Chat response does not carry the Diary.
- **The screen.** A Character's profile in a Chat has a "Diary" section under "Wearing now" and above who they are: a line saying what it is, a button ("Write an entry", then "Write the next entry"), and the entries with their moment and when they were written. The newest shows; earlier ones fold behind "Show N earlier entries". When the newest entry is at the Chat's newest reply the button gives way to "Up to date. Play on, then ask for the next entry." Delete asks first, in place. The Diary is read each time the profile opens.
- **Usage.** The Usage page lists the kind as "Diary entries".

## Testing Decisions

- API (`apps/api/test/diary.spec.ts`): the moment, the Messages an entry tells of and the budget, the whole prompt and what it leaves out, and reading the answer, as pure logic; then through HTTP with the fake gateway: an entry written from a Story with Secrets, an Arc direction, Starting Bonds and a Starting Belief (the Secrets, the direction and another Character's Bond are not in the call); the refusal of a second entry with no call; the next entry telling only what is new; an unknown Character, an empty answer, credit out and a missing entry; Regenerate, an edit and Reset; a Branch; a removed Character. The turn after an entry is checked not to contain it.
- Browser (`apps/web/e2e/diary.spec.ts`, phone size): the empty Diary, asking, the "up to date" line, the next entry after a turn, earlier entries folding, Again taking an entry back, a failed ask, Delete, and an accessibility check of the open profile.

## Out of Scope

- Entries written automatically, on a schedule or at a Scene's end.
- The Narrator reading the Diary, or an entry becoming a Memory.
- "Off-screen decisions": a Character doing things between scenes that then count in the story.
- Editing an entry, and a Thai reading of one.
- The Diary in the Transcript, on the Dashboard, in the wide-screen panel, or outside a Chat.
- A Diary for the Role or a Persona.

## Further Notes

- Tried only with the fake gateway. How well the play model keeps to "no new events" and to the Character's voice has not been seen with a real model.

# Spec: Facts panel

Status: ready-for-human
Builds on: [Spec: Story quality](../story-quality/spec.md) (Established facts, "Only the user changes canon", and its follow-up note), [Spec: Growing cards](../growing-cards/spec.md) (the user's own Now note: a detail record with no Message), [Spec: Place, Weather and Outfits](../info-box/spec.md) (the Scene strip as the Chat's info box)

Built 2026-11-18.

## Problem Statement

A Chat's Established facts decide what the Narrator keeps to ("nine summers", "twenty-six"), but the user cannot see them. A wrong fact, such as one seeded from an old Chat's history, stays until the user happens to say the right one in a message. The user has no way to check the list, fix a fact, drop one that is wrong, or write down one the story has not said yet.

## Solution

The Scene strip, opened, ends with an **Established facts** button that names how many there are. It opens a sheet listing every fact as it stands, topic and telling, in the order the topics were first set, with "You set this" under the ones the user wrote. Each can be edited (its telling) or deleted; a form at the foot adds a new one. The Narrator reads the change from the next turn on, and the Judge treats a fact the user set like any listed fact: only the user's own words change it.

## User Stories

1. As a player, I want to see the Chat's facts, so that I know what the Narrator holds to be true.
2. As a player, I want to correct a fact the Judge got wrong, so that the next reply uses the right number.
3. As a player, I want to delete a fact that is wrong or not worth keeping, so that the Narrator stops holding to it and it does not come straight back.
4. As a player, I want to add a fact the story has not said yet ("Nara's birthday: the first frost"), so that a reply never makes one up.
5. As a player, I want my edits to survive Again, an edit or another Reply version, so that undoing a reply never undoes my correction.
6. As a player, I want Reset to clear the facts and a Branch to carry them, as it does the rest of the Chat's state.
7. As a player on a 360px phone, I want the list and the edit form to fit, so that I can fix a fact mid-play.

## Implementation Decisions

- **A user's fact is a detail record with no Message** (`detail_change`, kind `fact`, `message_id` NULL), exactly as the user's Now note is. The newest record of a topic wins, so it is current until the user's own words change the fact again in a message.
  - No rewind of a Message removes it (the ledger deletes only the rewound Messages' records), so Regenerate, an edit or another Reply version right after a correction keeps it. When a later Judge change to the same topic is taken back, the user's telling is current again.
  - Reset deletes every detail record of the Chat, the user's too.
  - Branch copies records with no Message and those of the Messages it keeps, in id order (`branch.service.ts`), so a Branch carries the user's facts, as it does the user's Now notes. Like them, a user fact written after the Branch's Message is carried too: it was the user's word, not the story's.
  - No migration: kind `fact` and a null `message_id` are both allowed already.
- **`PUT /api/stories/:storyId/chats/:chatId/facts`** with `{ topic, fact }` (topic at most 60 characters, fact at most 120): sets the fact of that topic, adding it when no listed topic matches. Tidied as the Judge's are (one line, no full stop at the end, a colon in a topic becomes a space). Topics match loosely (`topicKey`: case, punctuation and a leading "the" aside), and a listed topic keeps its wording. A fact of whitespace only deletes the topic. Answers the Chat.
  - Writing what is already there, or deleting what is not there, writes nothing.
  - A topic with no letters or digits is `422.004.031` `FactWithoutTopicError`; a 41st fact is `422.004.032` `TooManyFactsError` (the Judge's cap, `FACTS_MAX`, holds for the user too; a change to a listed one is always taken).
  - Like the Now note and the Author's note, it takes no turn lock: a judgement already running may still record a change after it.
- **The Chat response** carries `facts: [{ topic, fact, byUser }]`, in the order the topics were first set. `byUser` is true when the current telling is the user's own record.
- **Only the user changes canon, unchanged.** The Judge's prompt, its rule and its section are byte for byte what they were; a user's fact is listed to it like any other. `applyFacts` already keeps a listed fact against a different telling unless the user's words say it (otherwise a slip), and never lets the Judge drop one. So a fact the user set wins over what a reply says.
- **A topic the user deleted stays deleted.** Without this the Judge would record the deleted fact again the next time a reply (or the story so far) says it, since a new topic needs no user words. So `applyFacts` takes a new fact on a topic the user deleted (and nothing has set since) only when the user's own words in that exchange say it (`saidByUser`); otherwise it is dropped and logged. Read from the records (`factsState().clearedByUser`), like the Now notes' "cleared by the user", and passed by `judge.service.ts`. The prompt does not change.
- **The screen.**
  - The Scene strip, opened, has a last row: an "Established facts" button with the count ("Established facts · 3", or "none yet"). It opens the Facts sheet. The strip is the Chat's info box (.scratch/info-box/spec.md); it is hidden on the shortest screens and by its own ✕, and the ⋯ menu brings it back.
  - The Facts sheet: a line on what facts are, the list, then "Add a fact". A fact shows its topic (small, muted), its telling, and "You set this" for a user's own. Its Edit button opens it in place: the telling in a text box (topic fixed; to rename, delete it and add it again), Save, Delete, Cancel. Escape cancels the edit without closing the sheet. The add form has a Topic box and a Fact box, each with its cap, and is shown only while there is room (fewer than 40).
  - Errors show under the form that caused them. Saving re-reads the Chat from the answer.

## Testing Decisions

- API, pure (`apps/api/test/facts-panel.spec.ts`): `factsState` (byUser, a Judge change after a user's, clearedByUser and setting again), `userFactChange` (add, change, loose topic keeping the listed wording, tidy, unchanged, delete, delete of nothing, no topic, the cap), `applyFacts` with a deleted topic (dropped, taken in the user's words, a listed fact the user set kept against a reply's telling as a slip).
- API, HTTP with the fake gateway: the Chat shows the facts; add, edit and delete through `PUT`; the next turn's closing message reads the user's fact; Regenerate keeps it; a later Judge change rolled back brings the user's back; Reset clears it; a Branch carries it; the errors.
- Browser (`apps/web/e2e/facts-panel.spec.ts`, phone size): open the strip and the sheet, see a Judge's fact, edit it, add one, delete one, at 360 and 320px wide without sideways scrolling.

## Out of Scope

- Renaming a topic in place.
- Showing slips to the user.
- The facts on the wide-screen "At a glance" panel, the Transcript or the Dashboard.
- A Facts entry in the ⋯ menu (the strip is one tap away from it).

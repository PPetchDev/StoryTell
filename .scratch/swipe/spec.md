# Spec: Reply versions (swipe)

Status: done

## Problem Statement

↺ Again (Regenerate) deletes the newest AI Message and writes a new one. The old reply is gone for good. A user who presses Again on a reply they half liked, and gets a worse one, can't go back. They also can't compare two or three takes and keep the best. A failed Again is worse still: the old reply is already deleted, so the Chat ends on the User Message with Retry, or on the AI Message before it.

## Solution

The newest AI Message keeps up to 5 **Reply versions**: the one shown now plus the ones Again replaced. The Chat screen shows ‹ n/m › under that Message. A swipe or a tap on ‹ or › shows another version. Choosing one undoes what the shown version changed in the ledger, the same way Again does, makes the chosen one the shown version, and runs the judge and Memory extraction on it again, as an AI Message edit does. Versions are only ever kept on the newest AI Message. Anything that adds a Message after it, or takes it away, drops them. They are never sent in a prompt.

## User Stories

1. As a player, I want Again to keep the reply it replaces, so that I can go back to it if the new one is worse.
2. As a player, I want to see ‹ n/m › on the newest reply, so that I know how many takes I have and which one is shown.
3. As a player on a phone, I want to swipe the reply left or right to change version, so that comparing takes is quick.
4. As a player, I want ‹ and › buttons too, so that I can change version without a swipe.
5. As a player, I want the chosen version to count from then on, so that the Bonds, Arcs, Scene and Memory follow the reply I kept.
6. As a player, I want at most 5 versions, with the oldest dropped first, so that versions never pile up.
7. As a player, I want sending a message to settle on the shown version, so that the story goes on from the reply I chose.
8. As a player, I want versions never sent to the AI, so that the turn reads only the story as it stands.
9. As a player whose Again fails, I want the reply I had kept as the shown version, so that a hiccup never costs me a reply.
10. As a player, I want a Snapshot to stay with the version it was taken of, so that the picture always matches the words under it.
11. As a player, I want a Snapshot of a version that is dropped to stay in the Gallery, so that I never lose a picture.
12. As a player, I want editing the newest reply to edit the shown version only, so that my other takes stay.
13. As a player, I want editing an earlier Message or resetting the Chat to drop the versions, so that no take of a reply that no longer follows is left over.

## Implementation Decisions

- **Domain term.** "Reply version" (glossary): one take of the newest AI Message. The shown version is the Message as the Chat, the prompt and the ledger know it. The others are kept beside it, only to be chosen again.
- **Storage.** The Message row stays the shown version, so everything that reads Messages is unchanged. The other versions are rows of a new `reply_version` table:
  - `message_id` (ON DELETE CASCADE);
  - `ordinal`, the version's place in the order the versions were written (1 is the first);
  - `model`, the parts as JSON, and when it was written.

  The Message gets `version_ordinal`, the shown version's place, null while the Message has only one version. ‹ n/m › counts the rows plus the shown version in `ordinal` order. Both are added in one migration.
- **Again.** It keeps the Message row and its id. The ledger, the Story so far and the Snapshots work as follows:
  - Its ledger changes and the Story so far are rolled back as before.
  - The turn is written from the history without that Message.
  - On success, one transaction stores the shown version as a version row, writes the new reply into the Message, and makes it the last version (highest ordinal). Past 5 versions in all, the lowest ordinal goes.
  - The replaced reply's Snapshots move to its version row.
- **A failed or stopped Again.** The Message keeps the reply it had. Its ledger changes were already rolled back for the new turn's prompt, so its judge and extraction run again, as after an edit. The error is answered as before. Supersedes Regenerate's "On a failed turn the old reply is already gone".
- **Choosing a version.**
  - `PUT /api/stories/:storyId/chats/:chatId/messages/:messageId/version` with `{ version }` (1-based, the n of ‹ n/m ›).
  - It answers like an edit: the Chat plus `rolledBack`.
  - It is allowed under the same gate as an AI Message edit:
    - it holds the turn lock;
    - it waits for pending background calls;
    - a failed one does not block it, since both run again anyway.
  - The shown version's ledger changes and the Story so far are rolled back from the Message's position.
  - One transaction swaps the two versions and sets both background statuses to pending. The shown parts go to a version row, and the chosen row's parts go into the Message.
  - The background (judge, extraction, then the Story so far check) starts on it.
  - Choosing the version already shown changes nothing, rolls back nothing, and makes no call.
  - A number outside 1..m is refused with `ReplyVersionNotFoundError` (404.004.018). That includes any number but 1 on a Message without versions.
- **Snapshots.** `snapshot.reply_version_id` (ON DELETE SET NULL) is added beside `message_id`.
  - A Snapshot of the shown version is linked to the Message, as now.
  - When that version is put away, its Snapshots move to its version row, with `message_id` null. They leave the thread and stay in the Gallery.
  - Choosing the version moves them back under the Message.
  - When a version row is dropped (oldest past 5, a send, Reset, an earlier edit), its Snapshots keep only their Story and Chat. That is the Gallery's existing "from an earlier version of this Chat".
- **Dropping versions.**
  - Storing a User Message, or a new AI Message after a Continue or Retry, deletes every version row of the Chat and clears `version_ordinal`.
  - Editing an earlier Message deletes the newest Message, and with it its versions (cascade). Reset does too.
  - Editing the newest AI Message rewrites only the shown version, and its other versions stay.
- **Prompt.** Nothing changes. Prompts read the Message rows only, so the turn, the judge, the extraction, Suggested replies, the Story so far and Snapshots see only the shown version.
- **API.** AI Messages get `versions: { current, count } | null`. It is null on a Message with one version.
- **Web.**
  - Under the newest reply, ‹ n/m › sits in the action row.
  - A horizontal swipe on the reply body changes version too. A swipe left shows the next version, a swipe right the one before. The swipe is a touch gesture of at least 60px and more horizontal than vertical.
  - While the choice is saved, the controls are disabled. Afterwards the Chat, the Memory drawer and the Snapshots read again, and the rollback notice shows what was undone.

## Testing Decisions

- Tests check behaviour at the existing seams only: HTTP through the API with the fake Model Gateway (`apps/api/test/reply-versions.spec.ts`), and Playwright e2e at 390px with touch (`apps/web/e2e/reply-versions.spec.ts`). Prior art: `regenerate.spec.ts` and `snapshots.spec.ts`.
- **API.**
  - Again keeps the Message id and shows `versions: { current: 2, count: 2 }`.
  - Choosing version 1:
    - brings its parts back;
    - rolls back version 2's Bond, Arc, Scene and Memory changes and reports them;
    - answers with judge and memory pending, then runs both on it.
  - The next turn's prompt has only the shown version.
  - A sixth Again drops the oldest.
  - A send, a Continue, an earlier edit and Reset drop the versions.
  - Editing the newest reply keeps the others.
  - Choosing the shown version makes no call.
  - An out-of-range number is a 404 with `404.004.018`.
  - A failed Again keeps the old reply and runs its background again.
  - Snapshots follow their version, and a dropped version's Snapshot stays in the Gallery.
- **e2e.** After Again, ‹ 2/2 › shows. A tap on ‹ shows the first reply and 1/2, and a swipe goes back to 2/2. Sending drops the control.

## Out of Scope

- Versions on any Message but the newest AI Message, or on User Messages.
- Keeping each version's ledger results to restore them without the background calls running again.
- Branching Chats from a version.

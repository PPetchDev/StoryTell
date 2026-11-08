# Spec: Branch

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md), [Spec: Reply versions (swipe)](../swipe/spec.md), [Spec: Story so far](../story-so-far/spec.md), [Spec: Story clock](../story-clock/spec.md)
Decision: [Branch a Chat from any Message](../sillytavern-gaps/issues/01-branch-a-chat.md) (option A)

Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

The only way back to an earlier moment of a Chat is to edit a Message, and an edit deletes every Message after it for good, with every Memory, Bond, Arc step, Scene advance and Time of day change they caused. A player who wants to see how "The Young Master" would have gone if they had said no at the gate has to throw away everything that came after, or start a new Chat from the Opening and play all the way back. Reply versions don't help: they only exist on the newest reply, and they are dropped the moment the story moves on.

## Solution

**Branch from here** on any Message makes a new Chat, "<title> (branch)", holding that Chat's Messages up to and including the chosen one, with everything the Chat knew at that Message: its Memories and who knows them, Bonds, Arcs, Scene, Time of day, the worn identity and, when it covers nothing later, its Story so far. The new Chat opens at once and the user plays on from there. The original Chat is not touched. The new Chat shows which Chat it branched from, in its Chat menu and in the Story's Chat list, as a link back. Branching from a User Message makes the Branch end on the AI Message before it and puts that User Message's text in the new Chat's composer, so the user can say it differently. A Branch costs nothing: no model is called.

## User Stories

1. As a player, I want "Branch from here" on any Message, so that I can play on from that moment without losing what came after.
2. As a player, I want the original Chat left exactly as it was, so that branching never costs me anything.
3. As a player, I want the new Chat to open at once, so that I can write my next line straight away.
4. As a player, I want the new Chat to hold every Message up to and including the one I chose, so that the story reads the same up to there.
5. As a player, I want the Memories as they stood at that Message, with who knows each one, so that the Characters remember only what had happened by then.
6. As a player, I want a Memory the AI added later not to be in the Branch, so that nobody remembers events that haven't happened in it.
7. As a player, I want a Memory the AI changed, archived or deleted later to be as it was at that Message, so that the facts match the moment.
8. As a player, I want my own Memory work to come out of a Branch exactly as it comes out of an edit of the next Message, so that "the state at a Message" means one thing everywhere: a Memory I wrote myself stays, and a Memory I edited keeps my text over any later AI update; but a Memory the AI added after that Message goes, even if I edited it since, as it does on an edit.
9. As a player, I want the Bonds as they stood at that Message, with their history up to then, so that the Characters feel what they felt then.
10. As a player, I want the Arc steps up to that Message, and the Arc directions the Chat had, so that a Character's growth is the same as it was there.
11. As a player, I want the Scene the Chat was on at that Message, so that the plot is where it was.
12. As a player, I want the Time of day as it stood at that Message, so that it is still evening if it was evening.
13. As a player, I want the Branch to wear the identity the original wears now, so that I keep playing as the same Role or Persona.
14. As a player, I want the Story so far copied when it covers nothing after that Message, so that a long Chat's Branch still reads its early events.
15. As a player, I want a Story so far that reaches past that Message left out of the Branch, so that the AI never reads events that haven't happened in it; it is written again when the Branch needs one.
16. As a player, I want the Reply versions of the chosen reply to come along when I branch from the newest reply, so that I can try another take in the Branch while the original keeps the one it shows.
17. As a player, I want the Snapshots to stay with the original Chat, so that the Gallery shows each picture once, under the Chat it was taken in.
18. As a player, I want the new Chat named "<title> (branch)", so that I can tell it apart from the original in the Chat list.
19. As a player who branches the same Chat twice, I want the second one named "<title> (branch 2)", so that the two Branches are told apart.
20. As a player who branches a Branch, I want "Chat 1 (branch 2)" rather than "Chat 1 (branch) (branch)", so that titles stay short.
21. As a player, I want the new Chat to show which Chat it came from, as a link, so that I can go back and compare.
22. As a player, I want that link to bring me to the Message I branched from, so that I land where the two Chats part.
23. As a player, I want the Chat list to show "Branched from <title>" under a Branch, so that I can see how my Chats relate.
24. As a player who deletes the original Chat, I want its Branches to stay, simply without the link, so that deleting one Chat never takes another.
25. As a player, I want to branch from a User Message I wrote, and find that text waiting in the new Chat's composer, so that I can send it differently.
26. As a player, I want branching from a User Message to run no turn by itself, so that nothing spends credit until I send.
27. As a player, I want to branch from the Opening, so that I can start over while keeping the Chat's identity and Arc directions.
28. As a player, I want Branch to work even while sending is blocked (empty Story fields or text credit used up), from any Message, my own included, since it calls no model.
29. As a player, I want Branch refused while a turn is being written, so that I never copy a half-written moment.
30. As a player, I want Branch to wait for the last reply's Memory, Bonds, Arcs and Scene to finish saving, and tell me to try again in a moment if they take too long, so that the copy is never caught half-saved.
31. As a player branching from a reply whose background calls failed, I want the Branch to carry the same Retry notice, so that I can fix it there, by my own tap.
32. As a player, I want a Branch to be an ordinary Chat afterwards, renamed, reset, edited, branched or deleted like any other, so that there is nothing new to learn.
33. As a player, I want editing an earlier Message in a Branch to roll back exactly as it would in any Chat, so that a Branch never behaves differently.
34. As a player, I want a rewind in the Branch never to touch the original's Memories, and the other way round, so that the two Chats are truly separate.
35. As a player, I want the Branch to show first in the Chat list, so that I find the Chat I'm about to play.
36. As a player, I want Branch to need no confirmation, since it changes nothing and only adds a Chat.
37. As a player, I want everything else the Chat and its Messages hold to come along (the Author's note, who is Sitting out, the auto-read switch, and each copied Message's Thai reading, Documents used, part emotions and read-aloud audio), so that the Branch reads, sounds and is directed the same way.
38. As a player, I want backups to hold Branches and their link like any other Chat, so that restoring loses nothing.

## Implementation Decisions

- **Glossary:** "Branch" is already in `CONTEXT.md`. No new terms.
- **How the copy reaches the state at Message N.** Copy everything the source Chat owns, then roll the copy back from position N + 1 with the existing newest-first rollback, then delete the copy's Messages after N. Not "copy only the rows up to N". Why:
  - Bonds, Arc steps, Scene advances and Time changes are append-only, but Memory is not. A Memory's state at N is its state now with every later change undone (an update's old text back, an archive lifted, a Known-by addition taken off, a deleted Memory put back, a later add removed). That undo is exactly what `rollbackFrom` does for an edit, a Regenerate and choosing a Reply version.
  - The Chat's `current_scene_id` and `time_of_day` at N fall out of undoing the later SceneAdvances and TimeChanges, so they need no replay logic.
  - A Branch at N then holds exactly what an edit of Message N + 1 would leave behind. "The state at a Message" has one meaning across edit, Regenerate, Reply versions and Branch. The consequences for the user's own Memory work are deliberate and match an edit, because they are what `rollbackFrom` does today:
    - a Memory the user wrote (no Add record) stays, even one written after N;
    - a locked Memory keeps the user's text: undoing a later AI update skips a locked Memory;
    - a Memory the AI added after N goes, even if the user edited (and so locked) it since: undoing an Add deletes the Memory whatever happened to it afterwards.
  - The rollback finds its records through Messages at or after the rewind position, so the copy holds every Message row of the source, including those after N. Those later Messages need only their rows. Their parts and Reply versions are not copied, and they are deleted once the rollback has run.
- **One transaction.** The whole Branch is one database transaction: create the Chat, copy, roll back, delete the later Messages. A failure leaves no half-made Chat. It runs at REPEATABLE READ, so every read of the source sees one snapshot (see "Isolation" under the gate). This needs the prefactor below.
- **Prefactor: rollback inside a caller's transaction.** Only `LedgerModelService.rollbackFrom` opens its own transaction. It gains an optional transaction manager: given one, it runs inside it; with none, it opens its own transaction, as today. The Memory helpers it uses need no change: `createMemory` already takes a manager, and the rollback never calls `setKnownBy` (undoing a Known-by addition deletes the added rows directly). Every existing caller is unchanged.
- **What is copied**, all in source id order, so new ids keep the old relative order. The rollback's newest-first order and the Memory layer's stable order depend on it.
  - **The Chat row:** `story_id`, `current_scene_id`, `time_of_day`, `persona_id`, and the Story so far columns (subject to the rule below). The new Chat gets its own `created_at` and `last_played_at` (now), so it heads the Chat list. The source's `last_played_at` is not touched.
  - **Messages:** every row with its `position`, `kind`, `text`, `identity_name`, `persona_id`, `model`, both background statuses and errors, `version_ordinal` and `created_at`. The parts go only for Messages at or before N.
  - **Reply versions:** only the newest Message can have them, so they come along only when N is the source's newest Message. Its `reply_version` rows are copied, and `version_ordinal` keeps which version is shown. Their Snapshots stay with the original (see Snapshots).
  - **Memories:** each with its `text`, `written_by`, `locked`, `archived`, `created_at` and Known-by rows, and `message_id` remapped.
  - **MemoryChanges:** with `kind`, `before`, `after`, `event`, `created_at`, and `memory_id` and `message_id` remapped. `before` and `after` hold Character ids, which belong to the Story and need no remapping.
  - **BondChanges** (StartingBond seeds with no Message included), **ArcSteps**, **SceneAdvances** and **TimeChanges**, with `message_id` remapped.
  - **ChatArcDirections:** the Branch keeps the copies the source holds, not the Story's current Arc directions ("Live vs copied edits").
  - **Extended by the features that land after Branch.** Branch lands before any other feature that adds per-Chat or per-Message data ([integration](../sillytavern-gaps/integration.md)). Each of those adds its own copy step to Branch's copy, in its own ticket blocked by [Branch ticket 02](issues/02-branch-a-chat.md), with a test that a Branch carries it:

    | Data | Copied as | Extended by |
    |---|---|---|
    | Author's note | the Chat's note | [authors-note 01](../authors-note/issues/01-authors-note-in-turns-and-the-chat-menu.md) |
    | Sitting out | the Chat's set | [speaker-controls 01](../speaker-controls/issues/01-sitting-out-in-turns-and-the-sheet.md) |
    | Auto-read switch | the Chat's switch | [read-aloud 04](../read-aloud/issues/04-auto-read-new-replies.md) |
    | Thai readings | with the copied Messages, ids remapped, fingerprints unchanged | [write-for-me 03](../write-for-me/issues/03-thai-reading.md) |
    | Documents used by a Message | with the copied Message | [documents 04](../documents/issues/04-documents-reach-the-narrator.md) |
    | Emotion on a message part | with the copied parts | [expressions 03](../expressions/issues/03-judge-tags-emotions.md) |
    | Read-aloud audio | audio files copied to the new Message ids, no credit spent | [read-aloud 03](../read-aloud/issues/03-read-a-message-aloud.md) |

    Per-Message data is copied only for the Messages the Branch keeps (at or before N); the rows of later Messages are deleted with them.
- **Memory ids.** `memory_change.memory_id` is a plain id, not a foreign key, and a rolled-back delete puts the Memory back under that id. The existence check before that re-insert is not scoped to a Chat. So the Branch must never share a Memory id with its source:
  - Gather every Memory id the source mentions: its live Memories, plus every id in its MemoryChanges, which covers deleted Memories.
  - In ascending order, give each one a fresh id from the `memory` table's id sequence.
  - Insert the live ones under their new ids, with explicit-id inserts like the existing re-insert path, and rewrite every MemoryChange to the new ids.
  - A deleted Memory's reserved id is free until a rollback in the Branch puts it back, now or on a later edit. It then sits in the same relative order it had in the source.
- **Message ids.** New Messages get new ids, and an old-id → new-id map rewrites every `message_id` above. The source's Messages and ledger rows are only read.
- **Story so far.** It is kept only when it covers nothing past N, that is when `story_so_far_through` ≤ N's position. That is the same test a rewind from N + 1 uses. Kept, all six Story so far columns are copied, the user's corrections included. Otherwise the Branch has none, and the usual check after the Branch's first turn writes one when the Branch needs it. The Story so far as it stood at N can't be recovered (no history of it is stored), so dropping is the honest choice. Until it is rewritten, the turn leaves out the oldest Messages to fit, as it does today.
- **Snapshots stay with the original.** None are copied, re-linked or duplicated. The Branch's Messages show no Snapshots, and the Gallery keeps grouping each Snapshot under the Chat it was taken in. The Cover is unaffected.
- **Branching from a User Message.** The Branch is made at the Message before it (the copy holds Messages up to the User Message's position − 1). The answer carries the User Message's text as `draft`, which the web puts in the new Chat's composer. No turn runs and no credit is spent until the user sends. A User Message is never the first Message, since the Opening is, so there is always a Message before it.
- **Branching from an AI Message** (the Opening included) copies up to and including it. Its background statuses come along as they are: done, failed (the Branch shows the usual Retry notice, and the user's tap runs the call in the Branch), or null for the Opening and old replies.
- **The gate.** Branch:
  - is refused with `TurnInProgressError` while the source Chat's turn is being written;
  - holds the source's turn lock while it copies, so no send, edit or reset starts meanwhile;
  - waits for the source's pending background calls like an AI Message edit or a reset (`settledForWrite`), and past the wait answers `BackgroundStillSavingError`. A judge or extraction that wrote rows halfway through the copy would leave the copy's ledger and Memories out of step;
  - is refused with `TurnInProgressError` while a manual Retry of the judge or of Memory extraction runs for the source Chat (see "Isolation");
  - is not blocked by failed background calls, an unplayable Story or credit being out, since it calls no model.
- **Isolation.** Two things could write to the source while it is copied, and each is settled:
  - **A manual Retry.** Today `retryJudge` and `retryExtraction` take no lock: they set the status to pending and run the call at once. A Retry that starts after Branch has settled the background calls would write Bonds, Arcs, Scene or Memories halfway through the copy. Decision: a manual Retry now holds the Chat's turn lock while it runs, as a turn does. So Branch (and a send, an edit or a reset) is refused with `TurnInProgressError` while a Retry runs, and a Retry tapped while a Branch holds the lock is refused the same way. The web already treats a Retry as a write in flight, so nothing else can be tapped meanwhile.
  - **Writes that take no lock on purpose:** the user's own Memory actions, and later the Author's note, Sitting out and the auto-read switch. Transactions run at Postgres's default READ COMMITTED today, so one copy statement could see such a write and the next not. Decision: the Branch's transaction runs at REPEATABLE READ. Every read of the source sees one snapshot, so each such write lands wholly in the Branch or wholly not. The Branch writes only rows of the new Chat, so no other writer competes with it and no serialization failure is expected.
- **Title.** "<title> (branch)", where <title> is the source's title with any trailing " (branch)" or " (branch N)" taken off. When that title is already taken in the Story, the next free "(branch 2)", "(branch 3)", and so on. Cut to the 200-character title limit.
- **The link back.** New `chat` columns:
  - `branched_from_chat_id` (foreign key to `chat`, ON DELETE SET NULL);
  - `branched_from_message_id` (foreign key to `message`, ON DELETE SET NULL): the Message the user tapped, so the User Message itself when branching from one.

  Both are null for Chats that were never branched, and both are added in one migration. Deleting the original clears the link and keeps the Branch. Deleting a Branch does nothing to the original. Reset keeps the link, like the title.
- **API.**
  - `POST /api/stories/:storyId/chats/:chatId/messages/:messageId/branch`, no body. It answers 201 with the new Chat's `ChatDetail` plus `draft: string | null`. Errors: `ChatNotFoundError`, `MessageNotFoundError`, `TurnInProgressError`, `BackgroundStillSavingError`. No new error codes.
  - `ChatDetail` gains `branchedFrom: { chatId: number; title: string; messageId: number | null } | null`. The title is read live from the source Chat, so a rename shows.
  - `ChatListItem` gains `branchedFrom: { chatId: number; title: string } | null`.
- **Modules.**
  - `ChatManagerService` gains `branchChat(storyId, chatId, messageId)`, which owns the gate, the title and the draft. `retryJudge` and `retryExtraction` run under the turn lock.
  - The copy itself is one model-level function over the Chat, Message, Memory and ledger tables in one REPEATABLE READ transaction. It is made of copy steps, each taking the transaction's manager, the source and new Chat ids and the id maps (Message ids, Memory ids); the ledger's step ends with `rollbackFrom` on the copy. **This function is the one place a Chat is copied**: every later feature with per-Chat or per-Message data adds its own step to it (see "Extended by" above) rather than writing a copy of its own.
  - The Chat list and detail read the link.
- **Web.**
  - "⑂ Branch" is a new action, always the last one, in two places ([integration](../sillytavern-gaps/integration.md), "Message actions"):
    - in the newest AI Message's action row, after the existing actions (▶ Read aloud and ไทย later go between them and ⑂);
    - in the tools a tap on any other Message shows (the Opening and User Messages included), after ✎ Edit.

    At 390 px wide whatever doesn't fit moves into a "⋯" overflow, and an e2e checks nothing overflows.
  - It is offered whenever no turn or write is in flight and no edit is open, **including while sending is blocked**, because it runs no turn.
  - **User Messages while sending is blocked.** Today the thread makes a User Message untappable while sending is blocked (a User Message edit runs a turn): `editable` is `canEdit && (message.kind === 'ai' || !blocked)`, and a Message that isn't editable gets no tap handler, so it shows no tools. This changes: a User Message stays tappable whenever ⑂ can be offered, and while sending is blocked its tools are ⑂ Branch alone, with no ✎ Edit. AI Messages are unchanged (their edit runs no turn, so they already stay editable).
  - There is no confirmation. While it runs, the actions are disabled. On success the app goes to the new Chat. A `draft` reaches that Chat's composer through a one-shot hand-off in the browser's session storage, keyed by the new Chat's id and never put in the URL, and a quiet status line says "Branched from <title>".
  - The Chat menu gains a "Branched from <title>" line at its top, above the existing rows. It links to the source Chat at the Message branched from (`#message-<id>`), and is shown only while the link exists.
  - The Chat list shows "Branched from <title>" under a Branch's title.
- **Usage:** no model call, so nothing is logged or spent.
- **Error-code docs:** none new. `docs/error-codes.md` gains Branch in the lists of writes that `TurnInProgressError` and `BackgroundStillSavingError` refuse, and notes that `TurnInProgressError` also answers while a manual Retry runs.

## Testing Decisions

- Test only external behaviour: what the API answers, what the gateway is asked on the Branch's next turn, and what the Chat screen and Chat list show. Don't test the copy's SQL or the id maps directly.
- **API tests** through HTTP with the fake gateway, in a new `branch` spec. Prior art: `test/regenerate.spec.ts` and `test/reply-versions.spec.ts` for scripted turns, rollback counts and background statuses; `test/story-duplicate.spec.ts` for "the copy is separate from the source"; `test/story-so-far.spec.ts` for coverage; `test/judge.spec.ts` "rollback on edit" for ledger state.
  - Branching from AI Message N of a Chat with later turns: the Branch has Messages 1…N with the same parts; its dashboard Bonds, Arc steps and Scene equal what an edit of Message N + 1 in a twin Chat leaves; its Time of day is N's; the source is unchanged, Message for Message and Memory for Memory.
  - Memory at N:
    - a Memory added after N is absent;
    - one updated, archived or given a Known-by after N is back as it was;
    - one deleted after N is back;
    - a user-written Memory from after N stays;
    - an AI-added Memory from after N that the user then edited is gone, as an edit of N + 1 leaves it;
    - an AI Memory from before N that the user edited after N keeps the user's text over a later AI update.
  - Separation: deleting or editing a Memory in the Branch leaves the source's alone. An edit in the Branch that rolls back a delete from before N puts the Memory back in the Branch only, and the source keeps its own, both when the source still has that Memory and when it has deleted it too.
  - Reply versions come along when branching from the newest reply, and choosing one in the Branch leaves the source's shown version alone. Branching from an earlier reply brings none.
  - The Story so far is copied when its last covered position ≤ N, and absent otherwise.
  - Snapshots of the source stay under the source; the Branch's Gallery group is empty.
  - Branching from a User Message: the Branch ends on the Message before it, `draft` is its text, `awaitingReply` is false, and the gateway received no call.
  - Titles: "(branch)", then "(branch 2)", and a Branch of a Branch gives "(branch 2)" rather than a stacked suffix.
  - The link: `branchedFrom` on the detail and the list; renaming the source shows the new title; deleting the source clears it and keeps the Branch.
  - The gate: refused mid-turn; waits for a pending judge; `409.004.007` past the wait; allowed with failed background calls (statuses copied); allowed with the Story unplayable and with credit out.
  - Isolation: a Branch while a manual Retry of the judge runs (the fake gateway holding the judge's answer) is `409.004.004`, and a manual Retry while a Branch holds the lock is `409.004.004` too; a manual Retry with nothing else running answers as before.
  - The next turn in the Branch sends only Messages 1…N in its history, and Memory and Feelings as at N.
- **Prefactor:** the whole existing suite stays green, and `rollbackFrom` called inside an outer transaction that then fails leaves nothing rolled back.
- **e2e** (Playwright, 390px, fake gateway), a new `branch` spec. Prior art: `e2e/edit-and-reset.spec.ts`, `e2e/reply-versions.spec.ts`, `e2e/chat-top-bar.spec.ts`.
  - ⑂ Branch on an earlier reply opens "<title> (branch)" ending on that reply.
  - Going back shows the original intact.
  - Branching from a User Message opens the Branch with its text in the composer.
  - While sending is blocked (the Story unplayable), a tap on a User Message shows ⑂ Branch and no ✎ Edit, and ⑂ makes the Branch.
  - The Chat menu's "Branched from" line at its top leads back to the original, and the Chat list shows the line.
  - At 390 px, the newest reply's action row and a tapped Message's tools do not overflow horizontally.

## Out of Scope

- Named checkpoints, and a tree or graph of Branches. The link goes one step back only.
- Copying or sharing Snapshots between a Chat and its Branches.
- Branching into another Story, or merging two Chats.
- Branching from a Reply version that isn't shown. Choose it first, then branch.
- Keeping a Story so far that reaches past N by cutting it back. It is dropped and rewritten when needed.
- Running the Branch's first turn, or its Story so far update, as part of the Branch.

## Further Notes

- The decision ([01](../sillytavern-gaps/issues/01-branch-a-chat.md)) says the Branch has the Story so far "as it stood there". No history of the Story so far is kept, so this spec reads that as "copied when it covers nothing past N, otherwise dropped and rewritten", which the decision's option A states.
- Cross-feature copy steps: Branch lands first, and its copy is the function the later features extend, each in its own ticket with its own test (the "Extended by" table under "What is copied"). Branch's tickets copy only what exists when Branch lands.
- Open question: should a Branch from a User Message instead copy up to and including it and leave it awaiting a reply with Retry? Recommended answer: no. The existing "The last turn failed" notice would mislead, and putting the text in the composer lets the user reword it, which is the reason to branch there.
- Open question: should the Branch kick off a Story so far update at once when it drops one? Recommended answer: no. It would spend credit without a tap, and the next turn's own background check does it.

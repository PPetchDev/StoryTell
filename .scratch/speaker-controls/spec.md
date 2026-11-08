# Spec: Speaker controls (Nudge and Sitting out)

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md), [How one AI turn behaves](../storytell-mvp/issues/07-one-ai-turn-prototype.md), [Spec: Streaming replies](../streaming/spec.md)
Decision: [Choosing who speaks in a group](../sillytavern-gaps/issues/13-group-speaker-controls.md) (options A + B)

Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

One play-model call writes the whole turn, and the Narrator decides which Characters speak. That design is right, but it leaves the user two wishes with no answer. Sometimes a Character the user wants to hear from stays quiet turn after turn, and the only way to ask is to write it into the Role's own line ("I turn to Mira and wait"), which isn't always what the Role would do. Sometimes a Character should be out of the story for a while (asleep, gone to the city, simply not wanted in this part), yet the Narrator keeps bringing them back, and the background calls keep giving them feelings and Memories of events they never saw.

## Solution

- **Nudge:** tapping a Character in the composer's Character row (its Portraits, the composer's second band) asks the Narrator to give that Character a line in the next turn. It is a hint in the trailing system message, which the Narrator may pass over, never a forced speaker. It works with a send, with Continue (▶ on an empty box), and with Retry and Again. It clears once a turn has written its reply.
- **Sitting out:** from a "Who's in this Chat" sheet, the user keeps a Character out of this Chat's turns until bringing them back:
  - the Narrator is told not to write them;
  - any line the model writes for them anyway is dropped;
  - the judge gives them no new feelings or Arc steps;
  - Memory extraction adds them to no Known by;
  - Snapshots leave them out of the frame unless the user's hint names them.

  Their Memories and Bonds stay exactly as they were, ready for when they come back. The cast cards stay in the cached system message, so neither control breaks prompt caching. Neither adds a model call.

## User Stories

1. As a player, I want a row of the Chat's Characters in the composer, so that I can see who I can call on.
2. As a player, I want to tap a Character in that row to nudge them, so that the Narrator gives them a line in the next turn.
3. As a player, I want the nudged Character to stay highlighted until the turn is written, so that I can see what I asked for.
4. As a player, I want to tap the highlighted Character again to take the nudge back, so that I can change my mind before sending.
5. As a player, I want only one Character nudged at a time, so that the hint stays simple and clear.
6. As a player, I want the nudge to be a hint the Narrator may pass over, so that a nudge never breaks the story (someone who isn't there can't speak).
7. As a player, I want to nudge and then tap ▶ Continue with an empty box, so that I can let a Character speak up without writing anything myself.
8. As a player, I want the nudge to apply to a send, Retry, Again and an edited User Message too, so that it rides on whatever turn runs next.
9. As a player, I want the nudge to clear once the turn's reply is written, so that it never sticks to later turns by accident.
10. As a player whose turn failed or was stopped, I want the nudge kept, so that Retry still carries it.
11. As a player, I want a nudge never stored in the Chat, so that the history holds only the story.
12. As a player, I want the nudge to cost nothing extra, so that steering who speaks spends no credit beyond the turn itself.
13. As a player, I want to set a Character as sitting out from a "Who's in this Chat" sheet, so that they are kept out of the story for now.
14. As a player, I want to reach that sheet from the Chat menu and from the end of the Character row, so that it is easy to find while playing.
15. As a player, I want to bring a Character back from the same sheet, so that sitting out is never permanent.
16. As a player, I want the Narrator told not to write a Character who is sitting out, so that they stay out of the scene.
17. As a player, I want any line the model writes for a Character sitting out dropped from the reply, while it streams and once it is stored, so that they truly stay silent.
18. As a player, I want the other Characters still able to talk about someone sitting out, so that the world doesn't pretend they never existed.
19. As a player, I want a Character sitting out to keep their feelings as they were, so that they come back feeling what they felt when they left.
20. As a player, I want a Character sitting out to gain no Arc steps, so that they don't change from events they weren't in.
21. As a player, I want the others' feelings toward a Character sitting out still able to change, so that someone can come to resent the one who left.
22. As a player, I want a Character sitting out added to no new Memory's Known by, so that they don't learn what happened without them.
23. As a player, I want the Memories a Character sitting out already knows to stay, so that they remember their past when they come back.
24. As a player, I want a Snapshot to leave out a Character sitting out, unless my hint names them, so that pictures match the scene and my own words still win.
25. As a player, I want the reminder near the end of the prompt not to call a Character sitting out "in the latest exchange", so that the Narrator never gets two opposite hints.
26. As a player, I want the Character row to leave out Characters sitting out, so that I can't nudge someone who is away.
27. As a player, I want the row's end to show how many are sitting out, so that I don't forget someone is.
28. As a player, I want a nudge on a Character to clear when I set them sitting out, so that the two never clash.
29. As a player, I want the API to refuse a nudge on a Character sitting out, so that a stale screen can't send a contradiction.
30. As a player, I want older Messages where a Character sitting out spoke to show as they always did, so that the history never changes.
31. As a player who edits an AI Message by hand, I want my lines for a Character sitting out kept, since I wrote them myself.
32. As a player, I want the Opening to stay as the author wrote it, even when it has a Character sitting out.
33. As a player, I want edits, Regenerate and choosing a Reply version to leave who is sitting out alone, so that it never rolls back with the story.
34. As a player, I want Reset to keep who is sitting out, as it keeps the identity I wear, so that starting over keeps my choice.
35. As a player, I want a Branch to copy who is sitting out, so that the Branch starts with the same people in play.
36. As a player, I want a Character removed from the Story to drop out of every Chat's Sitting out by itself, so that nothing is left over.
37. As a player, I want every Character able to sit out at once, so that the Narrator can tell a stretch of the story with only the world and my Role.
38. As a player, I want Suggested replies not to suggest talking to someone sitting out, so that the ideas fit the scene.
39. As a player of a one-Character Story, I want "Who's in this Chat" still in the Chat menu, so that I can set the lone Character sitting out, while the Character row (and with it Nudge) appears only with two or more Characters, so that a lone Character's Chat isn't cluttered.
40. As a player, I want sitting out never to break prompt caching, so that turns stay as fast and cheap as before.
41. As a player, I want backups to keep who is sitting out, so that restoring loses nothing.

## Implementation Decisions

- **Glossary:** "Nudge" and "Sitting out" are already in `CONTEXT.md`. No new terms.
- **Sitting out: storage.**
  - A new `chat_sitting_out` table: `chat_id` and `character_id`, composite primary key, both foreign keys ON DELETE CASCADE. A removed Character or a deleted Chat drops its rows. Added in one migration.
  - It is a table rather than an array column so the cascade does the cleanup, as `memory_known_by` does.
  - It is Chat state outside the ledger: edits, Regenerate and choosing a Reply version never touch it, Reset keeps it, a Branch copies it.
- **Sitting out: API.**
  - `PUT /api/stories/:storyId/chats/:chatId/sitting-out` with `{ characterIds: number[] }` replaces the whole set and answers the Chat. An id not in the Story's cast is `CharacterNotFoundError` (404.003.002).
  - No turn lock and no wait for background calls, like swapping the worn identity: a turn being written finishes with the set it started with.
  - `ChatDetail` gains `sittingOut: number[]`, in cast order.
- **Sitting out: the turn prompt.**
  - The cast cards and the "@Name:" name list in the system message stay as they are, everyone included. The system message, and with it the cached prefix, never changes when someone sits out or comes back, and the Narrator still knows who the others are talking about.
  - "Where things stand" in the trailing system message gains one sentence when anyone is sitting out. It names them and says they take no part in the story for now: don't write their words or actions, and don't bring them into the scene.
  - "In the latest exchange" leaves out Characters sitting out, so the two hints never disagree.
  - **The Memory layer is not touched.** The same "present" list (the Characters in the latest exchange) also orders which Memories the Memory layer leaves out once it is over its cap: Memories about a present Character go last. If the filtered list fed that order, setting someone sitting out would change which Memories are left out above the cap, and with it the system message and the cached prefix. So the Memory layer keeps reading the exchange's Characters as they are, everyone included; only the reminder's "In the latest exchange" line leaves out those sitting out. Under the cap nothing is left out either way.
  - The prompt layers input gains `sittingOut` (names), so Suggested replies and the Story so far trigger's fixed cost (which builds the reminder) see it too.
- **Sitting out: the reply parser.**
  - `parseReply` gains an option, the ids of Characters sitting out. With the guard on (every model-written reply, streamed or not), a speech part whose speaker is one of them is dropped, with the continuation lines under it. The parsed reply reports the dropped speakers, and the turn logs them, as it logs unknown speakers.
  - Narration that mentions them stays: the parser can't tell a mention from an action, and others may talk about them.
  - With the guard off (the Opening, an AI Message the user edits) nothing is dropped.
  - The streaming path re-parses the released text with the same option, so a dropped line never shows, even briefly.
- **Sitting out: the judge.**
  - In the judge prompt, a Character sitting out is marked in the cast as not in the story now, with no Bond or Arc changes.
  - The apply rules gain the sitting-out ids and drop, with a logged reason, any Bond change *from* a Character sitting out and any Arc step *for* one.
  - Bond changes from others *toward* them still apply, because those are the others' feelings.
  - Scene and Time of day are unaffected.
- **Sitting out: Memory extraction.**
  - The present Characters it is told about exclude those sitting out, and so does its "everyone" fallback when it finds nobody.
  - The apply rules drop Characters sitting out from the Known by of a new Memory and from Known-by additions, logged.
  - A merge keeps the Known by its sources already had, since that is old knowledge.
  - Updates and archives of Memories they know still apply: facts in the world can change while someone is away.
- **Sitting out: Memories the user adds by hand.** Today a Memory the user adds with no Known by given is known by the Characters present (the latest exchange's, or everyone when it names nobody), and the Memory drawer's add form starts its Known-by picker from that same list. Left alone, that would quietly tag Characters sitting out. Decision: that default, and the `present` list the Memory list answers for the form, leave out Characters sitting out, the "everyone" fallback included, as extraction does. The user can still tick them in the picker: an explicit Known by is the user's own choice and is kept as given, as the Snapshot hint wins.
- **Sitting out: Snapshots.** The Snapshot writer's cast and the in-frame pick leave out Characters sitting out, unless the user's hint names them: the hint is the user's own explicit words, and they win.
- **Unchanged by Sitting out:** the Story so far writer, which covers old Messages where they took part; Lore and Lore in play; the Memory graph; the dashboard; the Transcript.
- **Sitting out: Suggested replies.** The shared layers carry the set, and the suggestions instruction gains one line asking for no option that addresses a Character sitting out.
- **Nudge: API.**
  - The bodies of send, Retry, Continue, Regenerate and a User Message edit accept an optional `nudgeCharacterId`. Retry, Continue and Regenerate take an optional JSON body for it, and without one behave exactly as today.
  - Before anything is stored:
    - an id not in the Story's cast is `CharacterNotFoundError`;
    - a Character sitting out is a new `NudgeSittingOutError` (409, chat domain: "<Name> is sitting out. Bring them back before nudging them."). It takes the next free chat-domain code in `docs/error-codes.md` at implementation time.
  - An AI Message edit runs no turn and takes no nudge.
- **Nudge: the turn prompt.**
  - The turn prompt input gains `nudge` (a Character's name, or null). It is turn-only and not part of the shared layers.
  - In the trailing system message, in the one order of [integration](../sillytavern-gaps/integration.md) (**Lore → Documents → Author's note → Where things stand → Nudge → the final instruction**), one line says the user would like to hear from that Character this turn. It asks the Narrator to give them a line or a moment if they could plausibly be there, and to carry on naturally without forcing it if not.
  - It counts in the turn's budget as part of that message. The Story so far trigger adds a small fixed allowance for it.
- **Nudge: never stored.** No column, no ledger record, no usage of its own. The judge, extraction, Suggested replies and Snapshots never see it.
- **Model calls and usage:** no new call. Both controls only change the input of calls already made and logged (`turn`, `judge`, `memory_extraction`, Suggested replies, `snapshot_prompt`), all of them already on the user's tap or following one.
- **Modules:**
  - The turn prompt builder gains the reminder sentence and the nudge line.
  - The reply parser gains the drop option.
  - The judge's and the extraction's apply rules gain the sitting-out set; their prompt builders mark it.
  - The Snapshot service filters its cast.
  - The Memory manager's "present" default leaves out Characters sitting out.
  - `ChatManagerService` reads the set with the Chat (the Chat model service loads it in `findWithMessages`), validates nudges, and gains `setSittingOut`.
  - The Chat controller gains the route and the optional body fields.
- **Web.**
  - **The Character row:**
    - It is band 2 of the composer ([integration](../sillytavern-gaps/integration.md), "The composer, top to bottom"): below the Panel (Suggested reply cards, the Saved replies tray or a status) and above the Tool row. It is shown only when the Story has two or more Characters. The bands come from [write-for-me ticket 01](../write-for-me/issues/01-composer-tool-row.md), which this row is blocked by.
    - It holds one chip per Character not sitting out (Portrait and name), scrolling sideways when it overflows.
    - A tap toggles the nudge on that Character (`aria-pressed`), one at a time.
    - The last chip, "Who's here", opens the sheet; it reads "N sitting out" when anyone is.
    - The row is disabled while a turn or write is in flight.
  - **The nudge state** lives in the Chat screen:
    - it is sent with the next send, Continue, Retry, Again or User Message edit;
    - it clears once a turn answers with its reply;
    - it is kept when a turn fails or is stopped;
    - it clears when that Character is set sitting out, and when the user leaves the Chat.
  - **"Who's in this Chat":**
    - The sheet lists every Character with their Portrait, name and a switch between "In the story" and "Sitting out".
    - Each switch saves the whole set at once, as a write, with the usual busy state and error line.
    - The Chat menu gains a row for it, after the existing rows and after Author's note ([integration](../sillytavern-gaps/integration.md): Author's note · Who's in this Chat · Read replies aloud). It is there whatever the cast size. Its quiet line reads "Everyone is in", or names who is sitting out.
- **Branch copy:** [Branch](../branch/spec.md) lands first and owns the one copy of a Chat. [Ticket 01](issues/01-sitting-out-in-turns-and-the-sheet.md) adds the set to Branch's copy, blocked by [Branch ticket 02](../branch/issues/02-branch-a-chat.md), with a test that a Branch carries it.

## Testing Decisions

- Test only external behaviour: the messages the fake gateway receives, the parts of stored Messages, the dashboard and Memory the API answers, and what the Chat screen shows.
- **Pure prompt tests**, beside `test/turn-prompt-reminder.spec.ts`:
  - with someone sitting out, the reminder names them and "In the latest exchange" leaves them out;
  - with a nudge, the line comes after the reminder and before the final instruction;
  - with neither, the prompt equals today's;
  - the system message is identical with and without either, including above the Memory cap: with the Memory layer over its cap and a Memory about Mira, setting Mira sitting out leaves the same Memories out as before.
- **API tests** through HTTP with the fake gateway, in a new `speaker-controls` spec. Prior art:
  - the "reply parser and guard" section of `test/chats.spec.ts`;
  - the guard section of `test/streaming.spec.ts`;
  - the filters of `test/judge.spec.ts`;
  - `test/memory.spec.ts`;
  - `test/snapshots.spec.ts`;
  - `test/suggested-replies.spec.ts`.

  Cases:
  - **Setting the set:** the PUT replaces and answers it; an unknown id is a 404; removing the Character from the Story drops it.
  - **The reply:** a scripted reply with an `@Mira:` line, while Mira sits out, stores no Mira part (and the streamed parts never held one), while narration naming her stays; an AI Message edit with her line keeps it.
  - **The judge:** a scripted judgement with a Bond change from her and an Arc step for her applies neither, while a Bond change toward her from another Character applies.
  - **Extraction:** a scripted extraction adding her to a new Memory's Known by leaves her off.
  - **Memories added by hand:** with no Known by given, a new Memory is not known by her, and the Memory list's `present` leaves her out; given explicitly, she is kept.
  - **Snapshots:** the writer's cast leaves her out, unless the hint names her.
  - **Suggested replies:** their instruction has the line.
  - **Keeping the set:** a User Message edit and Reset keep it; a Branch carries it.
  - **Nudge:** on a send, a Continue, a Retry and a Regenerate, the trailing message holds the line; nudging her while she sits out is the new 409 with nothing stored; an unknown id is a 404; the next turn without a nudge has no line; the judge and extraction calls never hold it.
- **e2e** (Playwright, 390px, fake gateway), a new `speaker-controls` spec. Prior art: `e2e/composer-and-actions.spec.ts`, `e2e/continue.spec.ts`, `e2e/suggested-replies.spec.ts`, `e2e/chat-top-bar.spec.ts`.
  - A tap on a chip highlights it; ▶ Continue clears it once the reply is in.
  - In "Who's here", setting a Character sitting out removes their chip, shows "1 sitting out", and survives a reload.
  - Bringing them back restores the chip.
  - A one-Character Story shows no Character row, and its Chat menu still offers "Who's in this Chat".

## Out of Scope

- SillyTavern's activation strategies (natural, list, pooled, manual), auto-mode and self-responses: the Narrator writes everyone in one call, and repeated Continue stays user-driven.
- Forcing a speaker, or nudging several Characters at once.
- Taking a Character's card out of the system message while they sit out (it would break the cached prefix for little gain).
- Marking a Character sitting out on the dashboard, in the Memory graph or in their Character profile.
- Remembering which nudge a past turn had, or replaying it on Again.
- @mentions in the composer text.

## Further Notes

- The decision ticket's Recommendation was "D for now", but the Answer is A + B. This spec follows the Answer.
- `CONTEXT.md` says that while sitting out "their Memories and Bonds stay as they were". This spec reads "their Bonds" as the Bonds they hold (their feelings toward others and the user). Others' feelings toward them may still change. That matches the Bond definition, "a Character's feelings toward the user or toward another Character".
- Open question: should the nudge be kept server-side (a Chat column cleared after each turn) so a reload keeps it? Recommended answer: no. A nudge is part of one turn's request, so a request field is enough, and keeping it on the client until a turn succeeds already covers Retry.
- Open question: should Characters sitting out show in the row, dimmed, instead of being left out? Recommended answer: no. The "N sitting out" chip says it in less space on a phone, and the sheet is one tap away.

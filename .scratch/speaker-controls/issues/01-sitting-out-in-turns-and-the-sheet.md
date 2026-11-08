# 01 — Set a Character sitting out, and the turns leave them out

**Status:** ready-for-agent

Part of: [Spec: Speaker controls](../spec.md)

**What to build:** From a "Who's in this Chat" sheet in the Chat menu, the user sets a Character sitting out, and from the next turn the Narrator leaves them out of the story until the user brings them back. Follow the spec's "Sitting out" decisions for storage, API, the turn prompt, the reply parser and Suggested replies:

- Storage and API: a `chat_sitting_out` table (both keys ON DELETE CASCADE); `PUT /api/stories/:storyId/chats/:chatId/sitting-out` with `{ characterIds }`, which replaces the set and answers the Chat; `sittingOut` on the Chat detail, in cast order. No turn lock and no wait for background calls.
- Turns: "Where things stand" names the Characters sitting out and says not to write them or bring them in; "In the latest exchange" leaves them out. The cast cards, the name list and the Memory layer stay as they are (the Memory layer's leave-out order keeps reading the exchange's Characters unfiltered), so the system message never changes.
- The reply parser, with the guard on (every model-written reply, streamed or not), drops their speech lines and logs them; narration naming them stays. Hand-edited AI Messages and the Opening keep their lines.
- Suggested replies get a line asking for no option that addresses them.
- Chat state: edits and Reset keep the set; a Branch carries it, through a step added to [Branch's copy](../../branch/issues/02-branch-a-chat.md).
- Web: a "Who's in this Chat" row in the Chat menu after the existing rows and after Author's note, offered whatever the cast size; its quiet line reads "Everyone is in" or names who is sitting out. It opens a sheet listing every Character with Portrait, name and a switch between "In the story" and "Sitting out". Each switch saves the whole set at once as a write, with the usual busy state and error line, and the switches are disabled while a turn or write is in flight. The thread is unchanged: older lines by a Character now sitting out show as they always did.

**Blocked by:** [Branch 02 — Branch a Chat from a reply](../../branch/issues/02-branch-a-chat.md) (Branch's copy, which this extends).

- [ ] Pure prompt tests: the reminder sentence; "In the latest exchange" without them; the system message identical with and without someone sitting out, including with the Memory layer over its cap and a Memory about the Character sitting out; no change to the prompt when nobody is.
- [ ] API tests (fake gateway): the PUT replaces the set; an unknown id is `404.003.002`; removing the Character from the Story drops them from it; a reply with their `@Name:` line stores no part for them and the streamed parts never showed one, while narration naming them stays; an edited AI Message keeps their line; a User Message edit and Reset keep the set; a Branch carries it; Suggested replies carry the line.
- [ ] A Chat with nobody sitting out sends exactly the prompts it sent before.
- [ ] e2e (390 px): setting a Character sitting out from the Chat menu updates the row's line and survives a reload; switching them back restores "Everyone is in"; a one-Character Story's Chat menu offers the row too.
- [ ] Typecheck, the whole API suite and the whole e2e suite pass.

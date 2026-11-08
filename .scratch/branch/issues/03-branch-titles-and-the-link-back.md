# 03 — Branch titles and the link back

**Status:** done

Part of: [Spec: Branch](../spec.md)

**What to build:** A Branch is named so it can be told apart, and shows where it came from. Branching the same Chat twice gives "<title> (branch 2)", and branching a Branch gives "Chat 1 (branch 2)" rather than a stacked suffix. A Branch's Chat menu shows "Branched from <title>" at its top, linking to the source Chat at the Message branched from, and the Story's Chat list shows the same line under the Branch. Deleting the source keeps the Branch and drops the link. Follow the spec's "Title", "The link back" and "API" decisions:

- The title: the source's title with any trailing " (branch)" or " (branch N)" taken off, plus " (branch)", or the next free " (branch N)" in the Story, cut to 200 characters.
- One migration adds `chat.branched_from_chat_id` and `chat.branched_from_message_id`, both ON DELETE SET NULL; the message id is the Message the user tapped.
- The Chat detail gains `branchedFrom: { chatId, title, messageId } | null`, with the source's live title; Chat list items gain `branchedFrom: { chatId, title } | null`. Reset keeps the link.
- Web: the Chat menu's top line and the Chat list line, each shown only while the link exists.

**Blocked by:** [02 — Branch a Chat from a reply](02-branch-a-chat.md).

- [x] API: titles "(branch)", then "(branch 2)"; a Branch of a Branch gives "(branch 2)", not a stacked suffix; a long title is cut to 200 characters.
- [x] API: `branchedFrom` on the detail and on the list; renaming the source shows the new title; deleting the source clears it and keeps the Branch; Reset keeps it; a Story whose Chats were never branched answers `branchedFrom: null` everywhere.
- [x] e2e (390 px, fake gateway): the Branch's Chat menu shows "Branched from <title>" at its top and it leads to the original Chat scrolled to the Message; the Chat list shows the line; after the original is deleted, neither shows.
- [x] Typecheck, the whole API suite and the whole e2e suite pass.

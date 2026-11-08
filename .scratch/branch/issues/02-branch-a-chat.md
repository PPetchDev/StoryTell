# 02 — Branch a Chat from a reply

**Status:** done

Part of: [Spec: Branch](../spec.md)

**What to build:** "⑂ Branch" on an AI Message (the Opening included) makes a new Chat, "<title> (branch)", holding the source's Messages up to and including that one, with everything the Chat knew there, and opens it. The source is not touched. This ticket builds **Branch's copy**, the one function every later feature with per-Chat or per-Message data extends ([integration](../../sillytavern-gaps/integration.md)). Follow the spec's Implementation Decisions:

- `POST /api/stories/:storyId/chats/:chatId/messages/:messageId/branch`, no body, answers 201 with the new Chat's detail.
- The copy: everything the source owns (the Chat row, every Message row, Memories with Known by, MemoryChanges, BondChanges, ArcSteps, SceneAdvances, TimeChanges, ChatArcDirections, Reply versions when N is the newest Message), in source id order, then the existing rollback from N + 1 on the copy, then the copy's later Messages deleted. One transaction, at REPEATABLE READ. Message ids are remapped; Memory ids, deleted ones included, get fresh ids from the sequence in ascending order. The copy is built as steps over one transaction manager and the id maps, so a later feature adds a step.
- Extended by, each in its owning ticket with its own test (the spec's "Extended by" table): the Author's note ([authors-note 01](../../authors-note/issues/01-authors-note-in-turns-and-the-chat-menu.md)), Sitting out ([speaker-controls 01](../../speaker-controls/issues/01-sitting-out-in-turns-and-the-sheet.md)), the auto-read switch ([read-aloud 04](../../read-aloud/issues/04-auto-read-new-replies.md)), Thai readings with ids remapped ([write-for-me 03](../../write-for-me/issues/03-thai-reading.md)), Documents used per Message ([documents 04](../../documents/issues/04-documents-reach-the-narrator.md)), part emotions ([expressions 03](../../expressions/issues/03-judge-tags-emotions.md)), and read-aloud audio files copied to the new Message ids with no credit spent ([read-aloud 03](../../read-aloud/issues/03-read-a-message-aloud.md)). This ticket copies only what exists when it lands.
- The Story so far is copied only when it covers nothing past N. Snapshots stay with the source.
- From a User Message id, the Branch ends on the Message before it ([ticket 04](04-branch-from-a-user-message.md) adds the draft and the web for it).
- The title is "<title> (branch)" for now; [ticket 03](03-branch-titles-and-the-link-back.md) adds the numbering and the link back.
- The gate: refused with `TurnInProgressError` mid-turn; holds the source's turn lock while it copies; waits for pending background calls (`settledForWrite`) and answers `BackgroundStillSavingError` past the wait; not blocked by failed calls, an unplayable Story or credit being out.
- Isolation: `retryJudge` and `retryExtraction` now run under the Chat's turn lock, so a Branch during a manual Retry, and a Retry during a Branch, are each refused with `TurnInProgressError`.
- Web: ⑂ Branch is the last action in the newest AI Message's action row and in a tapped AI Message's tools, after ✎ Edit. It is offered whenever no turn or write is in flight and no edit is open, also while sending is blocked. No confirmation; the actions are disabled while it runs; on success the app opens the new Chat with a quiet "Branched from <title>" status line.

**Blocked by:** [01 — Ledger rollback can run inside a caller's transaction](01-rollback-in-a-callers-transaction.md).

- [x] API spec `branch` (fake gateway): the Branch from AI Message N has Messages 1…N with the same parts; its Bonds, Arc steps and Scene equal what an edit of N + 1 in a twin Chat leaves; its Time of day is N's.
- [x] API: Memory at N: a later AI add is gone (also when the user edited it since); later updates, archives, Known-by additions and deletes are undone; a locked Memory keeps the user's text; a user-written Memory from after N stays.
- [x] API: separation: deleting or editing a Memory in the Branch leaves the source's alone, and an edit in the Branch that rolls back a pre-N delete puts the Memory back in the Branch only (source still holding it, and source having deleted it too).
- [x] API: Reply versions come along from the newest reply, and choosing one in the Branch leaves the source's shown version; none from an earlier reply. The Story so far rule; the source's Snapshots stay under the source.
- [x] API: from a User Message the Branch ends on the Message before it, `awaitingReply` is false, and the gateway received no call.
- [x] API: the gate (mid-turn refusal, waiting for a pending judge, `409.004.007` past the wait, allowed with failed calls and their statuses copied, allowed with the Story unplayable and with credit out) and isolation (Branch during a held manual Retry and Retry during a Branch are both `409.004.004`; a lone manual Retry answers as before).
- [x] API: the source is unchanged by a Branch (Messages, Memories, ledger rows, Story so far, `last_played_at`); a failure partway leaves no new Chat; the Branch's next turn sends only Messages 1…N in its history, with Memory and Feelings as at N.
- [x] e2e (390 px, fake gateway): ⑂ Branch on an earlier reply opens "<title> (branch)" ending on that reply; going back shows the original intact; neither the newest reply's action row nor a tapped Message's tools overflow horizontally.
- [x] `docs/error-codes.md` lists Branch among the writes `409.004.004` and `409.004.007` refuse, and `409.004.004` during a manual Retry.
- [x] Typecheck, the whole API suite and the whole e2e suite pass.

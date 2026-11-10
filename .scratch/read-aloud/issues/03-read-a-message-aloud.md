# 03 — Read a Message aloud

**Status:** done

**What to build:** ▶ Read aloud on any AI Message plays the text as the thread shows it (the Chat's Replace rules applied), in order: narration and `*actions*` in the Narration voice, and each line in its speaker's Speaking voice. The part being read is highlighted, and Pause, Resume and Stop work. A second play of the same words costs nothing, and a Branch replays the audio of the Messages it copies for free. Per the spec's "The play queue", "Audio cache" and "The player (web)":

- the Chat's `onAi` Replace rules applied to each AI part's text before the queue is built, with the API's apply function from Replace rules;
- the pure `readAloudQueue`, with each item's `paragraph`;
- the speech store, keyed by Message and a hash of model, voice, speed and shown text;
- `GET .../messages/:messageId/speech` and `POST .../speech/:index`, with `NotReadableError`, `SpeechItemNotFoundError` and the out-of-credit pre-check;
- pruning within a Message, keeping every Reply version's audio;
- `sweepSpeech()` after a discarding edit, Reset, Delete Chat and Delete Story, and at start;
- Branch's copy extended: after the Branch commits, each copied Message's audio folder is copied to its new Message id (a failed copy is logged, never fails the Branch);
- the Chat screen's single player, owned by the Chat screen and not by the thread:
  - it prefetches the next item;
  - starting a Message stops the one before;
  - leaving the Chat stops it;
  - errors resume from the failed item;
- the controls: in the newest reply's action row after the existing actions (before ไทย and ⑂ where those exist), and in a tapped older AI Message's tools right after ✎ Edit; at 390px what doesn't fit goes into the row's "⋯" overflow;
- the highlight with `aria-current`.

**Part of:** [Spec: Read aloud](../spec.md)

**Blocked by:** [02 — Narration voice and Speaking voices in the Story editor](02-voices-in-the-story-editor.md), [Branch's copy ticket](../../branch/issues/02-branch-a-chat.md), [Replace rules on AI Messages as shown](../../saved-replies-and-replace-rules/issues/04-replace-rules-on-ai-messages.md)

- [x] Pure tests on `readAloudQueue`:
  - a paragraph per narration item, with its `paragraph` index;
  - actions in the Narration voice;
  - the fallbacks for a missing voice, a null link or a removed Character;
  - punctuation-only items dropped;
  - the 4,000-character split.
- [x] API tests:
  - the queue, and none for a User Message;
  - an item is made once and then answered from disk with `cached: true` and no call;
  - an out-of-range index is refused;
  - out of credit is refused before any call while a cached item still plays;
  - after Regenerate the changed item has a new key, and the old file goes on the next reading;
  - an `onAi` rule's replaced words are what the fake is asked to speak; a rule added after a reading makes that item uncached with a new key, and the old file goes on the next reading;
  - a Reply version's audio survives choosing another version;
  - a discarding edit, Reset, Delete Chat and Delete Story remove their Messages' folders;
  - a Branch of a Chat whose reply was read answers its items `cached: true` and plays them with no call.
- [x] e2e at 390px:
  - ▶ Read aloud highlights the first part, then the next, and ends idle;
  - Pause and Resume keep the place, and Stop ends it;
  - ▶ on an older Message stops the one playing;
  - Read aloud is not offered on a streaming reply;
  - the action row and a tapped Message's tools don't overflow.
- [x] `docs/error-codes.md` lists the two new codes, the next free ones at implementation time. Typecheck and the whole suites stay green.

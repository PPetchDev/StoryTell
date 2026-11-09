# 06 — Visual novel view follows Read aloud

**Status:** done

**What to build:** While Read aloud plays a Message, the Visual novel view shows the step being read and moves on with the audio. Both split the same shown text (Replace rules applied), so the step is found from the item's `partIndex` and, for narration, its `paragraph` among the shown text's paragraphs. ▶ Read aloud joins the box's action row after 📷 Snapshot, and reads the shown step's Message from that item. The player keeps playing across a view switch, and auto-read works the same in both views. Per the spec's "Visual novel view" (Read aloud).

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** [05 — Visual novel view while playing](05-visual-novel-view-while-playing.md), [Read aloud 03 — Read a Message aloud](../../read-aloud/issues/03-read-a-message-aloud.md), [Read aloud 04 — Read new replies aloud by themselves](../../read-aloud/issues/04-auto-read-new-replies.md)

- [x] e2e at 390px:
  - ▶ on a reply in the Visual novel view reads from the shown step, and the shown step moves with each item;
  - a narration paragraph and an `*action*` inside a line map to the right step;
  - with an `onAi` Replace rule that removes a narration paragraph, the items still land on the right steps;
  - switching to the thread keeps it playing, with the highlight there;
  - with auto-read on, a send plays the new reply and the view follows it.
- [x] Typecheck and the whole e2e suite pass.

**Notes:** The player's `play` can now take a pick from the queue (`from: (items) => index`), so ▶ in the box starts at the item of the step on show without reading the queue twice. ▶ shows on every stored AI step, and it sits in the action row (after 📷) on the newest reply's last step. While that Message is being read, Pause and Stop replace it.

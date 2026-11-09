# 05 — Visual novel view while playing: streaming, Continue, Again and versions

**Status:** done

**What to build:** The Visual novel view plays live:

- **Send:** shows the user's line, then the reply's first part as it streams in, with Replace rules applied to the streamed text as in the thread.
- **Reading at your own pace:** stepping past what has arrived shows the writing dots until the next part comes.
- **Continue and Retry** behave like a send.
- **The newest reply's last step** shows the action row in the box: ‹ n/m ›, ↺ Again, 📷 Snapshot and "Edit in thread" (▶ Read aloud joins after 📷 in ticket 06).
- **Again and choosing a version** show that reply from its first step.
- **Reset** shows the Opening.
- **Snapshot jobs** show a "Drawing a Snapshot…" chip.
- **Rollback notices, errors and Retry** show in the composer as in the thread.

Per the spec's "Visual novel view" (live steps and their keys, a reply being replaced, while playing, the action row).

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** [04 — Visual novel view: stepping through a Chat](04-visual-novel-view.md)

- [x] e2e at 390px with a slowed fake stream:
  - a send shows the user line, then the first streamed part;
  - Next past the arrived parts shows the writing dots, then the next part when it arrives;
  - the position holds when the stream settles into the stored Message;
  - Continue moves to the new reply;
  - Again shows the new reply from its start, and ‹ 1/2 › shows the first;
  - "Edit in thread" opens that Message's Edit in the thread;
  - Reset shows the Opening's first step;
  - a Snapshot taken from the box shows the chip, then its step.
- [x] Typecheck and the whole e2e suite pass.

**Notes:** Continue and Retry move the view to the new reply's first part wherever it is, "as Send" does. The spec's "when the user is on the last step" holds for Send anyway, because Send first moves the view to the user's line. ↺ Again and choosing a version ask the view for the newest reply's first step. Reset asks for the first step. These are `NovelRequest`s from the Chat screen. A Snapshot taken in this tab comes up as its step when the user is on the step it follows.

# 04 — Visual novel view: stepping through a Chat

**Status:** ready-for-agent

**What to build:** A button in the Chat top bar switches this device to the Visual novel view, remembered for every Chat. It shows the Chat's stored Messages one step at a time over the Backdrop, in their shown text (the Chat's `onAi` Replace rules applied to each AI part before it is split into steps, as the thread applies them before splitting paragraphs):

- the speaking Character large (their Expression for the line's emotion, else their whole Reference image, else a big initial on their colour, from the line-picture helper's whole-picture output) with their words in a box;
- narration and the user's own lines in the box with no picture;
- each Snapshot as its own step after its Message, with Open for the viewer.

A tap, Space, Enter or → goes on; Back or ← goes back. It opens on the newest reply's first step, and switching to the thread scrolls to the Message shown. The composer, menu, Memory drawer and Character profile all work from it. Per the spec's "Visual novel view" (toggle, steps for stored Messages and Snapshots with their shown text, stage, box, going on and back, where it opens, accessibility, desktop). Streaming and the action row come in ticket 05.

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** [03 — A Backdrop](03-backdrop.md), [Expressions 03 — The Judge tags each line](../../expressions/issues/03-judge-tags-emotions.md), [Replace rules on AI Messages as shown](../../saved-replies-and-replace-rules/issues/04-replace-rules-on-ai-messages.md)

- [ ] e2e at 390px:
  - the toggle persists across a reload;
  - a reply with narration and two speakers steps through narration (no picture), speaker A (Reference image) and speaker B (initial);
  - Back returns;
  - long narration steps per paragraph;
  - an `onAi` Replace rule shows its replaced words in the box, and a rule that removes a narration paragraph removes that step;
  - a Snapshot step follows its Message and Open shows the viewer;
  - with a tagged line and an Expression, the large picture is that Expression;
  - switching to the thread scrolls to the Message shown;
  - Space and the arrow keys step.
- [ ] e2e at 1440px: the stage sits in the reading column over the Backdrop, and the docked Memory drawer leaves it usable.
- [ ] The box is `aria-live`, and Next and Back are labelled buttons.
- [ ] The thread view is unchanged with the toggle off. Typecheck and the whole e2e suite pass.

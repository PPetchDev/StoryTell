# 03 — A Backdrop behind a Chat's Messages

**Status:** ready-for-agent

**What to build:** On the Story editor's Style tab, the author picks the Chat backdrop: None (the default), Cover, or Newest Snapshot. Behind every Chat of that Story, the picture shows dimmed and softly blurred, readable in both themes. Newest Snapshot means the newest one still in this Chat's thread, falling back to the Cover. It follows a new Snapshot, and on a PC it spans the Chat area beside the rail. Per the spec's "Backdrop":

- `story.backdrop`, by migration;
- the Story update, response and Duplicate;
- the editor choice;
- the pure `backdropOf` helper;
- the fixed layer with the focus point, blur and `--backdrop-dim` overlay;
- the contrast check's Backdrop pairs (white and black pictures, both themes).

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** [02 — A light theme](02-light-theme.md)

- [ ] API tests: `backdrop` defaults to `none`, round-trips, refuses an unknown value, and is copied by Duplicate.
- [ ] The contrast check passes with `--fail` in both themes, including the Backdrop pairs.
- [ ] e2e at 390px:
  - Cover shows the Cover behind the thread;
  - Newest Snapshot shows the Cover until a Snapshot is taken, then that Snapshot;
  - None shows no picture.
- [ ] e2e at 1440px: the Backdrop spans the area beside the rail, and the docked Memory drawer stays opaque over it.
- [ ] A Story left at None looks exactly as before. Typecheck and the whole suites pass.

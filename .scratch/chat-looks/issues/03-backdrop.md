# 03 — A Backdrop behind a Chat's Messages

**Status:** done

**What to build:** On the Story editor's Style tab, the author picks the Chat backdrop: None (the default), Cover, or Newest Snapshot. Behind every Chat of that Story, the picture shows dimmed and softly blurred, readable in both themes. Newest Snapshot means the newest one still in this Chat's thread, falling back to the Cover. It follows a new Snapshot, and on a PC it spans the Chat area beside the rail. Per the spec's "Backdrop":

- `story.backdrop`, by migration;
- the Story update, response and Duplicate;
- the editor choice;
- the pure `backdropOf` helper;
- the fixed layer with the focus point, blur and `--backdrop-dim` overlay;
- the contrast check's Backdrop pairs (white and black pictures, both themes).

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** [02 — A light theme](02-light-theme.md)

- [x] API tests: `backdrop` defaults to `none`, round-trips, refuses an unknown value, and is copied by Duplicate.
- [x] The contrast check passes with `--fail` in both themes, including the Backdrop pairs.
- [x] e2e at 390px:
  - Cover shows the Cover behind the thread;
  - Newest Snapshot shows the Cover until a Snapshot is taken, then that Snapshot;
  - None shows no picture.
- [x] e2e at 1440px: the Backdrop spans the area beside the rail, and the docked Memory drawer stays opaque over it.
- [x] A Story left at None looks exactly as before. Typecheck and the whole suites pass.

**Notes:** Migration `1764080000000-StoryBackdrop` adds the enum column. It is applied to the dev DB. `backdrop` may be left out of a PATCH, but `null` is refused with a 400 like any other value outside the set. The contrast check sets the overlay strength. `--backdrop-dim` is 94% of the page colour in dark, because `--accent` (the user's name) over a white picture needs it. Dark tokens can't change. It is 90% in light, with five light Character colours made a little darker (`--character-1/2/5/7/8`) so they pass over a black picture. The top bar now has the page colour as its own surface (`background: var(--bg)`), so it looks the same with no Backdrop. The layer is fixed at `z-index: -1`, and `body` goes see-through while it shows. Without that, the body's own background would paint over a negative-z layer. A Snapshot shows centred, since it has no focus point. "Newest" is the highest Snapshot id among those under a Message still in `chat.messages`.

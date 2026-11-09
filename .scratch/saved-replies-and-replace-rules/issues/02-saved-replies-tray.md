# 02 — Saved replies tray in the composer

**Status:** done

**What to build:** A Saved replies button in the composer's tool row opens a tray (in the composer's top band, the panel, above the Character row and the tool row) listing "This Story" then "All Stories" lines. A tap inserts the line, with `{user}` as the worn identity's name, at the box's caret, with a space where needed; nothing is sent, and the tray stays open. "Save this draft" saves the box's text for this Story or for all Stories and adds it to the tray. The tray and ⚡'s cards never show together. Per the spec's "Composer" decisions.

**Blocked by:** 01 — Saved replies: store and manage; [Write for me 01 — Composer tool row](../../write-for-me/issues/01-composer-tool-row.md)

Part of: [Spec: Saved replies and Replace rules](../spec.md)

- [x] Tool row button "Saved replies" (`aria-pressed` while open); the tray (`aria-label` "Saved replies") scrolls inside at most about 40% of the viewport; lines show at most two lines of text; empty state as in the spec (pointing to Settings and the Story editor's Style tab).
- [x] A tap fills an empty box with the line; on a non-empty box it inserts at the caret (the end if the box was never focused) with one space on a side that needs it; the caret lands after it; `{user}` becomes the worn Role's or Persona's name.
- [x] Opening the tray closes ⚡'s cards and the other way round; a send closes the tray; a fill ends Write for me's Undo (when 02 of Write for me has landed).
- [x] "For this Story" and "For all Stories" save the box's text as is, are disabled on an empty box, and the new line shows in its group without a Chat reload and after a reload.
- [x] Nothing is sent by the tray; no model call is made.
- [x] The tray e2e from the spec's Testing Decisions passes at 390px with touch; the existing composer e2e stays green.

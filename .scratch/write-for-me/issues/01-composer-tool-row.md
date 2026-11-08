# 01 — Composer tool row

**Status:** ready-for-agent

**What to build:** The composer gets the four-band layout of the spec's "Composer tool row" (as [integration](../../sillytavern-gaps/integration.md) settles it), top to bottom: a panel band (today's Suggested reply cards live there), an empty Character row band (the Nudge Portraits of [Speaker controls](../../speaker-controls/spec.md) plug in here), a tool row of small round icon buttons, left-aligned, holding ⚡ Suggest replies and ✱ Write an action (moved out of the box row), and the box row with the text box and the send slot. No new feature yet: it makes room for ✍️ Write for me, the Saved replies tray, the Nudge Portraits and the Dictation mic. The layout is the same at phone width and on desktop.

**Blocked by:** None — can start immediately

Part of: [Spec: Write for me and Thai reading](../spec.md). Also gates [Saved replies tray](../../saved-replies-and-replace-rules/issues/02-saved-replies-tray.md), [the Character row and Nudge](../../speaker-controls/issues/03-nudge.md) and [the Dictation mic](../../dictation/issues/02-composer-mic.md).

- [ ] ⚡ and ✱ sit in a tool row above the box, keep their accessible names, titles, pressed/busy states and disabled rules; ✱ still keeps the box's focus and selection.
- [ ] The box row is the box and the send slot (Send / ▶ Continue / ■ Stop) only, and the box is wider than before at 390px.
- [ ] The tool row has a right-end slot for a quiet text button (Undo, used by ticket 02), empty for now.
- [ ] A Character row slot sits between the panel and the tool row, empty for now and taking no height while empty, ready for the Nudge Portraits.
- [ ] At most one panel shows above the Character row; today's Suggested reply cards and their wait and error show there as before.
- [ ] Nothing overflows horizontally at 320px and 390px; the composer stays above the on-screen keyboard as today.
- [ ] Existing e2e (`suggested-replies`, `composer-and-actions`, `continue`, `streaming`) pass unchanged or with locator updates only; typecheck passes.

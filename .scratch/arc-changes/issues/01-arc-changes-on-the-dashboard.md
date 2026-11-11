# 01 — The Dashboard shows that a Character changed, and why, never the plan

**Status:** done

**What to build:** Each Character's Arc on the Dashboard becomes a fold titled "Changed N times", which opens to the cause of each change with a link to its Message. A Character with no change shows "Hasn't changed yet" instead. The dashboard response drops the Arc direction and the step's words, and gains `arcChanges: [{ messageId, cause, createdAt }]`. The fold key is `arcChanges:<characterId>`, starting folded. Follow the spec's "Implementation Decisions". The Story editor's directions are untouched.

**Blocked by:** None — can start immediately.

**Part of:** [Spec: Arc changes](../spec.md)

- [x] API tests:
  - a scripted Arc step appears as an `arcChange` with its cause and Message;
  - the dashboard JSON holds neither the direction nor the step's words;
  - a rolled-back step disappears.
- [x] e2e at 390px: "Changed 1 time" opens to the cause and its link; neither the direction nor the step text is on the page; "Hasn't changed yet"; the fold survives a reload.
- [x] The existing Dashboard tests that read "Author's direction" or step text are rewritten to the new rule, each traced to this spec.
- [x] Typecheck and the whole suites stay green.

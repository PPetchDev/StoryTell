# 02 — Starting Bonds set starting levels

**Status:** done

**What to build:** In the Story editor, each Starting Bond gets four level pickers, one per axis, each showing the level's word and defaulting to the middle. A new Chat and a Reset begin with those levels, and Duplicate copies them. Follow the spec's "Storage" (Starting Bond columns, not null, default 0) and "Copying".

**Blocked by:** [01 — The Judge sets Bond levels](01-bond-levels-from-the-judge.md)

**Part of:** [Spec: Bond axes](../spec.md)

- [x] API tests: Starting Bond levels are saved and validated (range per axis); they seed a new Chat and come back on Reset; Duplicate copies them.
- [x] e2e at 390px: pick "trusts" for Trust on a Starting Bond, reload, and it is kept; no digit shows in the pickers.
- [x] Typecheck and the whole suites stay green.

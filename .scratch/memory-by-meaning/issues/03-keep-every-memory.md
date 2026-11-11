# 03 — Keep every Memory: no more cap in the extraction

**Status:** done

**What to build:** The extraction prompt stops counting Memories and tokens, and stops demanding merges and archives. Merge and archive remain operations the model may choose, and locked Memories still take only known-by changes. Archived Memories stay archived but can be found by meaning, which is already covered by 02's choice. Follow the spec's "Keeping every Memory".

This lands only after 02, so a Chat never grows past what a turn can choose from.

**Blocked by:** [02 — Each turn chooses Memories by meaning](02-choose-memories-by-meaning.md)

**Part of:** [Spec: Memory by meaning](../spec.md)

- [x] Pure test: at 200 Memories the extraction prompt holds no cap demand; merge and archive still parse and apply.
- [x] API test: a Chat past 60 Memories keeps them all after an extraction that merges nothing.
- [x] The existing cap tests in `memory.spec.ts` are rewritten to the new rule. Each rewrite is traced to this spec, and none is simply deleted.
- [x] Typecheck and the whole suites stay green.

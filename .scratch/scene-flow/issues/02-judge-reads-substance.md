# 02 — The Judge reads a Scene's condition for its substance

**Status:** done

**What to build:** Rewrite the Judge's Scene rule per the spec's "The Judge's Scene rule":
- met means it has happened in substance, in any words;
- a part met in an earlier exchange still counts;
- the rules about getting closer, who must act, and "when in doubt, false" stay;
- "A Scene is meant to last many exchanges" goes.

Update the Judge prompt fixture only where the rule text changes.

**Blocked by:** none (touches the same Judge prompt as 03; build before it)

**Part of:** [Spec: Scenes that keep moving](../spec.md)

- [x] The Judge prompt test asserts the new rule text: in substance, earlier parts count, and the kept rules still present.
- [x] The Judge prompt no longer contains "A Scene is meant to last many exchanges".
- [x] Typecheck and the whole suites stay green.

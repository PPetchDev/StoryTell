# 05 — Starting Beliefs

**Status:** ready-for-agent

**What to build:** In the Story editor, next to Starting Bonds, an author lists Starting Beliefs: a Character and what they believe. Every new Chat, and every Reset, begins with them as Beliefs, and Duplicate copies them. Follow the spec's "Beliefs" (Starting Beliefs, `PUT .../starting-beliefs`).

**Blocked by:** [04 — Beliefs](04-beliefs.md)

**Part of:** [Spec: Memory by meaning](../spec.md)

- [ ] API tests: Starting Beliefs save and validate; they seed a new Chat and Reset; Duplicate copies them with remapped Characters.
- [ ] e2e at 390px: add a Starting Belief in the Story editor; a new Chat's Memory drawer shows it.
- [ ] Typecheck and the whole suites stay green.

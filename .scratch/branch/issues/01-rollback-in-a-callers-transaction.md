# 01 — Ledger rollback can run inside a caller's transaction

**Status:** ready-for-agent

Part of: [Spec: Branch](../spec.md). A declared prefactor: it changes no behaviour, so it is not a vertical slice.

**What to build:** A prefactor so a Branch can copy a Chat and roll the copy back in one transaction. Only the ledger's roll-back-from-a-position opens its own transaction today; it gains an optional transaction manager. Given one, it runs inside it. Without one, it opens its own transaction exactly as today. The Memory helpers it uses need nothing: creating a Memory under a given id already takes a manager, and the rollback never sets a Known by wholesale (it deletes the added Known-by rows directly). No caller changes behaviour: edit, Regenerate, choosing a Reply version and Reset work as before.

**Blocked by:** None — can start immediately.

- [ ] Rolling back with a caller's transaction manager writes nothing until that transaction commits, and nothing at all when it rolls back (an API-level or model-level test with a deliberately failing outer transaction).
- [ ] Every existing caller still uses its own transaction; no call site changes its behaviour.
- [ ] The whole existing API suite stays green (`test/regenerate.spec.ts`, `test/reply-versions.spec.ts`, `test/judge.spec.ts` "rollback on edit", `test/memory.spec.ts`).

# 01 — The Judge sets Bond levels, and the Narrator reads them in words

**Status:** done

**What to build:** Every Bond gains a level on the four Bond axes, recorded on the ledger's Bond changes. The Judge sets them a step at a time, and every prompt that reads Bonds shows them in words. A Bond with no levels yet gets its first measure the next time the Judge touches it. Follow the spec's "The axes and their words", "Storage" (the `bond_change` columns), "The Judge" and "Prompts that read Bonds":

- `BondAxis` and `BondLevels`, with ranges and the word table, in the API and mirrored in the web's types;
- the migration adding `trust`, `affection`, `desire` and `tension` (nullable) to `bond_change`;
- the cast in the Judge prompt shows levels in words, or "levels not set yet", and `bond_changes` items gain `levels`;
- parse reads `levels` loosely;
- apply clamps each axis to one step, lets Tension rise two and fall one, and clamps to range. It takes a first measure unclamped, keeps levels when `levels` is missing, and drops a change only when neither label nor level differs;
- the feelings layer (the Narrator, Suggested replies, Write for me) and the Snapshot prompt add the levels in words where a Bond has them;
- the Chat and dashboard responses carry each current Bond's `levels` (or null).

**Blocked by:** None — can start immediately.

**Part of:** [Spec: Bond axes](../spec.md)

- [x] Pure tests: prompt words and "levels not set yet"; parse; each clamp rule; first measure; same label with new levels is kept; nothing different is dropped.
- [x] API tests: a scripted Judge change writes levels and the dashboard shows them; a Branch at an earlier Message carries the levels as they were then; a Story whose Bonds have no levels sends the Narrator exactly today's feelings text.
- [x] Typecheck and the whole suites stay green.

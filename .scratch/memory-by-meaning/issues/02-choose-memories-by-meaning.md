# 02 — Each turn chooses Memories by meaning, in a 4k budget

**Status:** ready-for-agent

**What to build:** One `context_search` embedding per turn, of the Documents query, serves both Documents and Memory. A pure choice fills a 4,000-token Memory budget, in this order:
1. locked Memories, never left out;
2. Memories closest to the query, above the floor;
3. the newest Memories about the people present.

The chosen Memories are written in story order. With no query vector, step 2 is skipped. The turn, Suggested replies, Write for me and the Snapshot prompt all use the same choice. The turn budget and the Story so far trigger reserve 4k for Memory.

The Chat response marks the Memories the last turn used, shown as "In play" in the Memory drawer. The drawer warns when locked Memories take more than half the budget. Follow the spec's "Choosing Memories for a turn".

The search runs when the Story has passages or the Chat has embedded Memories. The `context_search` kind is labelled "Memory and Document search".

**Blocked by:** [01 — Every Memory is embedded](01-embed-memories.md)

**Part of:** [Spec: Memory by meaning](../spec.md)

- [ ] Pure tests: the fill order; locked past the budget; no vector falls back to newest; an archived Memory can be found; story order with each reason.
- [ ] API tests:
  - a turn makes one `context_search` call, even with Documents too;
  - its prompt carries the Memory closest to the query over an older unrelated one;
  - a failed search writes the turn with the newest Memories;
  - Snapshot, Suggested replies and Write for me use the chosen Memories;
  - the locked warning flag past half the budget.
- [ ] e2e at 390px: "In play" on the used Memories; the locked warning.
- [ ] Typecheck and the whole suites stay green.

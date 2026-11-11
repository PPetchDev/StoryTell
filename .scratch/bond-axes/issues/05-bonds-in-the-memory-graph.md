# 05 — "Show Bonds" in the Memory graph

**Status:** ready-for-agent

**What to build:** A "Show Bonds" switch beside the List/Graph choice. It is remembered per device as `storytell.memoryGraphBonds` and starts off. When on, it draws each current Bond between two people in the Memory graph, Sitting-out Characters left out. Each line:
- takes the colour of its strongest axis: Tension wins a tie, and only counts at 2 or more;
- is grey when the Bond is all zero, and dashed grey when it has no levels;
- opens its label and four levels in words when tapped.

Follow the spec's "The Memory graph".

**Blocked by:** [01 — The Judge sets Bond levels](01-bond-levels-from-the-judge.md)

**Part of:** [Spec: Bond axes](../spec.md)

- [ ] Pure test (a Playwright test with no page): the strongest-axis colour rule, including the tie, the Tension threshold, all-zero and unmeasured.
- [ ] e2e at 390px: the switch draws a line between two people; tapping it names the Bond's label; the choice survives a reload; a Sitting-out Character has no line.
- [ ] Typecheck and the whole suites stay green.

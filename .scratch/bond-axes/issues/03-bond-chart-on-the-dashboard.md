# 03 — The Dashboard charts each Bond, in words

**Status:** ready-for-agent

**What to build:** Each Bond on the Dashboard gets a small chart of its four axes over the Chat, inside its existing fold. The chart has:
- axis words at the ends, and no numbers anywhere;
- pins where the label changed, each opening its event with a link to the Message;
- "Not measured yet" in place of the chart for a Bond with no levels.

Follow the spec's "The Dashboard":
- `trend` per Bond in the dashboard response;
- a pure chart layout function;
- plain inline SVG, with no chart library.

**Blocked by:** [01 — The Judge sets Bond levels](01-bond-levels-from-the-judge.md)

**Part of:** [Spec: Bond axes](../spec.md)

- [ ] Pure test (a Playwright test with no page, as the line-picture helper's): the layout gives a point per change and a pin where the label changed, and its text holds no digits.
- [ ] API test: `trend` lists each change in order, with its Message, its levels or null, and whether the label changed.
- [ ] e2e at 390px: the chart shows axis words; tapping a pin shows its event and the link; no digit appears inside the chart; an unmeasured Bond reads "Not measured yet".
- [ ] Typecheck and the whole suites stay green.

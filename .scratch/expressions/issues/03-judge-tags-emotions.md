# 03 — The Judge tags each line, and the line's picture shows its Expression

**Status:** ready-for-agent

**What to build:** After a reply, the Judge's existing call also tags the emotion of each line a Character speaks. The tags are stored in the same transaction that records the judgement and marks the judge done, so they show the moment the judge is done and a failed write never records the judgement twice. Once the tags arrive, the round picture beside a line shows that Character's Expression for it, falling back to the Portrait. The Character profile shows the set. A Branch keeps the tags of the Messages it copies. Per the spec's "Storage" (on a message part, Branch), "The Judge tags each line" and "In the Chat":

- `message_part.emotion`, by migration;
- `emotion` on speech parts in the API response;
- the numbered lines, rule, JSON field and token cap in the judge prompt, only when the Story has an Expression;
- loose parsing;
- the pure line-to-part mapping, and the tags passed to the ledger's record with the other changes (`MessageChanges` gains `emotions`) and written inside its transaction, never after it;
- Branch's copy extended to carry each part's `emotion`;
- the shared web line-picture helper with both outputs: the round picture, used beside lines, and the whole picture (the Expression's full image, else the whole Reference image, else none) that the Visual novel view will use;
- the Expressions row in the Character profile.

**Part of:** [Spec: Expressions](../spec.md)

**Blocked by:** [01 — Expressions on a Character](01-expressions-on-a-character.md), [Branch's copy ticket](../../branch/issues/02-branch-a-chat.md)

- [ ] Pure tests:
  - the judge prompt with Expressions numbers the latest exchange's speech lines and carries the rule and field;
  - without them, it is byte-for-byte unchanged;
  - parsing drops unknown emotions and bad numbers, in any case;
  - the mapping handles out-of-range and repeated numbers.
- [ ] A Playwright test with no page (the web has no unit-test runner) checks the line-picture helper's two outputs: the round picture (Expression with its crop or the Portrait's, else the Portrait, else the initial) and the whole picture (the Expression's full image, else the whole Reference image, else none), for a tagged, a `neutral`, an untagged and a picture-less Character's part.
- [ ] API tests:
  - a judged reply's speech parts carry the scripted emotions, and narration none;
  - the first Chat read that shows the judge done already holds the tags;
  - in a model-level test, a record whose emotion write fails commits nothing (no Bond change, Arc step, Scene advance or Time change, and the judge not done), so the automatic retry records each change once;
  - Regenerate and an AI Message edit clear them, and the rerun judge writes new ones;
  - choosing a Reply version re-tags;
  - a failed judge leaves them null, and its Retry fills them;
  - a Story without Expressions sends today's judge prompt;
  - a Branch of a judged reply carries its parts' emotions.
- [ ] e2e at 390px:
  - after a turn whose scripted judge tags a line `joy`, that line's picture is the Happy Expression;
  - a `neutral` or untagged line shows the Portrait;
  - the Character profile lists the Expressions.
- [ ] Typecheck and the whole suites stay green.

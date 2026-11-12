# The Story so far keeps no cut-off or off-form answer

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Story so far](../spec.md)

## What to build

Per the spec's "Writer output guard" decision. In eight replays of one dev Chat rewrite, four answers hit the 1,000-token cap and ended mid-sentence, and one opened with `[Story]` and told only the latest scene. All of these would have been stored as the account.

- **Check (pure):** next to `parseStorySoFar`, a function that says why an answer can't be the account, or nothing: it used the whole length cap, or it opens with a speaker tag of the Messages it was given. `parseStorySoFar` also drops a leading `[Account]` label.
- **Service:** the update asks once more, right away, when the first answer is rejected. A second rejection fails the update with that reason, as any failure does now.

## Acceptance criteria

- [x] An answer that used the whole cap is rejected as cut off.
- [x] An answer opening with `[Story]` or the worn identity's tag is rejected; a tag mid-text or a non-speaker bracket is not.
- [x] A leading `[Account]` label is dropped.
- [x] A cut-off answer followed by a good one stores the good one in the same update, with no failure recorded.
- [x] Two rejected answers keep the old text, record the reason, and the next turn tries again.
- [x] `apps/api/test/story-so-far.spec.ts` covers each of these, and the full API suite stays green.

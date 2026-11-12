# The Story so far writer keeps what the Scenes need

Type: task
Status: wontfix
Blocked by: 01
Part of: [Spec: Story so far](../spec.md)

## Reverted (2026-11-12)

Replayed on the same rewrite, four answers each: the old prompt kept the tasting 4 of 4, this one kept it whole once, wrote longer answers that hit the length cap more often, and once wrote a story passage instead of an account. The code is taken back out; see the spec's "Scene goals: tried and dropped" and issue 04.

## What to build

Per the spec's "Facts the Scenes need" decision. In a dev Chat, a rewrite from 4,352 to 1,846 characters dropped "Petch tasted the milk", the first half of the current Scene's move-on condition. The Judge then wrote that it had never happened.

- **Prompt:** `storySoFarPromptMessages` takes optional `sceneConditions`. When any is non-blank, a "Story goals" section comes after the Messages and the corrections. It lists them and asks the writer to keep every event that bears on them, even a small one: what happened and who did it. It also tells the writer never to name or hint at them.
- **Service:** the update passes the move-on conditions of the Chat's current Scene and the next Scene by position. In free play there are none. A gates-only Scene has a blank condition, so it adds nothing. The Bond gates are not given.

## Acceptance criteria

- [x] With conditions, the writer's input lists them with the "keep every event" and "never name them" instruction, after the Messages and before "Write the account now."
- [x] With no conditions, an empty list or only blank ones, the input is exactly as before.
- [x] Only the current and the next Scene's conditions go in; a later Scene's does not.
- [x] A Story with no Scenes sends no goals.
- [x] `apps/api/test/story-so-far.spec.ts` covers each of these, the full API suite stays green, and the API typecheck passes.

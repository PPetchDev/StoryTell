# A pressing check that answers the same way twice

Type: task
Status: ready-for-agent
Blocked by: none
Needs: a real grader check and one real play to finish (about $0.10; the user's go-ahead)
Spec: [Reply repair](../spec.md), "3. A steady pressing check"

## What to build

The eval's "does not press the same demand" asks the grader to count replies, and the grader answers both ways on the same Chat (prompt-evals spec, "Checks on a whole played Chat"). Replace it with a check where the grader answers one yes-or-no question a reply and code counts.

- A new kind of graded check on a played Chat: one verdict a reply, all in one grader call, each with the words judged on.
- The pressing check's question: does this reply's close press the user's character to ask, say or decide a thing their turn was not about? Its rule: fail when three or more replies in a row do, or half the replies or more.
- The grader check takes cases for it: a Chat's replies and a label a reply.
- A new played Chat with the turns of `evening`, whose Character's card has no asking line among its example lines.

## Acceptance criteria

- [ ] A per-reply check sends one grader call a played Chat, showing each turn and its reply, and reads one verdict a reply.
- [ ] The scene's rule turns the verdicts into pass or fail; the reason names the turns that pressed.
- [ ] A verdict the grader left out or gave unreadably makes the check "not graded", never a pass or a fail.
- [ ] `evening` uses the new check in place of the old one; "keeps the slow burn" is unchanged.
- [ ] The cost said before spending is still right (the call replaces one, it adds none).
- [ ] The grader check holds written-in cases for it: a pass, a plain fail, and a fail in changing words; its card shows agreement reply by reply.
- [ ] The label sheet lists per-reply entries with a label a reply to fill.
- [ ] The new scene's prompt holds no asking line; a test says so.
- [ ] Every new check has an answer it passes and an answer it must fail.
- [ ] Tests go through the eval run with a scripted `fetch`, written red first.
- [ ] With the user's go-ahead: the real grader agrees on every written-in case at five asks a case, and on the six real Chats labelled by reading them; the result is written into the prompt-evals spec. If it does not agree, say so there and leave the check marked unsteady.

## Notes

- The six real Chats (two of 2026-11-23, four of 2026-11-24) are in the eval reports outside the repository. Label them reply by reply in the labels file there; commit none of their words.
- The rule's numbers came from those six Chats. Change them if the labelled Chats say otherwise, and say why in the spec.

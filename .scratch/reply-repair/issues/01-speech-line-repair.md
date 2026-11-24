# Speech-line repair

Type: task
Status: ready-for-agent
Blocked by: none
Needs: no model
Spec: [Reply repair](../spec.md), "1. Speech-line repair"

## What to build

A reply that has no speech line at all, and whose narration quotes someone speaking, gets those quoted words moved onto speech lines of the Character who said them, in code. End to end: a Message is sent, the play model answers with quoted speech only, and the Chat shows the Character speaking; the next turn's history holds the mended reply.

It runs after the reply is parsed and an echoed user Message is dropped, and before Line repair, which then reads the recovered lines.

Who spoke is decided in code only:

- one Character present and not sitting out: every quotation is theirs, unless its sentence names the user's character as the speaker;
- several present: a quotation is a Character's only when its own sentence names exactly one of them as the speaker;
- anything else stays narration as written.

A pure module beside the reply parser: the parsed reply, the cast present and the worn identity's name in; the mended parts and a record of what moved out.

## Acceptance criteria

- [ ] A reply of narration with quoted speech, one Character present, comes back from the API with that Character's speech lines, the quotation marks gone and the narration around them kept.
- [ ] A bare speech tag ("she said") left with nothing else is removed; a tag carrying an action keeps the action as narration.
- [ ] A reply that has even one speech line is returned exactly as written.
- [ ] With several Characters present, only a quotation whose sentence names one of them is moved; the rest stay narration.
- [ ] No speech line is ever made for the user's character or for a Character sitting out.
- [ ] A quoted title, a word in scare quotes and words reported from the past stay narration.
- [ ] When nothing can be given to a Character, the reply is kept as written.
- [ ] The next turn's prompt holds the mended reply in its history.
- [ ] A streamed reply ends as the mended one.
- [ ] Line repair is offered the recovered lines.
- [ ] One log line a repair, with the Chat and the reply before and after.
- [ ] Tests go through the HTTP API with the scripted model gateway, written red first.

## Notes

- Read the six real replies with no speech line (the `slow` scene's first play in the eval report of 2026-11-24, under the eval runs outside the repository) to learn their shapes, then write synthetic replies of those shapes for the tests. Commit no real reply.
- When in doubt, leave the reply alone: a line in the wrong mouth is worse than none.

# API stores Lore and sends it in turns, suggestions and Snapshots

Type: task
Status: done
Blocked by: none
Part of: [Spec: Lore](../spec.md)

## What to build

Per the spec's Implementation Decisions: the `lore_entry` table and migration, the authoring routes, `lore` on the Story response, Duplicate Story, the matching and selection (pure), the block in the turn's trailing system message, the Story so far reserve, Suggested replies, the Snapshot writer's Lore section, and `GET .../chats/:chatId/lore`.

## Acceptance criteria

- [x] The selection's pure tests and the API tests in the spec's Testing Decisions pass; the existing suite stays green.
- [x] A Story with no Lore sends exactly the prompts it sent before.
- [x] `docs/error-codes.md` lists `404.003.013`; `CONTEXT.md` gains Lore.

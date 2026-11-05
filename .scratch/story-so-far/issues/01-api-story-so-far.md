# API writes and sends the Story so far

Type: task
Status: done
Blocked by: none
Part of: [Spec: Story so far](../spec.md)

## What to build

These items follow the spec's Implementation Decisions on storage, covered Messages, the prompt layer, when and how it is written, failure, rewinds, concurrency and the API.

- **Migration:** the Story so far columns on `chat`.
- **Gateway:** a `story_summary` text call kind on the background model.
- **Prompt:** the "Story so far" layer after Memory. The covered Messages are left out of the history, in the turn prompt and in the Suggested replies prompt.
- **Background:** after each turn, check for the no-gap trigger and run at most one full-rewrite update per Chat. A failure never blocks a send.
- **Rewinds:** clear the Story so far on any rewind at or before its position, and on Reset. An update that lands late is dropped.
- **Routes:** `GET` and `PUT` `/api/stories/:storyId/chats/:chatId/story-so-far`.

## Acceptance criteria

- [x] Every API test case in the spec's Testing Decisions passes, and the existing suite stays green.
- [x] A Chat that still fits makes no `story_summary` call.
- [x] Each update's input holds every covered Message, plus the user's text with "corrections win" when the user wrote it.
- [x] `CONTEXT.md` gains the term "Story so far".

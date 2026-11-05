# Spec: Streaming replies

Status: ready-for-agent

## Problem Statement

The user waits 7–10 seconds, sometimes longer, staring at three dots before a reply appears all at once. Zeta and other apps show the reply as it is written, so the wait feels short and the user can start reading at once. The user also can't stop a reply that is going somewhere they don't want.

## Solution

Every turn the user starts shows its reply as it is written, word by word, in the same bubbles and narration lines the finished reply uses. The thread follows the end as it grows. A Stop button ends the reply early. A stopped or failed reply leaves nothing behind, exactly as a failed turn does today. The finished reply is stored and the background calls start only when the reply is complete. A line written as the worn identity never shows, not even for a moment.

## User Stories

1. As a player, I want the reply to appear word by word as it is written, so that I can start reading at once.
2. As a player, I want the growing reply to look like the finished one, narration lines and speech bubbles with names, pictures and colours, so that nothing jumps when it completes.
3. As a player, I want the thread to follow the end of the reply as it grows, so that I don't have to scroll.
4. As a player, I want to scroll up while a reply streams without being pulled back down, so that I can reread something.
5. As a player, I want the writing indicator to stay at the end of the growing reply until it is done, so that I know more is coming.
6. As a player, I want a Stop button in place of Send while a reply is written, so that I can end a reply I don't like.
7. As a player, I want a stopped reply to leave nothing behind, so that my Chat stays as it was.
8. As a player, after I stop a reply to my line, I want my line kept with Retry, so that I can try again or edit it.
9. As a player, I want a reply that fails halfway to disappear with the usual error and Retry, so that I never keep a half reply.
10. As a player, I want streaming for Send, Retry, ▶ Continue, ↺ Again and an edit's new reply, so that every turn feels the same.
11. As a player, I never want to see a line the model wrote as my character, even briefly, so that the story never speaks for me.
12. As a player, I want the action row, the Scene strip and the background statuses to update only when the reply is finished, as now.
13. As a player, I want Snapshot, Edit, Again and ⚡ hidden while a reply streams, as they are while one is written today.
14. As a player on a slow connection, I want the reply to arrive at the end, as now, if streaming can't get through, so that the app still works.
15. As a player, I want a reply I stopped to cost only what the model actually wrote, recorded in Usage like any call.

## Implementation Decisions

- **Which calls stream:** Turns only (send, Retry, Continue, Regenerate, and the turn an edit runs). The play model streams. Suggested replies, the judge, Memory extraction, the Snapshot prompt, drafting and the Story assistant do not.
- **Model Gateway:** A streaming text call beside `completeText`. It takes the same request plus a callback for each new piece of text and an abort signal, and it resolves to the same result as `completeText` once the reply is complete. The OpenRouter client sends `stream: true` and reads the server-sent events. Usage and cost are taken from the stream's final usage. The session confirms against OpenRouter's current docs how usage arrives in a stream and what an aborted stream bills. Retries for a 429 or 503 happen only before the first piece of text arrives. The fake gateway streams a scripted reply in pieces (a configurable size), can be told to fail after N pieces, and records the call as today.
- **The wire format:** The existing turn endpoints keep answering JSON as today. A request with `Accept: text/event-stream` gets server-sent events instead:
  - `parts`: `{ parts: MessagePart[] }`, the whole reply so far, parsed by the same reply parser the stored Message uses. It is sent after each new piece, at most every 100 ms or so.
  - `done`: the same body the JSON answer has today: the Chat, plus the rollback count where the endpoint reports one.
  - `error`: `{ error: { code, message } }` with the same typed errors as today. Errors found before the turn starts (the send gate, a turn in progress, a bad Message) answer as plain JSON errors with their status, before any stream begins.
- **The guard while streaming:** Text is released to the client only up to the last point that can't become a line written as the worn identity. The start of an unfinished line is held back while it could still turn out to be `Name:`, `@Name:`, `*Name*:` or `You:` (the guard's pattern). When a line is written as the identity, the stream ends there, the call is aborted, and the reply is the text before it, as the guard cuts today. Stop strings are still sent.
- **Stop:** The client aborts the request. The API sees the request close, aborts the model call, and follows the failure path of that endpoint: nothing new is stored, a sent User Message stays awaiting Retry, a Regenerate ends at the previous Message as a failed one does, the turn lock is released. A stopped call that the provider bills is recorded in Usage.
- **Client:**
  - The Chat screen asks for the stream when it can and renders each `parts` event through the same Message rendering, in place of the writing indicator, with the indicator after it.
  - The thread's follow-the-end key includes the streamed reply's length, so it follows as it grows, but only while the user is at the end.
  - While a reply is written, the composer's send button becomes ■ Stop.
  - If the response is not a stream (a proxy that buffers, an older API), the client reads the JSON answer as today.
- **Next.js proxy:** `/api` reaches the API through the Next rewrite. The first step of the client ticket is a spike that checks it passes events through as they come, in dev and in a production build. If it buffers, the stream goes through a route handler that pipes the API's response, or another way that keeps the browser on one origin.
- **The service worker** already passes API calls straight to the network, so it needs no change.
- **MVP spec:** "No streaming in the MVP" and the Friendly UI spec's "Streaming replies" out-of-scope line are superseded by this spec.

## Testing Decisions

- Test external behaviour at the existing seams: API tests (Vitest) with the fake gateway, and Playwright e2e with the fake gateway. No unit tests of private functions.
- **API tests:**
  - A streamed send delivers several growing `parts` events, then `done`, and the stored Message equals the last `parts`.
  - A line written as the worn identity, split across pieces, never appears in any `parts` event.
  - Stop (the client closes the request) stores nothing new, keeps the User Message awaiting Retry, records Usage, and releases the lock so the next send works.
  - A failure after some pieces sends `error`, and stores nothing.
  - Continue, Regenerate and an edit stream too.
  - Without the `Accept` header, the JSON answer is unchanged, so the existing tests keep passing.
- **Playwright (390px, touch):**
  - A slowly scripted reply shows its first words before the reply finishes, and the finished reply matches.
  - Stop mid-reply leaves the line with Retry and no reply.
  - The thread follows the growing reply.
- **Contract test:** if the gateway's existing contract tests replay recorded HTTP, add a recorded OpenRouter stream.
- **Manual:** one real streamed turn on the phone over the tailnet or Wi-Fi, and one Stop.

## Out of Scope

- Streaming any call other than turns.
- Showing the model's reasoning.
- Resuming a stream after the phone sleeps or the connection drops. That reply simply fails, with Retry.
- Typing-speed effects. Text shows as it arrives.

## Further Notes

- The MVP chose polling and no streaming as defaults to keep the first build simple. Both are reversible (MVP spec, "Decisions this spec fills in").
- GMICloud ignores stop strings, so for DeepSeek V4 Pro the streaming guard is what stops a line written as the identity.

## Tickets

| # | Ticket | Blocked by |
|---|---|---|
| 01 | [API streams turns, with the guard and Stop](issues/01-api-streams-turns.md) | none |
| 02 | [The Chat shows the reply as it streams, with Stop](issues/02-client-streaming-and-stop.md) | 01 |

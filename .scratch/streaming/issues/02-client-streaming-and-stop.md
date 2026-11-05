# The Chat shows the reply as it streams, with Stop

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Streaming replies](../spec.md)

## What to build

Per the spec's Implementation Decisions on the client and the Next.js proxy.

- **Spike first:** check that the `/api` rewrite passes server-sent events through as they arrive, both under `next dev` and in a production build (`next build` and `next start`). If it buffers, pipe the stream through a route handler, or find another way that keeps the browser on one origin. Record which approach was used in the ticket's Comments.
- **Chat client:**
  - Send, Retry, ▶ Continue, ↺ Again and an edit ask for the stream.
  - Each `parts` event renders through the existing Message rendering, where the writing indicator sits now, with the indicator after it.
  - `done` replaces the in-progress reply with the stored Chat.
  - `error` shows the usual error and Retry.
  - A JSON answer that isn't a stream is handled as today.
- **Following the end:** the thread follows the growing reply while the user is at the end. Scrolling up stops the following until they return to the end.
- **Stop:** while a reply is written, the send button becomes ■ Stop, which aborts the request. Afterwards the Chat shows what the API's failure path left: the line with Retry, or the Chat as it was.
- **Hidden while a reply streams:** the action row, ⚡, Edit and Snapshot stay hidden, as they are today.

## Acceptance criteria

- [x] Playwright at 390px with touch: a slowly scripted reply shows its first words before it finishes, and the finished reply matches the stored one.
- [x] Playwright: Stop mid-reply leaves the user's line with Retry and no reply. Retry then gives a full reply.
- [x] Playwright: the thread follows the growing reply. Scrolling up during the stream is not undone.
- [x] Playwright: ▶ Continue and ↺ Again stream.
- [x] The spike's result is recorded in the Comments, and the production build streams too, checked by hand or with a test.
- [x] Every existing e2e spec passes.
- [x] The full suites pass.

## User stories covered

1–6, 13, 14.

## Comments

Built and verified on `claude/streaming-replies-173287`, on top of ticket 01.

- **Spike: the `/api` rewrite streams, so no route handler was needed.** A bare SSE origin sent one event every 300 ms behind the Next rewrite. Under `next dev`, events arrived 300 ms apart, about 10 ms late. Under `next build` + `next start`, they arrived about 5 ms late. Neither compressed the stream, even with `Accept-Encoding: gzip, br`. The API sends `Cache-Control: no-cache, no-transform` and `X-Accel-Buffering: no` as well. The service worker already passes `/api` through, so it is unchanged.
- **Client:**
  - `apiSendStream` in `lib/api.ts` asks for `text/event-stream, application/json`. It hands each event on until `done` (the answer) or `error` (an `ApiError` with the same code). A non-stream answer is read as `apiSend` reads it, so a buffering proxy or an older API still works.
  - A Stop rejects with `StreamStoppedError`. A stream that ends without an answer rejects with `StreamBrokenError` ("The reply was cut off. Try again."), and the Chat is re-read to show Retry.
  - `chatApi.send`, `retry`, `continue`, `edit` and `regenerate` take an optional `TurnStream`. An AI Message edit still answers JSON.
- **Chat screen:**
  - `runTurn` streams every turn: Send, Retry, ▶ Continue, ↺ Again and a User Message edit. Each `parts` event renders through `AiMessageParts`, the same renderer stored AI Messages use, followed by the writing indicator. `done` replaces it in the same render.
  - A failure or a Stop drops the reply at once and re-reads the Chat. A Stop shows no error.
  - While a reply is written, the send button is ■ Stop. The action row, Edit, ⚡ and Snapshot stay hidden or disabled while writing, as before.
- **Following the end:** the growing reply is followed by the thread's existing size observer, and only while the user is at the end. I did not add the reply's length to the follow-the-end key, as the spec suggested: that key forces a scroll to the end, which would undo the user's scroll up. A turn whose reply streamed also leaves the reader where they are when it ends (done, Stop or error).
- **Found in review and fixed:** a Stop that came while the API was still in the send gate (waiting on the last reply's background calls) used to store the User Message afterwards. The API now checks for Stop before storing it, and before an edit's or Regenerate's rewind (new API test). Scrolling up was undone after a Stop or an error, and is now covered by an e2e test. A dropped stream no longer puts the draft back, since the API had already stored the line.
- **Left as is:** Stop can still land in the few milliseconds while the API writes the User Message, and a Retry tapped within a moment of Stop can meet "a turn is in progress" until the API notices the close.
- **Tests:**
  - `e2e/streaming.spec.ts` (5, at 390px with touch): first words before the end and finished = stored; Stop leaves the line with Retry, then Retry writes the whole reply; the thread follows and scrolling up isn't undone; ▶ Continue and ↺ Again stream; Stop after scrolling up keeps the place.
  - Full e2e passes 58/58 (`E2E_WEB_PORT=3551 E2E_API_PORT=3552`). The 5 streaming specs also pass 5/5 against a production build (`next build` + `next start`, via a temporary Playwright config that was not committed).
  - `npm run typecheck` passes. `npm run test:api` passes 336/336.
- **Not done here:** the spec's manual check (one real streamed turn and one Stop on the phone over the tailnet or Wi-Fi) needs the user and real credit.

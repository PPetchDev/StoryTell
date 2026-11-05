# API streams turns, with the guard and Stop

Type: task
Status: done
Blocked by: none
Part of: [Spec: Streaming replies](../spec.md)

## What to build

Per the spec's Implementation Decisions on the Model Gateway, the wire format, the guard while streaming, and Stop.

- **Gateway:** a streaming text call beside `completeText`, in the gateway interface, the OpenRouter client and the fake.
  - The OpenRouter client sends `stream: true`, reads server-sent events, and takes usage and cost from the end of the stream. Check OpenRouter's current docs for how usage arrives and what an aborted stream bills.
  - It retries a 429 or 503 only before the first piece arrives.
  - The fake streams a scripted reply in pieces, can fail after N pieces, and can be slowed for e2e. Its test control route takes those options.
- **Turn endpoints** (send, retry, continue, regenerate, edit): with `Accept: text/event-stream` they answer server-sent events (`parts`, `done`, `error`). Without the header they answer JSON exactly as today.
- **Guard while streaming:** never release text that could still turn out to be a line written as the worn identity. A finished identity line ends the stream and aborts the call, and the stored reply is cut as today.
- **Stop:** a closed request aborts the model call and follows the endpoint's failure path. The turn lock is released, and Usage is recorded when the provider bills.
- **Docs:** update `docs/error-codes.md` for any new error. Note in the MVP and Friendly UI specs that this spec supersedes their "no streaming" lines.

## Acceptance criteria

- [x] An API test where a streamed send gives growing `parts` events, then `done`, and the stored Message equals the last `parts`.
- [x] An API test where an identity line split across pieces never appears in any event.
- [x] An API test where closing the request mid-stream stores nothing new, keeps the User Message awaiting Retry, records Usage, and lets the next send through.
- [x] An API test where a failure after some pieces gives `error` and stores nothing.
- [x] API tests showing Continue, Regenerate and an edit stream.
- [x] Every existing API test passes unchanged, because the JSON path is unchanged.
- [x] A recorded OpenRouter stream, if the gateway's contract tests replay recordings.
- [x] `npm run typecheck` and `npm run test:api` pass.

## User stories covered

7–12, 15.

## Comments

Built and verified on `claude/streaming-replies-173287`.

- **Gateway:** `ModelGateway.streamText(request, { onText, signal })` sits beside `completeText`. It resolves with the same result plus `stopped`.
  - `OpenRouterClient.chatStream` sends `stream: true`, skips `:` comment lines and reads usage from the last chunk before `[DONE]`. It maps an `error` chunk (HTTP 200, `finish_reason: "error"`) and `content_filter` the way a whole call's errors are mapped. 429 and 503 are retried only on the HTTP status, so only before the first piece.
  - Checked in OpenRouter's docs on 2026-11-05: an aborted stream gets no usage chunk, and cancelling stops billing on hosts that support it (DeepInfra does; GMICloud is on neither list). So a stopped stream's bill is read in the background from `GET /api/v1/generation?id=` and written as a normal UsageRecord. The lookup retries while OpenRouter answers 404, about 30 s in all. A stream stopped before its first chunk has no generation id, so nothing is recorded for it.
  - The fake streams a scripted reply in `pieceSize` pieces, `pieceDelayMs` apart, and fails after `failAfterPieces` with `failWith`. Its control route takes the same options, with `failWith` given as a scripted error.
- **Wire format:** `apps/api/src/api/chat/turn-response.ts`. With `Accept: text/event-stream`, the answer turns into SSE once the turn starts (`onStart`): `parts` at most every 100 ms, then `done` with the JSON body or `error` with `{ error: { code, message } }`. Errors before the turn starts, and an AI Message edit (which runs no turn), still answer plain JSON. The turn endpoints write their own answer through `@Res()`. Without the header they answer JSON as before.
- **Guard while streaming:** `releasedText` in `reply-parser.ts` holds back an unfinished line while it could still become `Name:`, `@Name:`, `*Name*:` or `You:`. It also holds an unfinished `@Name` speech header until its colon arrives, so a bubble never shows first as narration. Once an identity line begins, the call is aborted and the reply is the text before it, cut by the usual `parseReply`.
- **Stop:** a closed request aborts the call, and `TurnStoppedError` takes the endpoint's failure path. Stop is checked again just before storing, and the final `parts` is sent only after the reply is stored. Edit and Regenerate keep their rollback, as a failed turn does today.
- **Docs:** `docs/error-codes.md` gains a "Streamed turns" section; no new codes. The MVP spec's out-of-scope line now notes this spec supersedes it.
- **Tests:**
  - `test/streaming.spec.ts` (15): growing parts then done, with stored = last parts; four identity-line shapes split mid-line; Stop on send and on a Regenerate; a failure partway; errors before the stream; Continue, Regenerate and edit; the JSON path; and Stop through the real gateway, recording the generation's bill in Usage.
  - `test/gateway/openrouter.contract.spec.ts`: 7 new tests on recorded synthetic streams (`test/fixtures/openrouter/stream-*.sse`).
  - `test/fake-model-gateway.spec.ts`: 2 new tests.
  - `npm run typecheck` passes. `npm run test:api` passes 335/335. One earlier full run failed `chats.spec.ts` › "refuses Retry when the Chat is not waiting for a reply": background judge/extraction calls from the test before it landed after `gateway.reset()`. That race isn't touched by this change, and the test passes alone and in two later full runs.
- **Code review** against master (two axes): fixed the store-after-Stop race, the final parts sent before a failed store, the duplicated model pick and UsageRecord in the real gateway, the fake's duplicate reply split, the dead `@HttpCode` decorators, and `TurnStream` moving to `manager/chat/turn/turn-stream.ts`.

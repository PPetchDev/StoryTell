# API streams turns, with the guard and Stop

Type: task
Status: ready-for-agent
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

- [ ] An API test where a streamed send gives growing `parts` events, then `done`, and the stored Message equals the last `parts`.
- [ ] An API test where an identity line split across pieces never appears in any event.
- [ ] An API test where closing the request mid-stream stores nothing new, keeps the User Message awaiting Retry, records Usage, and lets the next send through.
- [ ] An API test where a failure after some pieces gives `error` and stores nothing.
- [ ] API tests showing Continue, Regenerate and an edit stream.
- [ ] Every existing API test passes unchanged, because the JSON path is unchanged.
- [ ] A recorded OpenRouter stream, if the gateway's contract tests replay recordings.
- [ ] `npm run typecheck` and `npm run test:api` pass.

## User stories covered

7–12, 15.

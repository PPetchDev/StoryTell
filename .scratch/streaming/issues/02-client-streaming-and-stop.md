# The Chat shows the reply as it streams, with Stop

Type: task
Status: ready-for-agent
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

- [ ] Playwright at 390px with touch: a slowly scripted reply shows its first words before it finishes, and the finished reply matches the stored one.
- [ ] Playwright: Stop mid-reply leaves the user's line with Retry and no reply. Retry then gives a full reply.
- [ ] Playwright: the thread follows the growing reply. Scrolling up during the stream is not undone.
- [ ] Playwright: ▶ Continue and ↺ Again stream.
- [ ] The spike's result is recorded in the Comments, and the production build streams too, checked by hand or with a test.
- [ ] Every existing e2e spec passes.
- [ ] The full suites pass.

## User stories covered

1–6, 13, 14.

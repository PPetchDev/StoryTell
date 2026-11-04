# Continue: the story goes on with one tap

Type: task
Status: ready-for-agent
Blocked by: 02
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variant D: tap ▶ with the composer empty).

## What to build

Per the spec's "Continue" section.

- **API:**
  - A continue endpoint on a Chat, with the same gate as send. No User Message is stored.
  - The turn prompt's final user-role message is the continue instruction: the worn identity does nothing new, and the rule against writing their words or actions still holds.
  - The guard, parser and stop strings run as for any turn.
  - The reply is stored as an AI Message, both background calls start, and last played is bumped.
  - A failure stores nothing.
  - It is refused while a User Message is awaiting its reply.
- **Client:** while the composer is empty or whitespace, its send button shows ▶ and calls Continue. The writing indicator and error line are the same as for a send.

## Acceptance criteria

- [ ] API tests:
  - Continue stores one AI Message and no User Message
  - it works right after the Opening, and after another AI Message
  - the recorded prompt ends with the continue instruction and includes the previous AI Message
  - the background calls run
  - the guard cuts a line written as the worn identity
  - it is refused while a User Message awaits its reply, while a turn is in flight, with text credit out, and on a non-playable Story
  - a failed call stores nothing
- [ ] Playwright: tap ▶ twice from the Opening, and see two new AI replies and no user line.
- [ ] `docs/error-codes.md` is updated for any new error.
- [ ] The full suites pass.

## User stories covered

20–24.

# Play a Chat: one turn end to end

Type: task
Status: ready-for-agent
Blocked by: 20, 21
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Chats per Story:** create, list (with created and last played times), rename (default "Chat N"), and delete after confirmation.
- **Starting a Chat.** The Opening is copied in as Message 1, model "author", split into parts by the reply parser. The Chat starts at the first Scene, or in free play.
- **Send a turn.** One play-model call writes the whole turn. The prompt is assembled in the spec's layer order:
  1. Narrator rules
  2. Setting
  3. Role
  4. Style instructions (POV, tense, reply-length word range)
  5. every Cast card, with Secrets marked as known only to that Character
  6. current Scene, or free play
  7. recent Messages, trimmed from the oldest to fit a ~16k-token budget
  8. the user's message
  9. the final instruction

  The Feelings, Arcs and Memory layers are added in tickets 27 and 28. Stop strings on the Role name are sent only where the host supports them.
- **Reply parser and guard** (pure logic, behaviour as in the turn prototype):
  - An `@Name:` line starts a speech part. The name is matched case-insensitively against the cast and the canonical name is stamped.
  - A line directly under a speech line continues it. After a blank line, text is narration.
  - An unknown speaker is kept with its name but no Character link, and logged.
  - The reply is cut at the first line written as the Role or "You".
- **Storing.** An AI Message is stored only when it completes, with its parts and the model that wrote it. A failed turn keeps the User Message with Retry. There's no streaming: a "writing" indicator shows while the client waits.
- **Blocked sends.** Sending is blocked when the Story isn't playable (with a note naming the missing field) or when text credit is out.
- **Drift notice.** If the last AI Message came from a different model than the current play model, the Chat shows a one-line Drift notice.
- A UsageRecord is written per turn.
- **Chat screen:** narration and named speech in order, and a composer.

## Acceptance criteria

- [ ] API tests with the fake gateway:
  - parts split and names stamped
  - unknown-speaker handling
  - the guard cuts `Name:`, `@Name:`, `*Name*:` and `You:` lines
  - stop strings are present for GLM-5.3 and absent for V4 Pro
  - the prompt layer order is as specified
  - the recent-Message window trims from the oldest
  - a failed turn stores no AI Message and Retry succeeds
  - a non-playable Story or out of text credit blocks sending
  - the Drift notice appears after a model change
  - deleting a Chat removes its Messages
- [ ] Playwright: start a Chat, see the Opening, send, and see narration plus named speech.

## User stories covered

49–60, 62 (prompt side), 64–67, 78, 126 (Chat half), 130.

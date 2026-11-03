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

## Comments

**Built (agent, 2026-11-04).** On branch `claude/charming-brahmagupta-38dd69`, on top of master with tickets 19, 20 and 21. `Status:` is left for the user to close.

- **Schema:** migration `1762800000000-ChatsAndMessages` adds `chat` (story, title, created and last played, `current_scene_id` with `ON DELETE SET NULL`, so free play when a Scene goes), `message` (chat, position, kind `user`/`ai`, the User Message's text and stamped `identity_name`, the AI Message's `model`) and `message_part` (message, position, narration or speech, `character_id` with `ON DELETE SET NULL` and the stamped `speaker_name`). Chats cascade from the Story, Messages from the Chat, parts from the Message. Parts are rows rather than JSON so a removed Character clears its links in the database (ticket 29) and a Message can be re-split in place (ticket 25). The worn identity is the Role until ticket 26 adds Personas; the two background-call statuses are tickets 27 and 28's columns.
- **Entities and model** (`apps/api/src/model/chat/`): `ChatEntity`, `MessageEntity`, `MessagePartEntity` with `toResponse()`, and `ChatModelService` (`findByStory`, `findWithMessages`, `addUserMessage`, `addAiMessage` in one transaction, `touchPlayed`, `deleteChat`).
- **Pure turn logic** (`apps/api/src/manager/chat/turn/`):
  - `reply-parser.ts`: `parseReply(text, cast, identityName, {guard})` is the prototype's `parseSingle`. `@Name:` lines (optionally `*`-wrapped) start speech with the canonical cast name stamped case-insensitively; a line directly under a speech line continues it; after a blank line text is narration and consecutive narration merges; an unknown speaker keeps its name with `characterId: null` and is reported for the log; the guard cuts at the first `Name:`, `@Name:`, `*Name*:` or `You:` line. The name charset is wider than the prototype's ASCII-only one. `partsToText()` renders parts back to `@Name:` text for the prompt history and ticket 25's editor. The Opening is parsed with the guard off, since the author wrote it.
  - `prompt.ts`: `buildTurnPrompt()` assembles one system message with `# Rules`, `# Setting`, `# The user's Role`, `# Style` (POV, tense, and the reply-length word range: short 60–150, medium 150–350, long 350–600), `# Cast` (every card: appearance, personality, voice, example lines, background, and Secrets "known only to Name; no one else knows these unless Name reveals them") and `# Current Scene` (or "No Scene — the story unfolds freely"), then the recent Messages as user/assistant turns, the user's message, and the final instruction as a trailing system message. The Feelings, Arcs and Memory layers have their slot marked between the Scene and the Messages (`PROMPT_LAYERS` names them already). Recent Messages are trimmed from the oldest to fit `TURN_PROMPT_TOKEN_BUDGET` (16k, at about four characters per token). Stop strings `\n<Role>:`, `\n@<Role>:`, `\nYou:` are always passed; the gateway drops them for GMICloud. `maxTokens` follows the reply length (450 / 900 / 1400).
- **Manager** (`ChatManagerService`): list, create (title "Chat N" for the first free N, the Opening as Message 1 with model `author`, the first Scene or free play; refused on a non-playable Story), get, rename (whitespace keeps the title), delete, send and retry. Send: empty text → `422.004.005`; not playable → `422.004.002` with the missing labels in the message; text credit known and ≤ 0 → `402.001.003`; a turn already in flight for the Chat → `409.004.004`; then the User Message is stored, the play model called once with `servedFor: {storyId, chatId}`, the reply parsed and guarded (unknown speakers and cuts go to the log), the AI Message stored only when complete, and `lastPlayedAt` bumped. A failed turn leaves the User Message with `awaitingReply: true`; `POST .../retry` runs the same turn again (`409.004.003` when there is nothing to retry). `GET` also answers `playable`/`missing`, `textCreditOut`, `playModel` and `drift: {lastModel, playModel} | null` (the last AI Message a model wrote, the Opening excluded, against the current play model).
- **API** (`/api/stories/:storyId/chats`): `GET` list (most recently played first), `POST`, `GET/PATCH/DELETE :chatId`, `POST :chatId/messages`, `POST :chatId/retry`. Every write answers with the whole Chat. Codes are domain `004` in `docs/error-codes.md`.
- **Frontend:** `/stories/[id]/chats` lists Chats (started and last played times, New Chat, inline rename, delete after confirming in place, the not-playable note), `/stories/[id]/chats/[chatId]` is the Chat screen (`components/chat/chat-screen.tsx`): the Opening and replies as narration paragraphs and named speech, User Messages under the Role name, the notice line (not playable with the missing fields, text credit out, Drift), a composer with Ctrl/Cmd+Enter, a "Writing…" indicator while the turn is written, and a Retry line when the last turn failed (the screen re-reads the Chat after a failed send, so the kept User Message shows). The one link from the editor is "Play →" in its breadcrumbs. `lib/chat.ts` holds the types and `chatApi`.
- **E2E harness:** `E2E_WEB_PORT`/`E2E_API_PORT` can now be overridden, so two worktrees can run the browser suite at once (ticket 22's run held 3101 during this one).

**Verified:**
- `npm run typecheck`: clean for both apps.
- `npm run test:api`: 108 passed (80 before + 28 in `test/chats.spec.ts`): Opening split into parts with model `author`; first Scene or free play; "Chat N", list with times, rename; most recently played first and `lastPlayedAt` bumped by a turn; Chat creation refused on a non-playable Story; 404s; Chat deletion removes its Messages and parts, and Story deletion its Chats; parts split and canonical names stamped (`@mira:`, `*@KAI O'ROURKE*:`, continuation lines, narration merging); unknown speaker kept with `characterId: null`; the guard cuts `Ash:`, `@Ash:`, `*Ash*:`, `You:` and `@ash:` lines; the Opening is not cut; the prompt layer order (heading indices ascending, no Feelings layer yet), Secrets marking, the word range, the Scene block, the history, the user's message and the final instruction, stop strings and `servedFor`; free play wording and the full turn history; the recent-Message window dropping the Opening and the oldest turn at four ~5k-token messages while every Message stays stored; a failed turn stores no AI Message, keeps the User Message, and Retry re-sends the same prompt and stores the reply; Retry refused with nothing to retry; a refusal passed through; empty text, a missing required field (naming "Mira: Voice", nothing stored) and text credit out block sending, unknown credit does not; a second send during a turn is refused; the Drift notice appears after a Settings change and clears after a turn from the new model. Through the real gateway on recorded fixtures: GLM-5.3 gets `stop: ['\nAsh:', '\n@Ash:', '\nYou:']`, the AI Message records `glm-5.3`, and one UsageRecord lands in `GET /api/usage`; DeepSeek V4 Pro gets no `stop`.
- `npm run test:e2e`: 7 passed (6 before + `e2e/play-a-chat.spec.ts`: start a Chat from the list, see the Opening as narration plus Mira's named speech, send, see narration plus named speech, no Drift notice, the Chat listed with its times; the Story is deleted at the end).
- **One real turn (2026-11-04), GLM-5.3 on DeepInfra through the built API** on a throwaway database with the keys from `.env`: a two-Character Story, one user line; 8.9 s; the reply parsed into narration and five speech parts for Mira and Kai, both linked; `drift: null`; UsageRecord $0.001443 for the turn. Text credit read as $4.53 before the call.

**Not verified / notes:**
- The in-flight guard (`409.004.004`) is per process, which is right for the single API instance.
- `GET` on a Chat reads the gateway's remaining credit (cached 30 s in the real gateway) to answer `textCreditOut`.
- The fake gateway's default `model` is `fake/text-model`, so a browser test that must not show the Drift notice scripts `{ text, model: 'glm-5.3' }`.
- Ticket 25's editor can render an AI Message with `partsToText()` and re-split it with `parseReply()`; ticket 27 fills the slot after `# Current Scene` in `prompt.ts` and the background-status columns on `message`.

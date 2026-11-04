# Edit an earlier Message and reset a Chat

Type: task
Status: resolved
Blocked by: 24
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

Message-level rewind before any background state exists. Ticket 27 adds rollback of Bond, Arc and Scene changes, and ticket 28 adds Memory.

- **Edit User Message N.** Messages after N are deleted permanently and N's text is overwritten, with no version history. Then the AI writes a fresh reply.
- **Edit AI Message N.** The edit UI shows the Message as `@Name:` text. Messages after N are deleted, and the edited text is re-split into parts by the same parser. The Chat then waits for the user: no new AI reply.
- **Reset a Chat.** The title and worn identity are kept. Every Message is cleared, the current Opening is copied in again as Message 1, and the Chat returns to the first Scene or free play.
- Both actions ask for confirmation before discarding later Messages.

## Acceptance criteria

- [ ] API tests:
  - editing a User Message deletes later Messages and triggers exactly one new turn
  - editing an AI Message re-splits its parts and triggers no turn
  - reset keeps the title and identity and re-copies the current Opening, so an Opening edited after the Chat started appears only after reset
- [ ] Playwright: edit an earlier User Message and see the later Messages gone and a new reply.

## User stories covered

69–72, 76, and 77 (Messages part).

## Comments

**Built (agent, 2026-11-04).** On branch `claude/infallible-lumiere-935830`, on top of master f34df02 (tickets 19–22 and 24). `Status:` is left for the user to close. No schema change, so no migration.

- **Model** (`apps/api/src/model/chat/chat.service.ts`): `rewriteUserMessage(message, text)` deletes every Message after it and overwrites the text in one transaction; `rewriteAiMessage(message, parts)` deletes the later Messages and replaces the parts in one transaction, keeping the Message's id, model and time; `clearMessages(chatId)` deletes every Message of a Chat (parts cascade). The part rows are built by one helper shared with `addAiMessage`.
- **Manager** (`ChatManagerService`):
  - `editMessage(storyId, chatId, messageId, text)`: whitespace → `422.004.005`; an unknown id, or a Message of another Chat → `404.004.006`. A **User Message** goes through the same gate as send (playable, text credit, the in-flight lock), is rewritten, and then `writeTurn` runs exactly as for a send: same prompt (the history up to the edited Message), guard, UsageRecord through the gateway, `lastPlayedAt` bump. A failed turn leaves the edited text with `awaitingReply: true`, and Retry runs it again. An **AI Message** (the Opening copy included; it keeps model `author`) is re-split with `parseReply(..., { guard: false })`, since the user wrote the text like the author wrote the Opening; unknown speakers are logged and kept by name; no turn runs, so it needs neither a playable Story nor credit, only no turn in flight.
  - `resetChat(storyId, chatId)`: refused on a non-playable Story (`422.004.002`, like starting a Chat) or while a turn is in flight; otherwise `currentSceneId` goes back to the first Scene or null, every Message is cleared, and the Opening as it is now is copied in again as Message 1 through the same `copyOpening` as `createChat`. Title, id, `createdAt` and the worn identity stay; `lastPlayedAt` is not touched.
- **API:** `PATCH /api/stories/:storyId/chats/:chatId/messages/:messageId` with `{ text }` (`EditMessageRequestBodyDTO`; for an AI Message the text is narration paragraphs and `@Name:` lines) and `POST /api/stories/:storyId/chats/:chatId/reset`. Both answer with the whole Chat. `docs/error-codes.md`: `404.004.006 MessageNotFoundError` added; the `409.004.004` and `422.004.005` rows now also name edits and reset.
- **Frontend** (`components/chat/chat-screen.tsx`, `lib/chat.ts`): every Message has an Edit button (hidden while a turn is written, while another Message is being edited, and on User Messages while sending is blocked). Editing opens an in-place box with the text, or for an AI Message its `@Name:` text (`messageText()` in `lib/chat.ts` mirrors the API's `partsToText`). With Messages after it, Save asks first ("This discards the N Messages after it and the AI replies afresh / and the Chat waits for you.", confirm "Save and rewind"), through the same `ConfirmButton` as Chat deletion; the last Message saves straight away. A User Message edit runs as a turn (Writing… indicator, the error line and Retry on failure); an AI Message edit and Reset are plain writes. Reset sits next to the title and always asks first; it is disabled while the Story is not playable. `chatApi.edit` and `chatApi.reset` added. Styles are a short block after `.turn-error` in `globals.css`.

**Verified:**
- `npm run typecheck`: clean for both apps.
- `npm run test:api`: 134 passed (126 before + 8 in `test/chats.spec.ts`): editing a User Message deletes the later Messages and their parts (row counts), overwrites the text, keeps the ids before it, and runs exactly one turn whose prompt holds the Opening and the new text only; a failed turn after the edit keeps the edited text with Retry; editing an AI Message re-splits its parts (canonical names stamped, a continuation line, an unknown speaker kept with no link, a line written as the Role kept since the guard is off), keeps the model, deletes the later Messages and makes no call; the Opening copy edits like any AI Message with model `author`; an empty edit, an unknown Message and a Message of another Chat are refused with nothing changed; text credit out blocks a User Message edit but not an AI Message edit; reset keeps the title, identity and `createdAt`, clears every Message, re-copies an Opening edited after the Chat started (which the Chat had not seen before reset), and returns from free play (after the first Scene was removed) to the new first Scene; reset is refused on a non-playable Story.
- `npm run test:e2e`: 10 passed (9 before + `e2e/edit-and-reset.spec.ts`: a Chat two turns in, edit the first User Message, see the confirm name the 3 Messages, Save and rewind, see one User Message with the new text and one fresh reply with narration plus Mira's named speech and the old text gone; then Reset, confirm, see only the Opening and the title kept; the Story is deleted at the end).

**Not verified / notes:**
- The worktree needs its own `node_modules` (`npm ci`) before `npm run test:e2e`, as ticket 22 noted: the first run here resolved Next from the main checkout and Turbopack failed with "Could not find the Next.js package".
- No real-model turn was run for this ticket; the edit turn is the unchanged `writeTurn`, exercised through the fake gateway.
- The spec's rollback of Memory, Bond, Arc and Scene changes and the rollback notice (stories 73–75) are tickets 27 and 28; Snapshot links (story 121) are ticket 31. `rewriteUserMessage`, `rewriteAiMessage` and `clearMessages` are where those tickets hook in.

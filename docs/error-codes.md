# API error codes

Every API error has the body `{ "error": { "code": "XXX.YYY.ZZZ", "message": "..." } }`:
`XXX` is the HTTP status, `YYY` the domain and `ZZZ` the case. The code is part of the API
contract: the frontend routes on it, never on the message. Defined in
`apps/api/src/errors/`.

A response that is not JSON, or has no code, did not come from the API. The frontend reads it
as "the API can't be reached" and shows the can't-connect screen (`apps/web/lib/api.ts`).

## Streamed turns

A turn asked for with `Accept: text/event-stream` (send, Retry, Continue, Regenerate, a User
Message edit) answers an error found before the turn starts (the send gate, a turn in
progress, a bad Message) as above: plain JSON with its status. Once the stream has begun, a
failure arrives as its last event, `event: error`, whose data is the same body and code; the
HTTP status is the endpoint's success status, already sent. A turn the user stops sends
nothing more: the request is gone. See `apps/api/src/api/chat/turn-response.ts`.

## Domains

| `YYY` | Domain |
|---|---|
| 000 | General (validation, unknown errors) |
| 001 | Model Gateway |
| 002 | Images |
| 003 | Story authoring |
| 004 | Chats and turns |
| 005 | Story drafting |
| 006 | Personas |
| 007 | Character cards |

## Codes

| Code | Error | Meaning |
|---|---|---|
| `XXX.000.000` | (any `HttpException`) | Framework error with that HTTP status, e.g. `400.000.000` for a failed validation. |
| `500.000.000` | (unhandled) | Unexpected server error. |
| `502.001.001` | `ProviderOutageError` | The model provider failed or is down, including a rate limit or host overload (OpenRouter 429 or 503) that outlasted the gateway's same-host retries. The message carries the host's own code, e.g. `(DeepInfra: engine_overloaded)`. Also raised when Sampling values were sent and OpenRouter finds no endpoint that takes them; the message then reads "DeepInfra no longer takes one of the Sampling values for <model>. Reset Sampling for it in Settings." Show with Retry. |
| `422.001.002` | `ModelRefusalError` | The model refused, or the host stopped the output for content. Show with Retry. |
| `402.001.003` | `OutOfCreditError` (text) | Text credit is used up: OpenRouter answered 402 (balance, key limit or the per-request credit reservation) or a 403 budget block, the only answers that carry a `limit_source`. Never raised for a 429, whatever its metadata says. Blocks play. |
| `402.001.004` | `OutOfCreditError` (image) | Image credit is used up. Blocks only Snapshots and Reference images. A camera press answers it at once when the balance is known to be used up; a failed Snapshot job carries it as its error otherwise. |
| `502.001.005` | `UnparseableOutputError` | The model's output could not be read. Show with Retry. |
| `422.001.006` | `SamplerNotOfferedError` | A Sampling value (`PUT /api/settings/samplers/:playModel`) for a parameter that play model's host does not list. Nothing is saved. Resetting it with `null` is always allowed. |
| `404.002.001` | `ImageNotFoundError` | No image file at that path. |
| `400.002.002` | `InvalidImagePathError` | The path is absolute or leaves the image folder. |
| `404.002.003` | `ReferenceCandidateNotFoundError` | No such Reference image candidate: it was picked, replaced by a newer round, expired, or never made. Generate again. |
| `422.002.004` | `NoAppearanceError` | A Reference image was asked for while the Character's Appearance is empty. |
| `404.002.005` | `SnapshotNotFoundError` | No Snapshot with that id in this Story. |
| `404.002.006` | `SnapshotJobNotFoundError` | No such Snapshot job in this Chat: it succeeded, was dismissed, or the API restarted. Take the Snapshot again. |
| `409.002.007` | `SnapshotJobNotFailedError` | A Retry or dismiss of a Snapshot job that is still running. |
| `400.002.008` | `NoImageFileError` | An upload with no file in its `image` field. |
| `415.002.009` | `UnsupportedImageError` | An uploaded file whose bytes are not a PNG, JPEG or WebP picture. |
| `413.002.010` | `ImageTooLargeError` | An uploaded picture over the size limit (15 MB for a Cover). |
| `422.002.011` | `SnapshotSizeNotOfferedError` | A Settings change that asks for a Snapshot size the Snapshot model is not drawn at, such as 2K for Seedream V4.5 edit. |
| `404.003.001` | `StoryNotFoundError` | No Story with that id. |
| `404.003.002` | `CharacterNotFoundError` | No Character with that id in this Story, including an id outside the cast in a Chat's Sitting out set (nothing changes). |
| `404.003.003` | `SceneNotFoundError` | No Scene with that id in this Story. |
| `404.003.004` | `StartingBondNotFoundError` | No StartingBond with that id in this Story. |
| `422.003.005` | `CastFullError` | The Story already has 6 Characters. |
| `409.003.006` | `DuplicateStartingBondError` | That Character already has a StartingBond in that direction. |
| `422.003.007` | `SelfStartingBondError` | A StartingBond from a Character toward itself. |
| `422.003.008` | `InvalidOrderError` | A reorder that does not list every Character (or Scene) of the Story exactly once. |
| `409.003.009` | `NoReferenceImageError` | A Portrait crop for a Character with no Reference image. Add one first. |
| `422.003.010` | `InvalidCoverChoiceError` | A Cover pick that names both a Snapshot and a Character, or neither. |
| `409.003.011` | `NoCoverError` | A Cover focus point for a Story with no Cover. |
| `409.003.012` | `NoReferenceImageForCoverError` | A Cover picked from a Character with no Reference image. |
| `404.003.013` | `LoreEntryNotFoundError` | No Lore entry with that id in this Story: edited or removed. |
| `422.003.014` | `InvalidLorePatternError` | A Lore pattern that does not compile as a regular expression (case-insensitive, Unicode, multi-line). The message names the pattern and the reason; nothing of that write is saved. |
| `404.004.001` | `ChatNotFoundError` | No Chat with that id in this Story. |
| `422.004.002` | `StoryNotPlayableError` | The Story has a required field empty. The message names the missing fields. Blocks starting a Chat, sending, Continue and Regenerate. |
| `409.004.003` | `NoTurnToRetryError` | Retry when the Chat is not waiting for a reply to a User Message. |
| `409.004.004` | `TurnInProgressError` | A send, a Continue, a Regenerate, Suggested replies, a Message edit, choosing a Reply version, a reset, a Branch or a manual Retry of the judge or Memory extraction while this Chat's turn is still being written, or while a manual Retry of either background call runs for it (a Retry holds the Chat's turn lock, so a Branch or another write meanwhile is refused, and a Retry tapped while a Branch copies the Chat is refused too). |
| `422.004.005` | `EmptyMessageError` | A send or a Message edit with nothing but whitespace. |
| `404.004.006` | `MessageNotFoundError` | No Message with that id in this Chat. |
| `409.004.007` | `BackgroundStillSavingError` | A send, Retry, Continue, Regenerate, Message edit, choosing a Reply version, reset or Branch while one of the previous AI Message's background calls (the judge, Memory extraction) was still pending past the short wait. Try again in a moment. |
| `409.004.008` | `BackgroundFailedError` | A send, Retry, Continue or Regenerate while one of the previous AI Message's background calls has failed, and so has its one automatic retry (`BACKGROUND_RETRY_MS` later). The message names which in plain words ("Couldn't save the Memories from the last reply."); retry it (on the Chat screen or the dashboard) first. |
| `409.004.009` | `NoFailedJudgeError` | A judge retry on a Message whose judge did not fail, or that is not the latest AI Message. |
| `409.004.010` | `NoFailedExtractionError` | A Memory extraction retry on a Message whose extraction did not fail, or that is not the latest AI Message. |
| `404.004.011` | `MemoryNotFoundError` | No Memory with that id in this Chat. |
| `422.004.012` | `EmptyMemoryError` | A Memory added or edited with nothing but whitespace. |
| `409.004.013` | `AwaitingReplyError` | A Continue while the last User Message still awaits its reply. Nothing stored; Retry that Message instead. |
| `409.004.014` | `NotRegenerableError` | A Regenerate on a Message that is not the Chat's newest Message, on a User Message, or on the Opening. Nothing changes and no call is made. |
| `502.004.015` | `UnreadableSuggestionsError` | The Suggested replies the model wrote could not be read as exactly three suggestions, one each of `action`, `speech` and `move`, each with text. Nothing stored. The client shows "Couldn't suggest replies, try again". |
| `422.004.016` | `EmptyStorySoFarError` | The Story so far saved with nothing but whitespace. Nothing changes. |
| `409.004.017` | `NoStorySoFarError` | The Story so far saved while the Chat has none yet: the whole Chat still fits in the turn prompt, so it would cover no Messages. Nothing changes. |
| `404.004.018` | `ReplyVersionNotFoundError` | A Reply version chosen that the Message does not have: a number outside 1..m of its ‹ n/m ›. Only the newest AI Message has more than one version, so any number but 1 on another Message is refused too. Nothing changes and no call is made. |
| `502.005.001` | `UnreadableDraftError` | The model's draft or rewrite could not be read (no JSON object, or no text). Nothing saved. Show with Retry. |
| `502.005.002` | `InvalidDraftError` | The draft does not fit a Story (0 or 7 Characters, a Style value outside its set, a required field empty, a bad StartingBond). Nothing saved. Show with Retry. |
| `422.005.003` | `EmptyIdeaError` | A draft was asked for with a blank idea. |
| `422.005.004` | `NotRewritableError` | A rewrite named a field that is not a text field of that part of the Story. |
| `502.005.005` | `UnreadableChangeSetError` | The assistant's answer could not be read (no JSON object). Nothing saved. Show with Retry. |
| `502.005.006` | `InvalidChangeSetError` (from the model) | The assistant's change set does not fit the Story (an unknown Character or Scene, a field that does not exist, a Style value outside its set, a bad StartingBond, a blank required field on a new Character or Scene). Nothing saved. Show with Retry. |
| `422.005.007` | `InvalidChangeSetError` (from the client) | A change set sent to `assistant/apply` does not fit the Story as it is now. Nothing saved. |
| `409.005.008` | `RemovalNeedsConfirmationError` | A change set sent to `assistant/apply` removes a Character or Scene without `confirmRemovals`. Nothing saved. |
| `422.005.009` | `EmptyInstructionError` | An assistant instruction with nothing but whitespace. |
| `404.006.001` | `PersonaNotFoundError` | No Persona with that id: read, updated or deleted, or worn through a Chat's identity swap. |
| `422.006.002` | `EmptyPersonaNameError` | A Persona created or renamed with nothing but whitespace as its Name. |
| `400.007.001` | `NoCardFileError` | A card import (or preview) with no file in its `card` field. |
| `415.007.002` | `UnsupportedCardError` | A card file whose bytes are neither a PNG nor JSON text (a WebP, a JPEG, a CHARX zip, a JSON array). Read from the bytes, never the file name. |
| `413.007.003` | `CardTooLargeError` | A card file over 15 MB, refused before it is read. |
| `422.007.004` | `UnreadableCardError` | The card's JSON is broken, is not an object, has a `spec` but no `data`, or has none of name, description and first message. Nothing is made. |
| `422.007.005` | `InvalidGreetingError` | An import asking for a greeting the card doesn't have (0 is the first message, 1..n the alternate greetings). Nothing is made. |
| `422.007.006` | `NoCardInPictureError` | A PNG with neither a `ccv3` nor a `chara` text chunk: an ordinary picture. Nothing is made. |
| `415.007.007` | `NotAPngError` | A Character card export whose uploaded picture is not a PNG (the web draws one; a JPEG or a broken PNG is refused). |

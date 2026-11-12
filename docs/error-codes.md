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
| 008 | Saved replies and Replace rules |
| 009 | Audio (Dictation) |

## Codes

| Code | Error | Meaning |
|---|---|---|
| `XXX.000.000` | (any `HttpException`) | Framework error with that HTTP status, e.g. `400.000.000` for a failed validation. |
| `500.000.000` | (unhandled) | Unexpected server error. |
| `502.001.001` | `ProviderOutageError` | The model provider failed or is down, including a rate limit or host overload (OpenRouter 429 or 503) that outlasted the gateway's same-host retries. The message carries the host's own code, e.g. `(DeepInfra: engine_overloaded)`. Also raised when Sampling values were sent and OpenRouter finds no endpoint that takes them; the message then reads "DeepInfra no longer takes one of the Sampling values for <model>. Reset Sampling for it in Settings." Show with Retry. |
| `422.001.002` | `ModelRefusalError` | The model refused, or the host stopped the output for content. Show with Retry. |
| `402.001.003` | `OutOfCreditError` (text) | Text credit is used up: OpenRouter answered 402 (balance, key limit or the per-request credit reservation) or a 403 budget block, the only answers that carry a `limit_source`. Never raised for a 429, whatever its metadata says. Blocks play. |
| `402.001.004` | `OutOfCreditError` (image) | The Venice pool ("Images and audio (Venice)") is used up. Blocks only Snapshots, Reference images and new audio: Dictation, and Read aloud and voice samples not already on disk. Audio already made still plays. A camera press answers it at once when the balance is known to be used up; a failed Snapshot job carries it as its error otherwise. |
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
| `404.002.012` | `SnapshotPromptNotFoundError` | Draw Snapshot (`POST .../snapshots`) with a Snapshot prompt the Chat no longer holds: drawn already, replaced by a newer one, an hour old, or the API restarted. Nothing is drawn; write it again. |
| `404.003.001` | `StoryNotFoundError` | No Story with that id. |
| `404.003.002` | `CharacterNotFoundError` | No Character with that id in this Story, including an id outside the cast in a Chat's Sitting out set or a turn's `nudgeCharacterId` (nothing changes). |
| `404.003.003` | `SceneNotFoundError` | No Scene with that id in this Story. |
| `404.003.004` | `StartingBondNotFoundError` | No StartingBond with that id in this Story. |
| `422.003.005` | `CastFullError` | The Story already has 6 Characters. |
| `409.003.006` | `DuplicateStartingBondError` | That Character already has a StartingBond in that direction. |
| `422.003.007` | `SelfStartingBondError` | A StartingBond from a Character toward itself. |
| `422.003.008` | `InvalidOrderError` | A reorder that does not list every Character (or Scene) of the Story exactly once, or every Replace rule of its scope: the message names "the Story's" Replace rules, or "your app-wide" ones. |
| `409.003.009` | `NoReferenceImageError` | A Portrait crop for a Character with no Reference image. Add one first. |
| `422.003.010` | `InvalidCoverChoiceError` | A Cover pick that names both a Snapshot and a Character, or neither. |
| `409.003.011` | `NoCoverError` | A Cover focus point for a Story with no Cover. |
| `409.003.012` | `NoReferenceImageForCoverError` | A Cover picked from a Character with no Reference image. |
| `404.003.013` | `LoreEntryNotFoundError` | No Lore entry with that id in this Story: edited or removed. |
| `422.003.014` | `InvalidLorePatternError` | A Lore pattern that does not compile as a regular expression (case-insensitive, Unicode, multi-line). The message names the pattern and the reason; nothing of that write is saved. |
| `422.003.015` | `EmptyDocumentError` | A Document added with nothing but whitespace. No embedding call is made. |
| `413.003.016` | `DocumentTooLargeError` | A Document over 200,000 characters after trimming, refused before any embedding call. Split or trim it. |
| `422.003.017` | `DocumentLimitError` | A 21st Document in a Story, or a Document that would take the Story past 1,000 passages in all, refused before any embedding call. |
| `404.003.018` | `DocumentNotFoundError` | No Document with that id in this Story: removed, or another Story's. |
| `422.003.019` | `InvalidPageAddressError` | A fetch-page address that isn't `http:` or `https:`, carries credentials, or names the PC itself (`localhost`, `*.localhost`, `127.0.0.0/8`, `::1`, `::ffff:127.x.x.x`), given or reached by a redirect. Refused before it is fetched. The message says which, and to paste the text instead. |
| `502.003.020` | `PageFetchError` | A page that couldn't be fetched or read: unreachable, a timeout (15 s), a non-2xx answer, more than 5 redirects, a type other than `text/html` or `text/plain`, a body over 2 MB, or no text. The message says which, and to paste the text instead. |
| `422.003.021` | `UnknownVoiceError` | A Narration voice, Speaking voice or voice sample (`POST /api/voices/:voiceId/preview`) naming a voice that `GET /api/voices` doesn't list. Nothing changes and no call is made; `null` (the default) is always allowed. |
| `404.003.022` | `ExpressionNotFoundError` | Setting or resetting the square of, or removing, an Expression the Character does not have for that emotion. An emotion outside the seven (`neutral` included) is a validation error (`400.000.000`). |
| `409.003.023` | `NoReferenceImageToDrawError` | Drawing an Expression (`POST .../expressions/:emotion/draw`) for a Character with no Reference image. No call is made. Add a Reference image first. |
| `422.003.025` | `EmptyStartingBeliefError` | Starting Beliefs (`PUT /api/stories/:storyId/starting-beliefs`) with one whose text is nothing but whitespace. The whole list is refused and nothing changes. A Character outside the cast is `CharacterNotFoundError`. |
| `404.004.001` | `ChatNotFoundError` | No Chat with that id in this Story. |
| `422.004.002` | `StoryNotPlayableError` | The Story has a required field empty. The message names the missing fields. Blocks starting a Chat, sending, Continue and Regenerate. |
| `409.004.003` | `NoTurnToRetryError` | Retry when the Chat is not waiting for a reply to a User Message. |
| `409.004.004` | `TurnInProgressError` | A send, a Continue, a Regenerate, Suggested replies, Write for me, a Message edit, choosing a Reply version, a reset, a Branch or a manual Retry of the judge or Memory extraction while this Chat's turn is still being written, or while a manual Retry of either background call runs for it (a Retry holds the Chat's turn lock, so a Branch or another write meanwhile is refused, and a Retry tapped while a Branch copies the Chat is refused too). |
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
| `502.004.019` | `UnreadableWriteForMeError` | Write for me's answer held nothing once a leading label for the worn identity and everything from the first `@` line (a Character's line) were taken off. Nothing stored. The client shows "Couldn't write it, try again". |
| `502.004.020` | `UnreadableThaiReadingError` | The background model answered a Thai reading with nothing. Nothing stored. The client shows "Couldn't make a Thai reading, try again". |
| `409.004.021` | `NudgeSittingOutError` | A send, Retry, Continue, Regenerate or User Message edit whose `nudgeCharacterId` names a Character sitting out of the Chat. Checked before anything is stored; nothing changes. "<Name> is sitting out. Bring them back before nudging them." |
| `404.004.022` | `NotReadableError` | Read aloud (`GET` or `POST /api/stories/:storyId/chats/:chatId/messages/:messageId/speech`) on a User Message: only AI Messages have a play queue. No call. |
| `404.004.023` | `SpeechItemNotFoundError` | A Read aloud item (`POST .../speech/:index`) outside the Message's queue as it reads now: an edit, a Regenerate or a Replace rule may have changed it since the queue was read. No call; read the queue again. |
| `404.004.024` | `BeliefNotFoundError` | No Belief with that id in this Chat: an edit or delete (`PATCH`/`DELETE /api/stories/:storyId/chats/:chatId/beliefs/:beliefId`) of one that is gone, or another Chat's. Nothing changes. |
| `422.004.025` | `EmptyBeliefError` | A Belief added or edited with nothing but whitespace. Nothing changes. |
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
| `422.008.001` | `EmptySavedReplyError` | A Saved reply added or edited with nothing but whitespace. Over 1,000 characters is a validation error (`400.000.000`). |
| `422.008.002` | `TooManySavedRepliesError` | A 51st Saved reply in one scope (app-wide, or one Story). Nothing is added. |
| `404.008.003` | `SavedReplyNotFoundError` | A Saved reply id that isn't in that scope: an app-wide route given a Story's line, or a Story's route given another Story's or an app-wide one. |
| `422.008.004` | `TooManyReplaceRulesError` | A 51st Replace rule in one scope (app-wide, or one Story). Nothing is added. |
| `404.008.005` | `ReplaceRuleNotFoundError` | A Replace rule id that isn't in that scope. |
| `422.008.006` | `InvalidReplaceRuleError` | A Replace rule refused at save (create or update), nothing saved; the message is the plain reason the editor shows under Find: the engine's message for a regex that doesn't compile, "This would match between every letter", "This pattern is too slow" (over 250 ms on the probe texts, in a worker thread), or, with On my Messages on, "This rule would change your text again if run twice". A Find over 500 characters, or empty, is a validation error (`400.000.000`). |
| `400.009.001` | `NoAudioFileError` | A dictation (`POST /api/stories/:storyId/chats/:chatId/dictation`) with no file in its `audio` field. No call. |
| `415.009.002` | `UnsupportedAudioError` | A dictation whose bytes are not a WebM, MP4/M4A, Ogg or WAV recording (read from the first bytes, not the label). No call. |
| `413.009.003` | `AudioTooLargeError` | A dictation recording over 10 MB. No call. |
| `422.009.004` | `RecordingTooLongError` | A dictation whose `durationMs` is over 125,000 (the two-minute limit and five seconds' grace). No call. A `language` other than `th` or `en`, or a missing duration, is a validation error (`400.000.000`); the Venice pool known to be used up answers `402.001.004`. |

# API error codes

Every API error has the body `{ "error": { "code": "XXX.YYY.ZZZ", "message": "..." } }`:
`XXX` is the HTTP status, `YYY` the domain and `ZZZ` the case. The code is part of the API
contract: the frontend routes on it, never on the message. Defined in
`apps/api/src/errors/`.

A response that is not JSON, or has no code, did not come from the API. The frontend reads it
as "the API can't be reached" and shows the can't-connect screen (`apps/web/lib/api.ts`).

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

## Codes

| Code | Error | Meaning |
|---|---|---|
| `XXX.000.000` | (any `HttpException`) | Framework error with that HTTP status, e.g. `400.000.000` for a failed validation. |
| `500.000.000` | (unhandled) | Unexpected server error. |
| `502.001.001` | `ProviderOutageError` | The model provider failed or is down, including a rate limit or host overload (OpenRouter 429 or 503) that outlasted the gateway's same-host retries. The message carries the host's own code, e.g. `(DeepInfra: engine_overloaded)`. Show with Retry. |
| `422.001.002` | `ModelRefusalError` | The model refused, or the host stopped the output for content. Show with Retry. |
| `402.001.003` | `OutOfCreditError` (text) | Text credit is used up: OpenRouter answered 402 (balance, key limit or the per-request credit reservation) or a 403 budget block, the only answers that carry a `limit_source`. Never raised for a 429, whatever its metadata says. Blocks play. |
| `402.001.004` | `OutOfCreditError` (image) | Image credit is used up. Blocks only Snapshots and Reference images. |
| `502.001.005` | `UnparseableOutputError` | The model's output could not be read. Show with Retry. |
| `404.002.001` | `ImageNotFoundError` | No image file at that path. |
| `400.002.002` | `InvalidImagePathError` | The path is absolute or leaves the image folder. |
| `404.002.003` | `ReferenceCandidateNotFoundError` | No such Reference image candidate: it was picked, replaced by a newer round, expired, or never made. Generate again. |
| `422.002.004` | `NoAppearanceError` | A Reference image was asked for while the Character's Appearance is empty. |
| `404.003.001` | `StoryNotFoundError` | No Story with that id. |
| `404.003.002` | `CharacterNotFoundError` | No Character with that id in this Story. |
| `404.003.003` | `SceneNotFoundError` | No Scene with that id in this Story. |
| `404.003.004` | `StartingBondNotFoundError` | No StartingBond with that id in this Story. |
| `422.003.005` | `CastFullError` | The Story already has 6 Characters. |
| `409.003.006` | `DuplicateStartingBondError` | That Character already has a StartingBond in that direction. |
| `422.003.007` | `SelfStartingBondError` | A StartingBond from a Character toward itself. |
| `422.003.008` | `InvalidOrderError` | A reorder that does not list every Character (or Scene) of the Story exactly once. |
| `404.004.001` | `ChatNotFoundError` | No Chat with that id in this Story. |
| `422.004.002` | `StoryNotPlayableError` | The Story has a required field empty. The message names the missing fields. Blocks starting a Chat and sending. |
| `409.004.003` | `NoTurnToRetryError` | Retry when the Chat is not waiting for a reply to a User Message. |
| `409.004.004` | `TurnInProgressError` | A send, a Message edit or a reset while this Chat's turn is still being written. |
| `422.004.005` | `EmptyMessageError` | A send or a Message edit with nothing but whitespace. |
| `404.004.006` | `MessageNotFoundError` | No Message with that id in this Chat. |
| `409.004.007` | `BackgroundStillSavingError` | A send, Retry, Message edit or reset while one of the previous AI Message's background calls (the judge, Memory extraction) was still pending past the short wait. Try again in a moment. |
| `409.004.008` | `BackgroundFailedError` | A send or Retry while one of the previous AI Message's background calls has failed. The message names which; retry it (on the Chat screen or the dashboard) first. |
| `409.004.009` | `NoFailedJudgeError` | A judge retry on a Message whose judge did not fail, or that is not the latest AI Message. |
| `409.004.010` | `NoFailedExtractionError` | A Memory extraction retry on a Message whose extraction did not fail, or that is not the latest AI Message. |
| `404.004.011` | `MemoryNotFoundError` | No Memory with that id in this Chat. |
| `422.004.012` | `EmptyMemoryError` | A Memory added or edited with nothing but whitespace. |
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

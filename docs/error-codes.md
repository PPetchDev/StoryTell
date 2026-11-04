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

## Codes

| Code | Error | Meaning |
|---|---|---|
| `XXX.000.000` | (any `HttpException`) | Framework error with that HTTP status, e.g. `400.000.000` for a failed validation. |
| `500.000.000` | (unhandled) | Unexpected server error. |
| `502.001.001` | `ProviderOutageError` | The model provider failed or is down. Show with Retry. |
| `422.001.002` | `ModelRefusalError` | The model refused, or the host stopped the output for content. Show with Retry. |
| `402.001.003` | `OutOfCreditError` (text) | Text credit is used up. Blocks play. |
| `402.001.004` | `OutOfCreditError` (image) | Image credit is used up. Blocks only Snapshots and Reference images. |
| `502.001.005` | `UnparseableOutputError` | The model's output could not be read. Show with Retry. |
| `404.002.001` | `ImageNotFoundError` | No image file at that path. |
| `400.002.002` | `InvalidImagePathError` | The path is absolute or leaves the image folder. |
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
| `502.005.001` | `UnreadableDraftError` | The model's draft or rewrite could not be read (no JSON object, or no text). Nothing saved. Show with Retry. |
| `502.005.002` | `InvalidDraftError` | The draft does not fit a Story (0 or 7 Characters, a Style value outside its set, a required field empty, a bad StartingBond). Nothing saved. Show with Retry. |
| `422.005.003` | `EmptyIdeaError` | A draft was asked for with a blank idea. |
| `422.005.004` | `NotRewritableError` | A rewrite named a field that is not a text field of that part of the Story. |

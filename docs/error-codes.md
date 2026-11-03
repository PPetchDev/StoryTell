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

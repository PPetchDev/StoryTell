# 01 — Transcription through Venice's Whisper

**Status:** done

**What to build:** The API can turn a recording into text. The Model Gateway gains `transcribe` with the call kind `dictation` in the one Venice-audio call-kind type shared with Read aloud; the real gateway sends the audio to Venice's Whisper (`openai/whisper-large-v3`) from the Venice client's one audio section, with the chosen language, and writes one UsageRecord in the Venice (`image`) pool at list price; the fake gateway scripts transcriptions and the testing control exposes them to e2e without echoing the audio. `POST /api/stories/:storyId/chats/:chatId/dictation` (multipart: `audio`, `language`, `durationMs`) answers `{ text }` and stores nothing. The Usage page lists "Dictation", and the Venice pool is labelled "Images and audio (Venice)" everywhere. Per the spec's "Model Gateway" and "API" decisions.

**Blocked by:** None — can start immediately

Part of: [Spec: Dictation](../spec.md)

- [ ] `transcribe` on the gateway boundary; `dictation` in `AudioCallKind` (`'dictation' | 'read_aloud' | 'voice_preview'`, one type with [Read aloud](../../read-aloud/spec.md): join its type if it landed first), part of `CallKind`, the Usage DTO kind list and the web's call-kind labels.
- [ ] Venice client: the transcription call lives in the one audio section shared with Read aloud (reuse it if Read aloud landed first); multipart `POST /audio/transcriptions` with a file name whose extension matches the type, `model`, `language`, JSON response; field names checked against Venice's docs page (no paid call) and pinned by a contract test with a recorded response.
- [ ] Errors map exactly as image calls do: 402 → image-pool `OutOfCreditError`, 422 → `ModelRefusalError`, anything else → `ProviderOutageError`; only 429 and 503 are retried (same backoff, same `MAX_RETRIES`); contract tests for 402, 422, 400, 500 (one request each) and 429-then-200 (two requests, one UsageRecord).
- [ ] One UsageRecord per answered call: kind `dictation`, pool `image`, host `venice`, cost = $0.0001 × whole seconds (clamped 1–120) unless Venice reports duration or cost.
- [ ] Fake gateway `scriptTranscription` + recorded calls (language, MIME type, byte length); `POST /api/testing/fake-gateway/transcription`; reset clears it; an unscripted call fails loudly.
- [ ] `GET /api/testing/fake-gateway/calls` summarises a transcription's audio as `{ mimeType, size }` and never returns its bytes (API test).
- [ ] The endpoint refuses no file, over 10 MB, non-audio bytes (sniffed WebM / MP4 / Ogg / WAV), over 125 s, a bad language, and a known-empty Venice pool, each with no call; new Audio-domain codes in `docs/error-codes.md` (or Read aloud's audio domain if it exists).
- [ ] Audio is never written to disk or logged.
- [ ] The pool label "Images and audio (Venice)" (pool id still `image`) shows on the Usage page heading (no doubled "(Venice)"), the low-credit banner, and Settings' "Images and audio (Venice) pool (USD)" and "Images and audio (Venice) warning (%)"; "Dictation" shows under it on the Usage page. Existing e2e that read the old "Image" labels are updated.
- [ ] API and recorded-fetch tests from the spec's Testing Decisions pass; the existing suites stay green.

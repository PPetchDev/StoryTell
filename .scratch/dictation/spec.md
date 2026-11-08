# Spec: Dictation

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) ("Composer", "Model Gateway", "UsageRecord", "Per-device preferences")
Decision: [Speaking instead of typing](../sillytavern-gaps/issues/06-speech-to-text.md) (read its revised Answer)
Research: [Voices (TTS) and dictation (STT) options](../../docs/research/voices-and-dictation.md) (1. Venice audio, 4. Browser-native)
Shares the composer with: [Write for me and Thai reading](../write-for-me/spec.md) (owns the tool row), [Saved replies and Replace rules](../saved-replies-and-replace-rules/spec.md)
Shares Venice audio with: [Read aloud](../read-aloud/spec.md)
Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

On a phone, typing a reply is the slowest part of playing, and typing Thai on a phone keyboard is slower still. The keyboard's own dictation helps only in some keyboards, and switches language awkwardly. The browser's built-in speech recognition, the obvious free route, is reported not to work in an iPhone home-screen app (how the user runs Storytell), sends audio to the browser vendor's cloud anyway, and its Thai support is unconfirmed.

## Solution

A 🎤 button in the composer's box row. A tap starts recording in the browser; the box row becomes a recording bar with a timer, a ไทย/EN language switch, Cancel and Done. Done sends the recording to the API, which has Venice's Whisper transcribe it in the chosen language and answers the text. The text is appended to the composer as ordinary text, for the user to edit, send, or turn into an English reply with ✍️ Write for me. A recording lasts at most two minutes. Each transcription is one tap and one paid call, logged as usage in the Venice pool (about $0.006 a minute). Nothing is recorded or kept unless the user taps 🎤, and the audio is never stored.

## User Stories

1. As a player on a phone, I want to speak my reply instead of typing it, so that playing is quicker.
2. As a player who thinks in Thai, I want to dictate in Thai, so that I can say what I mean in my own language.
3. As a player, I want to dictate in English too, so that I can speak an English line directly.
4. As a player, I want a ไทย/EN switch that remembers my choice on this phone, so that I set it once.
5. As a player, I want the switch reachable while I record, so that I can fix it before I finish.
6. As a player, I want what I said added to the end of what's already in the composer, so that I can type part and speak part.
7. As a player, I want dictated text to be plain composer text, so that I can edit it before sending.
8. As a player, I want dictation never to send anything by itself, so that I always check first.
9. As a player, I want to speak Thai and then tap ✍️ Write for me, so that I play in English without typing (with [Write for me](../write-for-me/spec.md)).
10. As a player, I want to see that I'm recording and for how long, so that I know it's listening.
11. As a player, I want a warning as I near the limit and the recording to finish on its own at two minutes, so that nothing I said is lost.
12. As a player, I want Cancel to throw a recording away with no cost, so that a false start is free.
13. As a player, I want a recording under a second ignored with a short note, so that an accidental tap costs nothing.
14. As a player, I want to see that my speech is being transcribed, so that I wait for it.
15. As a player, I want a failed transcription to keep my recording and offer Retry, so that I don't have to say it all again.
16. As a player, I want to know when nothing was heard, so that I can try again.
17. As a player, I want the microphone asked for only when I first tap 🎤, so that the app never listens unasked.
18. As a player who blocked the microphone, I want a plain note on how to allow it, so that I can fix it.
19. As a player, I want 🎤 hidden where the browser can't record, so that I never press a button that can't work.
20. As a player, I want the phone's microphone released as soon as I finish or cancel, so that the recording light goes off.
21. As a player who switches away from the app while recording, I want what I said so far transcribed, so that I don't lose it.
22. As a player, I want 🎤 unavailable while the AI is writing, like the box, so that dictated text doesn't land mid-turn.
23. As a player, I want 🎤 disabled when Venice credit is used up, so that I don't record for nothing.
24. As a player watching spend, I want each transcription logged as "Dictation" in the Venice pool on the Usage page, so that I can see what it costs.
25. As a player, I want the Usage page and Settings to call the Venice pool what it now pays for, "Images and audio (Venice)", so that the numbers make sense.
26. As a player, I want my recordings never stored on the server, so that my voice isn't kept anywhere.
27. As a player, I want the mic to fit the composer next to Send, so that the box isn't squeezed on a phone.

## Implementation Decisions

### Model Gateway

- **New method** on the one gateway boundary: `transcribe(request) → result`.
  - The request is `{ kind: 'dictation', audio: { bytes, mimeType }, language: 'th' | 'en', durationSeconds, servedFor }`.
  - The result is `{ text, model, costUsd }`.
  - One call-kind type for Venice audio, shared with [Read aloud](../read-aloud/spec.md) as [integration](../sillytavern-gaps/integration.md) ("Venice audio in the Model Gateway") settles: `AudioCallKind = 'dictation' | 'read_aloud' | 'voice_preview'`, part of `CallKind`. This spec adds `dictation`; if Read aloud landed first, its type is that one (renamed to `AudioCallKind` if it was named otherwise) and `dictation` joins it, so there is never a second audio type. The Usage DTO's kind list and the web's call-kind labels gain `dictation` ("Dictation").
- **Model.** The app's model name `whisper-large-v3`, Venice id `openai/whisper-large-v3`, in the real gateway's model table. Only Whisper takes Venice's `language` parameter (the others auto-detect), and the decision chose it. No Settings choice: callers never name a model.
- **Venice client** gains the transcription call, in **one audio section** of the client that Read aloud's speech and voice-list calls share (same headers, same `send` with its retries, same error mapping). Whichever of Dictation and Read aloud lands second adds its call to the first's section rather than a section of its own.
  - `POST /audio/transcriptions` as `multipart/form-data` with the audio file, `model`, `language` and a JSON response format. The file's name carries an extension matching its type (`.webm`, `.m4a`, `.ogg`, `.wav`), since some servers go by it.
  - Node's own `fetch`, `FormData` and `Blob` build it; no new dependency.
  - Field names and the response shape are to be confirmed against Venice's docs page for the endpoint (reading docs only, no paid call), and pinned by a contract test with a hand-written recorded response.
  - Error mapping, exactly as image calls do today (`toError` in `apps/api/src/service/model-gateway/real/venice-client.ts`): 402 → `OutOfCreditError('image')` (the Venice pool); 422 → `ModelRefusalError`; anything else (an unreadable or unsupported audio file's 400 included) → `ProviderOutageError` with Venice's message. Only 429 and 503 are retried, on the same model with the existing backoff (`isRetryable` and `MAX_RETRIES` in `real/http.ts`), because both are refused before any work runs, so a retry never bills twice; any other 5xx is not retried. A network failure is an outage, as today.
- **Cost and usage.**
  - Venice reports no per-call cost for images. If the transcription answer has none either, the record carries the list price: $0.0001 per audio second (Venice pricing page, 2026-11-08), times the duration rounded up to whole seconds, kept to whole millionths of a dollar.
  - The duration is the client's measured `durationSeconds`, clamped to 1–120. If Venice's answer reports the audio's duration, that wins (open question below).
  - One UsageRecord per answered call: kind `dictation`, **pool `image`**, model `whisper-large-v3`, host `venice`, tokens and images null, the Story and Chat served. A failed call writes none, as for every kind.
- **The Venice pool.** The `image` pool already is "whatever Venice bills". Its id stays `image`, so no migration and no history rewrite. Its label everywhere is **"Images and audio (Venice)"** ([integration](../sillytavern-gaps/integration.md), "Story editor, Settings and Usage"): the web's pool label (`POOL_LABEL` in `apps/web/lib/types.ts`, today "Image") becomes it, and every place that names the pool uses it whole:
  - the Usage page heading reads "Images and audio (Venice)" (the heading today adds the provider in brackets after the label; for this pool it must not add a second "(Venice)") and its by-kind list's accessible name;
  - the low-credit banner ("Images and audio (Venice) credit is low");
  - Settings' "Image pool (USD)" and "Image warning (%)" become "Images and audio (Venice) pool (USD)" and "Images and audio (Venice) warning (%)".

  Under it the Usage page lists the kinds Dictation, Read aloud, Voice samples and Expression pictures as each lands. Whichever of the Venice-audio and Expressions features lands first makes the label change; the rest only add their kinds.
- **Fake gateway.**
  - `scriptTranscription(...replies)`: each reply is a text, a partial result with an optional `delayMs`, or a gateway error.
  - Each call is recorded as `{ method: 'transcribe', request }`, so a test can see the language, the MIME type and the byte length; `transcriptionCalls()` lists them.
  - The testing control's `GET /api/testing/fake-gateway/calls` never sends the raw audio back: a `transcribe` call's `audio` is summarised as `{ mimeType, size }` (byte length), as `generateImage` calls' reference images already are (`apps/api/src/testing/fake-gateway-control.controller.ts`). e2e reads the type and size from there.
  - A call with nothing scripted fails loudly, as the fake does for every kind.
  - The testing control gains `POST /api/testing/fake-gateway/transcription` with `{ replies }` (the same reply and error JSON as text), and the existing reset clears it.

### API

- **Endpoint.** `POST /api/stories/:storyId/chats/:chatId/dictation`, `multipart/form-data`: `audio` (the file), `language` (`th` or `en`), `durationMs` (integer). It answers `{ text }`, trimmed, possibly empty.
- **Checks**, all before any call:
  - no file → `NoAudioFileError` (400);
  - over 10 MB → `AudioTooLargeError` (413). Two minutes of Opus is about 1 MB and of AAC about 2 MB; Venice's own limit is 25 MB.
  - bytes that aren't WebM, MP4/M4A, Ogg or WAV, sniffed by their magic bytes as images are → `UnsupportedAudioError` (415);
  - `durationMs` over 125,000 → `RecordingTooLongError` (422);
  - a bad `language` → validation 400;
  - the Venice pool known to be out → `OutOfCreditError('image')`.

  The new errors go in a new Audio domain (the next free `YYY` in `docs/error-codes.md`; if Read aloud has already added an audio domain, use that).
- **No turn lock and no state.** It reads the Chat only to check it exists and to tag the usage; nothing is stored. The audio stays in memory for the one call and is never written to disk or logged.

### Web: the composer

- **Layout** (shared; the bands come from [Write for me 01](../write-for-me/issues/01-composer-tool-row.md)): the composer is, top to bottom, the panel · the Character row · the tool row · the box row, as [integration](../sillytavern-gaps/integration.md) ("The composer, top to bottom") settles. Box row = box · 🎤 · send slot. 🎤 is a quiet round button like ✱ was, `aria-label` "Dictate", title "Speak instead of typing".
- **Shown** only when the page can record: `navigator.mediaDevices.getUserMedia` and `MediaRecorder` exist (a secure context: the tailnet's HTTPS URL, or localhost in tests). **Disabled** while a turn is written, a write is in flight, Write for me or a transcription is running, or `imageCreditOut` is true; the title then says why ("Venice credit is used up").
- **Starting.** A tap asks `getUserMedia({ audio: true })`; the browser asks permission the first time. Refused (`NotAllowedError`): the panel says "The microphone is blocked. Allow it for this site in your browser's settings, then try again." No device: "No microphone found." Nothing is recorded in either case.
- **Recording.**
  - `MediaRecorder` with the first type the browser supports of `audio/webm;codecs=opus`, `audio/mp4`, `audio/ogg;codecs=opus`, else its default. iPhone Safari records `audio/mp4`, Android Chrome `audio/webm`, and Venice takes both, so nothing is transcoded.
  - The box row turns into the **recording bar**:
    - ✕ Cancel;
    - a red dot and the elapsed time (`role="timer"`, "0:07");
    - the language switch, a two-state button showing "ไทย" or "EN" (`aria-label` "Dictation language");
    - ✓ Done.
  - The tool row is disabled while recording.
- **⚡ and ✍️ while dictating.** While a recording **or** a transcription runs, ⚡ Suggest replies and ✍️ Write for me are disabled (integration: "While a recording or a transcription runs, ⚡ and ✍️ are disabled"). This spec adds that to each button's own disabled rule: ⚡'s today, and ✍️'s when Write for me exists (if Write for me lands after this, its ticket wires the same states into ✍️).- **Language.** A per-device preference (`storytell.dictationLanguage`, `th` or `en`, default `th`), changed by the switch at any time before Done.
- **Limit.** Two minutes. From 1:45 the timer shows as a warning. At 2:00 the recording stops and goes on as if Done.
- **Done** stops the recorder, stops every track (the phone's mic light goes off), and handles the audio:
  - under 1 second it is dropped with "That was too short.";
  - otherwise it is posted with the language and the measured duration. The panel shows "Transcribing…", the box is read-only, and 🎤 is busy.
- **Result.**
  - Text: it is appended to the draft, after one space when the draft is non-empty and doesn't end in whitespace. The box isn't focused, so the phone keyboard doesn't jump up over the result. This changes the box, so it ends Write for me's Undo.
  - Empty text: "Didn't catch anything." and the draft is unchanged.
- **Failure.**
  - The panel shows "Couldn't transcribe that." with Retry and Discard. The recording stays in memory until it succeeds, is discarded, or a new recording starts, so Retry sends the same audio again (a new paid call, on the user's tap).
  - Venice credit out shows "Venice credit is used up." An unreachable API reports as elsewhere.
- **Cancel** stops the recorder and the tracks and discards the audio; no call.
- **Leaving the page.** When the page is hidden while recording (the user switches app or locks the phone), the recording stops and goes on as Done, since it was started by a tap and losing speech is worse than the fraction of a cent. When the Chat screen unmounts, it is cancelled.
- **Mic permission on iPhone.** A home-screen app may ask again after each launch; nothing to do in the app, noted for the user.

### Glossary

Dictation is in `CONTEXT.md`. "Venice pool" is a UI label for the existing credit pool, not a new domain term.

## Testing Decisions

- Test external behaviour only: what the fake gateway receives, what the API answers and records, and what the composer shows.
- **API tests** through the fake gateway (prior art: `apps/api/test/suggested-replies.spec.ts` for an on-tap call and its gate; `story-cover.spec.ts` for a multipart upload and sniffing; `usage.spec.ts` for records and pools):
  - a WebM and an M4A recording are each transcribed: the fake receives the bytes, MIME type, language and duration, and the answer is the trimmed text;
  - no file, too large, not audio, too long, and a bad language are each refused with their code and no call;
  - the Venice pool known out is refused with `402.001.004` and no call;
  - a scripted outage passes through as `502.001.001`;
  - `GET /api/testing/fake-gateway/calls` shows a transcription's audio as `{ mimeType, size }`, never its bytes.
- **Real gateway tests with recorded fetch** (prior art: `apps/api/test/gateway/venice.contract.spec.ts`, the harness's recorded fetch):
  - the multipart body has the file with a matching extension, `model` `openai/whisper-large-v3` and `language`;
  - a 402 maps to the image pool's out-of-credit, a 422 to `ModelRefusalError`, a 400 and a 500 to `ProviderOutageError` with one request each (not retried); a 429 then a 200 makes two requests and one UsageRecord;
  - one UsageRecord of kind `dictation`, pool `image`, host `venice`, with the list-price cost for the duration;
  - the Usage summary counts it under the image pool's `byKind`.
- **e2e** (Playwright, 390px with touch). The dictation spec file launches Chromium with `--use-fake-ui-for-media-stream` and `--use-fake-device-for-media-stream` and grants `microphone`, so a real `MediaRecorder` records a test tone. Prior art: `apps/web/e2e/suggested-replies.spec.ts`, `composer-and-actions.spec.ts`.
  - tap 🎤, the recording bar shows with the timer;
  - switch to EN and back;
  - after over a second, Done; "Transcribing…" shows; the scripted Thai text is appended to a typed draft with a space;
  - the fake was called with `th` and an `audio/webm` file of non-zero size (read from the summarised calls);
  - while recording and while transcribing, ⚡ (and ✍️ once it exists) is disabled;
  - Cancel makes no call (the fake's pending replies unchanged);
  - a scripted failure shows Retry, and Retry succeeds with a second scripted reply;
  - with `getUserMedia` stubbed (an init script) to reject with `NotAllowedError`, the blocked-microphone note shows;
  - the Usage page lists "Dictation" under "Images and audio (Venice)", and Settings shows "Images and audio (Venice) pool (USD)".
- **Manual check on the user's phones** (its own `ready-for-human` ticket, [03](issues/03-manual-check-on-the-phones.md)), only with the user's OK since each is a paid call of under a cent:
  - one Thai and one English dictation from the iPhone home-screen app and from Android Chrome;
  - the two-minute auto-stop;
  - switching away mid-recording.

  This covers what the fake device can't: real permission prompts, Safari's `audio/mp4`, and Whisper's Thai accuracy.

## Out of Scope

- The browser's own speech recognition (`SpeechRecognition`), as a primary or an optional free path.
- Live (streaming) transcription while speaking, or voice activity detection that stops on silence.
- Auto-detecting the language, or languages beyond Thai and English.
- Dictating anywhere but the Chat composer (the Story editor, the Story assistant, Memories).
- Keeping recordings, playing them back, or a history of dictations.
- A choice of transcription model in Settings; DeepInfra's Whisper (cheaper, but its docs list only mp3/wav, so the phone's audio would need transcoding).
- Voice commands ("send", "new line").

## Further Notes

- Whisper is known to "hear" stock phrases in silence or noise (e.g. a sign-off line). The one-second minimum and the user's own check before sending are the guard; nothing more for now.
- Open question: does Venice's transcription answer report the audio's duration or cost? Recommendation: read the docs page when implementing (no paid call). If it reports either, record that; otherwise the client's measured duration at list price, clamped to 1–120 seconds, is accurate to within a second.
- Open question: ไทย/EN switch versus Whisper's auto-detect? Recommendation: the switch, defaulting to Thai. Short Thai clips full of English names are where auto-detection is least reliable, and Venice applies `language` only to Whisper, which the decision chose anyway.
- Pairing with Write for me: speak Thai, then ✍️ turns it into an English reply as the worn identity. No coupling in code: dictation only appends text.

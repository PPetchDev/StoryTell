# Speaking instead of typing

Type: grilling
Status: resolved
Blocked by: none

## Question

Should the composer get its own microphone button that turns speech into the message?

## SillyTavern

Speech Recognition extension (browser Web Speech API, Whisper, Vosk…).

## Storytell today (checked 2026-11-08)

- The composer is text only (`apps/web/components/chat/chat-composer.tsx`). The app is served over HTTPS on the tailnet, so a browser mic would be allowed.
- The phone keyboard's own dictation (e.g. Gboard's mic) already types speech into any text box, Thai included, at no cost and with no code.

## Options

- **A. A mic button** using the browser's speech recognition.
- **B. A paid transcription provider.**
- **C. Never** — keyboard dictation already does it.

## Recommendation

C. Keyboard dictation covers it; paired with the draft translation in [Writing in Thai while the story plays in English](07-translation.md), the user can speak Thai and play in English.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: **Dictation** — a mic button in the composer that types what the user says, in Thai or English.

Revised the same day after [the voices research](../../../docs/research/voices-and-dictation.md): the browser's own speech recognition is reported broken in iOS home-screen PWAs and sends audio to a cloud service anyway, and its Thai support is unconfirmed. So Dictation records the audio in the browser and the API sends it to Venice's Whisper transcription (it takes the m4a/webm the phone records, so no transcoding; about $0.006 a minute, roughly $2 a month at heavy use), each recording a user tap, logged as usage. Venice rather than DeepInfra keeps to the vendors already wired in.

Spec and tickets: [.scratch/dictation/](../../dictation/spec.md).

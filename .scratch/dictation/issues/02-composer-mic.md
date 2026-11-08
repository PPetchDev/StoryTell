# 02 — 🎤 in the composer

**Status:** ready-for-agent

**What to build:** A 🎤 button in the composer's box row, between the box and the send slot. A tap asks for the microphone and records with `MediaRecorder`; the box row becomes the recording bar (✕ Cancel, a red dot with the elapsed time, the ไทย/EN switch remembered per device, ✓ Done). Done posts the recording to the dictation endpoint and appends the text to the draft; Cancel discards it with no call. Two minutes at most, with a warning from 1:45 and an automatic finish at 2:00. Per the spec's "Web: the composer": shown only where recording works, the disabled rules (Venice credit out included), ⚡ and ✍️ disabled while recording or transcribing, the permission and no-device notes, the under-a-second drop, the page-hidden finish, Retry with the same audio, and releasing the mic every time.

**Blocked by:** 01 — Transcription through Venice's Whisper; [Write for me 01 — Composer tool row](../../write-for-me/issues/01-composer-tool-row.md)

Part of: [Spec: Dictation](../spec.md)

- [ ] 🎤 ("Dictate") shows only with `getUserMedia` and `MediaRecorder`; disabled while a turn or write is in flight, while Write for me or a transcription runs, and when `imageCreditOut` (title says why).
- [ ] Recording bar with Cancel, `role="timer"` elapsed time, the "Dictation language" switch (`storytell.dictationLanguage`, default `th`), and Done; the tool row is disabled meanwhile; the recorder uses the first supported of webm/opus, mp4, ogg/opus.
- [ ] While a recording or a transcription runs, ⚡ and ✍️ are disabled, each by its own rule (✍️ only if Write for me has landed; otherwise Write for me's ticket wires it).
- [ ] Done: under 1 s dropped with "That was too short."; otherwise "Transcribing…", then the text is appended after one space where needed (box not focused); empty text shows "Didn't catch anything."; the mic tracks are stopped every time.
- [ ] Failure keeps the audio and offers Retry (same audio) and Discard; Venice credit out shows "Venice credit is used up."; blocked mic and no device show their notes and record nothing.
- [ ] 2:00 finishes as Done; the page going hidden finishes as Done; leaving the Chat screen cancels.
- [ ] e2e from the spec's Testing Decisions pass with Chromium's fake media device and a stubbed `NotAllowedError`; the existing composer e2e stays green.

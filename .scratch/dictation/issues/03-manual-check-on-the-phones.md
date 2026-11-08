# 03 — Manual check on the user's phones

**Status:** ready-for-human

**What to build:** Nothing to build: a check only the user can do, on their own phones, covering what the fake media device can't (real permission prompts, Safari's `audio/mp4`, Whisper's Thai accuracy). Each dictation is a paid Venice call of under a cent, so it runs only with the user's OK. Per the spec's Testing Decisions, "Manual check on the user's phones".

**Blocked by:** 02 — 🎤 in the composer

Part of: [Spec: Dictation](../spec.md)

- [ ] The user has agreed to the paid calls (a handful, under a cent each).
- [ ] One Thai and one English dictation from the iPhone home-screen app: the permission prompt, the text appended, "Dictation" on the Usage page under "Images and audio (Venice)".
- [ ] The same from Android Chrome.
- [ ] The two-minute auto-stop finishes as Done on one phone.
- [ ] Switching away mid-recording transcribes what was said so far.
- [ ] Results, including how well Whisper heard the Thai, noted under `## Comments` here.

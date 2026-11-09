# 02 — Narration voice and Speaking voices in the Story editor, with samples

**Status:** done

**What to build:** The author picks the Story's Narration voice on the Style tab and each Character's Speaking voice on their card, hears a short sample of any voice with one tap, and both choices autosave. Per the spec's "Voices on the Story and its Characters" and "Audio cache" (the speech folder):

- `story.narration_voice` and `character.speaking_voice`, by migration;
- the Story and Character updates, with `UnknownVoiceError`;
- the Story response fields;
- Duplicate Story copying both voices;
- `POST /api/voices/:voiceId/preview`, with each voice's sample made once and kept in the speech folder's `samples/`;
- the `SPEECH_DIR` config value and its default beside the image folder (refused when inside it);
- a `speechDir` option on the API test harness's `startTestApp`, by default a fresh temporary folder of its own removed on close, so test apps never share the default `speech` folder beside their temporary image folders;
- the editor's selects, grouped by accent and gender, with "Default (Sky)" and "Same as narration", and ▶ Sample.

**Part of:** [Spec: Read aloud](../spec.md)

**Blocked by:** [01 — Speech in the Model Gateway](01-speech-in-the-gateway.md)

- [ ] API tests:
  - setting and clearing both voices;
  - an unknown voice is refused with the new code;
  - Duplicate copies the voices;
  - a sample is made once (one `voice_preview` call, logged) and then served from disk with no call;
  - two test apps get different speech folders, and each is gone after `close()`;
  - a `SPEECH_DIR` inside the image folder fails config.
- [ ] e2e at 390px:
  - choosing a Narration voice and a Speaking voice autosaves and survives a reload;
  - ▶ Sample plays and the fake records one call; a second tap records none.
- [ ] `docs/error-codes.md` lists `UnknownVoiceError`, with the next free code at implementation time.
- [ ] A Story with no voices set behaves exactly as before. Typecheck and the whole suites stay green.

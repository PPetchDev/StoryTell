# 01 — Speech in the Model Gateway, counted in the Venice pool

**Status:** done

**What to build:** The Model Gateway can make speech and list English voices, through Venice's Kokoro model, and every answered call shows on the Usage page. Per the spec's "Provider and the Model Gateway":

- `synthesizeSpeech` and `speechVoices` on the gateway, and `speak` and `voices` in the Venice client's one audio section (shared with Dictation: reuse it if Dictation landed first), reading voices and price from `GET /models?type=tts` with the stored fallback;
- the `read_aloud` and `voice_preview` call kinds in `AudioCallKind` (created here if Dictation hasn't landed), and the speech entry in the model table with `DEFAULT_NARRATION_VOICE`;
- errors mapped exactly as image calls: 402 out of image credit, 422 refused, anything else an outage; only 429 and 503 retried;
- the nullable `characters` column on UsageRecord, by migration;
- the fake gateway's speech scripting, `FAKE_MP3` and default voice list, plus the testing control route;
- `GET /api/voices`;
- the Venice pool labelled "Images and audio (Venice)" on the Usage page and in Settings (unless Dictation already did it), and the Usage page listing "Read aloud" and "Voice samples" under it.

No editor or Chat UI yet. This is the prefactor the other tickets stand on.

**Part of:** [Spec: Read aloud](../spec.md)

**Blocked by:** None — can start immediately.

- [x] Venice contract tests pass:
  - the request body and bytes;
  - the usage record (pool `image`, `characters`, list price from `pricing.input`);
  - the fallback price and voices when the models call fails;
  - the English-only filter;
  - 402 is out of image credit, 422 is a refusal, 500 is an outage, 429 and 503 are retried, and nothing else is.
- [x] Fake gateway tests: scripted speech replies, errors and the default voices; an unscripted speech call fails loudly.
- [x] `GET /api/voices` answers the voices and the default Narration voice without a paid call (API test).
- [x] The Usage summary counts both speech kinds in the image pool (API test).
- [x] e2e: the Usage page lists "Read aloud" and "Voice samples" under "Images and audio (Venice)", and Settings shows "Images and audio pool (USD)" and "Images and audio warning (%)". Existing e2e that name the old "Image" labels are updated to the new ones.
  Settings' labels read "Images and audio (Venice) pool (USD)" and "Images and audio (Venice) warning (%)", the wording Dictation's ticket set; `e2e/dictation.spec.ts` checks them, and `e2e/read-aloud.spec.ts` checks the Usage page.
- [x] `docs/error-codes.md` says out of image credit also blocks new audio.
- [x] Typecheck and the existing API and e2e suites stay green.

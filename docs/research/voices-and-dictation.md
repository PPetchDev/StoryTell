# Voices (TTS) and dictation (STT) options

Researched 2026-11-08 from provider docs/pricing/policy pages only; no paid calls made. Prices are as listed on that date and may change. Where a page did not state something, it says "not stated" rather than guessing.

Sizing assumption: 40 messages/day x ~150 words x ~6 chars/word = ~900 chars/message, ~36k chars/day, **~1.1M chars/month** of TTS. Dictation assumed 10 min/day = ~300 min/month.

## 1. Venice.ai audio

- **TTS exists**: `POST /audio/speech` (Beta), 13 models, input max 4,096 chars, `speed` 0.25-4.0, formats mp3/opus/aac/flac/wav/pcm (varies per model), optional `streaming` (sentence by sentence), voice cloning via `vv_<id>` on supporting models. <https://docs.venice.ai/api-reference/endpoint/audio/speech>
- **Voices are per model** and returned as a `voices` array in `GET /models?type=tts` (also `supported_formats`, `default_format`, `pricing.input` per 1M chars). No single total count on the docs. Examples named: Kokoro (af_sky, af_bella, am_adam...), Orpheus (tara, leah, jess, leo, dan, mia, zac, zoe), xAI (26 voices). Gender mix is not stated per model but names show both. <https://docs.venice.ai/api-reference/endpoint/audio/speech>, <https://docs.venice.ai/api-reference/endpoint/models/list>
- **Languages**: not listed on the TTS page; language hints are model-specific. Thai is not confirmed for any Venice model on these pages (Gemini 3.1 Flash TTS is offered, but Thai support was only confirmed by Google for a different Gemini TTS version, see section 6).
- **TTS prices per 1M chars**: Kokoro $3.50, Inworld 1.5 Max $12.50, xAI v1 $18.75, Gradium $47.50, Chatterbox HD $50, ElevenLabs Turbo v2.5 $62.50, Orpheus $62.50, Qwen3 0.6B $87.50, Qwen3 1.7B $112.50, MiniMax HD $125, Gemini 3.1 Flash $187.50. Kokoro, xAI, Chatterbox, Orpheus, Qwen3 are tagged "Private"; Inworld, Gradium, ElevenLabs, MiniMax, Gemini "Anonymized". <https://docs.venice.ai/overview/pricing>
- **STT exists**: transcription endpoint, models `nvidia/parakeet-tdt-0.6b-v3` (default), `openai/whisper-large-v3`, `fal-ai/wizper`, `elevenlabs/scribe-v2`, `stt-xai-v1`; optional ISO 639-1 `language` (Whisper only; others auto-detect); formats WAV, FLAC, M4A, AAC, MP4, MP3, OGG, OGA, WEBM; 25 MB limit. <https://docs.venice.ai/api-reference/endpoint/audio/transcriptions>
- **STT price per audio second**: xAI $0.00003148, Parakeet $0.0001, Whisper Large V3 $0.0001, Wizper $0.0001, Scribe V2 $0.000167 (i.e. Whisper = $0.006/min). <https://docs.venice.ai/overview/pricing>
- **Privacy**: "Private" tier = no prompt/response stored (enforced by contract); "Anonymous" = provider may keep content. <https://venice.ai/privacy>
- **Adult-content policy**: The Terms contain no standalone adult-content policy. They mention a "mature content filter" users must not circumvent, forbid content "objectionable, profane, indecent, pornographic" in the user-content representation (Sec. 10.9c), prohibit CSAM including AI-generated (Sec. 12b), and say users must follow third-party model providers' usage policies (Sec. 10.3). Net: adult text is not clearly allowed or banned by the ToS wording; the "Private" models are the safer bet, and Venice already serves the app's image use. <https://venice.ai/legal/tos>

## 2. DeepInfra

- **Native endpoint** (not OpenAI-style as far as docs show): `POST https://api.deepinfra.com/v1/inference/{model}` with JSON `{"text": ...}`; response is audio (examples save `.wav`). Voice/speed/language are per-model params; see each model's API page. OpenAI-compatible base `https://api.deepinfra.com/v1/openai` is documented, but no audio path was found there. <https://docs.deepinfra.com/apis/text-to-speech.md>, <https://docs.deepinfra.com/>
- **TTS models and price per 1M chars**: Kokoro-82M $0.99; chatterbox-multilingual $1.00; chatterbox-turbo $1.00; Orpheus-3b $7.00; sesame/csm-1b $7.00; Audio8-TTS-Preview $5.00; Qwen3-TTS $20; HiggsAudioV2.5 $20; Inworld mini/2/max $25/$35/$50; MiMo-V2.5-tts listed at $0.00. Zonos not listed. <https://deepinfra.com/models/text-to-speech>
- **Kokoro**: $0.99/1M; voice list and formats not stated on DeepInfra's page. Upstream Kokoro-82M has 54 voices (29 F / 25 M) across 9 languages (en-US 20, en-GB 8, ja 5, zh 8, es 3, fr 1, hi 4, it 2, pt-BR 3). **Thai is not supported.** <https://deepinfra.com/hexgrad/Kokoro-82M/api>, <https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md>
- **Chatterbox multilingual**: 23 languages, **no Thai**; zero-shot cloning via a "Voice ID created on deepinfra"; formats wav (default), mp3, opus, flac, pcm; params exaggeration/CFG/temperature/seed. <https://deepinfra.com/ResembleAI/chatterbox-multilingual>
- **Orpheus**: only default voice `tara` shown; formats mp3/opus/flac/wav/pcm; languages not stated. <https://deepinfra.com/canopylabs/orpheus-3b-0.1-ft>
- **STT per minute**: whisper-large-v3 $0.00045; whisper-large-v3-turbo $0.00020; Qwen3-ASR 0.6B $0.00020 / 1.7B $0.00045; Voxtral Mini $0.001; Voxtral Small $0.003. <https://deepinfra.com/models/automatic-speech-recognition>
- **Whisper endpoint**: `POST /v1/inference/openai/whisper-large-v3`, multipart `audio`; docs list mp3/wav only (no size limit stated); returns `text` + `segments`; language is a per-model param. Whisper's language table includes Thai (`th`) but "performance varies widely depending on the language". <https://docs.deepinfra.com/apis/speech.md>, <https://github.com/openai/whisper/blob/main/whisper/tokenizer.py>, <https://github.com/openai/whisper>
- **Terms/privacy**: ToS Sec. 11 bans "illegal, fraudulent, or deceptive purpose" and high-risk use; no wording on adult/sexual content. Privacy policy: DeepInfra "will not store, sell, or train using this data unless we have your explicit consent" for inference inputs/outputs. Since the app already sends adult text to DeepInfra via OpenRouter, this is consistent. <https://deepinfra.com/terms>, <https://deepinfra.com/privacy>

## 3. ElevenLabs and OpenAI (brief)

- **ElevenLabs** TTS API: Flash/Turbo $40/1M chars, Multilingual v2 $80/1M; Scribe v2 STT $0.22/hour. <https://elevenlabs.io/pricing/api> Policy: does not ban adult content wholesale, but Sec. 6 prohibits "visual depictions of explicit sexual acts", erotic material involving incest/bestiality/necrophilia, and non-consensual intimate content; some uses "may be restricted". Explicit erotic audio is a grey zone and account-risky. <https://elevenlabs.io/use-policy> **Thai is not supported** by Flash/Turbo v2.5 or Multilingual v2. <https://elevenlabs.io/docs/overview/models>
- **OpenAI** TTS: tts-1 $15/1M chars, tts-1-hd $30/1M; gpt-4o-transcribe $0.006/min. <https://developers.openai.com/api/docs/pricing> Policy: the page returned 403 to my fetcher, so I could not quote it directly. Search snippets of the 2025-10-29 revision show prohibitions on sexualizing minors, sexual violence and non-consensual intimate content (<https://openai.com/policies/usage-policies/revisions/2025-10-29/>); I did not verify whether consensual adult erotica is banned, so treat OpenAI as unsuitable/unverified rather than confirmed-forbidden.

## 4. Browser-native

### speechSynthesis (read aloud)
- MDN: "Baseline widely available" since Sept 2018. `getVoices()` returns only voices **on the device**, so lists differ per user; voices can load late (`voiceschanged`). Calls are queued by `speak()`. <https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis>
- caniuse (as read): supported in Chrome for Android and in iOS Safari 7+. <https://caniuse.com/speech-synthesis>
- Not verified from a primary source: whether a `th-TH` voice is present on a given Android/iPhone (depends on installed OS/Google TTS voices; check `getVoices()` on the actual device), and installed-PWA behaviour. Autoplay-style restrictions (speaking only after a user tap) were not documented on MDN's page; plan to trigger speech from a tap.
- Quality: OS voices, one-or-few per language; a "distinct voice per Character" is limited to whatever the device ships. Free, offline, zero policy risk.

### SpeechRecognition / webkitSpeechRecognition (dictation)
- MDN: "Limited availability" (not Baseline). In Chrome the engine is server-based: "your audio is sent to a web service for recognition processing, so it won't work offline" (so audio goes to a cloud service, privacy implication). `lang` sets the language (e.g. `th-TH`); newer `processLocally` / `available()` / `install()` exist for on-device. MDN's page does not state a secure-context rule (browsers generally require HTTPS for the mic; the Tailscale HTTPS URL satisfies this). <https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition>
- caniuse (as read): Chrome Android partial; iOS Safari partial from 14.5 (no detail on what is partial). <https://caniuse.com/speech-recognition>
- **iOS standalone PWA is a known problem**: a WebKit developer said it was not available in Home Screen web apps (2021) and later reports in 2023-24 say it still fails there, while feature detection passes. Not a definitive current statement. <https://bugs.webkit.org/show_bug.cgi?id=225298>, <https://developer.apple.com/forums/thread/748048>, <https://bugs.webkit.org/show_bug.cgi?id=268643>
- Thai `th-TH` is not confirmed by any primary source I fetched; Chrome's engine historically supports it but I did not find a doc stating so. Treat as "test on device".

## 5. Cost for ~40 msgs/day x 150 words (~1.1M chars/mo)

| TTS option | $/1M chars | ~$/month | Thai | Policy fit for explicit adult text |
|---|---|---|---|---|
| DeepInfra Kokoro | 0.99 | ~1.1 | No | ToS silent, only "illegal" banned; no-train/no-store |
| DeepInfra Chatterbox | 1.00 | ~1.1 | No (23 langs) | same |
| Venice Kokoro (Private) | 3.50 | ~3.9 | No | ToS ambiguous, private tier |
| DeepInfra Orpheus | 7.00 | ~7.7 | n/s | same as DeepInfra |
| OpenAI tts-1 | 15 | ~17 | n/s | unverified / likely hostile |
| ElevenLabs Flash | 40 | ~44 | No | grey zone |
| Venice Gemini 3.1 Flash | 187.50 | ~206 | unconfirmed | Anonymized tier; over budget |

| STT option | Rate | ~$/month (300 min) |
|---|---|---|
| DeepInfra whisper-large-v3-turbo | $0.0002/min | ~0.06 |
| DeepInfra whisper-large-v3 | $0.00045/min | ~0.14 |
| Venice Whisper v3 | $0.006/min | ~1.80 |
| Browser SpeechRecognition | free | 0 (audio goes to browser vendor cloud) |

## 6. Recommendation

**TTS**: Use **DeepInfra Kokoro-82M** (~$1/month): 54 voices with both genders, enough for a narrator plus a distinct voice per Character, same vendor/privacy posture already used for the text models, and no adult-content clause in its terms beyond "illegal". Fallback or alternative: Venice Kokoro (~$4/month, "Private") if you prefer one vendor and key. Neither speaks Thai, so for Thai messages fall back to browser `speechSynthesis` with a `th-TH` voice if the device has one (verify on the actual phone). Thai-capable cloud TTS found: Google's Gemini Flash TTS (Thai listed only for Gemini 3.8 Flash TTS, 30 prebuilt voices) <https://aistudio.google.com/docs/speech-generation>, but Venice resells a different Gemini version at ~$206/month for this volume, so it is not worth it. Avoid ElevenLabs and OpenAI for explicit text. Budget impact: ~$1-4/month.

**STT**: Record with `MediaRecorder` in the PWA and send to the API for **DeepInfra whisper-large-v3-turbo** (or v3 for better Thai accuracy), ~$0.06-0.14/month. This avoids the iOS standalone-PWA SpeechRecognition problem and is not tied to a browser vendor's cloud. Caveats to test: Safari records `audio/mp4`; DeepInfra's docs list only mp3/wav, so transcode on the NestJS side (or use Venice's Whisper, which accepts M4A/MP4/WEBM, at ~$1.80/month). Whisper Thai accuracy varies by language, so test a few Thai dictations before committing. Browser `SpeechRecognition` is an optional free path on Android Chrome only.

**Open items to verify hands-on (cheap):** DeepInfra Kokoro voice parameter name and valid voice IDs; DeepInfra Whisper accepting m4a/webm; `th-TH` voices present on the user's phones.

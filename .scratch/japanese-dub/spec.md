# Spec: Japanese dub for Read aloud

Status: ready-for-agent

## Problem Statement

Read aloud (`.scratch/read-aloud/spec.md`) reads every line in Kokoro, which can't be told how to say a line. Its delivery is nearly monotone, even though the Judge tags each line's emotion. The user wants the story read like an anime: in Japanese, each Character in a voice of their own, saying each line with its feeling.

## Solution

A Story setting, **Read aloud in: English / Japanese dub**, in the Story editor's Style tab, beside the Narration voice.

- **English** reads as before, with the same audio cache.
- **Japanese dub** keeps the text on screen in English and reads it in Japanese, like a dub with subtitles:
  - The Message's queue (narration paragraphs, actions, a Character's words) is translated in **one** background call into natural spoken Japanese. Each line is in its speaker's voice and every character is an adult. The translation is kept beside the Message's audio.
  - **A Character's words** are read by **Qwen 3 TTS 1.7B** (`tts-qwen3-1-7b`), the one Venice speech model that takes a style prompt, in that Character's **Japanese voice** (default **Ono_Anna**, its native Japanese voice). The style prompt comes from the emotion the Judge tagged the line with. Teasing is "Playful and teasing, a soft warm smile in the voice…" and Passion is "Breathless and overwhelmed, trembling, intimate."
  - **Narration and actions** are read by Kokoro in a Japanese voice, the Story's **Japanese narration voice** (default **jf_alpha**). Plain, and cheap.
- Each Japanese voice can be sampled in the editor. The sample is Japanese and is made once, then kept.

## User Stories

1. As a player, I want the story read in Japanese like an anime dub, while I read the English text.
2. As a player, I want each Character's lines said with the feeling the story gives them (teasing, sad, breathless…), so that it isn't monotone.
3. As an author, I want to choose each Character's Japanese voice and the narration's, and hear a sample first.
4. As a player, I want a replay to cost nothing, and switching back to English to bring back the English audio.
5. As a player, I want to know a dub costs more before I turn it on.

## Implementation Decisions

- **Migration `JapaneseDub1764480000000`:**
  - `story.read_aloud_language`: `english` | `japanese`, default `english`;
  - `story.dub_narration_voice`;
  - `character.dub_voice`.

  All three are copied by Duplicate, and validated against the voice list: unknown is 422.003.021. A character card import leaves `dubVoice` out.
- **Gateway.**
  - `SpeechRequest` takes an optional `model` (`kokoro` or `qwen3`), `language` and `prompt`. Venice gets `language` and `prompt` only when given, with the prompt cut to 500 characters.
  - `SPEECH_MODELS.qwen3` is `tts-qwen3-1-7b`. Its fallback price is $112.50 per million characters and its fallback voices are the nine Venice listed on 2026-11-19.
  - `dubVoices()` gives Qwen 3's voices for speech and Kokoro's `j[fm]_*` voices for narration.
- **Voice list.** `GET /api/voices` adds `dubVoices`, `defaultDubVoice`, `dubNarrationVoices` and `defaultDubNarrationVoice`. A sample of a dub voice says `DUB_SAMPLE_TEXT` in Japanese; a Qwen 3 sample is kept as `samples/qwen3-<voice>.mp3`.
- **The queue.**
  - A words item now carries `speech: { characterId, emotion }`.
  - In a dub, the item's key hashes `dub-ja`, its model, voice, style, speaker and **English** text. So the queue knows what is cached before any translation, and an English item's key is unchanged.
- **Translation.**
  - `dub_translation` is a background-model call: numbered items with `[Speaker]`, answered as JSON `{"lines": [...]}`, exactly one line per item.
  - It is kept as `dub-ja-<hash>.json` in the Message's folder, where the hash covers every item's text and speaker. It goes with the folder's sweep.
  - Two items asked at once share one call. An unreadable answer is a 502, and no speech is made.
- **Delivery.** `EMOTION_DELIVERY` holds one style prompt per emotion, the six intimate ones included. Neutral and untagged lines are said naturally and warmly.
- **Web.**
  - "Read aloud in" sits on the Style tab, with the cost in its hint.
  - "Japanese narration voice" shows under it while dubbed.
  - Each Character card gets a "Japanese voice", shown while dubbed.
  - Voices are labelled by what they are, e.g. "Ono Anna — Japanese, female". `VoiceField` takes a flat `options` list for these.

## Cost

- **Qwen 3** is $112.50 per million characters, against **Kokoro** at $3.50 (Venice's list, 2026-11-19). A reply of about 600 characters is roughly $0.05–0.07 dubbed, against about $0.002 in English. Only spoken words are Qwen 3, so narration-heavy replies cost less.
- **Translation** is one cheap background call per Message.

## Real-model check (2026-11-19)

Samples of one Nara line, sent to the user, cost about $0.013:
- Kokoro af_bella;
- Kokoro jf_alpha reading Japanese;
- Qwen 3 Ono_Anna, Japanese, with a teasing prompt;
- Qwen 3 Vivian, English, with a teasing prompt.

The user chose the Qwen 3 Japanese one. **Not yet checked on a real model:** the translation call on a real reply, and each emotion's prompt.

## Testing Decisions

- API, `test/japanese-dub.spec.ts`:
  - the prompts and the reader;
  - settings, validation and Duplicate;
  - one translation per Message, words in Qwen 3 with the emotion's style, narration and actions in Japanese Kokoro;
  - kept audio and a free replay;
  - back to English with its cache;
  - an unreadable translation;
  - a Japanese sample.

  `read-aloud-queue.spec.ts`, `read-aloud.spec.ts` and `voices.spec.ts` follow the new shapes.
- e2e, `e2e/japanese-dub.spec.ts`:
  - the editor's language, narration voice and Character voice, saved, at 360 and 320px;
  - ▶ Read aloud sending the Japanese to the right voices while the page stays English.

## Out of Scope

- Japanese on screen: a Japanese reading of the text.
- Voices of the user's own.
- A male native-Japanese voice in Qwen 3. Venice lists none; a male Character can have one of Qwen 3's other voices, which speak Japanese with an accent.

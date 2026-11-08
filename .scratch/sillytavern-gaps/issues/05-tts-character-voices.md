# Text-to-speech with a voice per Character

Type: grilling
Status: resolved
Blocked by: none

## Question

Should AI Messages be read aloud, narration in one voice and each Character in their own?

## SillyTavern

TTS extension with many providers (ElevenLabs, OpenAI, Edge, Silero, XTTS, …), a voice map per character, "narrate quoted text only", auto-play.

## Storytell today (checked 2026-11-08)

- Nothing spoken. But AI Messages are already split into parts — narration vs. speech with `character_id` and `speaker_name` (`apps/api/src/model/chat/entities/message-part.entity.ts`) — so who says what is known without parsing.
- No audio provider in the Model Gateway (OpenRouter text, Venice images). Whether Venice's audio endpoint, or any other provider, allows adult text, and what it costs, is unchecked.

## Options

- **A. Browser voices** — the phone's built-in `speechSynthesis`, free; quality and choice depend on the phone.
- **B. A paid provider** — needs a research ticket first (adult-content policy, voices, price per character).
- **C. Later.**
- **D. Never.**

## Recommendation

C. Worth it only if the user actually wants to listen while playing; if so, a research ticket on providers comes before any design.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: **Read aloud** — any AI Message can be played, narration in the Story's narration voice and each Character's speech in their own **Speaking voice**, with an optional auto-read setting. Provider chosen from [the voices research](../../../docs/research/voices-and-dictation.md): Venice's `/audio/speech` with Kokoro voices (about $3.50 per million characters, roughly $4 a month if 40 Messages a day are read). DeepInfra's Kokoro is cheaper (~$1) but would add a third vendor account, key and credit pool; Venice is already wired in and its Private tier stores nothing. Kokoro has no Thai voice, so Read aloud is English only. Every playback is a user tap or the auto-read setting the user turns on, and is logged as usage.

Spec and tickets: [.scratch/read-aloud/](../../read-aloud/spec.md).

# Spec: Read aloud

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md), [Spec: Reply versions](../swipe/spec.md), [Spec: Streaming replies](../streaming/spec.md)
Decision: [Text-to-speech with a voice per Character](../sillytavern-gaps/issues/05-tts-character-voices.md)
Research: [Voices (TTS) and dictation (STT) options](../../docs/research/voices-and-dictation.md)

Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

The story can only be read. The user would sometimes rather listen: lying down with the phone on the pillow, or playing on the PC while doing something else. Nothing in the app speaks, and a Character's lines and the narration would sound the same even if the phone's own voice read the page. The AI Messages already know who says what (narration, and each Character's speech with their Character link), but nothing uses that to give each Character a voice of their own.

## Solution

Any AI Message can be **read aloud**: narration in the Story's **Narration voice** and each Character's lines in their own **Speaking voice**. The author picks the voices in the Story editor from Venice's Kokoro voices (English only), with a short preview tap for each. In a Chat, ▶ Read aloud on a Message plays it part by part with pause and stop, highlighting the part being read. It speaks the text as shown, with the Chat's Replace rules applied. A Chat can be set to read new replies aloud by itself (off by default). Audio is made by Venice through the Model Gateway, logged as usage in the Venice pool under its own kind, and kept on disk per Message so a second play costs nothing.

## User Stories

1. As an author, I want to choose a Narration voice for my Story, so that the narration sounds the way I imagine the storyteller.
2. As an author, I want to choose a Speaking voice for each Character, so that I can tell who is talking without looking.
3. As an author, I want the voice list to name each voice with its accent and whether it sounds female or male, so that I can pick quickly.
4. As an author, I want to hear a short sample of a voice before choosing it, so that I don't have to start a Chat to find out how it sounds.
5. As an author, I want a sample to be a tap I make, never something that plays on its own, so that I know when credit is spent.
6. As an author, I want a voice I have already sampled to play again for free, so that comparing voices costs almost nothing.
7. As an author, I want a Character without a Speaking voice to be read in the Narration voice, so that Read aloud works before I have set every voice.
8. As an author, I want a Story without a Narration voice to use a sensible default voice, so that Read aloud works on any Story.
9. As an author, I want voices to save like every other field in the editor, so that I never press Save.
10. As an author, I want Duplicate Story to keep the Narration voice and every Speaking voice, so that a copy sounds like the original.
11. As an author, I want the Speaking voice kept apart from the Character's Voice field, so that how they talk on the page and how they sound stay two separate things.
12. As a player, I want ▶ Read aloud on any AI Message, the Opening included, so that I can listen to any part of the story.
13. As a player, I want the narration read in the Narration voice and each line in its speaker's Speaking voice, so that the scene sounds like a cast.
14. As a player, I want a Character's `*actions*` inside their line read in the Narration voice, so that "smiles" is not spoken as if the Character said it.
15. As a player, I want a line from a speaker with no Character link to be read in the Narration voice, so that nothing is skipped.
16. As a player, I want the part being read highlighted, so that I can follow along.
17. As a player, I want to pause and carry on from the same place, so that an interruption doesn't lose my place.
18. As a player, I want to stop, so that the reading ends at once.
19. As a player, I want starting another Message to stop the one playing, so that two voices never talk over each other.
20. As a player, I want leaving the Chat to stop the reading, so that it never follows me around the app.
21. As a player, I want the first words to start quickly, so that the next part is made while the current one plays rather than all at once up front.
22. As a player, I want a Message I have already heard to play again without spending credit, so that re-listening is free.
23. As a player, I want a Chat setting to read new replies aloud by themselves, so that I can play by listening.
24. As a player, I want that setting off by default, so that nothing spends credit until I ask.
25. As a player, I want auto-read to play only replies written in front of me (after a send, Continue, Retry, Again or an edit), never old Messages when I open a Chat, so that opening a Chat is quiet.
26. As a player, I want auto-read to wait until the reply has finished streaming, so that it reads the whole reply in order.
27. As a player on an iPhone, I want auto-read to work after I tap Send, so that the phone's autoplay rules don't silence it.
28. As a player, I want a reply I regenerate to be read as the new reply, so that I never hear the old words.
29. As a player, I want a reply I edit to be read as edited, so that the audio matches the page.
30. As a player switching Reply versions, I want each version read with its own words, and a version I already heard to play again for free, so that comparing takes by ear is cheap.
31. As a player, I want Messages that an edit or a Reset takes away to take their audio with them, so that the disk doesn't fill with sound nobody can play.
32. As a player, I want a failed reading to say why and let me try again from where it stopped, so that a hiccup doesn't make me start over.
33. As a player out of Venice credit, I want audio I already have to keep playing and a clear message for anything new, so that I know why it stopped.
34. As a player, I want a long passage read in full, so that the provider's per-request limit never cuts a part short.
35. As the owner, I want every reading and every sample logged as usage, so that the Usage page shows what voices cost.
36. As the owner, I want voices counted with Venice's credit, shown as their own lines ("Read aloud", "Voice samples") on the Usage page, so that one Venice balance covers images and voices and I can still see each.
37. As the owner, I want the voice list read from Venice, with a stored list when Venice can't be asked, so that the editor works offline from Venice and new voices appear by themselves.
38. As the owner, I want audio kept out of the daily backups, so that backups don't grow by hundreds of megabytes a month with sound that can be made again for cents.
39. As a player, I want Read aloud and its controls usable by keyboard and screen reader, so that the PC works as well as the phone.
40. As a player, I want the e2e suite and the API tests to cover reading aloud without ever calling Venice, so that tests never spend credit.
41. As a player, I want Read aloud to speak the text as the thread shows it, with my Replace rules applied, so that a word I replaced is never heard.
42. As a player, I want a Branch to keep the audio of the Messages it copies, and the Chat's "Read replies aloud" setting, so that branching never spends credit on words I already heard.

## Implementation Decisions

### Provider and the Model Gateway

- **Provider:** Venice `POST /audio/speech` with the Kokoro model (Venice's id `tts-kokoro` per its docs on 2026-11-08; check it against `GET /models?type=tts` when implementing). Private tier: Venice stores nothing. Request: `model`, `input`, `voice`, `response_format: "mp3"`, `speed: 1`, no streaming. The answer is the audio bytes.
- **English only:** Kokoro has no Thai voice, and Messages are English, so Read aloud offers English voices only: Kokoro voice ids whose first letter is `a` (American) or `b` (British). The second letter gives the gender (`f`/`m`). The label is built from the id, e.g. `af_sky` → "Sky — American, female".
- **Gateway interface** gains two methods. Callers still never name a model:
  - `synthesizeSpeech(request)` with `{ kind: 'read_aloud' | 'voice_preview', text, voice, servedFor? }`. It answers `{ audio: { bytes, mimeType: 'audio/mpeg' }, model, characters, costUsd }`. Text over the request limit is a programming error (`RangeError`), never sent: the play queue splits text first (below).
  - `speechVoices()` answers the English voices `{ id, label, accent: 'american' | 'british', gender: 'female' | 'male' }[]`.
- **New call kinds:** `read_aloud` and `voice_preview` join `AudioCallKind`, the one call-kind type of Venice audio, shared with [Dictation](../dictation/spec.md): `AudioCallKind = 'dictation' | 'read_aloud' | 'voice_preview'`, part of `CallKind`. Whichever of the two features lands first creates the type with its own kinds; the second adds its kinds to it.
- **Venice client:** one audio section serves Dictation (transcription) and Read aloud (speech and the voice list). Read aloud adds `speak` and `voices` to it. Whichever of the two features lands second reuses the first's section rather than adding a second one.
  - Same auth as images, and errors map exactly as image calls do today: 402 is `OutOfCreditError('image')`, 422 is `ModelRefusalError`, anything else is `ProviderOutageError`.
  - Only 429 and 503 are retried, through the same retry helper as images. Venice answers those before any work runs, so a retry never bills twice.
  - Voices and the per-character price come from `GET /models?type=tts`: the Kokoro entry's `voices` array and `pricing.input` (USD per million characters). They are read once per process, like the image prompt limits, and read again after a failure.
  - When that call fails, the model table's stored fallback is used: the English Kokoro voice ids (upstream VOICES.md: 20 American, 8 British; check them against Venice's list when implementing) and $3.50 per million characters.
- **Model table:** a speech entry for Kokoro (id, fallback price, fallback voices, request limit 4,096 characters). `DEFAULT_NARRATION_VOICE` is `af_sky`.
- **Usage:**
  - One UsageRecord per answered call: kind `read_aloud` or `voice_preview`, pool `image`, host `venice`, model `kokoro`, `images` null, and a new nullable `characters` column (integer) with the characters sent.
  - The cost is characters × price ÷ 1,000,000, rounded to whole millionths of a dollar, like image list prices.
  - A refused or failed call writes no record.
- **Credit pool:** voices join the Venice pool. The pool id stays `image`: renaming it would touch stored rows, the API and the web for no behaviour change.
  - Its label everywhere is "Images and audio (Venice)": the Usage page heading, and Settings' pool and warning fields ("Images and audio pool (USD)", "Images and audio warning (%)"). Whichever of Dictation and Read aloud lands first makes the change; the second finds it done.
  - The Usage page lists the new kinds as "Read aloud" and "Voice samples", under that pool beside Dictation and Expression pictures.
  - `OutOfCreditError` (image) now also blocks new audio. Play and cached audio are unaffected. `docs/error-codes.md` says so.
- **Fake gateway:**
  - `scriptSpeech(kind, ...replies)`: a reply is a partial result, an error, or `{ delayMs }`.
  - The default audio is `FAKE_MP3`, a few silent MPEG frames that a browser can play to the end.
  - `speechVoices()` answers a fixed short list of four voices (two American, two British; female and male) unless scripted. A speech call with nothing scripted fails loudly, as text and image calls do.
  - The testing control controller gains `POST testing/fake-gateway/speech`, and `GET calls` summarises speech requests (kind, voice, text) without bytes.

### Voices on the Story and its Characters

- **Schema:**
  - `story.narration_voice` (text, nullable; null means `DEFAULT_NARRATION_VOICE`).
  - `character.speaking_voice` (text, nullable; null means "read in the Narration voice").
  - One migration adds both.
- **API:**
  - `PATCH /api/stories/:storyId` accepts `narrationVoice: string | null`.
  - The Character update accepts `speakingVoice: string | null`.
  - A voice id not in `speechVoices()` is refused with `UnknownVoiceError` (422, Story authoring domain; the next free code there at implementation time).
  - The Story response gains `narrationVoice: string | null`, and each Character `speakingVoice: string | null`.
- `GET /api/voices` answers `{ voices: SpeechVoice[], defaultNarrationVoice }`. It makes no paid call.
- **Voice sample:**
  - `POST /api/voices/:voiceId/preview` answers `audio/mpeg`.
  - The sample text is fixed: "The lamp went out an hour ago, and the sea kept talking."
  - Each voice's sample is made once (kind `voice_preview`, no Story) and kept in the speech folder's `samples/`. Every later sample of that voice is served from disk with no call. Samples are never swept.
  - An unknown voice id is `UnknownVoiceError`.
- **Duplicate Story** copies `narrationVoice` and every `speakingVoice`.
- The Story assistant and AI drafting do not set voices. A draft leaves them null.
- **Story editor:**
  - The Style tab gets "Narration voice": a select of the voices, grouped by accent and gender, with "Default (Sky)" for null, and a ▶ Sample button.
  - Each Character card gets "Speaking voice" under the Voice field: the same select with "Same as narration" for null, and ▶ Sample.
  - A select change autosaves like any field.
  - The sample button plays the cached sample or makes it. It shows "Playing…" while it plays, and an error inline if it fails.
  - A hint under the first sample button says a sample costs a fraction of a cent once per voice.

### The play queue

- **Shown text:** Read aloud speaks what the thread shows. Before the queue is built, the Chat's `onAi` Replace rules (app-wide, then the Story's, parked ones left out) are applied to each AI part's text, with the API's copy of the apply function that [Saved replies and Replace rules](../saved-replies-and-replace-rules/spec.md) adds for the Transcript. As in the thread, a narration part is replaced before it is split into paragraphs, and a speech part before its `*…*` spans are found. Names are never spoken, so they need no rules.
- **Pure function:** a Message's play queue is built by `readAloudQueue(parts, voices)` from the parts as shown, where `voices` is `{ narration, byCharacterId }`. It answers items `{ index, partIndex, paragraph, voice, text }`, in order. `paragraph` is the narration paragraph's index within its part's shown text (null for a speech part's items), so the thread and the Visual novel view can find the step being read.
  - A narration part becomes one item per paragraph (split as the thread splits it), in the Narration voice.
  - A speech part is split at its `*…*` spans. Each span becomes an item in the Narration voice, without the asterisks. The text between spans becomes items in the speaker's Speaking voice: the Character's, or the Narration voice when they have none, when the part has no Character link, or when that Character is gone.
  - Items with no letter or digit (lone punctuation, an ellipsis) are dropped.
  - Any item longer than 4,000 characters (under the 4,096 limit) is split at the last sentence end before the limit, else at the last space.
- The queue is built from the shown version's parts, the Chat's Replace rules and the Story's voices **at the time of asking**. A changed voice, edited text or a changed Replace rule gives a different item text or voice, so a different cache key (below), and stale audio is never played.
- Only AI Messages have a queue. A User Message has none.

### Audio cache

- **The speech folder:**
  - A new config value `SPEECH_DIR`, optional. Its default is a folder named `speech` beside the image folder. It must not be inside the image folder (a `ConfigError` at start), so the backup job, which copies the image folder, never copies audio.
  - The API test harness gives every test app a speech folder of its own: `startTestApp` gains a `speechDir` option, by default a fresh temporary folder (`storytell-speech-…`) removed on `close()`, like the image folder. Without it, every test app's default would be the one shared `speech` folder beside their temporary image folders, in the system temp folder, and parallel tests would see each other's audio.
  - A **speech store** (a store module like the image store) reads, writes and removes files there under the same path-safety rules.
- **Layout:** `messages/<messageId>/<key>.mp3`. The key is the first 32 hex characters of the SHA-256 of `model | voice | speed | text`, where `text` is the item's shown text. A Replace rule added, changed, parked or deleted changes the shown text, so the key, with no extra bookkeeping: the new text is made on the next reading, and the old file is pruned then.
- **Endpoints:**
  - `GET /api/stories/:storyId/chats/:chatId/messages/:messageId/speech` answers the queue: `{ items: [{ index, partIndex, paragraph, voice, characters, cached }] }`. It makes no call. A User Message answers 404 `NotReadableError` (Chats domain; the next free code there at implementation time).
  - `POST .../messages/:messageId/speech/:index` answers the item's audio as `audio/mpeg`, with `Cache-Control: no-store`.
    - From disk when it is there, with no call.
    - Otherwise the gateway makes it (kind `read_aloud`, servedFor the Story and Chat), and it is written to disk before it is answered.
    - When the Venice pool is known to be used up and the item is not on disk, it answers `OutOfCreditError` (image) without a call.
    - An index outside the queue is 404 `SpeechItemNotFoundError` (Chats domain; the next free code).
  - Neither takes the turn lock. They read the Message as stored at that moment, and the Chat's Replace rules as they are then.
- **Pruning within a Message:** after an item is written, files in that Message's folder whose key is in no queue of the shown version or of any of its Reply versions (with today's rules and voices) are deleted. Regenerate, an AI Message edit, a voice change or a Replace rule change leaves the old audio until the next reading of that Message, and never longer. Reply versions keep their audio, so comparing takes by ear stays free.
- **Messages that are gone:** `sweepSpeech()` deletes every Message folder whose Message id no longer exists. It runs:
  - after a Message edit that discards later Messages;
  - after Reset Chat, Delete Chat and Delete Story;
  - once at API start (to catch a crash between a delete and its sweep).
  A folder that can't be deleted is logged, never an error to the user.
- **Branch** (per [integration](../sillytavern-gaps/integration.md), extending [Branch's copy ticket](../branch/issues/02-branch-a-chat.md)): after the Branch's transaction commits, each copied Message's folder is copied to its new Message id's folder, so a Branch replays its audio with no call and no credit. Pruning on the Branch's next reading drops any file its Reply versions don't use. A folder that can't be copied is logged, and the Branch still succeeds: the next reading makes that audio again. A Branch that fails copies nothing.
- **Backups:** audio is not backed up. A restore leaves no audio, and the next reading makes it again. ADR 0003's "the whole image folder" stays true. No ADR change is needed, but the spec's reason is recorded here: at the research's volume, audio is hundreds of MB a month, every daily full copy would carry all of it, and it can be made again for about $0.003 per Message.

### The player (web)

- **One player per Chat screen.** The Chat screen owns it, not the thread: it lives above whatever shows the Messages, so it works with the thread alone today and keeps playing across a switch to the [Visual novel view](../chat-looks/spec.md) when that lands, which uses the same player. Nothing in this spec waits for that view. It holds one `HTMLAudioElement`, the queue of the Message playing, the item playing, and its state: `idle | loading | playing | paused | error`.
  - It fetches item n+1 while item n plays.
  - Starting a Message stops the one before.
  - Leaving the Chat screen stops it.
  - A failed item stops it with the error, and ▶ again resumes from that item.
- **Controls:**
  - "▶ Read aloud" in the newest AI Message's action row, after the existing actions and before ไทย and ⑂ Branch where those have landed; and in the tools a tap shows under any other AI Message, right after ✎ Edit (✎ Edit · ▶ · ไทย · ⑂), per [integration](../sillytavern-gaps/integration.md).
  - At 390px, whatever doesn't fit in the row moves into its "⋯" overflow. If the overflow isn't there yet when this lands, this ticket adds it.
  - While that Message plays: "❚❚ Pause" / "▶ Resume" and "■ Stop".
  - The part being read gets a highlight (an outline in the Character colour, or the accent for narration) and `aria-current`. The thread does not scroll by itself.
  - Read aloud is not offered on the reply being streamed, nor on a reply ↺ Again is replacing. Pressing Again or editing a Message that is playing stops it.
- **Errors:** "Couldn't read this aloud: …" under the Message, routed on the error code. Out of Venice credit says "Out of Venice credit: replies you've already heard still play." The text and image credit banners are unchanged.

### Auto-read

- **Schema:** `chat.auto_read` (boolean, default false). `PATCH /api/stories/:storyId/chats/:chatId` accepts `autoRead`, and the Chat response gains `autoRead`. A Branch copies it, extending [Branch's copy ticket](../branch/issues/02-branch-a-chat.md); Reset keeps it.
- **Menu:** the Chat's ⋯ menu gets a switch row "Read replies aloud", with the sub-line "New replies play by themselves". It is the menu's last row, after the existing rows and Author's note and Who's in this Chat where those have landed (per [integration](../sillytavern-gaps/integration.md)).
- **Behaviour:** when on, the player starts on an AI Message that a turn **started in this tab** stored: a send, Retry, Continue, ↺ Again, or a User Message edit. It starts once that turn has settled (stream finished and the Chat re-read).
  - Never on page load, a Reply version change, a Reset, or a reply that came from another tab.
  - A turn the user stopped is not read.
- **Autoplay unlock:** the player's audio element is unlocked by a tap. On the first Send, Continue, Again or ▶ tap in the Chat screen, it plays a silent clip inside that tap, so iOS allows the later auto-read. When the browser still refuses, the Message shows "▶ Tap to play" instead of an error.

### Glossary

The terms are `CONTEXT.md`'s: Read aloud, Speaking voice, Narration voice. "Auto-read" is a setting name used in the UI, not a domain term.

## Testing Decisions

- Test external behaviour only: what the gateway is asked and records, what the API answers and stores on disk, and what the Chat screen and editor show and play. Never assert private helpers beyond the pure queue builder.
- **Venice contract tests** (prior art: the Venice contract spec with recorded fixtures under the API test fixtures, synthetic only):
  - the speech request body (model, input, voice, mp3, speed);
  - the bytes returned;
  - the usage record (kind, pool `image`, characters, list price from `pricing.input`);
  - the fallback price and voices when `GET /models?type=tts` fails;
  - the English-only voice filter;
  - 402 → out of image credit, 422 → refusal, 500 → outage, 429 and 503 retried, and nothing else retried.
  Fixtures: a `models?type=tts` list and a tiny MP3.
- **Pure tests on `readAloudQueue`:**
  - a narration paragraph per item;
  - `*action*` spans in the Narration voice;
  - the speaker's voice, else the Narration voice for a missing voice, a null Character link, or a removed Character;
  - punctuation-only items dropped;
  - the 4,000-character split at a sentence end, else a space;
  - each item's `paragraph` (narration) and null (speech).
- **API tests through the fake gateway** (prior art: `reply-versions.spec.ts`, `regenerate.spec.ts`, `story-duplicate.spec.ts`, `usage.spec.ts`; the harness's temporary folders, each test app with its own speech folder):
  - voices are listed; setting and clearing both voice kinds; an unknown voice is refused;
  - Duplicate copies the voices;
  - a sample is made once and then served with no call;
  - the queue of an AI Message, and none for a User Message;
  - an item is made once, then `cached: true` with no second call;
  - an out-of-range index is refused;
  - out of credit is refused before any call, while a cached item still plays;
  - a Regenerate gives a new key for the changed item, and the old file goes when the new reply is next read;
  - a Reply version's audio survives choosing another version;
  - an edit that discards Messages, Reset, Delete Chat and Delete Story remove their Messages' folders;
  - an `onAi` Replace rule changes the queued text (the fake is asked for the replaced words), and adding the rule after a reading makes the changed item uncached with a new key, the old file going on that reading;
  - a Branch replays its copied Messages' audio with no call, and copies `autoRead`;
  - `autoRead` round-trips and survives Reset;
  - the Usage summary shows `read_aloud` and `voice_preview` in the image pool.
- **e2e (Playwright, 390px, fake gateway; prior art: `reply-versions.spec.ts`, `chat-top-bar.spec.ts`, `story-editor.spec.ts`):**
  - choosing a Narration voice and a Speaking voice autosaves and survives a reload; ▶ Sample plays and calls the fake once;
  - ▶ Read aloud on a reply highlights the first part, then the next, and ends idle; Pause and Resume keep the place; Stop ends it;
  - with "Read replies aloud" on, a send plays the new reply after it settles, and opening the Chat again plays nothing;
  - the Usage page lists "Read aloud" and "Voice samples" under "Images and audio (Venice)";
  - at 390px the action row and a tapped Message's tools don't overflow.
  Chromium is launched with an autoplay policy that needs no gesture, so the test checks the player's states, not real sound. The iOS unlock is checked by eye on the phone.

## Out of Scope

- Thai voices, or reading the user's own Messages and Thai readings.
- Other TTS models or providers (DeepInfra, ElevenLabs, OpenAI, browser `speechSynthesis`), voice cloning, and per-Story speed or pitch.
- Reading speed settings, a lock-screen or Media Session player, and playback while the app is in the background.
- Streaming audio sentence by sentence while a reply is still being written.
- A size cap or age-based pruning of the speech folder.
- Carrying voices in Character card export or reading them from a card on import.
- Voices chosen by the Story assistant or AI drafting.

## Further Notes

- Cost at the research's volume (40 Messages a day, about 900 characters each) is about $4 a month. One Message is about $0.003, and one sample about $0.0002 once per voice.
- Venice's Terms neither clearly allow nor forbid adult text (see the research). The Kokoro model is on the Private tier, so nothing is stored. A refusal shows as a refusal with Retry, like images.
- [Dictation](../dictation/spec.md) shares the Venice client's one audio section, the `AudioCallKind` type and the pool label (see "Provider and the Model Gateway"). Whichever lands second reuses what the first added. Both write usage with pool `image`. The `characters` column here is for TTS input. Dictation is billed per audio second and needs its own measure.
- **Blocking edges across features:** per [integration](../sillytavern-gaps/integration.md), Branch lands first. [03 — Read a Message aloud](issues/03-read-a-message-aloud.md) and [04 — Read new replies aloud](issues/04-auto-read-new-replies.md) are blocked by [Branch's copy ticket](../branch/issues/02-branch-a-chat.md) and each extends that copy (audio files; the auto-read switch). 03 is also blocked by [Replace rules on AI Messages](../saved-replies-and-replace-rules/issues/04-replace-rules-on-ai-messages.md), which brings the API's apply function and the Chat's rules.
- Open question: should a Character without a Speaking voice get an automatic distinct voice rather than the Narration voice? Recommended: no. Gender and accent can't be guessed from the card, and a wrong guess is worse than one clear default. The editor makes picking a voice two taps.
- Open question: should audio be cached in the browser too (Cache Storage), so replays work offline? Recommended: no for now. Replays from the API's disk are free and fast over Tailscale.

# How the SillyTavern-gap features fit together

The thirteen specs that came out of [the map](map.md) were written in parallel. This page settles everything two or more of them touch, so they agree. Where a spec and this page disagree, this page wins. Every spec links here.

## Build order rule for per-Chat and per-Message data

[Branch](../branch/spec.md) owns the one copy of a Chat. **Branch lands before any other feature that adds per-Chat or per-Message data**, and each such feature extends Branch's copy in its own ticket (blocked by Branch's copy ticket), with a test that a Branch carries it. Duplicate already exists, so each per-Story feature extends Duplicate in its own ticket.

| Data | Owner spec | Branch | Reset | Edit / Regenerate | Duplicate |
|---|---|---|---|---|---|
| Author's note | authors-note | copied | kept | untouched | — (per Chat) |
| Sitting out | speaker-controls | copied | kept | untouched | — |
| Auto-read switch | read-aloud | copied | kept | untouched | — |
| Thai readings | write-for-me | copied with the Messages (ids remapped) | gone with the Messages | stop showing when the text changes | — |
| Documents used by a Message | documents | copied with the Message | gone | rewritten by the new turn | — |
| Emotion on a message part | expressions | copied with the parts | gone | rewritten by the Judge | — |
| Read-aloud audio | read-aloud | audio files copied to the new Message ids (no credit spent) | swept | stale audio swept on next read | — |
| Documents, Saved replies and Replace rules of a Story, Narration voice, Speaking voices, Expressions, Backdrop choice, Lore trigger fields | their specs | — | — | — | copied |

## The trailing system message of a turn

One order, in every spec and test: **Lore → Documents → Author's note → Where things stand (it names who is Sitting out) → Nudge → the final instruction.** Suggested replies and Write for me use **Lore → Documents → Author's note → their own instruction**. Every block that can appear is reserved in the turn budget, in the Story so far trigger, and in the history budget of Suggested replies and Write for me.

## Write for me's inputs

Write for me is a play-model call: it uses Sampling (models-and-samplers), Lore through the one Lore selection used by turns (lore-triggers), Documents, and the Author's note (authors-note ticket 03 owns adding it, blocked by write-for-me ticket 02). Whichever of these lands after Write for me adds itself to Write for me, with a test.

## Replace rules and what each reader sees

- Shown in the thread, the Visual novel view (rules applied before the text is split into steps), the Transcript, and Read aloud (it speaks the shown text): **rules applied**.
- Prompts, the Edit form, Thai reading (it translates the stored text, so editing a rule never drops a reading), Lore triggers, Memory, the Judge: **stored text**.
- A rule "on my Messages" must give the same result when run twice; the save check refuses one that doesn't (so a Branch draft or an edited Message re-sent is never changed twice).

## The composer, top to bottom

1. **Panel** — one at a time: ⚡ Suggested reply cards, the Saved replies tray, or a status/error.
2. **Character row** — the Portraits for Nudge (speaker-controls), only with two or more Characters.
3. **Tool row** — ⚡ · ✍️ Write for me · Saved replies · ✱ Write an action (as today), Undo at the right end. Replace rules have no composer button; they are managed in Settings and the Story editor.
4. **Box row** — the box · 🎤 Dictation · Send / Continue / Stop; while recording it becomes the recording bar.

Write-for-me ticket 01 builds the bands; the Character row, the tray and the mic are blocked by it. While a recording or a transcription runs, ⚡ and ✍️ are disabled.

## Message actions and the Chat menu

- The newest AI Message's action row, after the existing actions: **▶ Read aloud · ไทย · ⑂ Branch**. A tapped Message's tools: **✎ Edit · ▶ · ไทย · ⑂**. At 390 px wide whatever doesn't fit moves into a "⋯" overflow; an e2e checks nothing overflows.
- The Chat menu: a "Branched from …" line at the top when the Chat is a Branch; then the existing rows; then **Author's note · Who's in this Chat · Read replies aloud**.

## Story editor, Settings and Usage

- No eighth editor tab. Documents live in the Lore tab. The Story's own Saved replies and Replace rules are two folding cards in the Style tab, where the Narration voice and the Backdrop choice also sit. Speaking voice and Expressions are on the Character card.
- Theme (dark / light / match phone) is per device, in Settings. App-wide Saved replies and Replace rules are cards in Settings.
- The Venice credit pool keeps its id `image`; its label everywhere is **"Images and audio (Venice)"**. Usage shows the kinds Dictation, Read aloud, Voice samples and Expression pictures under it.

## Venice audio in the Model Gateway

One audio section of the Venice client serves Dictation (transcription) and Read aloud (speech, voice list), with one call-kind type for both (`dictation`, `read_aloud`, `voice_preview`). Errors map exactly as image calls do today: 402 → out of credit, 422 → the model refused, anything else → outage; only 429 and 503 are retried, so a retry never bills twice. Whichever of the two features lands second reuses the first's section.

## Error codes

Each new error takes the next free code in its domain at implementation time, never a number written in a spec.

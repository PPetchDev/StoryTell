# Map: SillyTavern gaps

Type: wayfinder:map

## Destination

Every feature SillyTavern has and Storytell AI lacks (or has only in part) carries a decision — do now, later, or never — with its reason, checked against the code; and each "do now" feature has a spec plus agent-ready tickets under its own `.scratch/<feature>/`, ready for `/implement`. No code is written on this map.

## Notes

- Source of the gap list: docs.sillytavern.app compared against Storytell AI on 2026-11-08 (master at `269f847`).
- Keep the strengths Storytell already has over SillyTavern and never regress them: Scenes with move-on conditions advanced by the Judge, Bonds and Arcs, Memory with Known by plus the Memory graph and Story so far, AI Story drafting and the Story assistant, Snapshots kept consistent by Reference images, usage and credit tracking, backups.
- Earlier decisions this map reopens on purpose (from [the MVP map](../storytell-mvp/map.md) Out of scope): "Thai or any non-English language", "Branch on messages", "User-directed speaker choice", "Tavern cards" (in [Export of Stories and Chats](../storytell-mvp/issues/16-export-of-stories-and-chats.md)). Reopening is the user's call, ticket by ticket.
- Never spend API credit (OpenRouter, Venice) without asking the user first. Research tickets read docs only.
- Grilling tickets: call the Skill tool for `grilling` and `domain-modeling`; resolved terms go into `CONTEXT.md` as they settle.
- Vocabulary is `CONTEXT.md`'s: Story, Chat, Message, Lore entry, Character, Narrator, Role, Persona, Suggested reply, Reply version, Story so far…

## Where the way leads

Every decision below has its spec and tickets (65 in all); [integration](integration.md) settles what several features share — the per-Chat copy matrix, the prompt order, the composer, the action row, labels and Venice audio. Build [Branch](../branch/spec.md) first: later per-Chat features extend its copy.

| Feature | Spec | Tickets | Needs the user |
|---|---|---|---|
| Branch | [branch](../branch/spec.md) | 4 | — |
| Author's note | [authors-note](../authors-note/spec.md) | 3 | — |
| Nudge and Sitting out | [speaker-controls](../speaker-controls/spec.md) | 3 | — |
| Character cards | [character-cards](../character-cards/spec.md) | 6 | — |
| Lore triggers | [lore-triggers](../lore-triggers/spec.md) | 8 | — |
| Play models and Sampling | [models-and-samplers](../models-and-samplers/spec.md) | 8 | ticket 05: a paid smoke test of candidate models |
| Documents | [documents](../documents/spec.md) | 9 | ticket 09: judging Thai/English retrieval |
| Write for me and Thai reading | [write-for-me](../write-for-me/spec.md) | 3 | — |
| Saved replies and Replace rules | [saved-replies-and-replace-rules](../saved-replies-and-replace-rules/spec.md) | 5 | — |
| Dictation | [dictation](../dictation/spec.md) | 3 | ticket 03: a paid check on the phones |
| Read aloud | [read-aloud](../read-aloud/spec.md) | 4 | — |
| Expressions | [expressions](../expressions/spec.md) | 3 | — |
| Backdrop, light theme, Visual novel view | [chat-looks](../chat-looks/spec.md) | 6 | — |

## Decisions so far

<!-- one line per resolved ticket: title link — gist -->

The user's answer (2026-11-08): every gap is a "do"; the form each takes was left to the planner.

- [Branch a Chat from any Message](issues/01-branch-a-chat.md) — Branch copies a Chat and its state up to a Message into a new Chat linked to its parent; no named checkpoints.
- [Import and export Character cards](issues/02-character-card-import.md) — import V1/V2/V3 PNG/JSON into a new Story by fixed mapping; export one Character as a V2+V3 PNG; no CHARX.
- [Author's note for a Chat](issues/03-authors-note.md) — one plain note per Chat, every turn, in the trailing system message; no knobs.
- [Choosing play models and sampler settings](issues/04-models-and-samplers.md) — per-model sampler values for play-model calls, plus research-vetted extra play models; never free-form.
- [Text-to-speech with a voice per Character](issues/05-tts-character-voices.md) — Read aloud with a narration voice per Story and a Speaking voice per Character, Venice Kokoro, English only.
- [Speaking instead of typing](issues/06-speech-to-text.md) — Dictation records in the browser and transcribes with Venice Whisper (browser recognition is unreliable in iOS PWAs), Thai or English.
- [Writing in Thai while the story plays in English](issues/07-translation.md) — Write for me for drafts, Thai reading for Messages; both on tap.
- [Attaching files and web pages](issues/08-data-bank-rag.md) — Documents per Story, embedded passages retrieved each turn under a cap; no pgvector.
- [Scripts, Quick Replies and Regex](issues/09-scripts-quick-replies-regex.md) — Saved replies and Replace rules; STscript out.
- [Expression sprites by emotion](issues/10-expression-sprites.md) — Expressions drawn or uploaded per Character, emotion tagged by the Judge's existing call.
- [Lore entries: World Info features](issues/11-lore-upgrades.md) — secondary keywords, regex, Sticky/Cooldown/Delay, Probability, Recursion, Groups; no insertion position.
- [Write the user's reply for them](issues/12-impersonate.md) — Write for me: draft or nothing → one full English reply as the worn identity.
- [Choosing who speaks in a group](issues/13-group-speaker-controls.md) — Nudge and Sitting out; no activation strategies or auto-mode.
- [Theme and Visual Novel mode](issues/14-theme-and-visual-novel.md) — Backdrop, light theme, Visual novel view; no custom CSS.

## Not yet specified

## Out of scope

- STscript or any user scripting language — Saved replies and Replace rules cover its everyday uses; the app's own code is where behaviour changes ([ticket](issues/09-scripts-quick-replies-regex.md)).
- Lore insertion position, case/whole-word toggles — Lore stays in the trailing system message for caching ([ticket](issues/11-lore-upgrades.md)).
- Group activation strategies and auto-mode ([ticket](issues/13-group-speaker-controls.md)); custom CSS ([ticket](issues/14-theme-and-visual-novel.md)); CHARX card files ([ticket](issues/02-character-card-import.md)); named checkpoints and a branch tree ([ticket](issues/01-branch-a-chat.md)); free-form model ids ([ticket](issues/04-models-and-samplers.md)).


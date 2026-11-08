# 06 — Storytell's own cards carry the voices and the Backdrop choice

**Status:** ready-for-agent

**What to build:** Once Stories have a Narration voice, Characters a Speaking voice ([Read aloud](../../read-aloud/spec.md)) and Stories a Backdrop choice ([Chat looks](../../chat-looks/spec.md)), a card Storytell exports carries them in its own `extensions.storytell` block and brings them back on import, so a round trip keeps them (spec: user story 36, "Exporting a card", "The mapping"). Export writes `style.narrationVoice`, `style.backdrop` and `character.speakingVoice`, each only when it isn't the default (a null voice, Backdrop `none`); the block stays `version: 1`. Import from a Storytell block sets them; a voice id the voice list doesn't know, or a Backdrop value outside the set, is left at its default and listed in "Won't come along"; an absent key means the default. Other apps ignore the block. Documents, Expressions, Saved replies and Replace rules still never travel in a card.

**Blocked by:** [04 — Export a Character as a card PNG](04-export-a-character-as-a-card.md), [Read aloud 02 — Narration voice and Speaking voices in the Story editor](../../read-aloud/issues/02-voices-in-the-story-editor.md), [Chat looks 03 — A Backdrop behind a Chat's Messages](../../chat-looks/issues/03-backdrop.md)

- [ ] Pure tests: the writer puts the three keys in the block only when set; the mapping reads them back; an unknown voice id and an unknown Backdrop value fall back to the default and are listed; a block without the keys gives the defaults.
- [ ] Export then import keeps the Narration voice, the Speaking voice and the Backdrop choice (pure round trip and one API test).
- [ ] API test: an exported card's definitions contain no Documents, Expressions, Saved replies or Replace rules of its Story.

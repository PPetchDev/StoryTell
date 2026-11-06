# Spec: Lore

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md), [Spec: Story so far](../story-so-far/spec.md)
Research: [How Zeta runs a Story](../../docs/research/zeta-how-a-story-runs.md) ("Copy" 5), [Long-chat memory](../../docs/research/long-chat-memory-techniques.md) (Technique 3)

## Problem Statement

The author's world lives in one Setting field that is sent whole on every turn. A richer world (peoples, places, customs, objects) means a longer Setting, which costs tokens on every turn and buries the detail that matters now under detail that doesn't. So the author keeps the Setting short, and the AI forgets or invents the small facts of the world: what the tribe's tents look like, what a festival is for, who rules the next valley.

## Solution

A Story has **Lore**: short entries about its world, each with a name, keywords and text. An entry goes into the turn prompt only when its name or one of its keywords appears in the latest exchange, or always when the author switches on "Always include". The Setting stays the short always-on core. The author writes Lore in a new Lore tab of the Story editor; the Story assistant can add, change and remove entries, and a new draft may come with a few. Snapshots use the same entries, so a place looks the same each time it is drawn. While playing, the Memory drawer shows which entries are in play.

## User Stories

1. As an author, I want to add a Lore entry with a name, keywords and text, so that the world's details have a home outside the Setting.
2. As an author, I want an entry's name to count as a keyword, so that a simple entry needs no keywords at all.
3. As an author, I want to give an entry extra keywords (other names, plurals, Thai words), so that it is found however the story mentions it.
4. As an author, I want keywords to match regardless of upper and lower case, so that "crescent tribe" finds "Crescent Tribe".
5. As an author, I want an English keyword to match only at the start of a word, so that "elf" does not fire on "herself".
6. As an author writing Thai keywords, I want them to match anywhere in the text, since Thai has no spaces between words.
7. As an author, I want to switch on "Always include" for an entry that matters on every turn, so that it never depends on a keyword.
8. As an author, I want to edit and remove entries with autosave, like every other part of the editor.
9. As an author, I want Lore to never block playing, so that a Story with no Lore plays as before.
10. As an author, I want Duplicate Story to copy the Lore, so that a copy is complete.
11. As an author, I want to ask the Story assistant to turn parts of my Setting into Lore entries, or to add, change or remove entries, so that I don't have to type them all.
12. As an author, I want a new AI draft to come with a few Lore entries when the idea implies them, so that a new world starts with its details.
13. As a player, I want the AI to know the details of the place, people or thing being talked about now, so that the story stays true to the world.
14. As a player, I want Lore to be common knowledge in the world, so that every Character knows it as a local would; secrets stay on Character cards.
15. As a player, I want the turn to stay fast and cost nothing extra, so that Lore needs no extra model call.
16. As a player, I want Suggested replies to know the same Lore as the turn, so that suggestions fit the world.
17. As a player, I want Snapshots to use the Lore of the moment, so that a place looks the same each time it is drawn.
18. As a player, I want to see in the Memory drawer which Lore entries are in play, so that I can tell a keyword works.
19. As a player, I want a long or crowded moment never to swell the prompt without bound, so that Lore has a cap.

## Implementation Decisions

- **Ownership:** Lore belongs to the Story, shared by all its Chats, like the Setting. It is not per Chat and is not touched by a Chat's rewind or Reset.
- **A Lore entry:** `name` (text), `keywords` (list of text, at most 20, each at most 100 characters, trimmed, blanks dropped), `text` (text), `alwaysOn` (boolean, default false), `position` (add order). No reorder UI: the order only breaks ties.
- **Matching:**
  - Each entry's triggers are its name plus its keywords, trimmed, blanks dropped. Matching ignores case.
  - A trigger whose first character is a Latin letter or a digit matches only where no Latin letter or digit comes right before it (the start of a word). Its end is free, so "Crescent" matches "Crescents". Any other trigger, including Thai, matches anywhere.
  - The scan window is the user's new message (none on a Continue) plus the 4 newest Messages before it, AI Messages as their `@Name:` text.
- **Selection:**
  - Entries with blank text are never sent.
  - Always-on entries come first, in position order. Triggered entries follow, ordered by how recently they were mentioned: the user's new message first, then newest Message to oldest, with position breaking ties.
  - The Lore cap is about 1,500 tokens. Entries are taken in that order while they fit, and one that doesn't fit is skipped while the rest are still tried.
- **Prompt placement:**
  - The selected entries go in the trailing system message, before "Where things stand".
  - The system message, and with it the cached prefix, does not change from turn to turn.
  - The block reads as common knowledge of the world: every Character knows it as anyone living there would.
  - With no entries selected, there is no block.
- **Budget:** The Lore block counts towards the turn budget, like the reminder. The Story so far trigger reserves the smaller of the cap and the Story's whole sendable Lore, so a turn heavy with Lore never pushes Messages out without warning.
- **Suggested replies:** The same selection, without a new user message, goes before the suggestions instruction.
- **Snapshots:**
  - The same matching runs over the Snapshot's Messages window and the hint.
  - The selected entries go to the Snapshot writer as a "Lore" section after the Setting, under the same cap.
  - Always-on entries are included.
- **Lore in play:**
  - `GET /api/stories/:storyId/chats/:chatId/lore` answers `{ entries: [{ id, name, alwaysOn }] }`. These are the entries a turn would select from the 4 newest Messages with no new user message, the same as a Continue.
  - The Memory drawer shows them read-only.
- **Authoring API:**
  - `POST /api/stories/:storyId/lore` with `{ name?, keywords?, text?, alwaysOn? }`.
  - `PATCH /api/stories/:storyId/lore/:loreId` with any of the same fields.
  - `DELETE /api/stories/:storyId/lore/:loreId`.
  - Each answers the whole Story, as every editor write does. The Story response gains `lore: LoreEntry[]` in position order.
  - New error `404.003.013 LoreEntryNotFoundError`.
- **Duplicate Story** copies every entry.
- **Story assistant:**
  - The change set gains target `lore`:
    - `set`, by name: fields `name`, `text` and `keywords` (the whole list), and `alwaysOn` (true or false);
    - `add`, with `{ name, keywords, text, alwaysOn }`;
    - `remove`, by name.
  - Removing an entry needs no confirmation, like a StartingBond.
  - The rendered Story the assistant reads lists the Lore.
- **Drafting:** A draft may carry up to 8 `lore` entries `{ name, keywords, text }`, written only when the idea implies a world with its own places, peoples, customs or objects.
- **Glossary:** `CONTEXT.md` gains "Lore" and "Lore entry".

## Testing Decisions

- Test only external behaviour: the prompt the gateway receives, the API's answers, and what the editor and Memory drawer show.
- **Pure tests on the selection:**
  - case-insensitivity;
  - the word-start rule for Latin triggers, against substring matching for Thai;
  - the name counting as a trigger;
  - always-on entries going first;
  - the most-recent-mention order;
  - the cap skipping an entry that doesn't fit;
  - blank text never being sent;
  - the 4-Message window.
- **API tests** through the fake gateway (prior art: `test/story-so-far.spec.ts`, `test/scenes.spec.ts`-style authoring tests):
  - CRUD answers the Story;
  - a turn's trailing system message holds a triggered entry's text, and an untriggered one's is absent;
  - the system message is the same with and without Lore;
  - Suggested replies carry the block;
  - the Snapshot writer gets the Lore section;
  - Lore in play;
  - Duplicate copies Lore;
  - the assistant adds, sets and removes entries;
  - a draft with Lore creates its entries.
- **e2e (Playwright, 390px):**
  - add an entry in the Lore tab, and it autosaves and survives a reload;
  - after a turn that mentions it, the Memory drawer lists it in play.

## Out of Scope

- The AI proposing new Lore during play (risk of overlap with Memory; maybe later).
- Per-entry Known-by; secrets stay in Character Secrets.
- Reordering entries, and per-field ✨ Rewrite on Lore.
- Selecting Lore by an extra model call or by vector search.
- Lore for the Story so far writer.

## Further Notes

The decision round on 2026-11-06 took every recommendation: Lore per Story; keywords plus Always include; the editor and the assistant write it, drafts may carry some; common knowledge; a cap of about 1,500 tokens; Snapshots use it; Lore in play shown in the Memory drawer.

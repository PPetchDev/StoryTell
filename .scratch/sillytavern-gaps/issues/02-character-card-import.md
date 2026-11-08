# Import and export Character cards (V2 / V3)

Type: grilling
Status: resolved
Blocked by: none

## Question

Should Storytell read community Character cards (PNG or JSON, Character Card V2 and V3) into a new Story, and should it write them back out?

## SillyTavern

Cards are PNGs with the JSON in a `tEXt` chunk (`chara` = V2, `ccv3` = V3; V3 cards usually also keep a V2 `chara` for older readers). V2 fields: name, description, personality, scenario, first_mes, mes_example, creator_notes, system_prompt, post_history_instructions, alternate_greetings, character_book (a lorebook), tags, creator, character_version, extensions. V3 adds assets, group-only greetings and lorebook decorators.

## Storytell today (checked 2026-11-08)

- No import or export of cards. [Export of Stories and Chats](../../storytell-mvp/issues/16-export-of-stories-and-chats.md) ruled out "Tavern cards" — its reason was recovery, which backups cover; using community cards is a different reason.
- A Story is richer than a card: Setting, Opening, required Role, 1–6 Characters (Appearance, Personality, Voice, Example lines, Background, Secrets, Arc directions, Reference image), Scenes, Lore, Style (`apps/api/src/model/story/entities`). Duplicate (`POST stories/:storyId/duplicate`) already copies a whole Story with images.
- Natural mapping: card → new Story with one Character; `scenario` → Setting; `first_mes` → Opening; `description`/`personality` → Personality (Appearance if separable); `mes_example` → Example lines; `character_book` entries → Lore entries (keys → keywords, `constant` → Always include); card image → Reference image; `{{user}}`/`{{char}}` → the Role's and the Character's names. A card has no Role, so the Story gets a default one the author edits.

## Options

- **A. Import only** — upload a PNG/JSON card, get a new Story by fixed mapping, no AI call; the author tidies it (the Story assistant can split fields if asked).
- **B. Import + "tidy with AI"** — A, plus one play-model call that splits `description` into Appearance/Personality/Voice/Background and drafts a Role.
- **C. Import and export.**
- **D. Not now.**

## Recommendation

A now (B's AI pass is already one Story-assistant request away). Export later: a single user has no one to send cards to, and backups cover recovery.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: **import and export** (options A + C). Import a V1/V2/V3 card (PNG or JSON) into a new Story by fixed mapping, no AI call; the Story assistant can tidy it afterwards. Export one Character as a card PNG (V2 `chara` + V3 `ccv3`) carrying the Reference image, with the Setting as scenario, the Opening as first message and the Story's Lore as its lorebook. CHARX (zip) cards are out of scope.

Spec and tickets: [.scratch/character-cards/](../../character-cards/spec.md).

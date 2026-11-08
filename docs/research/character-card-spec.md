# Character Card spec (V1 / V2 / V3) and SillyTavern behaviour

Goal: import a SillyTavern-style card (PNG, JSON, CHARX) into our own model and export one back.
Method: read the spec repos and SillyTavern source (release branch). Source summaries came via a fetch tool that paraphrases, so confirm exact code (line-level) before relying on edge cases.

## Primary sources
- V1 spec: https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v1.md
- V2 spec: https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md
- V2 README: https://github.com/malfoyslastname/character-card-spec-v2/blob/main/README.md
- V3 spec: https://github.com/kwaroran/character-card-spec-v3/blob/main/SPEC_V3.md
- ST PNG read/write: https://github.com/SillyTavern/SillyTavern/blob/release/src/character-card-parser.js
- ST import/export, V1->V2 conversion, lorebook conversion: https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/characters.js
- ST world-info (standalone lorebook) endpoints: https://github.com/SillyTavern/SillyTavern/blob/release/src/endpoints/worldinfo.js
- ST docs on card design (mes_example, macros): https://docs.sillytavern.app/usage/core-concepts/characterdesign/

## 1. PNG storage
Source: character-card-parser.js (ST), SPEC_V3.md, spec_v1.md.

- Chunk type: `tEXt` (ST uses `png-chunks-extract` + `png-chunk-text`). Not iTXt/zTXt.
- Keyword `chara` = V2 card. Keyword `ccv3` = V3 card. ST matches keywords case-insensitively.
- Payload: base64 of UTF-8 JSON text. No compression.
- Spec wording differs: V1 spec says base64 JSON in the EXIF field "Chara" (spec_v1.md). In practice, and in V3 spec, it is a PNG `tEXt` chunk. Implement tEXt.
- ST write (`write`):
  1. Strip all existing `chara` and `ccv3` tEXt chunks (to avoid mismatched copies).
  2. Insert a new `chara` chunk immediately before `IEND` (base64 of the JSON passed in).
  3. Then try to parse the same JSON, set only `spec = 'chara_card_v3'` and `spec_version = '3.0'`, and insert a `ccv3` chunk before `IEND`. If parsing fails, silently skip it (only `chara` remains).
  - Consequence: ST's `ccv3` chunk is the V2 data relabelled as V3, so it lacks V3-only required fields such as `group_only_greetings` unless the source had them. Importers must default missing V3 fields.
- ST read (`read`): extract tEXt chunks, prefer `ccv3`, else `chara`, base64-decode to UTF-8 string; if neither exists throw `No PNG metadata.` Only PNG is supported (other formats throw `Unsupported format`).
- V3 spec reader rules: if both `chara` and `ccv3` exist, `ccv3` wins. Apps may backfill V2 from `chara` (V3 spec says warn the user that V3 content may be placed in `creator_notes`, and trim the chara chunk on import).
- V3 extra assets in PNG: tEXt chunks named `chara-ext-asset_:{path}` (base64 data, referenced as `__asset:{path}`). Spec says new apps should avoid this and use CHARX.
- Recommended export for us: write `chara` (V2 JSON) plus `ccv3` (V3 JSON) like ST. Remove old chunks first. Use a real PNG; the image itself is the avatar.

## 2. V2 JSON shape
Source: spec_v2.md, spec_v1.md, ST characters.js (`charaFormatData`, `readFromV2`).

Top level: `spec: "chara_card_v2"` (string), `spec_version: "2.0"` (string), `data: object`.

`data` fields (V1 six first, all strings, default `""`, never null; spec_v1.md):

| Field | Type | Notes |
|---|---|---|
| name | string | |
| description | string | in every prompt |
| personality | string | short trait summary, in prompt by default |
| scenario | string | in prompt by default |
| first_mes | string | greeting; bot sends first |
| mes_example | string | `<START>`-separated blocks (section 5) |
| creator_notes | string | never put in prompts; show to user |
| system_prompt | string | replaces user's global system prompt by default; `""` = fall back; supports `{{original}}` |
| post_history_instructions | string | replaces user's jailbreak/UJB; `""` = fall back; supports `{{original}}` |
| alternate_greetings | string[] | each becomes an extra first-message swipe |
| character_book | CharacterBook (optional) | section 3 |
| tags | string[] | not for prompts; case-insensitive filtering |
| creator | string | not for prompts |
| character_version | string | not for prompts |
| extensions | Record<string, any> | default `{}`; unknown keys must never be deleted on import or export; namespace custom keys |

Implementer rules (spec_v2.md): editors must preserve optional fields and all `extensions` even if unsupported; frontends must support `{{original}}` and `alternate_greetings` swipes.

ST-specific `data.extensions` written by `charaFormatData`: `talkativeness` (number, default 0.5), `fav` (boolean), `world` (string, linked World Info name), `depth_prompt: { prompt: string, depth: number (default 4), role: string (default 'system') }`. ST also merges any user-supplied extensions JSON into this. (ST also writes `data.extensions` entries from imports like Risu sprites; unknown ones are preserved.)

ST also keeps a legacy flat mirror at the top level of its own stored card JSON: `name, description, personality, scenario, first_mes, mes_example, creatorcomment, avatar ('none'), chat, talkativeness, fav, tags, create_date`. These are ST-internal; they appear in exported PNG JSON as extra top-level keys. Importers should read `data.*` when `spec` is present and ignore the flat mirror.

### V1 (flat) legacy shape
Six top-level string fields: `name, description, personality, scenario, first_mes, mes_example`; no `spec`, no `data`. ST decides by the presence of `spec`: absent -> `convertToV2` (V1 path), present -> `readFromV2` (characters.js). ST's JSON import also accepts: only `name` present -> V1; only `char_name` -> Gradio/Pygmalion notepad format; YAML maps `context` -> description, `greeting` -> first_mes.
Importer rule: if `spec` missing, treat the object itself as `data`; default all absent strings to `""`.

## 3. character_book (lorebook)
Source: spec_v2.md; ST `convertWorldInfoToCharacterBook` in characters.js.

CharacterBook: `name?` string, `description?` string, `scan_depth?` number, `token_budget?` number, `recursive_scanning?` boolean, `extensions` object (required), `entries` array.

Entry (V2):
- Required: `keys` string[], `content` string, `extensions` object, `enabled` boolean, `insertion_order` number (lower = inserted higher).
- Optional: `case_sensitive` boolean, `name` string (editor label), `priority` number (lower dropped first when over budget), `id` number, `comment` string, `selective` boolean, `secondary_keys` string[] (used only if `selective`), `constant` boolean, `position` `'before_char' | 'after_char'`.
- Frontends should use the card's book by default (takes precedence over the user's world book, may stack).

ST mapping when exporting World Info -> character_book (characters.js):
- `id`<-uid, `keys`<-key, `secondary_keys`<-keysecondary, `comment`, `content`, `constant`, `selective`, `insertion_order`<-order, `enabled`<-!disable, `position` = 0 ? 'before_char' : 'after_char' (default after_char), `use_regex` always true (V3 field, written even in V2 export).
- ST `entry.extensions` (explicit keys override any spread-in source extensions): `position` (ST's numeric position), `exclude_recursion`, `display_index`, `probability` (default null), `useProbability` (false), `depth` (4), `selectiveLogic` (0), `outlet_name` (''), `group` (''), `group_override` (false), `group_weight` (null), `prevent_recursion` (false), `delay_until_recursion` (false), `scan_depth` (null), `match_whole_words` (null), `use_group_scoring` (false), `case_sensitive` (null), `automation_id` (''), `role` (0), `vectorized` (false), `sticky` (null), `cooldown` (null), `delay` (null), `match_persona_description`, `match_character_description`, `match_character_personality`, `match_character_depth_prompt`, `match_scenario`, `match_creator_notes` (all false), `triggers` ([]), `ignore_budget` (false).
- No official ST doc of these semantics was found; the list above is from the code. Treat as opaque pass-through unless we implement the feature.
- On import ST copies an imported card's `character_book` as-is into its world file (when `data.world` names it); only non-imported books are converted from ST entries.

V3 lorebook: same plus required `use_regex` boolean per entry (keys are regex; invalid regex never matches), `id` may be string or number. Standalone export wrapper `{ spec: 'lorebook_v3', data: Lorebook }`. Semantics: `enabled:false` never matches; `constant:true` always matches; selective needs a secondary-key match; entry content added at most once per generation; `scan_depth` limits message window; `token_budget` drops low priority first; `recursive_scanning` allows entry-triggered matches. (SPEC_V3.md)

## 4. V3 additions/changes (SPEC_V3.md)
- `spec: "chara_card_v3"`, `spec_version: "3.0"` (readers should not reject other versions; newer -> warn but import; older -> default missing).
- New fields on `data`: `assets` (optional), `nickname` (string, replaces `{{char}}`, `<char>`, `<bot>`), `creator_notes_multilingual` (Record<ISO-639-1, string>; `creator_notes` acts as `en` if none), `source` (string[] ids/URLs; append-only), `group_only_greetings` (string[], required, may be empty), `creation_date` and `modification_date` (Unix seconds UTC, 0 = unknown).
- Other V2 fields unchanged. `character_book` becomes Lorebook (above).
- Asset descriptor `{ type, uri, name, ext }`: type `icon | background | user_icon | emotion | other` (custom types start `x_`); uri = https URL, base64 data URL, `embeded://path` (spec's spelling; also written `embedded://`), or `ccdefault:`; exactly one `icon` named `main`; `ext` lowercase without dot or `unknown`. If `assets` is undefined, assume one icon `{ type:'icon', uri:'ccdefault:', name:'main', ext:'png' }`. Preserve assets you cannot use.
- Decorators: lines at the start of entry `content` like `@@depth 4`, `@@role assistant`, `@@scan_depth N`, `@@position after_desc`, `@@activate`, `@@dont_activate`, `@@additional_keys a,b`, `@@exclude_keys a,b`, `@@activate_only_after N`, `@@activate_only_every N`, `@@is_greeting N`, `@@instruct_depth`, `@@reverse_depth`, `@@ignore_on_max_context`, `@@disable_ui_prompt ...`, etc. `@@@` = fallback decorator. Unknown decorators are ignored; they are stripped from content before prompting. Backfilling to V2 should remove all decorators.
- CHARX: zip with `.charx` extension; root `card.json` required (V3 card); assets by `embeded://` path under `assets/{type}/{images|audio|video|l2d|3d|ai|fonts|code|other}/`; paths case-sensitive, `/` separator; not encrypted; apps may reject oversized/corrupt files.
- Reader MUST: read `ccv3` and CHARX `card.json`, prefer `ccv3` over `chara`; require `spec == chara_card_v3`; substitute `{{char}}`/`{{user}}`; honour `enabled`, `constant`, invalid-regex; add lorebook content once; ignore unknown fields/decorators but preserve them on export.
- Safe to ignore for MVP: assets other than the main icon, emotions, decorators, `source`, multilingual notes (keep raw), dates (preserve), `group_only_greetings` (preserve; use in group chat only). ST itself imports CHARX: card + avatar + sprites/backgrounds/misc into a per-character folder (characters.js); ST export supports only `png` and `json` (no charx export in that endpoint).

## 5. Macros and mes_example
- `{{char}}` or `<BOT>` -> card `name` (V3: `nickname` if non-empty); `{{user}}` or `<USER>` -> user display name. Replacement is case-insensitive (spec_v1.md; V3 detects macros case-insensitively). ST docs only document `{{user}}`/`{{char}}`, but the V1 spec defines the `<USER>`/`<BOT>` aliases, so keep both on import.
- `{{original}}`: only in `system_prompt` / `post_history_instructions`; expands to the user's/app's own prompt.
- V3 extra macros: `{{random:A,B}}`, `{{pick:A,B}}`, `{{roll:N}}`, `{{// comment}}`, `{{hidden_key:A}}`, `{{comment:A}}`, `{{reverse:A}}`. ST has many more (not covered here).
- `mes_example`: blocks each begin with a `<START>` line; lines are `{{char}}: ...` and `{{user}}: ...` (docs.sillytavern.app). `<START>` is not sent to the model; ST turns it into an "Example Separator" (text completion) or "New Example Chat" utility prompt (chat completion). Blocks are included only when context has room and are dropped one block at a time as history grows. Store raw; split on `<START>` when building prompts.

## 6. Size, encoding, gotchas
- Always UTF-8 for the JSON; base64 then wraps it. Decode base64 -> bytes -> UTF-8 (not latin-1); `atob` alone breaks non-ASCII. Strip BOM if present in `.json` cards.
- Large cards: PNG tEXt chunk length is a 32-bit int, so the practical limit is the file size. ST's UI warns when definitions exceed half the model context; nothing breaks.
- Missing metadata: ST throws `No PNG metadata.` when neither keyword exists. Handle gracefully (offer a blank card with the image as avatar).
- Plain `.json` card: V2/V3 object directly (V1 spec calls JSON-only discouraged but allowed). ST JSON import branches on `spec`; V1 flat if only `name`.
- Duplicate chunks: strip old `chara`/`ccv3` before writing, or readers may take the stale one.
- ST's `ccv3` may be a relabelled V2: default missing V3 fields (`group_only_greetings: []`, lorebook `use_regex`) on import.
- Private fields: ST export forces `fav` false and drops `chat`; do not export our internal ids/chat state.
- Round-trip: keep unknown top-level keys, `data.extensions`, entry `extensions`, and unknown assets verbatim (stored as JSON blob alongside our model).
- Not covered by primary sources: WEBP (V1 spec says not covered), iTXt/zTXt (no known writers use them for cards).

## Suggested minimal import model
name, description, personality, scenario, first_mes, mes_example, alternate_greetings[], system_prompt, post_history_instructions, creator_notes, creator, character_version, tags[], character_book (entries with the V2 fields + `use_regex`), nickname?, group_only_greetings[], extensions (raw JSON), avatar image, plus `rawCard` JSON for lossless re-export.

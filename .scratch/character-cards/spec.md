# Spec: Character cards

Status: ready-for-agent
Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md), [Spec: Lore](../lore/spec.md)
Decision: [Import and export Character cards (V2 / V3)](../sillytavern-gaps/issues/02-character-card-import.md)
Research: [Character Card spec (V1 / V2 / V3) and SillyTavern behaviour](../../docs/research/character-card-spec.md)
Related: [Spec: Lore triggers](../lore-triggers/spec.md) (its settings travel in cards once both land: ticket 05 here), [Spec: Read aloud](../read-aloud/spec.md) and [Spec: Chat looks](../chat-looks/spec.md) (the voices and the Backdrop choice travel in Storytell's own block: ticket 06 here)

## Problem Statement

Most characters people write for AI roleplay are shared as **Character cards**: a PNG whose picture is the character and whose hidden text holds the definition, or the same definition as a JSON file. The user finds a character they want to play, and the only way to get it into Storytell is to read the card in another app and copy a dozen fields by hand: the scenario into the Setting, the greeting into the Opening, the description into the Character, every lorebook entry into Lore one by one, and the picture saved and somehow made a Reference image (which today can only be drawn by AI, not uploaded). It takes long enough that they don't.

The other way round, a Character the user built in Storytell lives only in Storytell: there is no file to keep, to open in another app, or to bring back into a new Story later.

## Solution

On Home's New Story panel, beside "Draft from idea" and "Start blank", the user picks **From a Character card** and chooses a PNG or JSON card (V1, V2 or V3). Storytell reads it and shows a preview: the character's name and picture, its creator's notes, the greetings to choose the Opening from, how many Lore entries come along, and what won't. The user types the name they will play under and taps Import. A new Story is made by a fixed mapping, with no AI call: the card's scenario becomes the Setting, the chosen greeting the Opening, the description and personality go into the Character's fields, the example messages become Example lines, the lorebook becomes Lore, `{{user}}` and `{{char}}` become the Role's and the Character's names, and the card's picture becomes the Character's Reference image and the Story's Cover. The Story opens in the editor with what still needs filling in marked, and a one-tap offer to ask the Story assistant to tidy it.

From any Character's card in the Story editor, **Export as Character card** saves a PNG carrying both the V2 (`chara`) and V3 (`ccv3`) definitions: the Character, with the Story's Setting as the scenario, its Opening as the first message and its Lore as the lorebook, over the Reference image (or, without one, the Character's initial on their Character colour). Other apps read it as an ordinary card; Storytell reads its own cards back field for field.

## User Stories

1. As an author, I want to start a new Story from a Character card on Home, so that a character I found is playable without copying fields by hand.
2. As an author, I want to pick the card from my phone's files, PNG or JSON, so that it works with what card sites give me.
3. As an author, I want V1, V2 and V3 cards all to import, so that old and new cards work alike.
4. As an author, I want a PNG card's V3 data used when it carries both, so that I get the newest definition the card has.
5. As an author, I want to see the card's name, picture and creator before anything is made, so that I know I picked the right file.
6. As an author, I want to read the creator's notes in the preview, so that I see their tips (which never reach the AI) before I play.
7. As an author, I want to choose which greeting becomes the Opening, so that I can start from the alternate scenario I like.
8. As an author, I want the preview to say how many Lore entries come along and what won't come along, so that nothing is dropped behind my back.
9. As an author, I want to type the name I will play under before importing, so that `{{user}}` in the card reads as that name everywhere.
10. As an author, I want `{{char}}` and `{{user}}` (and `<BOT>`, `<USER>`) replaced in every field, so that the Story reads as prose, not as template.
11. As an author, I want the Story titled with the card's name, so that I find it on Home.
12. As an author, I want the card's scenario as the Setting and the chosen greeting as the Opening, so that the Story starts where the card starts.
13. As an author, I want the card's personality in the Character's Personality and its description in Background, so that every word of the definition reaches the Narrator.
14. As an author, I want the card's example messages split on `<START>` into Example lines, so that the Character's voice samples come along.
15. As an author, I want the card's lorebook entries as Lore entries with their keys as keywords and constant entries set to Always include, so that the world the card describes comes along.
16. As an author, I want disabled lorebook entries and lorebook decorators left out, so that only what the card actually used comes in.
17. As an author, I want the card's picture as the Character's Reference image, so that Snapshots draw them as the card shows them.
18. As an author, I want the Portrait to start as the usual square near the top middle, so that I can pick a better one later as for any Reference image.
19. As an author, I want the card's picture as the Story's Cover, so that Home shows the card art at once.
20. As an author, I want the Story's Style to start at the usual defaults, so that I tune it like any new Story.
21. As an author, I want a Story with exactly one Character from a card, so that the Story follows the 1–6 Characters rule and I can add more Characters myself.
22. As an author, I want the import to make no AI call and spend no credit, so that trying a card costs nothing.
23. As an author, I want the editor to open after import with the empty required fields marked, so that I know what to fill in before playing.
24. As an author, I want a one-tap "Tidy with the Story assistant" offer after import, which only fills the assistant's message for me to send, so that splitting the description into Appearance, Personality and Voice is one tap away and spends credit only when I send it.
25. As an author, I want a file that isn't a card (a plain picture, a WebP, a CHARX zip, broken JSON) refused with a clear reason, so that I know what went wrong.
26. As an author, I want an oversized card refused before it is read, so that a bad file can't stall the app.
27. As an author, I want text longer than the editor allows cut at its limit and the preview to say so, so that I can still edit every field afterwards.
28. As an author, I want a failed import to leave nothing behind, so that Home never shows a half-made Story.
29. As an author, I want to export any Character as a card PNG from their card in the Story editor, so that I keep a portable copy.
30. As an author, I want the export to carry the Story's Setting, Opening and Lore with the Character, so that another app gets the whole world, not just a name.
31. As an author, I want the export's picture to be the Reference image, so that the card looks like the Character.
32. As an author, I want a Character without a Reference image to export over their initial on their Character colour, so that export never waits for a picture.
33. As an author, I want both a V2 and a V3 definition in the PNG, so that old and new apps read it.
34. As an author, I want my Role's name written back as `{{user}}`, so that another app's user sees their own name.
35. As an author, I want Appearance, Voice, Background and Secrets combined into the card's description under labels, so that another app's AI gets all of it.
36. As an author, I want a card Storytell exported to import back into Storytell field for field (the Character with its Speaking voice, the Role, the Style with the Narration voice and Backdrop choice, the Setting, the Opening and the Lore), so that a round trip loses nothing a card carries; I accept that Documents, Expressions, Saved replies and Replace rules don't travel in a card.
37. As an author on my phone, I want the exported file offered through the share sheet when the phone supports it, so that I can save it to Files or send it on.
38. As an author, I want the exported file named after the Character, so that I find it later.
39. As an author, I want my internal ids, Chats, Memories, Bonds and Snapshots never in an exported card, so that only the definition leaves.
40. As an author, I want the Lore trigger settings (second keywords, patterns, Sticky, Cooldown, Delay, Chance, Groups, recursion opt-out) to travel in and out of cards once Storytell has them, so that lorebooks keep working as their author tuned them.

## Implementation Decisions

### Modules

- A new **Character card** manager module with pure parts, each testable without a database:
  - **Card PNG codec**: reads a PNG's chunks (checks the signature, walks length/type/data/CRC), returns the text of `tEXt` chunks by keyword (matched ignoring case), strips chunks, and inserts `tEXt` chunks before `IEND` with their CRC from Node's built-in `zlib.crc32`. No new dependency; no image decoding.
  - **Card reader**: bytes in (PNG or JSON), a normalised card out (the V2/V3 `data` fields with absent strings defaulted to `""`, absent lists to `[]`), its format (`v1`, `v2`, `v3`) and its picture (PNG bytes, or none).
  - **Card mapping**: a normalised card plus the user's choices (Role name, greeting) to the fields of a new Story, plus the "won't come along" list.
  - **Card writer**: a Story and one of its Characters to the V2 and V3 card JSON.
- An API controller for cards, and a manager service that makes the Story through the existing Story authoring module and stores the picture with the existing Reference image write, **inside one cleanup of its own**: creating the Story, filling it, writing the picture and setting the Cover all run inside one `try`. Any failure from creation on deletes the Story through the Story manager's delete (which also removes the Reference image and Cover files the Story records), deletes a picture file already written but not yet recorded on the Character, and answers the error. AI drafting is prior art only for creating the Story first: its cleanup covers just the model call and parsing, and its fill runs after that `try`, so a failed fill there would leave a half-made Story. Import must not copy that scope.
- A new error domain **Character cards** in `docs/error-codes.md` (the next free domain number, `007` if still free when implemented, since other specs add domains too).

### Reading a card

- **Upload**: one multipart file field `card`, at most 15 MB, the same limit as the Cover upload route in the API. Over it: `CardTooLargeError` (413). No file: `NoCardFileError` (400).
  - A card can't be shrunk before upload as a Cover is, since re-encoding would drop its text chunks, so it goes through the web's `/api` proxy as picked.
  - Proven by ticket 02's e2e: a PNG card of about 14 MB imports through the web, and a 16 MB one shows `CardTooLargeError`'s message in the panel. The Next.js rewrite buffers request bodies only up to `experimental.proxyClientMaxBodySize` (10 MB by default) and cut the 14 MB card short, so `apps/web/next.config.ts` raises it to 20 MB: every body up to the API's 15 MB passes whole, and a bigger one still reaches the API, which answers its own size error.
- **Kind**, from the bytes, never the name or declared type: the PNG signature means PNG; otherwise, after an optional UTF-8 BOM, text whose first non-space character is `{` means JSON. Anything else (WebP, JPEG, a zip such as CHARX): `UnsupportedCardError` (415, "Not a PNG or JSON Character card. CHARX files aren't supported.").
- **PNG**: the `ccv3` `tEXt` chunk if there is one, else `chara`; its text is base64 of UTF-8 JSON, decoded as UTF-8 (never Latin-1). Neither chunk: `NoCardInPictureError` (422, "This picture has no Character card in it.").
- **JSON shape**: `spec` absent means V1, the object itself is the data. `chara_card_v2` and `chara_card_v3` read `data`; any other `spec` with a `data` object is read as V3 with defaults. Not a JSON object, broken base64 or JSON, or an object with none of name, description, first_mes: `UnreadableCardError` (422).
- **Picture**: a PNG card's own PNG, with every `tEXt`, `zTXt` and `iTXt` chunk removed (the card text, which can be megabytes, never goes into the Reference image file or to Venice). A JSON card has a picture only when it is V3 and its main icon asset is a `data:` URL of a PNG, JPEG or WebP (checked by the image store's sniffing); a URL is never fetched.

### The mapping (fixed, no AI call)

Macros, replaced in every text that comes in: `{{user}}` and `<USER>` become the Role's name; `{{char}}`, `<BOT>` and `<char>` become the Character's name; all ignoring case. Other macros (`{{random:…}}`, `{{original}}`…) are left as written for the author to tidy. Line endings become `\n`; texts are trimmed.

- **Story title** ← card `name`, or "Imported card" when blank.
- **Character name** ← V3 `nickname` when not blank, else `name`, else "Character".
- **Setting** ← `scenario`.
- **Opening** ← the chosen greeting: 0 is `first_mes`, 1..n are `alternate_greetings` in order. The others are not kept. A number out of range: `InvalidGreetingError` (422).
- **Personality** ← `personality`.
- **Background** ← `description`. (A card's description is its catch-all; Background is the Story's catch-all field, and the cast card sends it to the Narrator like the others.)
- **Appearance, Voice, Secrets, Arc directions** ← blank. Appearance and Voice are required to play, so the editor marks them; the tidy offer below fills them on request.
- **Example lines** ← `mes_example` split on `<START>` (ignoring case), blank blocks dropped, at most 50 (the editor's limit). A block that is a single line starting with the Character's name and a colon loses that label; other blocks keep their speaker labels.
- **Role** ← name from the import form (required, at most 200 characters); description blank.
- **Style** ← the Story's defaults. **Scenes, Starting Bonds** ← none.
- **Lore** ← `character_book.entries`, in order, at most 200:
  - skipped: `enabled: false`, and blank content;
  - name ← entry `name`, else `comment`, else its first key, else "Lore n"; at most 200 characters;
  - keywords ← `keys` (and, until ticket 05, nothing else), cleaned as the editor does, at most 20 of at most 100 characters; a key that is the name is dropped as redundant; a key written as `/…/flags`, or every key of a V3 entry with `use_regex: true`, is left out until ticket 05 maps it to a pattern;
  - text ← `content` with leading `@@` decorator lines removed;
  - Always include ← `constant: true`.
- **Reference image** ← the picture, as the Character's one Reference image with no Portrait crop (the usual top-middle square stands in). **Cover** ← that Character's Reference image, when there is one.
- **Limits**: every text is cut at 20,000 characters (the editor's limit), so every imported field stays editable; each cut is listed.
- **Storytell's own cards**: a card whose `data.extensions.storytell` holds the block this spec's writer makes (below) takes the Character's fields, the Role's description and the Style from it instead of the fixed mapping, with the same macro replacement; the import form's Role name starts filled from it. Its optional voice and Backdrop keys (ticket 06) set the Narration voice, the Character's Speaking voice and the Backdrop choice; a voice id the voice list doesn't know, or a Backdrop value outside the set, is left at its default and listed in "Won't come along". An absent key means the default.

### What doesn't come along

Listed in the preview in plain words: `system_prompt`, `post_history_instructions` (Storytell's turn prompt is its own), `creator_notes` (shown in the preview, not kept), `tags`, `creator`, `character_version`, the greetings not chosen, `group_only_greetings`, assets other than the picture, other `extensions`, lorebook-level settings (`scan_depth`, `token_budget`, `recursive_scanning`), per-entry `insertion_order`, `position`, `priority`, `case_sensitive`, disabled entries (counted), entries past 200 (counted), regex keys (counted, until ticket 05), and any text cut at the limit.

### API

- `POST /api/stories/from-card/preview`, multipart `card`: reads the card, writes nothing, makes no call. Answers:
  ```ts
  interface CardPreview {
      format: 'v1' | 'v2' | 'v3';
      title: string;
      characterName: string;
      creator: string;
      creatorNotes: string;            // cut to 2,000 characters
      greetings: string[];             // [first_mes, ...alternate_greetings], each cut to 300 characters, macros as written
      loreEntries: number;             // how many will come along
      hasPicture: boolean;
      roleName: string | null;         // from a Storytell card's own block
      leftOut: string[];               // plain lines for the "Won't come along" list
  }
  ```
- `POST /api/stories/from-card`, multipart `card`, `roleName`, `greeting` (default 0): makes the Story and answers it as every Story write does (the Story with its playable status, 201). Create, fill, picture and Cover run inside the import's own cleanup (see "Modules"): any failure deletes the Story and any file written, and answers the error.
- `POST /api/stories/:storyId/characters/:characterId/card`, multipart `image` (a PNG, at most 15 MB): answers `image/png` as an attachment named after the Character (`Content-Disposition` with an ASCII fallback and an RFC 5987 UTF-8 name, as the Transcript download does). Errors: the Story and Character not-found errors; no file `NoImageFileError`; too large `ImageTooLargeError`; not a PNG `NotAPngError` (415, Character cards domain).
- No usage records: none of these makes a model call.

### Exporting a card

- **Why the picture comes from the browser**: Reference images are mostly JPEGs (Venice draws JPEG) and a card must be a PNG. Node can't decode a JPEG without a new dependency; the browser can. So the web draws the picture onto a canvas, makes a PNG of it, and sends it with the export request; the API only adds the card text. Without a Reference image, the web draws a 512×768 picture of the Character's initial on their Character colour, as the Portrait stand-in looks.
- **The PNG**: the uploaded PNG with any existing `chara`, `ccv3` and `chara-ext-asset_*` chunks removed, then `chara` (V2 JSON) and `ccv3` (V3 JSON) inserted before `IEND`, each base64 of UTF-8 JSON.
- **The V2 definition** (`spec: "chara_card_v2"`, `spec_version: "2.0"`), every text with the Role's name, as a whole word, written as `{{user}}`:
  - `name` ← the Character's name;
  - `description` ← labelled paragraphs, blanks omitted: "Appearance: …", "Voice: …", "Background: …", "Secrets: …";
  - `personality` ← Personality; `scenario` ← Setting; `first_mes` ← Opening;
  - `mes_example` ← each Example line as its own `<START>` block: a line with speaker labels (a line starting with the Character's or the Role's name and a colon) is written with those labels as `{{char}}:` / `{{user}}:`; any other line becomes `{{char}}: <line>`;
  - `creator_notes` ← "Exported from Storytell AI."; `system_prompt`, `post_history_instructions`, `creator`, `character_version` ← `""`; `alternate_greetings`, `tags` ← `[]`;
  - `character_book` ← the Story's Lore with sendable text, in order: `keys` = name plus keywords, `content` = text, `constant` = Always include, `enabled: true`, `insertion_order` = index, `selective: false`, `name` and `comment` = the entry's name, `extensions: {}`; omitted when the Story has none;
  - `extensions.storytell` ← `{ version: 1, character: { appearance, personality, voice, exampleLines, background, secrets, arcDirections, speakingVoice? }, role: { name, description }, style: { pov, tense, replyLength, imageStyle, narrationVoice?, backdrop? } }`, the texts with the Role's name as `{{user}}` too. The three optional keys are written once Storytell has those fields ([Read aloud](../read-aloud/spec.md) adds the voices, [Chat looks](../chat-looks/spec.md) the Backdrop choice; ticket 06 here carries them), each only when it isn't the default (a null voice, Backdrop `none`). Adding optional keys keeps `version: 1`.
- **The V3 definition** (`spec: "chara_card_v3"`, `spec_version: "3.0"`): the same `data` plus `nickname: ""`, `group_only_greetings: []`, `creation_date` and `modification_date` (the Story's, in Unix seconds), `assets: [{ type: "icon", uri: "ccdefault:", name: "main", ext: "png" }]`, and `use_regex: false` on each lorebook entry.
- Never in a card: ids, Chats, Messages, Memories, Bonds, Arcs, Scenes, Starting Bonds, Snapshots, other Characters (except as the Setting, Opening and Lore mention them).
- Not carried either, even by Storytell's own block: the Story's Documents, the Character's Expressions, and the Story's Saved replies and Replace rules. A card is one Character's definition; these are Story-wide tools or extra pictures, and Duplicate Story is the way to copy them. So a round trip brings back the Character (with its Speaking voice and one Reference image, Portrait reset to the usual square), the Role, the Style (with the Narration voice and Backdrop choice), the Setting, the Opening and the Lore (with its trigger settings once ticket 05 lands), and nothing else.

### Web

- **Home's New Story panel** gains a third path, "From a Character card", which opens the phone's file picker (`.png`, `.json`). Once a file is picked, the panel shows the preview: the picture (from the file itself in the browser, for a PNG), the name and creator, the creator's notes in a fold, the greetings as a choice (the first chosen; each shown cut, with macros as written), "n Lore entries", the "Won't come along" list in a fold, a required "Your name in this Story" field (the Role's name), and Import / Cancel. A refused file shows its error in the panel with "Choose another file".
- **After import**, the editor opens on the new Story with a one-time notice: "Made from a Character card. Fill in what's marked, or ask the Story assistant to tidy it." Its "Tidy with the Story assistant" button opens the assistant sheet with this message filled in and not sent: "Split <Character>'s Background into Appearance, Personality, Voice and Background, keeping every detail, and write a short description of my Role." Sending it is the user's tap, and the call is the assistant's ordinary `story_assistant` text call, logged as usage like any other.
- **Export**: an "Export as Character card" button at the foot of each Character's card body (not the header toolbar, which already holds ↑ ↓ Remove on a phone). It draws the picture, posts it, and then offers the file through the share sheet when the browser can share files, else downloads it. While it runs the button says "Exporting…"; an error shows under it.

### Model calls and credit

None. Import and export are fixed mappings; nothing here calls OpenRouter or Venice or logs usage. The only call reachable from this feature is the Story assistant's, sent by the user's own tap.

## Testing Decisions

- Test external behaviour only: what the API answers for given card files, the Story it makes, the bytes of the exported PNG, and what Home and the editor show. Tests build their card PNGs and JSON in code (a small helper that makes a PNG with `chara`/`ccv3` chunks); no card from the internet is checked in.
- **Pure tests** (vitest in the API, prior art: the pure blocks of `test/lore.spec.ts`, `test/judge-prompt.spec.ts`):
  - codec: read and write round trip; CRCs valid; existing `chara`/`ccv3` chunks replaced, never duplicated; keywords matched ignoring case; text chunks stripped from a picture; a non-PNG refused;
  - reader: V1 flat, V2, V3, `ccv3` preferred over `chara`, BOM-led JSON, non-ASCII (Thai) text through base64, broken input refused with the right error;
  - mapping: each row of the mapping; macros in every field, ignoring case; `<START>` splitting and the single-line label rule; Lore mapping including disabled, blank, decorators, constant and name/comment fallbacks; the limits and the left-out list; the Storytell block taking precedence;
  - writer: the V2 and V3 shapes, the description's labelled paragraphs, `{{user}}` for the Role's name as a whole word, Example line blocks, lorebook entries; export then import gives back the same Character, Role, Style, Setting, Opening and Lore (and, from ticket 06, the voices and Backdrop choice).
  - Tests that need a Storytell card before the writer exists (tickets 01 and 03) build one in code with an `extensions.storytell` block, like any other test card.
- **API tests** (prior art: `test/story-drafting.spec.ts` for born-then-fill, `test/story-cover.spec.ts` for multipart uploads, `test/story-duplicate.spec.ts` for whole-Story checks, `test/reference-images.spec.ts`):
  - preview writes nothing;
  - from-card makes the Story with its Character, Lore, Reference image and Cover, and the fake gateway records no call;
  - a refused card leaves no Story and no file; a failure forced during the fill, and one after the picture was written, each leave no Story and no file;
  - the size limit;
  - export answers a PNG whose chunks parse back to both definitions, with the right file name.
- **e2e (Playwright, 390px)** (prior art: `apps/web/e2e/story-draft.spec.ts` for Home's panel, `e2e/story-cover.spec.ts` for `setInputFiles`, `e2e/chat-transcript.spec.ts` for downloads):
  - pick a PNG card on Home, see its name and greetings, choose the second greeting, type a name, import; the editor shows the Opening, the Character's Portrait and the marked fields, and the Lore tab the entries;
  - the tidy button fills the assistant's message without sending it;
  - a plain picture is refused in the panel;
  - a PNG card of about 14 MB imports through the web's proxy, and a 16 MB one shows the size error;
  - Export as Character card downloads a PNG that imports back to the same Character.

## Out of Scope

- CHARX (zip) cards, WebP or JPEG cards, and V3 extra assets (`chara-ext-asset_*` chunks, emotions, backgrounds) beyond the main picture.
- Fetching a card or its picture from a URL.
- An AI pass during import; the tidy offer only fills the Story assistant's message.
- Adding a card's Character to an existing Story (import always makes a new Story).
- Exporting a JSON card, a whole Story as one card, several Characters as a group card, or a standalone lorebook.
- Keeping `system_prompt`, `post_history_instructions`, unchosen greetings, tags or unknown extensions for a lossless re-export of someone else's card.
- Lore trigger settings in cards until [ticket 05](issues/05-cards-carry-lore-triggers.md), which waits on [Lore triggers](../lore-triggers/spec.md); voices and the Backdrop choice until [ticket 06](issues/06-cards-carry-voices-and-backdrop.md), which waits on Read aloud and Chat looks.
- Documents, Expressions, Saved replies and Replace rules in any card.

## Further Notes

- The decision (2026-11-08): import and export, options A + C, no CHARX; the form was left to the planner. The forms chosen here: a preview step with the greeting choice (alternate greetings are not kept, since a Story has one Opening and Duplicate Story makes a second start cheap); the Role's name asked up front, because `{{user}}` is written into the Story's text at import and a placeholder name would read wrong ("You walks in"); `description` into Background; the card's picture also made the Cover; export pictures drawn by the browser.
- [Export of Stories and Chats](../storytell-mvp/issues/16-export-of-stories-and-chats.md) ruled out "Tavern cards" for recovery; that reason still stands (backups cover it). This spec is about using community cards.
- Contradiction with the decision ticket's notes, resolved here: its "Storytell today" put `description` into Personality. Personality is meant for traits; a card's description usually mixes looks, history and setting, which is what Background holds. Either reaches the Narrator.
- Reference images could only be drawn by AI until now; import is the first way a picture from outside becomes one. It goes through the same Reference image write (a fresh file name, the old file deleted), so nothing else changes.
- Open question: a card picture can be large (4,000 px PNGs exist), and Snapshots send the Reference image to Venice, whose input limit isn't pinned down in `docs/research/image-model-for-snapshots.md`. Recommended: ship as is; if a Snapshot fails on one, the author replaces the Reference image. If it proves common, shrink the picture in the browser before import as export already draws one.
- Open question: should SillyTavern's `selectiveLogic` values 1 (NOT ALL) and 3 (AND ALL) map to the nearest Storytell mode in ticket 05? Recommended: yes, 3 → "Also needs one of" and 1 → "Unless one of", listed as approximated; confirm the enum numbers against SillyTavern's source before relying on them.
- Glossary: no new term. "Character card" and its avoid-list are already in CONTEXT.md.

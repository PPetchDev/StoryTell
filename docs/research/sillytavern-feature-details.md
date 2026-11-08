# SillyTavern feature details (behaviour notes)

Sources: official docs at docs.sillytavern.app and the SillyTavern GitHub source (`release` branch, `raw.githubusercontent.com/SillyTavern/SillyTavern/release/...`). Where the docs are silent this file says so ("not documented") instead of guessing. Docs pages are abbreviated as follows.

- WI = https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- AN = https://docs.sillytavern.app/usage/core-concepts/authors-note/
- GC = https://docs.sillytavern.app/usage/core-concepts/groupchats/
- CF = https://docs.sillytavern.app/usage/core-concepts/chatfilemanagement/
- RX = https://docs.sillytavern.app/extensions/regex/
- EX = https://docs.sillytavern.app/extensions/expression-images/
- TR = https://docs.sillytavern.app/extensions/translation/
- VN = https://docs.sillytavern.app/usage/user-settings/visual-novel/
- STS = https://docs.sillytavern.app/usage/st-script/ (Quick Replies section)
- UC = https://docs.sillytavern.app/usage/core-concepts/uicustomization/
- US = https://docs.sillytavern.app/usage/user-settings/
- SLASH = https://docs.sillytavern.app/usage/chatting/slashcommands.md

## 1. World Info / Lorebook (WI)

**Keys**
- Primary keys: comma-separated list. Case-insensitive by default.
- Secondary keys ("Optional Filter"): comma-separated. Empty = filter ignored. They also support regex.
- Selective logic only runs after a primary key matched. Four modes:
  - AND ANY: at least one secondary key present.
  - AND ALL: every secondary key present.
  - NOT ANY: no secondary key present.
  - NOT ALL: blocks activation only when all secondary keys are present.
- Regex keys: a key is regex if it is a JS-style `/pattern/flags` (all flags allowed). Several regexes can be separate keys; commas are allowed inside a regex but not in plaintext keys. Since v1.12.6 each scanned message is prefixed with `speaker name + \x01`, so `/\x01{{user}}:[^\x01]*?hello/` matches only the user's "hello".
- Case-sensitive: keys must match capitalization. Global setting, overridable per entry.
- Match whole words: on by default, applies to single-word keys. Overridable per entry. Turn off for languages without spaces (Japanese, Chinese).
- Include Names: adds speaker names as prefixes in the scan buffer so name keys can fire without the name being in the text.

**Scan depth** (overridable per entry): 0 = only recursed entries and Author's Note are evaluated; 1 = last message only; N = last N messages.

**Recursion**
- "Recursive Scan" is a global switch: an activated entry's content is itself scanned for other entries' keys.
- Per entry: Non-recursable (cannot be activated by other entries); Prevent further recursion (once active, it triggers nothing else); Delay until recursion (only activates during recursive passes, grouped by Recursion Level; lowest level checked first, next level opens only when no more matches).
- Max Recursion Steps: 0 = limited only by budget; otherwise caps total scan sweeps (1 = no recursion, 2 = one recursive hop, 3 = two). Mutually exclusive with Min Activations.

**Trigger % (probability)**: an extra filter that can stop insertion however the entry activated (constant, key, recursion). 100 = always, 0 = effectively disabled. Sticky entries skip the probability check on later scans until sticky ends. Exactly when in the pipeline the roll happens is NOT documented.

**Inclusion groups**
- Entries with the same group label compete; if several trigger, only one is inserted. Default pick is random, weighted by Group Weight (default 100).
- An entry may be in several comma-separated groups; if chosen it disables all other entries in each of its groups.
- Prioritize Inclusion replaces the random roll: highest Order value wins.
- Group Scoring (global or per entry): only entries with the most key matches survive, then weight/prioritize decides. Points: 1 per primary match; AND ANY 1 per matching secondary; AND ALL 1 per secondary only if all match; NOT ANY / NOT ALL add nothing.

**Timed effects** (all counted in chat messages; 0 = off)
- Sticky N: stays active for N messages after activating.
- Cooldown N: cannot activate for N messages (may follow a sticky period).
- Delay N: needs at least N messages in the chat at evaluation time (1 excludes an empty chat, i.e. no greeting).
- Scoped to the chat where it fired; branches inherit parent state. Effects are dropped if the chat does not advance (swipe, delete). Editing the entry clears an active effect. Re-matching keys does not refresh an active effect.
- Doc example (sticky 3, cooldown 2, delay 2): activates at message 1, sticky through 4, cooldown 5-6, can activate again at 7. (The doc example is inconsistent with "delay 2" at message 1; treat as illustrative.)

**Token budget**: set by Context % or absolute Budget. Once exhausted no more entries activate even with matching keys. Constant entries are inserted first, then higher Order; directly key-triggered entries beat recursion-triggered ones. "Alert on overflow" warns when activated entries exceed the budget. No other drop order documented. Example-message entries get pushed out per the Example Messages Behavior setting.

**Constant entries**: the "blue circle" strategy, no keys, triggers every scan. Still subject to Trigger %, filters and budget.

**Also**: Min Activations (non-zero ignores scan depth and scans back until that many entries fire; bounded by max depth/budget). Insert Order: higher Order lands nearer the end of context (stronger). Positions: before/after char defs, before/after example messages, top/bottom of Author's Note (ignored if AN frequency is 0), @Depth (role system/user/assistant), Outlet (`{{outlet::Name}}` macro).

## 2. Chat branches and checkpoints (CF; source: `public/scripts/bookmarks.js`)

- Docs: message "..." menu has Create Branch (clone up to that message, switch to the clone) and Create Checkpoint (same clone, prompts for a name, stays in current chat). Link back is by chat file name; renaming a chat breaks checkpoint links. "Back to parent chat" is in the menu left of the input box.
- Source, branch: copies `chat.slice(0, mesId+1)` (deep clone; optional swipe synced). Sets only `main_chat` (parent) and a new `integrity` UUID in metadata. Name: `<main chat name> - Branch #N` (N counts up, skips existing). Parent message gets the new file name appended to `extra.branches`. Branch then opens.
- Source, checkpoint: name `<main chat name> - Checkpoint #N`, editable in a popup (empty = suggested). `main_chat` set to the parent; source message gets `extra.bookmark_link = <checkpoint name>` (shown as a flag; click or `/checkpoint-go` opens it). Does not open automatically.
- `backToMainChat` reads `main_chat`; old chats fall back to parsing the name before `Checkpoint #`. Other chat metadata copying is not shown in the source reviewed.
- Group chats: a branch inherits the group scenario override from its parent (GC).

## 3. Author's Note (AN; source: `public/scripts/authors-note.js`)

- Frequency (interval): 0 = never inserted, 1 = every user input, N = every Nth user input. Source counts only user messages; inserts when the user-message count is an exact multiple of N. Default interval 1.
- Placement: "After Scenario" (before example messages) or "In-chat" at a depth. Depth 0 = very end of history; depth 4 puts it before the last 3 messages. Default depth 4. Closer to the bottom means more influence.
- Role (source only, not in the docs page fetched): system (default), user, assistant; stored per chat, default in `extension_settings.note.defaultRole`.
- Chat note vs default note: the top box is the chat's note (not copied to new chats automatically). The bottom "default" note only seeds the chat note when none exists.
- Per-character note (source): stored by character filename, with a "Use character's author's note" checkbox and a position: replace (default; replaces chat note), before, or after the chat note. Disabled in group chats.

## 4. Impersonate

- Docs: `/impersonate` = "ask AI to write as you with an optional prompt" (SLASH). The detailed prompt is not described on the docs pages fetched.
- Source (`script.js`, `openai.js`, settings default): for Chat Completion, a utility prompt "Impersonation prompt" (`impersonation_prompt`) is added as the last control prompt after chat history. Default text begins "[Write your next reply from the point of view of {{user}}, using the chat history so far as a guideline..." and tells the model to match the user's style and not write as `{{char}}`. Group nudge is skipped for impersonation.
- Text completion: the final prompt line is the user's name plus colon (instruct mode uses user-turn formatting with name1).
- Input box text: in `Generate()` the textarea is NOT read as a user message when impersonating (text treated as empty). The streaming writer clears the textarea and writes the generated text into it; non-streamed output is also written to the textarea and `IMPERSONATE_READY` fires. The result is not saved as a chat message; the user edits then sends. Any text typed beforehand is overwritten. (A slash command's optional argument is the only documented way to pass a hint.)

## 5. Group chats (GC)

- Reply order: Manual (nobody replies unless you pick one via menu or `/trigger`; empty trigger picks a random unmuted member); Natural Order (below); List Order (members-list order); Pooled Order (random member who has not spoken since last user message; once all have, random until next user message).
- Natural order, three steps: (1) mentions: whole-word match of a member's name in the last message; self-mentions ignored unless Allow Self Responses; (2) talkativeness: each member activates with probability from its Talkativeness (0% shy, 100% chatty, default 50%); (3) pick randomly among activated; if none, pick one at random ignoring conditions.
- Mute: member never replies. Force Talk: makes a chosen member reply regardless of order (works even if muted).
- Auto-mode: generates replies without user input following the reply order; next turn starts 5 seconds after the last message; typing in the send box disables it (queued generations still finish).
- Allow Self Responses: natural order only; lets the last speaker reply again when self-mentioned; no effect in List Order.
- Generation handling: "Swap character cards" (default; only the active speaker's card in context) or "Join character cards" (all combined in list order, with include/exclude muted sub-modes and join prefix/suffix with `{{char}}`/`<FIELDNAME>`). Chat history is always shared.
- Other: group scenario override (all members use it), new members added to top of list, setting "Show group chat queue" shows response order in the character list (US), "Relax message trim in Groups" lets the AI speak for other members (US).

## 6. Quick Replies (STS; source: `public/scripts/extensions/quick-reply/`)

- Built-in extension, disabled by default. A bar of buttons appears above the chat input; "Number of slots" up to 100 (older docs). Each button has a label (emoji recommended), optional icon, tooltip title, and a script. In the source editor: "Show label even if an icon is assigned", "Invisible (auto-execute only)", context-menu entries (chaining: current QR is sent with and before the clicked one).
- Sets (presets): several sets, switched manually or by `/qrset`. A reply's content is a script; docs call everything a script (plain text is just a script with no commands; `{{input}}` reads the input box; "Inject user input automatically" should be off for STscript).
- Scope (source only, STS does not mention it): global sets (always loaded), chat sets (stored in chat metadata), character sets (stored per character; not for groups). Name lookup order: global, chat, character; `SetName.ReplyName` also works.
- Auto-execute flags per reply: startup; user message; AI message (swiped "..." skipped); chat change (opening a character or group chat); new chat; group member draft; before generation; plus Automation ID (fires when a World Info entry with the same ID triggers). "Don't trigger auto-execute" prevents a reply from triggering other auto-executed ones. Auto-execution works only while the extension is enabled.

## 7. Regex extension (RX)

- Scopes: Global (all characters, saved in settings) and Scoped (only the active character, saved in the card). Buttons convert between them.
- Affects: User Input, AI Response, Slash Commands, World Info (requires Alter Outgoing Prompt, or both ephemerality boxes unchecked), Reasoning (Chat Completion reasoning; with Alter Outgoing Prompt also applies in later prompts). With none checked the script runs only when called by a slash command/STscript.
- Ephemerality: neither box (default) rewrites the stored chat JSONL irreversibly; "Alter Chat Display" only = display only; "Alter Outgoing Prompt" only = prompt only; both = no write to chat file.
- Depth: Min/Max Depth, 0 = last message, 1 = second to last. Max must exceed Min. Min Depth Unlimited/-1 also affects the continued message. System/utility prompts are not affected.
- Find Regex: `/pattern/flags`, default case-sensitive first-match-only. Replace With: `{{match}}` = full match; `$1`, `$2` capture groups need parentheses in the pattern.
- Trim Out: strings (one per line) removed from the match before Replace is applied.
- Run on Edit: also runs after a message is edited. Macros in find regex: Don't Substitute / Raw / Escaped. Disabled scripts remain usable only if not disabled in the list (disabled in list = untriggerable by QR/STscript).

## 8. Character Expressions (EX; source: `extensions/expressions/index.js`)

- Default label list (28, GoEmotions; source `DEFAULT_EXPRESSIONS`): admiration, amusement, anger, annoyance, approval, caring, confusion, curiosity, desire, disappointment, disapproval, disgust, embarrassment, excitement, fear, gratitude, grief, joy, love, nervousness, optimism, pride, realization, relief, remorse, sadness, surprise, neutral. A 6-label model is optional via config.yaml.
- Classifier sources: Local (small model on the server, one-time ~100 MB HuggingFace download); Main API/LLM (Limited Context = last message plus instruction, or Full Context = whole chat incl. card; uses all existing sprite labels incl. custom); WebLLM; Extras (deprecated). A "none" option is not documented.
- When it runs: after each AI reply (worker polls every 2 s and classifies only when the last character message text changed); skipped while a stream/API call is in progress; on chat change it resets the sprite cache; with streaming it may update at intervals. `/classify` runs it manually.
- Fallback: "Default / Fallback Expression" setting: a chosen expression used when an image is missing, `[No Fallback]` (show nothing) or `[Default emojis]`. Source default fallback is `joy`, also used when classification fails.
- Sprites: files in `data/<user>/characters/<character name>/`; single image named `joy.png`; multiples with "Allow multiple sprites per expression" as `joy-1.png` or `joy.alt.png`; ZIP upload must be flat and is not renamed; folder override via setting or `/costume`; keyed by display name. Any image format, animated GIF/webp fine.

## 9. Visual Novel mode, backgrounds, themes

- VN (VN): toggle in User Settings below "No Text Shadows". UI adjusts to make room for a character sprite or card image at screen centre (default mode shows sprites beside chat). In group chats sprites spread out to make room. MovingUI (desktop only) lets you drag sprites. Multiple cards in VN mode without an extension is stated as unsupported; the Prome extension adds letterbox, focus mode (darken non-speakers), traditional mode (only last message), hide message box, and "Emulate Character Card as Sprite" for mixed groups. Backgrounds in VN: not described.
- Backgrounds (source `backgrounds.js`; docs have no dedicated page): a global background plus a per-chat lock stored in chat metadata (`custom_background`), set by lock button or `/lockbg`, removed by `/unlockbg`. While locked, changing the global background does not change what you see. Chats can also hold their own uploaded backgrounds (`chat_backgrounds`); selecting one locks it. `/bg` sets by file name; `/autobg` asks the model to choose.
- Themes (UC): saved theme files (import/export/delete/update, save as new). A theme holds colours, layout sliders, toggles and custom CSS; switching replaces current settings. The Theme Toggle list describes VN as "Compact chat with background sprite".

## 10. Chat translation (TR)

- Auto-mode: None; Translate responses (AI replies into target language); Translate inputs (your messages into English); Translate both.
- Providers: Libre Translate, Google Translate, Lingva, DeepL, DeepLX, Bing, OneRing, Yandex (some need an API key or custom URL). Docs recommend a provider with good auto-detect for the "both" mode. Source language is auto-detected; explicit selection not available.
- Internal language for the AI is hardcoded English (changeable only through settings.json).
- Stored vs display: the page does not say explicitly. It says originals are preserved, translations are cached, "Clear Translations" removes them from the chat, and "Translate Message" toggles back to the original; this implies translation is stored beside the original and the display swaps.
- Controls: Translate Chat, Translate Input (extensions menu), per-message Translate button, `/translate [target=code] text`.

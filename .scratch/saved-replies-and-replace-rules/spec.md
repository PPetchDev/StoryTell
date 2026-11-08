# Spec: Saved replies and Replace rules

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) ("Composer", "Message rendering", "Settings", "Story editor"), [Spec: Lore](../lore/spec.md) (per-Story lists answering the Story)
Decision: [Scripts, Quick Replies and Regex](../sillytavern-gaps/issues/09-scripts-quick-replies-regex.md)
Research: [SillyTavern feature details](../../docs/research/sillytavern-feature-details.md) (6. Quick Replies, 7. Regex extension)
Shares the composer with: [Write for me and Thai reading](../write-for-me/spec.md) (owns the tool row), [Dictation](../dictation/spec.md)
Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

Some lines the user types again and again: a habitual action ("*leans back and listens*"), a recurring question, a way to wrap up a scene, the same few words in a Story where they play a regular. On a phone each is a chore to type and easy to mistype. And some things the model writes, the user simply doesn't want to read: a pet phrase a model overuses ("a shiver ran down her spine"), a spelling of a name the user prefers otherwise, a tic in how the AI renders a word. The only fix today is asking the code agent to change the app, for what is a matter of taste in one Story or across all of them.

## Solution

- **Saved replies**: lines the user writes once and keeps, for the whole app or for one Story. A Saved replies tray in the composer lists them (this Story's first, then the app-wide ones); a tap puts the line into the composer at the caret. `{user}` in a line becomes the name of the Role or Persona worn in that Chat. The tray can save the composer's draft as a new Saved reply for this Story or for all Stories. They are managed in Settings (app-wide) and in a "Saved replies" folding card in the Story editor's Style tab (per Story). A Saved reply only fills the composer; the user still taps Send.
- **Replace rules**: find-and-replace rules, plain text or regex (with `$1` groups), for the whole app or one Story, in order. A rule can apply to **AI Messages as shown** — what is stored never changes, the AI and every background call keep reading the stored text, and Edit shows the stored text — and/or to **my Messages before sending**, where the replaced text is what is sent and stored. The Transcript, the Visual novel view and Read aloud use the shown text; Thai reading, Lore triggers, Memory, the Judge and every prompt use the stored text. A rule that doesn't compile, matches empty text, or is too slow is refused when saved, and so is a rule on my Messages that would change its own result if run again. They are managed next to Saved replies: a card in Settings, and a "Replace rules" folding card in the Story editor's Style tab.

Neither makes a model call or costs credit.

## User Stories

### Saved replies

1. As a player, I want to keep lines I often send, so that I don't type them again.
2. As a player, I want a Saved reply for every Story, so that my general habits are always at hand.
3. As a player, I want a Saved reply for one Story only, so that lines that only make sense there don't clutter the others.
4. As a player, I want a tray in the composer that lists this Story's Saved replies and then the app-wide ones, so that the most specific are first.
5. As a player, I want a tap on a Saved reply to put it into the composer at the caret, so that I can combine it with what I've typed.
6. As a player, I want a Saved reply in an empty composer to become the whole draft, so that one tap and Send is all it takes.
7. As a player, I want a space added between a Saved reply and the text next to it when needed, so that words don't run together.
8. As a player, I want a Saved reply never to send by itself, so that a stray tap never costs a turn.
9. As a player, I want the tray to stay open after a tap, so that I can add two Saved replies in a row.
10. As a player, I want `{user}` in a Saved reply to become the name of who I wear in this Chat, so that one line works for my Role and my Personas.
11. As a player, I want to save what's in the composer as a Saved reply from the tray, for this Story or for all Stories, so that I keep a good line the moment I write it.
12. As a player, I want to add, edit and remove app-wide Saved replies in Settings, so that I can tidy them.
13. As an author, I want to add, edit and remove a Story's Saved replies in the Story editor, so that they live with the Story.
14. As a player, I want long Saved replies shown in two lines at most in the tray, so that the tray stays compact.
15. As a player, I want the tray and ⚡ never open at once, so that the composer doesn't grow over the thread.
16. As a player, I want an empty tray to tell me how to add Saved replies, so that the feature explains itself.
17. As an author, I want Duplicate Story to copy the Story's Saved replies, so that a copy is complete.
18. As a player, I want Saved replies to cost nothing, so that I use them freely.

### Replace rules

19. As a player, I want to replace a word or phrase in what the AI writes, as I read it, so that the story reads the way I like.
20. As a player, I want plain-text rules by default, so that simple fixes need no regex.
21. As a player who knows regex, I want regex rules with `$1` groups in the replacement, so that I can rewrite patterns, not just words.
22. As a player, I want an ignore-case switch, so that "Shiver" and "shiver" are both caught.
23. As a player, I want an empty replacement to remove what was found, so that I can delete a tic.
24. As a player, I want a rule for every Story or for one Story, so that a Story's own fixes don't affect others.
25. As a player, I want rules applied in an order I set, app-wide ones first and then the Story's, so that rules that build on each other work.
26. As a player, I want to move a rule up or down, so that I can fix the order.
27. As a player, I want the stored Message never to change, so that turning a rule off brings the original back.
28. As a player, I want the AI to keep reading the original text, so that a display rule never changes what the story is.
29. As a player, I want Edit to show the stored text, so that I edit what is really there.
30. As a player, I want rules applied while a reply streams in, so that the text doesn't jump when it finishes.
31. As a player, I want speakers' names left alone by rules, so that a rule can't break who says what.
32. As a player, I want `*…*` written by a replacement into a Character's speech to show in italics like any action there, so that a rule can mark an action.
33. As a player, I want a rule that applies to my own Messages before they are sent, so that I can fix my own habits (a spelling, a shorthand I expand).
34. As a player, I want what my rule produced to be what is sent and stored, so that the AI reads the fixed text.
35. As a player, I want a send refused when my rules leave nothing to send, so that I never send an empty Message.
36. As a player, I want the downloaded Transcript, the Visual novel view and Read aloud to give me the text as I see it in the Chat, so that a phrase I hid stays hidden everywhere I read or hear the story.
37. As a player, I want a rule that won't compile refused when I save it, with the reason, so that a typo never breaks the Chat.
38. As a player, I want a rule that matches empty text refused, so that it can't insert its replacement between every letter.
39. As a player, I want a rule that is too slow refused when I save it, so that a bad regex can never freeze the Chat.
40. As a player, I want to try a rule on a sample text in its card, without a bad pattern freezing the editor, so that I can see what it does before I play.
41. As a player, I want a rule on my Messages refused when running it twice would change my text again, so that a line I re-send (a Branch's draft) is never changed twice.
42. As a player, I want to switch a rule's two targets (AI Messages, my Messages) on and off, so that I can park a rule without deleting it.
43. As an author, I want Duplicate Story to copy the Story's rules, so that a copy reads the same.
44. As a player, I want Replace rules to cost nothing, so that I use them freely.

## Implementation Decisions

### Composer (the tool row comes from [Write for me 01](../write-for-me/issues/01-composer-tool-row.md))

- The composer is four bands, as [integration](../sillytavern-gaps/integration.md) ("The composer, top to bottom") settles: the panel (one at a time: ⚡'s cards, the Saved replies tray, or a status/error), the Character row (the Nudge Portraits, with two or more Characters), the tool row (⚡ · ✍️ · Saved replies · ✱, Undo at the right end), and the box row (box · 🎤 · send slot). This spec adds the **Saved replies** tool button (a bookmark icon, `aria-label` "Saved replies", `aria-pressed` while the tray is open) and the **tray** as a panel. Opening the tray closes ⚡'s cards and the other way round.
- **The tray** (`aria-label` "Saved replies"): up to about 40% of the viewport high, scrolling inside.
  - Two groups, headed "This Story" and "All Stories", each shown only when it has lines, each in add order; each line a button showing at most two lines of text.
  - Below them, "Save this draft" with two buttons, "For this Story" and "For all Stories", disabled while the box is empty.
  - Empty state: "No saved replies yet. Save a draft here, or add them in Settings or the Story editor's Style tab."
- **A tap on a line** fills the composer: the line with `{user}` (exact, case-sensitive) replaced by the Chat's worn identity name, inserted at the box's caret (the end when the box hasn't been focused since the Chat opened). One space is added on a side where the neighbouring character isn't whitespace and the box isn't empty there. The caret goes after the inserted text. Nothing is sent. The tray stays open until the tray button, ⚡, or a send closes it.
- **No send from the tray**, and no long-press: the decision ticket said "fill or send", but one-tap sending spends a turn on a stray touch, and a long-press fights text selection on phones; the glossary's "fills the composer in one tap" stands.
- A Saved reply replacing or extending the draft counts as a change to the box, which ends Write for me's Undo.
- **Save this draft** stores the box's text as it is (its `{user}`, if any, stays literal), then adds it to the tray's group without reloading the Chat.

### Saved replies: storage and API

- New table `saved_reply`: `story_id` (nullable; ON DELETE CASCADE; null = app-wide), `text`, `position` (add order), `created_at`. Text is trimmed, 1–1,000 characters. At most 50 per scope; one more is refused with `TooManySavedRepliesError` (422).
- **App-wide routes**: `GET /api/saved-replies`, `POST /api/saved-replies` with `{ text }`, `PATCH /api/saved-replies/:savedReplyId` with `{ text }`, `DELETE /api/saved-replies/:savedReplyId`. Each answers `{ savedReplies: SavedReply[] }`, the app-wide list in position order.
- **Per-Story routes**, like Lore: `POST /api/stories/:storyId/saved-replies`, `PATCH /api/stories/:storyId/saved-replies/:savedReplyId`, `DELETE …`. Each answers the whole Story, whose response gains `savedReplies: SavedReply[]`.
- `SavedReply` is `{ id, text }`. A blank text is `EmptySavedReplyError` (422); an id not in that scope is `SavedReplyNotFoundError` (404).
- **Chat detail** gains `savedReplies: { id, text, scope: 'story' | 'app' }[]` in tray order (the Story's, then app-wide), so the tray needs no extra request.
- **Duplicate Story** copies the Story's Saved replies (`CONTEXT.md`'s Duplicate entry already lists them), in its own ticket's extension of Duplicate, with a test.

### Replace rules: storage and API

- New table `replace_rule`: `story_id` (nullable; cascade; null = app-wide), `find` (1–500 characters, **not trimmed**: spaces are part of the pattern), `replace` (0–1,000 characters, may be empty), `regex` (boolean, default false), `ignore_case` (default false), `on_ai` (default true), `on_mine` (default false), `position`, `created_at`. At most 50 per scope (`TooManyReplaceRulesError`, 422). Both targets off is allowed: the rule is parked.
- **Meaning of a rule** (one pure function, `applyReplaceRules(text, rules)`, the same in the API and the web):
  - Plain: every occurrence of `find`, matched literally (ignoring case when set), is replaced by `replace` taken literally (no `$` patterns).
  - Regex: `find` is a JavaScript regex source compiled with flags `g` plus `i` when ignoring case; every match is replaced using JavaScript's replacement patterns (`$1`, `$<name>`, `$&`, `$$`). No other flags; `[\s\S]` covers what `s` would.
  - Rules run in order, each on the output of the one before: app-wide rules by position, then the Story's by position.
  - A text longer than 20,000 characters is left unchanged by every rule (a guard; real parts are far shorter). A rule that throws when run is skipped.
- **Checks at save** (create and update), each refused with `InvalidReplaceRuleError` (422) and a plain message the editor shows under Find:
  - a regex that doesn't compile (the engine's message);
  - a rule whose pattern matches empty text ("This would match between every letter");
  - a rule too slow on the probe texts ("This pattern is too slow"). The API runs the rule over a fixed set of probe texts — a long English passage with quotes, asterisks and line breaks; a Thai passage; long runs of one letter, of spaces and of a letter followed by one odd character — in a worker thread, and terminates it after 250 ms. A terminated worker means too slow. Node's `worker_threads` needs no new dependency, and terminating the worker is the only reliable way to stop a runaway regex.
  - a rule with **On my Messages** switched on that gives a different result when run a second time on its own output ("This rule would change your text again if run twice"), per [integration](../sillytavern-gaps/integration.md): a Branch's draft or an edited Message re-sent must never be changed twice. The check runs the rule alone over the probe texts, plus its own `find` (for a plain rule) and its own `replace` text, then runs it again over each result; any second change refuses it. It runs in the same worker under the same time limit, and runs again when On my Messages is switched on for a saved rule. A rule only on AI Messages is not checked (shown text is always made from the stored text, so it is never run twice). Accepted gap: two rules that each pass can still undo each other in sequence; the check is per rule, as integration words it.
  - The web also compiles a regex as it is typed (compiling never runs the pattern, so it can't hang), to show a bad pattern at once without saving; the API stays the authority.
- **App-wide routes**: `GET /api/replace-rules`, `POST /api/replace-rules`, `PATCH /api/replace-rules/:ruleId`, `DELETE /api/replace-rules/:ruleId`, `PUT /api/replace-rules/order` with `{ ids }`. Each answers `{ replaceRules: ReplaceRule[] }` in order.
- **Per-Story routes**: the same under `/api/stories/:storyId/replace-rules`, each answering the whole Story, whose response gains `replaceRules: ReplaceRule[]`.
- `ReplaceRule` is `{ id, find, replace, regex, ignoreCase, onAi, onMine }`. A reorder that doesn't list every rule of the scope exactly once is the existing `InvalidOrderError`, widened (below). An unknown id is `ReplaceRuleNotFoundError` (404).
- **Chat detail** gains `replaceRules: { find, replace, regex, ignoreCase, onAi, onMine }[]` in apply order (app-wide, then the Story's), leaving out parked rules.
- **Error codes**: a new domain for Saved replies and Replace rules (the next free `YYY` in `docs/error-codes.md`) holding the five errors above. Other specs written the same day may claim codes too; take the next free ones when implementing.
- **`InvalidOrderError` is widened.** Today its constructor takes only `'Characters' | 'Scenes'` and always says "the Story's" (`apps/api/src/errors/story.errors.ts`). It gains `'Replace rules'` and a scope, so a per-Story reorder reads "The order must list every one of the Story's Replace rules exactly once." and an app-wide one "…every one of your app-wide Replace rules…". Its code (`422.003.008`) and its existing messages stay as they are.
- **Duplicate Story** copies the Story's rules (already listed in `CONTEXT.md`'s Duplicate entry), with a test.

### Where the AI-side rules run: the web's message renderer

- The Chat screen provides the Chat's `onAi` rules, compiled once per rule list, through a React context.
- The one renderer of AI parts (the component that draws a stored AI Message's parts and the streaming reply's parts, and which the Visual novel view will reuse) reads the context:
  - a narration part's text is replaced before it is split into paragraphs, so a rule can remove a whole paragraph. Narration is italic throughout and never turns `*…*` into italics (`apps/web/components/chat/message-body.tsx`), so asterisks a replacement writes there show as typed;
  - a speech part's text is replaced before `*…*` becomes italics, so a replacement can write an action inside a Character's line;
  - speakers' names are never touched.
- Text stays text (React escapes it), so a replacement can't inject markup.
- **Streaming**: every `parts` event is rendered through the same function, on the text so far. A match whose end hasn't arrived yet shows once it arrives; rules are cheap enough per event at the 20,000-character guard and 100 rules at most.
- **Who sees what**, as [integration](../sillytavern-gaps/integration.md) ("Replace rules and what each reader sees") settles:
  - **Rules applied (shown text):** the thread, the **Visual novel view** (it applies the `onAi` rules before it splits the text into steps; [Chat looks](../chat-looks/spec.md) owns that), the Transcript (below), and **Read aloud** (it speaks the shown text, so a hidden phrase isn't heard; [Read aloud](../read-aloud/spec.md) owns that, using the web's apply function and the Chat's `replaceRules`).
  - **Stored text, rules not applied:** User Messages as shown (their rule runs before send instead), the Edit form, every prompt and background call (turn, Judge, Memory extraction, Story so far, Suggested replies, Write for me, Snapshots), Thai reading (it translates the stored text, so editing a rule never drops a reading), Lore triggers and Memory.
- **Transcript**: the API applies the Chat's `onAi` rules to each AI part's text when it writes the Transcript, so the file reads as the screen does. This needs the apply function in the API too. The two copies are kept identical by one table of cases: the API's pure test (vitest) holds it, and since the web has no unit test runner (`apps/web/package.json` has only Playwright), an e2e runs the web copy over the same table through "Try it" (below) and checks each output. A shared workspace package for one small function isn't worth it.

### Where my-side rules run: the composer's send

- On Send, the composer runs the Chat's `onMine` rules over the draft. The result is what is sent: it shows in the pending bubble, and the API stores it.
- When the result is blank, nothing is sent, the draft stays, and the composer says "Your Replace rules left nothing to send."
- Not applied to: editing a User Message (the user edits the exact stored text), Retry (it resends the stored Message), filling the box (Saved replies, Suggested replies, Write for me, Dictation), or Continue.

### Management UI

- **Settings** gains two cards after Models, "Saved replies" and "Replace rules", for the app-wide lists, each autosaving like the rest of the page.
- **Story editor**: no new tab (integration: "No eighth editor tab"). The Style tab gains two folding cards (the editor's existing `FoldingCard`), "Saved replies" and "Replace rules", holding the Story's own lists and autosaving like Lore. They sit in the Style tab beside the Narration voice and the Backdrop choice of the sibling specs.
- **A Saved reply card**: one text box (autosave), Remove. "Add saved reply" at the end.
- **A Replace rule card**:
  - Find and Replace fields; switches Regex, Ignore case, On AI Messages, On my Messages; the order buttons (the editor's existing up/down buttons) and Remove.
  - A small "Try it" box under the fields shows a sample text with the rule applied, using the web's apply function. **It never runs a pattern on the main thread**: a bad regex can hang the page, and the web compile above only proves it parses. "Try it" runs the rule in a Web Worker with the same 250 ms limit as the API's check and terminates the worker on time-out, showing "This pattern is too slow" instead of an output; a new keystroke terminates a run still going and starts another. The thread and the composer run only rules the API has saved, so already checked.
  - A refused save shows the API's message under Find. The card keeps the typed text, and the last saved version stays in force.
  - "Add replace rule" at the end.
- No model calls anywhere in this spec.

## Testing Decisions

- Test external behaviour only: API answers, what the thread and composer show, what is sent and stored, the Transcript file.
- **Pure tests** (vitest) on `applyReplaceRules`, one table of cases:
  - plain literal match with `$` in the replacement kept literal; ignore case; regex with `$1` and `$<name>`;
  - empty replacement deletes; order (app-wide before Story, then position);
  - Thai text; the 20,000-character guard; a throwing rule skipped.
- **Pure tests** on the save checks: a bad regex refused with the engine's reason; an empty-matching pattern refused; a catastrophic pattern (`(a+)+$`) refused as too slow within the time limit; a normal regex accepted; an On my Messages rule that changes its own output again (`cat` → `cats`, regex `(\w+)` → `$1s`) refused, one that doesn't (`colour` → `color`) accepted, and the first one accepted when only On AI Messages is on. Also on the tray's insert-at-caret spacing and `{user}` filling, if kept as an exported pure function in the web (exercised by e2e otherwise).
- **API tests** (prior art: `apps/api/test/lore.spec.ts` for per-Story CRUD answering the Story, `personas.spec.ts` for an app-wide list, `story-duplicate.spec.ts`, `chat-transcript.spec.ts`, `chats.spec.ts`):
  - Saved replies: CRUD in both scopes; blank and over-limit refused; the Chat detail lists the Story's then the app-wide ones; deleting the Story removes its own; Duplicate copies them.
  - Replace rules: CRUD and reorder in both scopes; the four save checks (switching On my Messages on for a saved rule runs the twice-run check); an incomplete reorder refused with the widened `InvalidOrderError`; the Chat detail's apply order without parked rules; Duplicate copies them.
  - The prompts are unchanged by rules: a turn after a rule exists sends the stored text.
  - The Transcript applies `onAi` rules to AI parts and leaves names alone.
- **e2e** (Playwright, 390px with touch; prior art `apps/web/e2e/suggested-replies.spec.ts`, `composer-and-actions.spec.ts`, `lore.spec.ts`, `settings.spec.ts`, `streaming.spec.ts`):
  - Saved replies:
    - management: add, edit and remove one in Settings' card and one in the Style tab's "Saved replies" folding card; each survives a reload;
    - the tray shows both in their groups;
    - a tap fills an empty box, and a second tap inserts at the caret with a space;
    - `{user}` shows the worn name;
    - "Save this draft → For this Story" adds the line to the tray, and it survives a reload;
    - nothing is sent until Send.
  - Replace rules:
    - management: in Settings' card and in the Style tab's "Replace rules" folding card, add a rule, edit Find and Replace (autosave), switch Regex / Ignore case / the two targets, move it up and down, remove it; each change survives a reload;
    - a bad regex shows the web's compile error at once, and a refused save (an empty-matching pattern) shows the API's message under Find with the typed text kept;
    - "Try it" over the shared table of cases: for each single-rule case, the rule and sample typed into a card show the table's expected output (this is the check that the web copy behaves as the API copy; the table lives in one file both suites read);
    - the table's order case in the thread: an app-wide rule and a Story rule that build on each other both apply to an AI Message, app-wide first;
    - "Try it" on `(a+)+$` with a long run of `a`s shows "This pattern is too slow" and the page stays responsive (a click elsewhere still works);
    - a Story rule changes a word in an AI Message as shown, and Edit shows the original;
    - a streamed reply shows the replaced text while streaming;
    - an invalid regex shows its error and isn't saved;
    - an `onMine` rule changes the sent User Message as stored;
    - the downloaded Transcript has the replaced text.

## Out of Scope

- STscript or any scripting; Saved replies that run actions, chain, or fire automatically (SillyTavern's auto-execute).
- Sending from the tray, long-press actions, keyboard shortcuts for Saved replies.
- Placeholders beyond `{user}` (Character names, dates, `{input}`).
- Saved replies or rules per Chat or per Character; sets that switch.
- Reordering Saved replies (add order only).
- Rules that rewrite the prompt or the stored text of AI Messages, rules on reasoning, Lore or Memories, depth limits (SillyTavern's min/max depth), "trim out", and other regex flags.
- Applying rules to the Thai reading or Snapshots (stored text is used). Read aloud and the Visual novel view do use the shown text, but their specs own that.
- Importing SillyTavern regex scripts or Quick Reply sets.

## Further Notes

- The AI never sees a display rule's effect, so a model will keep writing the phrase a rule hides; that is the point of "what is stored never changes". A rule that should change what the AI writes belongs in the app's prompts (a code change), or in the Chat's Author's note once that exists.
- Read aloud speaks the shown text, so a hidden phrase isn't heard (settled by integration; the [Read aloud spec](../read-aloud/spec.md) builds it on the web's apply function and the Chat's `replaceRules`).
- Open question: should the Transcript use the stored text instead, to avoid the API copy of the apply function? Recommendation: no, keep it applied (shown text): the Transcript is for reading, and the copy is about thirty lines pinned by one table of tests.
- Open question: is 250 ms the right speed-check budget on the live box? Recommendation: yes. The probe texts are about 5,000 characters, a sane regex finishes them in well under 10 ms, and a catastrophic one never finishes.

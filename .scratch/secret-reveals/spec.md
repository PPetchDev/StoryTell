# Spec: Secret reveals

Status: ready-for-human
Builds on: [Spec: Bond axes](../bond-axes/spec.md) (Bond levels, Bond gates and their check), [Spec: Story quality](../story-quality/spec.md) (the Judge lessons: a field named in the system reply shape, the system message byte for byte the same, the code decides), [Spec: Endings](../endings/spec.md) (a ledger record against a Message, shown in the thread), [Spec: Prompt cache](../prompt-cache/spec.md) (what goes in the standing system message and what in the closing user message)

Built 2026-11-18.

## Problem Statement

A Character card has Secrets: a free text the Narrator plays and the user never sees. Nothing ever lets them out on purpose. A Character keeps them however close the user grows to them, or tells them on a whim in the first Scene; and when one does come out, the app does not notice: the profile still hides it, and nothing marks the moment.

## Solution

- **Secrets that open up.** Under the Secrets text on a Character card, the author can add Secrets one by one. Each can have a **Bond level** it needs: one feeling of the Character toward the Role and the least level ("Trust at least *trusts*"), picked by its word, as a Bond gate is. A Secret with no level is played exactly like the Secrets text: known to the Character, never shown to the user.
- **The Narrator is told when one may come out.** While a Secret's level is not reached, the Character keeps it to themselves. Once their Bond toward the user reaches it, the Narrator is told, in the closing message, that the Character may now tell that Secret if and when the moment fits: never forced, and never more than one Secret in a reply. A Character is offered one Secret at a time, the first in the author's order that is open and not yet told.
- **The Judge notices a reveal.** The Judge is shown the Secrets on offer, numbered, and lists the number of each that the latest exchange actually reveals to the user. The code takes only numbers it offered.
- **A Secret revealed moment.** A reveal is a ledger record against the AI Message that told it. The thread shows a small card under that Message: "Secret revealed — Nara: …". From then on the Secret shows in the Character's profile, under "Secrets shared with you", and the Narrator reads it as known to the user.
- **Taking the Message back un-reveals it.** Regenerate, an edit, another Reply version or Reset take the record away like any judged change; a Branch carries those of the Messages it keeps.
- **Unrevealed Secrets never reach the user while playing.** The Chat response carries only revealed ones. (The Story editor's response carries every Secret, as it carries the Secrets text today: the author writes them.)

## User Stories

1. As an author, I want to give a Secret a Bond level, so that a Character opens up only once the relationship has grown that far.
2. As an author, I want a Secret without a level to play as the Secrets text does, so that nothing changes unless I choose it.
3. As an author, I want to pick the level by its word, never a number, as I do for a Bond gate.
4. As an author, I want several Secrets on one Character, told in my order, so that a Character opens up a step at a time.
5. As a player, I want a Character to tell a Secret only when the moment fits, so that it feels earned and never forced.
6. As a player, I never want a Character to pour out every Secret at once.
7. As a player, I want to see when a Secret came out, as a small card in the thread.
8. As a player, I want a revealed Secret to show in the Character's profile, so that I can read it again.
9. As a player, I want taking back the Message to take back the reveal, so that Regenerate is a clean undo.
10. As a player, I never want an unrevealed Secret in anything the Chat shows me.
11. As a player on a 360px phone, I want the card and the profile section to fit at 360 and 320.

## Implementation Decisions

### Storage

- **`character_secret`** (migration `1764450000010-SecretReveals`): `id`, `character_id` (ON DELETE CASCADE), `position`, `text`, and the level as `axis` (text, null) and `at_least` (smallint, null). Both null, or both set: a check constraint holds it. Up to 8 per Character. Loaded with the Story (`characters: { expressions: true, secretList: true }`), sorted by position.
- **`secret_reveal`**, the ledger record: `id`, `chat_id` (CASCADE), `secret_id` (CASCADE: a Secret the author removes takes its reveals with it), `message_id` (CASCADE), `created_at`. Unique on `(chat_id, secret_id)`: a Secret is revealed once per Chat. Recorded in the Judge's one record transaction.
- **Rollback, Reset and Branch** go the way of `ending_reached`: the rollback deletes those of the rewound Messages, Reset deletes the Chat's, a Branch copies those of the Messages it keeps (the Secret ids are the Story's, so they need no remapping).
- **Duplicate** copies each Character's Secrets, with their levels, in order. **Character cards** carry only the Secrets text, as before (Out of Scope).
- The Secrets text field stays exactly as it is. The Story drafter, the Story assistant and card import go on writing only it.

### Which level counts

- The Bond is the Character's **toward the user** (the Role or the worn Persona): `toCharacterId` null. A level is one Bond axis, any of the four, and a least level within its scale, so the gate check of Bond axes (`gatesHold`) is reused: a Bond with no levels yet opens nothing.
- **Open** means: the Secret has a level, the Character's Bond toward the user holds it, the Secret is not yet revealed in this Chat, and the Character is not sitting out.
- **On offer**: per Character, the first open Secret in the author's order. One at a time, so a Character with three open Secrets tells them over three moments, never at once.
- Read with the Bonds as they stand before the reply (the turn reads the ledger before writing; the Judge reads the same, leaving out this Message's own reveals). A Secret that opens in the same judgement is offered from the next turn.
- A level the Bond later falls below does not hide a Secret already revealed; one not yet told stops being offered.

### The Narrator

- **The cast card** (standing system message, cached) gains, only for a Character with Secrets in the list:
  - Secrets without a level join the Secrets line, after the text, as `- …` items; with no Secrets text the line is the same with only the items.
  - Secrets with a level go on their own line: `Secrets Nara keeps for now (Nara does not tell them, or hint at them outright, until the Narrator's notes say Nara may):` then `- …` per Secret. The Character knows them and acts with them in mind; the card never changes as Bonds or reveals move, so the cached prefix holds for the whole Chat. No pronoun is guessed: the line repeats the name.
  - Without any Secret in the list, the card is byte for byte as before.
- **`# Secrets` in the closing user message**, after the Established facts and before "Where things stand", only when something is on offer or revealed:
  - `- Nara may now tell Ash this, if and when the moment truly fits; never force it or steer toward it: …` (one line per Character on offer), then `Tell at most one secret in a reply, and none at all when the moment is wrong for it.`;
  - `Already told to Ash, so never told again as news: Nara: …; …` (the revealed ones).
- The Story so far trigger reserves the block's room, as it does for the facts.
- Suggested replies and Write for me share the standing prefix (so they see the card) but not the closing block: they never steer toward a reveal.

### The Judge

- **The system message names the field** whenever the Story has any Secret with a level: `"secrets_revealed":[]` is added to the reply shape (after `roll_offer` where that is named). That is fixed for a Story, so the system message stays byte for byte the same from one call to the next in a Chat. A Story with no levelled Secret sends exactly the prompt it sent before: the golden fixture (`test/fixtures/judge/prompts-before-expressions.json`) still matches.
- **The section goes in the user message**, last, only when a Secret is on offer:
  ```
  # Secrets that may come out
  [1] Nara: She was once married to the bandit chief.
  Secret rule: in "secrets_revealed" give the number of each secret above that the latest exchange actually reveals to the user: the Character tells it, or the user plainly learns it. A hint, a hesitation, a promise to tell later or a half-truth is not a reveal. Most turns reveal none: when in doubt, leave it out.
  ```
  The secrets are numbered in the section, never by id.
- **The Judge only extracts; the code decides**: a number not in the section, a repeat, or anything that is not a whole number (or a numeric string) is dropped and logged. Each kept number becomes a reveal of its Secret.
- About 40 more tokens to the Judge's cap while the section is sent.

### API

- `POST /api/stories/:storyId/characters/:characterId/secrets` adds a blank Secret with no level at the end; `PATCH …/secrets/:secretId` takes `{ text?, axis?, atLeast? }` (`axis: null` clears the level; a level needs both); `DELETE …/secrets/:secretId` removes it (its reveals in Chats go with it). Each answers the Story. The Story's Character response gains `secretList: [{ id, text, axis, atLeast }]`.
- Errors: `404.003.150` `SecretNotFoundError` (no Secret with that id on that Character), `422.003.151` `InvalidSecretError` (a level outside the axis's scale, a level without an axis or an axis without one, a text over 1,000 characters), `422.003.152` `SecretLimitError` (a ninth Secret on one Character).
- **The Chat response** gains `secretReveals: [{ secretId, characterId, messageId, text }]`, the revealed ones only, in the order they came out. The Secret's text is the author's current text.

### The screen

- **Story editor:** under the Secrets field, a "Secrets told in time" group: each Secret a text box, a "Told once" select ("No level: kept like the Secrets above", or "Their Trust toward Ash has grown" and the other three feelings) and, with a feeling, its level by word ("At least"), then Remove (asks first, and says a Chat that revealed it no longer has it revealed). "Add secret" adds one, up to 8. Text and level are saved like the other fields (the autosave queue, one key per Secret for the text and one for the level).
- **Thread:** under the Message that told it, a small card (`aside`, named "Secret revealed by Nara"): an open-padlock mark, "Secret revealed", then `Nara: …` with the name in the Character colour. It is read from a context, like the Bookmarks, so a reveal never redraws other Messages. The words say it; the mark is only decoration. The Visual novel view does not show it (Out of Scope).
- **Profile:** "Secrets shared with you", above Appearance, listing the Character's revealed Secrets in the order they came out. No section while there are none.

## Testing Decisions

- **Pure** (`test/secret-reveals.spec.ts`): what is open and on offer (levels, sitting out, revealed, one per Character, a Bond with no levels); the cast card with and without Secrets (byte for byte as before without); the closing block; the Judge's section, its shape on the system message only with a levelled Secret, the golden fixture unchanged; reading `secrets_revealed` loosely; applying (numbers not offered, repeats).
- **API, HTTP with the fake gateway** (`test/secret-reveals-api.spec.ts`): the Secret routes and their errors; Duplicate copies; a Secret opens when a scripted Judge raises the Bond, the next turn's closing message offers it, a scripted reveal records it, the Chat response carries it, the following turn reads it as revealed; Regenerate takes it back; Branch carries it; Reset clears it; an unrevealed Secret is never in the Chat response.
- **e2e** (`e2e/secret-reveals.spec.ts`, at 360 and 320): the editor adds a Secret with a level by its word; a scripted reveal shows the card in the thread and the Secret in the profile; no horizontal overflow; the Story is deleted at the end.

## Out of Scope

- Character cards (export or import) carrying the list.
- The Story drafter or assistant writing levelled Secrets.
- Showing the Secret on offer to the user, or a "locked Secret" hint.
- A reveal by a Character toward another Character (only toward the user).
- The Diary telling revealed Secrets (it still never tells Secrets).
- The card in the Visual novel view.
- An announcement as the card appears: it shows once the Judge settles, when the Chat is read again.

## Further Notes

- **A real-model check, for later (no credit spent here).** Through `buildJudgePrompt` with live's Judge (DeepSeek V4 Flash on Venice), about $0.05: five runs each of (a) a reply where the Character tells the Secret in their own words, (b) a reply that only hints ("there's something I haven't told you"), (c) a reply about something else with a Secret on offer. Wanted: (a) mostly `[1]`, (b) and (c) always `[]`. Then on dev, play to an open Secret and check the Narrator tells it only when the moment fits, and never two in one reply. If (b) comes back as a reveal, tighten the rule's words, not the code.
- Characters always read as adults; nothing here changes that.

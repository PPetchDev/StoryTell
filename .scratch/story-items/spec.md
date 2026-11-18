# Spec: Items

Status: ready-for-human
Builds on: [Spec: Story quality](../story-quality/spec.md) (the Judge extracts, the code decides; a field the Judge returns is named in the system message's reply shape), [Spec: Facts panel](../facts-panel/spec.md) (a sheet from the Scene strip; the user's own record has no Message), [Spec: Place, Weather and Outfits](../info-box/spec.md) (detail records and the Scene strip), [Spec: Prompt cache](../prompt-cache/spec.md) (what changes goes in the closing user message)

Built 2026-11-18.

## Problem Statement

Things in a story matter: a key, a letter, a ring, a gift, a weapon. Today nothing keeps track of who has them. A reply can have the user still holding the ring they gave Nara two scenes ago, or reading the letter they burned. Memories may hold "Petch gave Nara the ring", but a Memory is found by meaning and may not reach the turn; the history that says it may be summarised away. The user cannot see or fix who holds what either.

## Solution

A Chat keeps a short list of its **Items**: each a name, who holds it (the user, a Character, or someone or somewhere else in a few words) and how it came to them ("found in the well", "given by Nara", "bought at the market"). An Item **ends** when it is used up, lost or destroyed; it then stays on the list as gone, with how it ended.

- **The Judge records them.** Each judgement it gives the Item changes the latest exchange shows (a thing found, given, taken, bought, used up, lost, destroyed); the code decides which are applied, against the list as it stands.
- **The Narrator reads them** every turn, in the closing message after the Established facts: who holds what now, and what is gone, so no reply forgets that the user gave Nara the ring or brings back the letter they burned.
- **The user sees and edits them** in an **Items** sheet, opened from a row of the Scene strip, as the Facts panel is: change who holds one and how, mark one gone, add one, delete one.

## User Stories

1. As a player, I want the story to remember who holds each thing that matters, so that a reply never has me holding the ring I gave away.
2. As a player, I want a thing that was burned, drunk or lost to stay gone, so that it does not turn up again in a later reply.
3. As a player, I want to see the Items and how each came to its holder, so that I know what the Narrator holds to be true.
4. As a player, I want to correct who holds an Item, add one the story missed, mark one gone, or delete one that is not worth keeping.
5. As a player, I want Again, an edit or another Reply version to take back the Item changes of the reply it undoes, and my own edits to stay.
6. As a player, I want Reset to clear the Items and a Branch to carry them, as it does the rest of the Chat's state.
7. As a player on a 360px phone, I want the Items row and sheet to fit, down to 320px.

## Implementation Decisions

### The record

- **An Item is a detail record** (`detail_change`, new kind `item`), as a fact is. Its `value` is JSON: `{"name", "holder", "how", "end"}`, with `end` null, `"used"`, `"lost"` or `"destroyed"`. The newest record of a name wins (names are matched loosely: case, punctuation and a leading "the", "a" or "an" aside). `{"name", "removed": true}` is the user deleting it.
  - Recorded against the judged Message, so Regenerate, an edit or another Reply version takes the change back with the reply; Reset clears them; a Branch copies them (`branch.service.ts` copies every detail record of the Messages it keeps, and those with no Message). No code of their own for any of these.
  - The user's own change is a record with no Message (`message_id` NULL), as the user's fact and Now note are: no rewind takes it away. When a later Judge change to the same Item is taken back, the user's is current again.
  - JSON, not `topic: fact`: an Item has four parts, and a holder or "how" may hold any character.
- **The holder** is stored as `{user}` for the user (whatever identity they wear, as Memories store it), a Character's name as the cast writes it, or a few words for anyone or anywhere else ("the innkeeper", "under the floorboard"). The Narrator reads `{user}` as the worn identity's name; the sheet shows "You".
- **One migration** (`1764440000010-StoryItems`) adds `item` to the kind check. Like Growing cards it rebuilds the check from the constraint as it stands, so a kind another branch adds is never undone, whichever runs first.
- **Caps.** At most 30 Items held at once (`ITEMS_MAX`); gone ones do not count. At most 3 Item changes a judgement (`ITEMS_PER_TURN`). A name is up to 60 characters, a holder 60, a "how" 80.

### The Judge extracts, the code decides

The lessons of the Established facts (`.scratch/story-quality/spec.md`, "Real-model check after the merge") hold:

- **The field is named in the system message's reply shape**: `"items":[{"item":"...","holder":"...","how":"...","end":null}]`, added after `roll_offer` (and before `new_event`, which ai-events adds last). On DeepSeek V4 Flash a field asked for only in the user message is not returned.
- **The system message stays byte-identical** from call to call: the shape is added whenever the Items section is sent, and the section is sent on every judgement, with "(none yet)" for a Chat with no Items. `judge-prompt.ts` is not changed: the shape, the section and the reading of the answer are added around it in `details/items.ts` (`withItemsJudge`, `readJudgedItemsFrom`), as ai-events does. The golden fixture (`test/fixtures/judge/prompts-before-expressions.json`) is unchanged and still passes: `buildJudgePrompt` alone sends what it did.
- **What changes goes in the closing user message**: the `# Items` section, after the latest exchange and the other sections: the Items held now, then the gone ones, then the rule.
- **The rule** asks only for what the exchange shows happen: a thing that matters to the story coming to someone (found, given, taken, bought, made), changing hands, or ending (used up, lost, destroyed). Never what someone plans, offers or asks for; never clothes being worn (an Outfit), food eaten at once, furniture or scenery. A listed Item is named as listed.
- **The code decides** (`applyItems`, pure):
  - A new Item needs a holder; one that ends as it arrives is not kept. A new Item past `ITEMS_MAX` held is dropped.
  - A listed Item takes a new holder (with its "how"), or an end. The same holder again is no change: the Judge does not rewrite how an Item came to someone.
  - **Gone stays gone.** An Item used up or destroyed is never brought back by the Judge, whatever a reply says; the answer is dropped and logged. A lost one comes back when the story shows someone find it (a holder, no end).
  - **An Item the user deleted stays deleted**, as a deleted fact does: the Judge's new record of it is taken only when the user's own words in that exchange name it (`saidByUser`, from facts).
  - One change an Item a turn; at most `ITEMS_PER_TURN` in all. What is dropped is logged with why, as the other judge items are.
  - The holder "user", "you", `{user}` or the worn identity's name is the user; a Character's name in any case is that Character.
- **Its token cap** rises by 140 for the answer.

### The Narrator

- **Where:** the closing user message, in its trailing blocks, right after `# Established facts` and before "Where things stand", under `# Items`. Not the system message, for the same reasons as the facts (prompt-cache spec): a change up there makes the next turn uncached, and the list must win over the history and the Story so far, which come before. The block keeps one place and one heading from turn to turn; its words change only when an Item does.
- **Short:** one line an Item held (`- Nara's ring: Nara has it, given by Petch`), then one line of the gone ones, the five most recent only (`Gone, so no one has them: the letter (destroyed, burned in the hearth)`), then one sentence: only who holds a thing can use, show or give it, and a thing that is gone stays gone. No block with no Items.
- The Story so far trigger reserves the block's room, as it does the facts'.

### The API

- **`PUT /api/stories/:storyId/chats/:chatId/items`** with `{ name, holder, how, end }` sets the user's own Item: adds it when no listed name matches, otherwise changes it (a listed name keeps its wording). `end` is null, `"used"`, `"lost"` or `"destroyed"`. With `{ name, remove: true }` it deletes the Item. Answers the Chat. Takes no turn lock, like the facts.
  - Writing what is already there, or deleting what is not there, writes nothing.
  - A name with no letters or digits is `422.004.140` `ItemWithoutNameError`; an Item held with no holder is `422.004.141` `ItemWithoutHolderError`; a new held Item when 30 are held is `422.004.142` `TooManyItemsError`.
- **The Chat response** carries `items: [{ name, holder, how, end, byUser }]`, in the order the Items were first recorded, held and gone alike; `holder` is `{user}` for the user.

### The screen

- **The Scene strip**, opened, has an "Items" row under the "Established facts" one, with the count held ("Items · 2", or "none yet"). It opens the Items sheet.
- **The Items sheet**: a line on what Items are, the Items held (name, then "You have it" or "Nara has it", then how), then "Gone" with the gone ones (how each ended), then "Add an item".
  - Edit opens one in place: who has it (You, each Character, or "Someone or somewhere else" with a box), how they came by it, and whether it is gone (Still here, Used up, Lost, Destroyed). Save, Delete, Cancel. Escape leaves the edit, not the sheet.
  - The add form: name, who has it, how. Shown while fewer than 30 are held.
  - Errors show under the form that caused them; saving re-reads the Chat from the answer.

## Testing Decisions

- API, pure (`test/story-items.spec.ts`): the state from records (newest wins, loose names, gone, the user's delete and `clearedByUser`, `byUser`); reading the Judge's answer loosely; `applyItems` (new, given, taken, ended, gone stays gone, lost found again, unchanged, unknown holder words kept, the user by name, caps, deleted by the user); the Judge's section and shape (system message byte-identical with and without Items, with Expressions, a Roll offer and ai-events; the section last in the user message; the golden fixture untouched); the Narrator's block and its place in a built turn prompt; the user's change.
- API, HTTP with the fake gateway (same file): the Judge's Items reach the Chat and the next turn's closing message; Regenerate takes them back; the user's add, edit, end and delete through `PUT`, which survive a Regenerate; Reset clears them; a Branch carries them; the errors.
- Browser (`apps/web/e2e/story-items.spec.ts`, phone size): open the strip and the sheet, see the Judge's Item, give it to a Character, add one, mark one gone, delete one, at 360px and 320px wide without sideways scrolling; the next turn's prompt reads the change; the Story is deleted.

- Pinned Judge numbers that move with this change: its token cap is 140 more (`chats.spec.ts`, `judge.spec.ts`, `line-emotions.spec.ts`), the exact user message in `judge.spec.ts` ends with the Items section, and the shape in `judge-rolls.spec.ts` now goes on past `roll_offer` to `items`.
- Results on 2026-11-18: `story-items.spec.ts` 21/21; full API suite 1833 tests, all passing once those five pinned tests were updated; the Items e2e passes at 360 and 320px; full e2e 355/355.

## Out of Scope

- Item counts ("three coins") beyond what the name says, and money as a number.
- A Character's own inventory view on the Character profile.
- Items on the wide-screen "At a glance" panel, the Transcript or the Dashboard.
- Starting Items an author sets on a Story.
- Renaming an Item in place (delete it and add it again).

## Further Notes

- **A real-model check to run later (not run: no real credit was spent).** Through the real code on dev, with live's Judge (DeepSeek V4 Flash on Venice), about five runs each, on content the rule never mentions:
  - The user gives a Character a thing ("I press the brass key into Morra's palm"): one change, holder Morra, how "given by user".
  - A Character hands the user something: a new Item held by the user.
  - The user burns a listed letter: `end: "destroyed"`.
  - A reply mentions a listed Item without it changing hands: nothing.
  - A reply has the user holding a destroyed Item: nothing taken (the code drops it if given), and the next reply's prompt still lists it as gone.
  - A tender scene with no things in it: no `items`.
  - Check the system message is the same across all calls (the provider's cached-token count), and that `items` comes back at all when only the shape names it.
- If V4 Flash floods the list with scenery, tighten the rule's "matters to the story" with a few named kinds, as the facts rule names its kinds.

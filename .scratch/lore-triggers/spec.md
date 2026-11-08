# Spec: Lore triggers

Status: ready-for-agent
Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).
Builds on: [Spec: Lore](../lore/spec.md)
Decision: [Lore entries: which SillyTavern World Info features to add](../sillytavern-gaps/issues/11-lore-upgrades.md)
Research: [SillyTavern feature details](../../docs/research/sillytavern-feature-details.md) (section 1, World Info)

## Problem Statement

A Lore entry today has one way in: its name or a keyword shows up in the user's new message or the 4 newest Messages, or it is set to Always include. That leaves blind spots the author can't fix from the editor:

- An entry drops out 4 Messages after its last mention, even while the story is still in that place or still talking around that custom.
- An entry named only inside another entry's text never comes along, so a place's entry can't bring its ruler's entry with it.
- A keyword can't be narrowed ("the Well" only when it is night) or blocked ("the festival" but not when the story is about last year's).
- A keyword can't be a pattern ("any of the moon's names", "a line Mira speaks").
- An entry can't be rationed: kept out for a while after it went in, held back until the Chat is under way, or let in only some of the time.
- Several entries that describe the same thing in different moods (the weather, the market on different days) can all go in at once, crowding the cap and contradicting each other.

And when an entry is or isn't in play, the Memory drawer can't say why, so the author can't tell which setting did it.

## Solution

Each Lore entry gains a few optional settings, behind a "More triggers" fold on its card so the simple entry stays simple:

- **Second keywords** with a mode: "Also needs one of" (the entry comes up only if one of these is there too) or "Unless one of" (it doesn't come up if one of these is there).
- **Patterns**: regular expressions that bring the entry up like keywords do.
- **Stays for** N Messages after it went in (Sticky); **Rests for** N Messages after that before it can come up again (Cooldown); **Waits until** the Chat has N Messages (Delay).
- **Chance**: the percentage of the times it comes up that it actually goes in. The roll is fixed per Message, so Regenerate and reloads never flicker.
- **Brought in by other entries**: on by default, so an entry named in the text of an entry already chosen comes along, up to 3 steps deep; the author can switch it off per entry.
- **Group**: at most one entry of a group goes in per turn: the one already staying, else the one that came up most recently.

Lore stays where it is: in the trailing system message, under the ~1,500-token cap, so the cached prefix holds. Nothing is stored per Chat. Every timed effect is worked out again from the Chat's own Messages, so editing a Message, Regenerate, choosing a Reply version, Reset and Branch all carry the right Lore with no bookkeeping. The Memory drawer's Lore in play says why each entry is in, and lists the entries that came up but were left out, with the reason.

## User Stories

1. As an author, I want the extra trigger settings tucked behind a "More triggers" fold on each Lore card, so that a plain entry still looks like name, keywords and text on my phone.
2. As an author, I want the folded "More triggers" header to sum up what is set ("Stays 4 · 50% · Group: weather"), so that nothing hidden is a surprise.
3. As an author, I want every new setting to default to today's behaviour, so that my existing Lore works as before until I change it.
4. As an author, I want to give an entry second keywords that it also needs, so that "the Well" comes up only when it is night.
5. As an author, I want to give an entry second keywords that block it, so that "the festival" stays out when the story is about last year's.
6. As an author, I want second keywords to follow the same matching rules as keywords (any case, Latin at a word start, Thai anywhere), so that I learn one rule.
7. As an author, I want to write a pattern (a regular expression) that brings an entry up, so that one line covers every spelling or form.
8. As an author, I want a pattern that matches only a Character's lines (`^@Mira:`), so that an entry comes up when Mira speaks about something, not when anyone does.
9. As an author, I want a broken pattern refused when I type it, with the reason under the field, so that I never save an entry that silently never fires.
10. As an author, I want an entry to stay in for a number of Messages after it went in, so that the story keeps knowing about the place while it is there.
11. As an author, I want an entry to rest for a number of Messages after its stay, so that a detail I want to come back now and then doesn't take over.
12. As an author, I want an entry to wait until the Chat has a number of Messages, so that a twist's Lore stays out of the first exchanges.
13. As an author, I want Stays, Rests and Waits counted in Messages, each of my lines and each reply counting one, so that I can predict them.
14. As an author, I want to give an entry a chance below 100%, so that a rumour or a random encounter only sometimes comes in.
15. As a player, I want an entry's chance rolled once per Message and kept, so that Regenerate, choosing a Reply version or reloading never flips it in and out.
16. As a player, I want editing my Message to roll again, so that a new message is a new moment.
17. As an author, I want an entry named in the text of another chosen entry to come along, so that the valley's entry brings its ruler's entry.
18. As an author, I want that to go a few steps deep but not forever, so that one mention can't pull in my whole Lore.
19. As an author, I want to switch off "Brought in by other entries" on an entry, so that a common word in other entries' text doesn't drag it in.
20. As an author, I want to put entries in a group, so that only one version of the weather or the market goes in at a time.
21. As an author, I want the group to keep the entry that is already staying, so that the story doesn't swap between two versions mid-scene.
22. As an author, I want otherwise the most recently mentioned group member to win, with the card order breaking ties, so that the choice is predictable.
23. As an author, I want Always include entries to keep their place at the front of the cap, so that what matters every turn is never pushed out.
24. As an author, I want an entry that came up only through another entry to rank below the ones the story mentioned itself, so that the cap keeps what is closest.
25. As an author, I want a staying entry to rank just after Always include entries, so that a place I am in is not pushed out by a passing mention.
26. As an author, I want changes to these settings to apply to the whole Chat as if they had always been so, so that I never have to reset anything after tuning.
27. As a player, I want editing a Message to take back the Lore that Message brought in, so that Stays and Rests follow the story as it now stands.
28. As a player, I want Regenerate and choosing a Reply version to give the same Lore as the reply it replaces, so that only the reply changes.
29. As a player, I want a Branch to carry the same Lore at its last Message as the Chat it came from, so that the new path starts where the old one stood.
30. As a player, I want a Reset Chat to start with no entry staying or resting, so that a fresh start is fresh.
31. As a player, I want to see in the Memory drawer why each entry is in play ("came up: yurt, 2 Messages back", "stays 3 more Messages", "brought in by The Valley", "always"), so that I can tell which setting did it.
32. As a player, I want to see the entries that came up but were left out, and why ("resting, 4 more Messages", "waits 6 more Messages", "lost its 30% chance", "the group went to Dry season", "no room", "needs one of: night"), so that I can fix an entry that never shows.
33. As a player, I want that left-out list folded away under the in-play list, so that the drawer stays short.
34. As a player, I want the turn to stay as fast and as cheap as now, so that none of this needs a model call.
35. As a player, I want Suggested replies, Write for me and Snapshots to use the same Lore selection as a turn at that point, so that suggestions, drafted replies and pictures fit.
36. As a player, I want the Lore block to stay in the trailing system message under the same cap, so that long Chats stay cached and the prompt never swells.
37. As an author, I want Duplicate Story to copy every setting, so that a copy behaves the same.
38. As an author, I want the Story assistant to keep my trigger settings when it edits an entry's name, keywords or text, so that asking it for help never resets them.
39. As an author, I want the Story assistant to see my trigger settings, so that its advice about an entry takes them into account.
40. As an author, I want the Story assistant and AI drafting to leave the new settings at their defaults on entries they add, so that only I tune them.
41. As an author, I want the new settings to survive a backup and restore, so that nothing is lost.
42. As an author on a wide screen, I want the same fold, so that the card reads the same everywhere.

## Implementation Decisions

### The Lore entry

New fields, each with a default that keeps today's behaviour:

- `secondaryKeywords` (list of text, at most 20, each at most 100 characters, cleaned like `keywords`: trimmed, blanks and repeats dropped), default empty.
- `secondaryMode`, `alsoNeeds` or `unless`, default `alsoNeeds`. Ignored while `secondaryKeywords` is empty.
- `patterns` (list of text, at most 10, each at most 200 characters, trimmed, blanks dropped), default empty. Each is the source of a regular expression, without slashes or flags.
- `sticky`, `cooldown`, `delay`: whole numbers 0–50, default 0 (off). Counted in Messages.
- `chance`: whole number 0–100, default 100. 100 means no roll.
- `recursable`: boolean, default true ("Brought in by other entries").
- `group`: text, at most 60 characters, trimmed, default empty (no group). Compared ignoring case.

Recursion is on by default, so after this ships an entry named in another chosen entry's text comes along where it didn't before. That is the change the decision asked for; an author who wants the old behaviour switches the opt-out off on that entry.

Each ticket adds its own columns to `lore_entry` in its own migration, with these defaults, so existing rows keep their behaviour. The Story response's `lore` entries, the authoring DTO (`POST`/`PATCH .../lore`) and Duplicate Story carry every new field.

New error `InvalidLorePatternError` (422, Story authoring domain: the next free `422.003.0NN` when implemented, since other specs written alongside this one add codes there too; listed in `docs/error-codes.md`): a pattern that does not compile with the flags below, naming the pattern and the engine's reason. Number ranges and list sizes are ordinary validation (`400.000.000`).

### Matching

- **Keywords** keep today's rule: the name plus keywords, ignoring case; a trigger starting with a Latin letter or digit must start a word; any other trigger, Thai included, matches anywhere. No case or whole-word toggles.
- **Patterns** are compiled with case-insensitive, Unicode and multi-line flags (`^` and `$` match at line ends), and tested against each scanned text as stored: the user's Messages as written, AI Messages as their `@Name:` text, so `^@Mira:.*silver` finds Mira's lines. A pattern that matches counts as the trigger that came up (its source is what Lore in play shows).
- **Second keywords** use the keyword rule. They are looked for in everything the selection reads at that point: the scanned Messages, any extra scan text (a Snapshot's hint), and the text of the entries already chosen. `alsoNeeds`: at least one must be there. `unless`: none may be there. They only filter an entry whose name, keyword or pattern came up; they never bring one up.
- Node's regular expressions have no timeout. The limits above (10 patterns of 200 characters, over a scan of at most 6 Messages plus a hint and chosen entries' text) keep the cost small; the risk of a pathological pattern is the author's own, in a single-user app, and is accepted.

### The point, and the scan

Lore is chosen for a **point** in a Chat: the place where a new AI Message goes. A point's number is how many Messages come before it, the Opening included.

- A turn's point is its reply's place. On a send or Retry, the user's new Message is among the Messages before it.
- Lore in play, Suggested replies and Write for me use the point after the newest Message, as a Continue would (as today for Lore in play and Suggested replies).
- A Snapshot uses the point after the Message it shows, with its hint as extra scan text.

The scan at a point is today's turn window: when the Message just before the point is the user's, that Message plus the 4 before it; otherwise the 4 Messages before the point. Newest first. Every earlier AI Message of the Chat, except the Opening, sits at a past point and its scan is found the same way from the stored Messages; so the selection at any past point can be worked out again.

A Snapshot keeps its own, wider scan, as today: its hint, then the 6 Messages ending with the one it shows (`SNAPSHOT_RECENT_MESSAGES`), newest first. So the entry point takes the scan length as an option, defaulting to the turn window; the Snapshot writer passes 6. Only the Snapshot's own point uses it: the staying and resting state at that point still comes from replaying the past points with the turn window, as for every caller.

### Selection at a point

The Lore module gets one entry point that the turn, Lore in play, Suggested replies, Write for me and the Snapshot writer all call: given the Story's entries, the Chat's Messages up to the point (oldest first, as the prompts see them), the point, optional extra scan text and an optional scan length, it answers which entries go in, each with a reason, and which came up but were left out, each with a reason. It stays pure (no database, no model call). The turn, Suggested replies and Write for me prompt builders receive the chosen entries instead of choosing them, so the selection runs once per call. Write for me does not exist yet ([Spec: Write for me](../write-for-me/spec.md)); whichever of the two lands second moves it onto this entry point, with a test (integration: "Write for me's inputs").

The order of the block, which is also the order entries take their room under the cap:

1. **Always include** entries, by position.
2. **Staying** entries (in from an earlier point, within their Sticky), by the point they went in, newest first, then position.
3. Entries that **came up** in the scan, by recency (the newest scanned text first), then position.
4. Entries **brought in** by other entries, by step, then position.

Each candidate passes these checks in order; the first that fails is its left-out reason:

1. **Condition**: its second keywords (skipped for Always include and staying entries).
2. **Waits** (Delay): the point is at least `delay`.
3. **Rests** (Cooldown): it is not within `cooldown` Messages after its last stay ended.
4. **Chance**: the roll (skipped for staying entries, which already won theirs).
5. **Group**: no earlier entry in this order has taken its group this point.
6. **Room**: it fits under the cap; one that doesn't is skipped and the rest are still tried (as today).

Entries with blank text are never candidates (as today). Sticky has no effect on an Always include entry; Waits, Rests and Chance do apply to one.

### Recursion

After the Always, staying and came-up entries are chosen, the text of the chosen entries is searched for the names, keywords and patterns of entries not yet chosen whose `recursable` is true. Those found are candidates of step 1, checked as above against the room left; the text of the step's chosen entries is searched for step 2, and so on, at most **3 steps**. An entry's reason names the first chosen entry whose text brought it in. An entry that is not recursable can still come up from the scan or be Always included.

### Timed effects, worked out again every time

Nothing about Lore is stored per Chat. The state Sticky and Cooldown need is found by replaying the selection over the Chat's past points:

- An entry **goes in** at point q when it is chosen there by Always, a trigger or recursion, and actually fits. Only going in starts a stay; a candidate left out for any reason starts nothing.
- It **stays** at every point p with q < p ≤ q + `sticky`, whether or not it is mentioned; being mentioned again during a stay does not extend it.
- It **rests** at every point p with q + `sticky` < p ≤ q + `sticky` + `cooldown`; it can't come in by any route then.
- It **waits** at every point p < `delay`.

The replay runs the full selection (recursion, chance, groups, cap) at each past point of a window, oldest first, starting with nothing staying or resting, and carries only where each entry went in. The window is the last 2 × (the longest `sticky` + `cooldown` among the Story's entries) Messages, at most 200; with no entry using Sticky or Cooldown there is no replay and a selection reads only its own scan. This is a definition, not an approximation the user can see: every caller works out the same answer for the same Messages.

Consequences, all without code of their own:

- Editing a Message deletes the later ones, so whatever they brought in is gone.
- Regenerate and choosing a Reply version keep the point and the Messages before it, so the Lore is the same.
- Reset leaves only the Opening.
- A Branch has the same Messages up to its last one, so the same Lore.
- Changing an entry's settings applies to the whole Chat as if they had always been so. The editor says this under the fold.

### Chance

The roll for an entry at a point is a number in [0, 100) taken from a SHA-256 hash of the entry's id, the point, and the text of the Message just before the point; the entry passes when the number is below `chance`. So the same point over the same Messages always rolls the same (Regenerate, Reply versions, reloads, Lore in play, Suggested replies), a Branch rolls as its parent did, and an edited Message rolls again. A staying entry is not rolled again during its stay.

### Groups

At most one entry per group goes in at a point: the first of the group in the order above that passes the earlier checks. So a staying member keeps the group; otherwise the member that came up most recently wins, position breaking ties, and an Always include member beats them all. The others are left out with the winner's name. The winner then takes its chance at the room like any entry; if it doesn't fit, no member of that group goes in at that point. No weights and no random pick between members: Chance already gives randomness where an author wants it.

### Prompt placement and budget

Unchanged: the chosen entries go at the start of the trailing system message, in the order above, under `# Lore`; no block when none is chosen; the system message is identical with and without Lore; the ~1,500-token cap; the Story so far reserve stays the smaller of the cap and the Story's whole sendable Lore.

Lore is the first block of the trailing message in the order every spec shares (integration: "The trailing system message of a turn"): **Lore → Documents → Author's note → Where things stand → Nudge → the final instruction** for a turn, and **Lore → Documents → Author's note → their own instruction** for Suggested replies and Write for me. Nothing in this spec moves the blocks after Lore.

### Lore in play

`GET /api/stories/:storyId/chats/:chatId/lore` answers the selection at the point after the newest Message, with reasons. The shape (a decision, so given here):

```ts
type InPlayReason =
    | { kind: 'always' }
    | { kind: 'cameUp'; trigger: string; messagesAgo: number } // 0 = the newest scanned Message
    | { kind: 'staying'; messagesLeft: number }
    | { kind: 'broughtIn'; byName: string };

type LeftOutReason =
    | { kind: 'condition'; mode: 'alsoNeeds' | 'unless'; keywords: string[] }
    | { kind: 'waiting'; messagesLeft: number }
    | { kind: 'resting'; messagesLeft: number }
    | { kind: 'chance'; chance: number }
    | { kind: 'group'; group: string; winner: string }
    | { kind: 'noRoom' };

interface LoreInPlay {
    entries: { id: number; name: string; alwaysOn: boolean; chance: number; why: InPlayReason }[];
    leftOut: { id: number; name: string; why: LeftOutReason }[];
}
```

`leftOut` lists the entries that were candidates at this point (Always, staying, came up or brought in) but didn't go in. An entry that never came up is in neither list.

The Memory drawer's Lore in play card shows each entry in play with its reason in plain words, and a chance below 100% beside it ("· 40% chance"). Under it, a "Came up but left out (n)" fold, closed by default, lists the left-out entries the same way. Read-only, as now.

### The Lore card in the editor

- Name, Keywords, Text and Include stay as they are, in that order.
- Below them, a **More triggers** fold, closed by default on every screen size. Its open state is a per-device preference kept in the same store as the card folds (the web's fold store). That store keeps only the keys of folds that are not in their starting state, as one list; every fold so far starts unfolded, so a key there means "folded". More triggers starts folded, so its key is `loreMoreOpen:<id>` and means the opposite: opening the fold adds it, closing removes it, and a device with nothing stored shows every More triggers fold closed. The store's comment lists the new key and says it records the open state; the fold's title reads the key's presence as open (an option on the shared fold title, so the card folds are untouched).
- Its header, folded and open alike, reads "More triggers" and then the **summary**: every non-default setting, in this order, joined by " · ":
  - "Also needs: night, storm" or "Unless: last year" (the second keywords, comma-separated);
  - "1 pattern" or "3 patterns";
  - "Stays 4", "Rests 6", "Waits 10";
  - "50%";
  - "Group: weather";
  - "Not from other entries".

  Every setting at once reads "Also needs: night · 1 pattern · Stays 4 · Rests 6 · Waits 10 · 50% · Group: weather · Not from other entries". With every setting at its default the summary is "None". These exact words are the summary everywhere: the fold's header, each ticket that adds a setting, and the Story assistant's rendered Story.
- Inside, fields in this order:
  - "Second keywords" (comma-separated, like Keywords) with a segmented "Also needs one of" / "Unless one of";
  - "Patterns" (one per line), with a hint that they are regular expressions matched ignoring case;
  - "Stays for … Messages", "Rests for … Messages", "Waits until the Chat has … Messages" (number fields, 0 = off), with one hint that each of your lines and each reply counts one;
  - "Chance … %";
  - "Group";
  - "Brought in by other entries" (Yes / No).
- One line at the foot: changes apply to the whole Chat as if they had always been so.
- Stays for is hidden while Include is Always, since it has no effect there.
- Every field autosaves like the rest of the card. A pattern the API refuses shows its error under the Patterns field and stays as typed; the fold opens when one of its fields has an error.
- The fields stay in the page while folded (hidden), like the card folds, so autosave keeps working.

### Story assistant and drafting

- The change set's `lore` target is unchanged: `set` of name, keywords (the primary list only), text and alwaysOn; `add` with `{ name, keywords, text, alwaysOn }`; `remove`. A `set` of any new field stays an invalid change set; the assistant prompt says trigger settings are set in the editor.
- `set` and `add` never touch the new fields: a set keeps them, an add gets the defaults.
- The rendered Story the assistant reads shows, under each entry with a non-default setting, one line "More triggers: <summary>" in the exact words of the fold's summary, so its advice takes them into account.
- The Story assistant and AI field rewrites read the same rendered Story (the drafting module's `renderStory`). So the line is behind a `renderStory` option that only the assistant turns on; a field rewrite's prompt stays byte-for-byte as today.
- Drafting is unchanged: draft entries get the defaults.

### Model calls

None. Selection, replay, rolls and Lore in play are pure computation in the API. No credit is spent and no usage is logged by anything in this spec.

## Testing Decisions

- Test only external behaviour: what the selection answers for given entries and Messages, the prompt the fake gateway receives, the API's answers, and what the editor and the Memory drawer show.
- **Pure tests on the selection** (prior art: the "matching and selection (pure)" block of the API's `test/lore.spec.ts`), driven through the one entry point with plain Messages:
  - default settings choose exactly what today's selection chose, except entries brought in by recursion;
  - the scan at a point after a user Message (it plus the 4 before) and after an AI Message (the 4 before); the Snapshot's scan of its hint and the 6 Messages ending with the one it shows;
  - second keywords in both modes, found in a scanned Message and in a chosen entry's text; Thai second keywords anywhere;
  - a pattern brings an entry up; `^@Mira:` matches only Mira's lines; case and multi-line flags;
  - recursion: one step, three steps, no fourth; the opt-out; the reason names the bringer; brought-in entries rank after came-up ones under the cap;
  - Sticky: in for exactly `sticky` Messages after going in, not extended by a mention, not started by a candidate that didn't fit;
  - Cooldown after a stay and without one; Delay at the boundary point;
  - the replay window: same answer whether the Chat is long or trimmed to the window;
  - Chance: the same Messages give the same answer every call; a different text before the point can change it; a staying entry is not rolled again;
  - Groups: staying member wins, then recency, then position, Always over all; the winner not fitting leaves the group empty;
  - the left-out list and each reason.
- **The pure prompt tests change shape.** Today's "turn and Suggested replies prompts (pure)" block in `test/lore.spec.ts` hands every entry to `buildTurnPrompt` and `buildSuggestionsPrompt` and asserts which are chosen. Once the builders receive chosen entries, those tests are rewritten: what is chosen is asserted through the selection entry point, and the prompt tests hand in chosen entries and assert only the block's place and the unchanged system message. The API-level prompt tests (turn, Suggested replies, Snapshot, Story so far) pass unchanged.
- **API tests** through the fake gateway (prior art: the "Lore: the API" block of `test/lore.spec.ts`, `test/regenerate.spec.ts`, `test/reply-versions.spec.ts`, `test/story-duplicate.spec.ts`):
  - CRUD carries every new field and validates ranges; a broken pattern is `InvalidLorePatternError` and nothing is saved;
  - a Sticky entry is in the trailing system message of the next turns and out after them, the system message identical throughout;
  - editing the Message that brought it in takes the stay back on the next turn;
  - Regenerate and choosing a Reply version give the same Lore block as the replaced reply;
  - a Chance entry gives the same block on Regenerate;
  - Lore in play answers reasons and the left-out list;
  - Suggested replies (and Write for me, once it exists) get the same selection as Lore in play; the Snapshot writer gets the selection at its point over its hint and 6-Message scan;
  - Duplicate copies every new field;
  - the assistant's `set` keeps the new fields; a `set` of a new field is an invalid change set; the assistant's rendered Story shows the summary line, and a field rewrite's prompt does not.
  - Once Branch exists ([Spec: Branch](../branch/spec.md)), a Branch's Lore in play equals its parent's at that Message.
- **e2e (Playwright, 390px)** (prior art: `apps/web/e2e/lore.spec.ts`, `e2e/memory.spec.ts`):
  - the More triggers fold is closed on a new card and on a device with nothing stored; opening it, setting Stays for 4 and a group autosaves and survives a reload, the open state survives too, and the header reads "More triggers" with "Stays 4 · Group: weather";
  - a broken pattern shows the error under Patterns;
  - after a turn that mentions an entry, the Memory drawer says "came up" with the keyword; a Sticky entry later says "stays"; an entry that lost to its group is in the left-out fold.

## Out of Scope

- Insertion position (before/after Character, at depth, around the Author's note): Lore stays in the trailing system message so the cached prefix holds.
- Case-sensitive and whole-word toggles; the word-start rule stays.
- Per-entry scan depth, Min Activations, a configurable recursion depth, "prevent further recursion" and "delay until recursion".
- "And all" / "Not all" second-keyword modes, and second patterns.
- Group weights, several groups per entry, group scoring and "prioritize inclusion".
- A per-Story or per-Chat Lore budget other than the fixed cap; storing timed state per Chat.
- The Story assistant or drafting writing trigger settings.
- Character filters (an entry only for some Characters); Lore stays common knowledge.

## Further Notes

- The decision (2026-11-08) made every World Info gap a "do" and left the form to the planner. The forms chosen here: two second-keyword modes; patterns as their own field so commas never need escaping; ST's non-refreshing Sticky and Cooldown semantics, so values imported from a Character card mean what they meant there (see [Character cards](../character-cards/spec.md), whose last ticket maps them); a fixed recursion depth of 3; groups decided by order, not weight.
- Stateless replay is chosen over per-Chat state because every rollback the app has (edit, Regenerate, Reply versions, Reset, and the coming Branch) already works by deleting or copying Messages; state derived from Messages follows all of them for free, where stored state would need undoing in each.
- Open question: should Lore in play also show an "Always include" entry that rested or waited? Recommended: yes, in the left-out list, which the design already does since Always entries are candidates.
- Open question: is 50 the right ceiling for Sticky, Cooldown and Delay? Recommended: yes; cards rarely use more than 10, and it bounds the replay at 200 Messages.
- Glossary: no new term is needed; "Stays for", "Rests for", "Waits until", "Chance", "Group", "Second keywords", "Patterns" and "More triggers" are UI labels on a Lore entry. CONTEXT.md's Lore definition already describes staying entries and entries brought in by other entries.

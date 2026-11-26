# Spec: The Story so far writer skips the story's start

Status: ready-for-human
Builds on: [Spec: Story so far](../story-so-far/spec.md) (how and when it is written, the output guard), [Spec: The Story so far writer overruns its length](../story-so-far-length/spec.md) (the shorter second try, deployed 2026-11-25 as 5c10f01), [Spec: Long-term memory eval](../long-term-memory-eval/spec.md) (Layer 4, the account scenes)

Written 2026-11-26. **No way to mend it is chosen here.** This sets out what was seen, the ways open, and what each costs, for the user to choose. Nothing in the app is changed.

## Problem Statement

The Story so far is the storyteller's only record of the parts of a Chat the turn prompt no longer sends word for word. It is meant to tell everything from the first Message to the last.

On live, Chat 4's Story so far was rewritten on 2026-11-26 at 02:04 UTC to cover its first 363 Messages. The writer answered on its first try, was not cut off, and the output guard stored it. It is 116 words long and tells only the last scene: an afternoon in the herb garden, the Empress talk, Odile's question before the moonrise festival. Nothing of the 360 or so Messages before that scene is in it: not how the story began (Rin hiding her tails and pulling Ines behind a broken pillar to wait out the torches), not any event in between.

Until the next update, the storyteller reads that one scene as "everything that has happened". The Account it replaced (349 Messages, 502 tokens) was overwritten, so it cannot be compared.

## What was seen (read-only, 2026-11-26)

| Fact | Where from |
|---|---|
| Live runs 5c10f01 | `/srv/storytell/app/COMMIT` |
| Since the deploy, 2 updates, both in Chat 4, both stored on the first try; no cut-off, no second try, no failure | API log, `usage_record` (`story_summary` rows 6829 and 6899) |
| Update of 02:04: 93,539 prompt tokens (the whole Chat), 152 completion tokens, $0.0084 | `usage_record` 6899 |
| Stored account: 116 words, covers through Message 362, `story_so_far_by` = ai, no user corrections | `chat` row 4 |
| The first-try prompt already asks for "everything that has happened so far", in order, at most 500 words | `story-so-far-prompt.ts` |
| The output guard refuses only an answer cut off at the cap, or one that opens with a speaker's tag | `storySoFarRejection` |

So this is the **first** try's own behaviour, not the shorter second try's; the clause "still from the beginning of the story" only rides on the second try.

## Unknowns

1. **How often.** Every past update's `completion_tokens` is in `usage_record`. Counting updates whose answer is short for the Chat's length (for example under 250 tokens past 100 Messages) gives a free, read-only upper bound. Whether each short one skipped the start cannot be told, because old accounts are overwritten.
2. **Whether the eval sees it.** Layer 4 checked that accounts open at the start for second tries (6 of 6 with the clause). Whether its first tries ever collapse to the last scene, on the eval's Harrowmere Chat of up to 30 chapters, is not in the reports as a separate count. The saved reports can be re-read for it without spending.
3. **Whether it is the model or the input.** The input here was 93,539 tokens; the eval's longest story is shorter. A first try on a story this long was not measured.

## Unknowns checked (2026-11-26, read-only, nothing spent)

### 1. How often, on live

**Every Story so far stored on live today skips the start.** Three Chats have one:

| Chat | Covers | Words | Its first sentence | How the Chat really began |
|---|---|---|---|---|
| 1 | 461 Messages (2026-11-09) | 265 | a scene at Nara's stall long into the story | Petch first seeing her and wanting to ask her name |
| 3 | 837 Messages (2026-11-19) | 546 | "Three days have passed since the binding dawn", on the road south, **in the first person** ("beside me") | the first taste of the famous milk |
| 4 | 378 Messages (2026-11-26 02:57, an update after the one above) | 235 | Rin asleep in Odile's lap in the herb garden | Rin hiding with Ines from the torches |

Chat 3's account also breaks the prompt's "third person, past tense" rule. Chat 4's newest account (301 tokens) still opens in the herb garden: the next update did not mend it.

From `usage_record` (all 133 `story_summary` rows since 2026-11-05): stored answers under about 260 tokens once the input passed 40,000 tokens happened **13 times** in Chats 1, 3 and 4, plus one of **5 tokens** in Chat 2 (2026-11-13 10:01, stored right after an answer refused for going on with the story) and one of 57 tokens (2026-11-14). These are an upper bound for "skipped the start": old accounts are overwritten, so each one cannot be read. Long answers can skip it too (Chat 3's is 546 words).

So it is not rare and not new: it was there before 5c10f01, and the guard has never caught it.

### 2. Whether the eval sees it

The seven saved memory reports hold 59 accounts that were stored (or would have been). **58 open at the start** ("Corin arrived in Harrowmere..."). One does not: a shorter second try at 24 chapters, opening "Corin measured the mill stream's flow". No first try ever collapsed to the last scene.

So the eval does not reproduce the live failure. Its Chat is much shorter: a whole account run there cost about $0.009 for 15 or more calls, while one live call on Chat 4 costs about $0.008. The eval reports also do not record which model wrote the accounts.

### 3. The model or the input

Still open. What the two checks show: on short input the writer starts at the start almost every time; on live input of 40,000 to 150,000 tokens it often tells only the latest stretch. Live Chats also differ in kind (mixed Thai and English lines, explicit scenes, first-person user lines), so length alone is not proven to be the cause. A free check is not left; finding out needs a paid run of the writer on a long input.

## Ways open

| Way | What it does | Prompt changes? | Cost | What it does not do |
|---|---|---|---|---|
| **A. Keep the better one** | Before storing, compare the new account's word count with the stored one. If it is under, say, 40% of it while the Chat has grown, keep the old account, log it, and ask once more as now. | No | None | Does not help a Chat whose first account was already bad |
| **B. Length floor** | Refuse an account under a floor that grows with the Chat (for example 200 words once past 100 Messages) and ask once more, like a cut-off. | No | One more call when it fires (about $0.008 on Chat 4) | A long account can still skip the start |
| **C. Ask for the start on the first try too** | Add to the first-try ask: "from the beginning of the story through to the last of the Messages". | Yes: needs an eval run of that commit for `vm:deploy`, or `--unmeasured` | One eval run | Asking does not prove it is done; the first try already asks for "everything" |
| **D. Check the opening** | Ask the writer to open with one line on how the story began, and refuse an account whose first sentence names none of the people or places in the first few Messages. | Yes | As C | Name matching is loose |
| **E. A grader call** | A second model call reads the account and the first Messages and says whether it starts at the start. | No | One more background call each update | Spends on every update |

**After the unknowns were checked:** A alone does little, because every stored account on live already skips the start, so "keep the old one" keeps a bad one. B would not catch Chat 3 (546 words). Only C, D or E aim at the start itself; any of them needs a paid measurement on a long input, which the eval does not have yet.

A and B change only the guard and the service, so the deploy gate is not touched. A and B together cover both the "shrank from a good one" case and the "too short for the Chat" case. C or D is the only way that asks the model differently.

## Plan: a long-input eval (written 2026-11-26, not built, nothing spent)

**Question it answers:** on input the size live sends (30,000 to 150,000 tokens), how often does the writer's account start at the start, and does C or D change that? The current eval cannot say, because its longest Chat is about a tenth of that size.

### Input: copies of the live Chats, kept off git

The live failure has not been seen on a made-up Chat, so the first round uses the real ones.

- A read-only export script copies the covered Messages of Chats 1, 3 and 4 over SSH (`message` plus `message_part`, in order, each with the speaker tag the app gives it, and the Chat's cast and the user's identity name) into `.data/eval-inputs/chat-<id>.json`. `.data/` is git-ignored. Nothing is written on the VM.
- Text goes only to the provider the app already sends it to for this job (the background model on DeepInfra). Reports keep the checks and the first 300 characters of each account, never the Messages.
- Input sizes, from the live `usage_record`: Chat 4 cut at about 30,000, 56,000 and 97,000 tokens (Messages 0 to 150, 0 to 260, 0 to 362); Chat 1 whole at about 116,000; Chat 3 whole at about 150,000. Five inputs.
- A made-up long Chat that can be committed (Harrowmere told as prose replies) is left for later. It would become the regression check once a way is chosen.

### Arms (prompt variants live in the eval code only until a way is chosen)

| Arm | The last line of the ask |
|---|---|
| now | "Write the account now." (as live) |
| C | "Write the account now, from the beginning of the story through to the last of the Messages." |
| D | as C, plus "Open with one sentence on how the story began." |

Everything else is the app's own: `storySoFarPromptMessages`, the background model and samplers, the 2,000-token cap, `storySoFarRejection`, and the shorter second try after a cut-off.

### Checks (all by code, no grader)

For each input, a short list written by hand from reading that Chat, shown to the user to confirm before any run:

1. **Opens at the start:** the first two sentences match a telltale of the Chat's first scene (Chat 4: Ines, the pillar, the torches).
2. **Covers the whole Chat:** one telltale for each quarter of the Messages; the score is the quarters matched, 0 to 4. This is what catches a long account that skips the start (Chat 3's 546 words).
3. **Third person:** no "I", "me", "my", "we", "our" outside quotation marks.
4. **Words**, whether it came from a second try, and whether the app would have refused it.

### Size and cost (DeepSeek V4 Flash on DeepInfra, about $0.09 per million input tokens, from the live rows)

| Round | Calls | Cost | Answers |
|---|---|---|---|
| 1. "now" only, 5 inputs x 3 samples | 15, plus any second tries | about $0.15 | Does the eval reproduce the live failure? If not, stop: the cause is not the input. |
| 2. C and D, same inputs and samples | 30, plus second tries | about $0.30 | Which one fixes it, and at what cost to the four events and the length |

Cap: the existing $0.50 per run. Round 2 only after round 1 is read with the user.

### Build (no spend)

- `--memory account-long` in `npm run eval:live`, reading `.data/eval-inputs/`; it refuses to run if an input file is missing, and spends only with `--spend`.
- Tests with the scripted router, as for the other layers: each check on made-up accounts (one that starts at the start, one that opens mid-story, one in the first person), the arm's ask line, the second try, and the cap.
- The export script is tested on a made-up row set; its first real run needs the user's OK, as it copies private Chats to the PC.

### Built (2026-11-26, approval 1: no spend, no live access)

- `apps/api/test/live/eval-long-account.ts`: the copy turned into the writer's Messages as the app's update does (user lines under the name written as, replies as `Story` with parts joined by `partsToText`); the plan check; the three arms; the four checks; the run with the app's cap, samplers, guard and shorter second try; the scorecard; the gate.
- `npm run eval:live -- --memory account-long [c] [d] [--samples N] --spend`: "now" alone unless arms are named; three samples unless told. Without `--spend` it says the calls and cost from the real inputs; with the plan or a copy missing it refuses before anything is sent.
- `scripts/export-chat.mjs <ids>` (repo root): one `BEGIN READ ONLY; SELECT ...; ROLLBACK;` per Chat over ssh (settings from `.env.vm`), saved as `.data/eval-inputs/chat-<id>.json`; prints only counts.
- The plan file is `.data/eval-inputs/long-account.json`: `{ "inputs": [{ "name", "chat", "through"?, "start", "quarters": [4 patterns] }] }`, patterns case-insensitive. It is written after the export, from reading the Chats, and shown to the user before round 1.
- The arms change only the first try's last line. The second try after a cut-off is the app's in every arm.
- Reports land in `.data/eval-runs/long-account-*.json/.md` and keep each account's first 300 characters only.
- Tests: `apps/api/test/eval-long-account.spec.ts`, 20, on a made-up Chat and scripted answers. Three of them were seen to fail with the opening check, the cut and the second try broken on purpose. Typecheck clean; the memory eval, Story so far and vm-deploy suites still pass. The gate was run without `--spend`: it refused for the missing plan, and sent nothing.
- Not run: the export SQL against the real database (approval 2). Its table and column names were taken from the entities.

### Exported, and the plan of checks (2026-11-26, approval 2)

- `node scripts/export-chat.mjs 1 3 4` ran on its first try: Chat 1, 474 Messages; Chat 3, 864; Chat 4, 398. Saved under `.data/eval-inputs/` (git-ignored, checked).
- The cuts follow what live's updates covered: Chat 4 at 150, 260 and 363 Messages; Chat 1 at 462; Chat 3 at 838. (Chats 1 and 3 are two plays of the same Story.)
- The telltales in `.data/eval-inputs/long-account.json` were picked by skimming each Chat and counting candidate words per quarter. Each was kept only where it is frequent in its own quarter and rare in the others. Where none was clean, a few leak into a later quarter; this is noted here, so a quarter count can run a little high, never low.

| Input | Start (first two sentences) | Q1 | Q2 | Q3 | Q4 |
|---|---|---|---|---|---|
| chat-4-150 | waking in the forest, torches, pillar, hounds, bandage | torches, pillar, hounds | Colette, cottage | the letter, Riders | Severine, Mireille |
| chat-4-260 | as above | Colette, cottage, torches | the letter | inn, Severine, Mireille (leaks into Q4) | horse, north road, comb |
| chat-4-363 | as above | Colette, cottage, torches | the letter | inn, horse, north road | Ysolde, throne, Moon Tree, Odile |
| chat-1-462 | the market, first taste, never seen a cow | third cup, in love, Morra's tent | jug stand, cuffs, cradle, songs | Edran, council, palace, Mirelle (leaks) | the ox, Betha, wagon, Von Varenhall |
| chat-3-838 | as Chat 1 | clerk, metalworker, Lord | spice merchant | Mirelle, the map, Alice, Tessa, Eira | Erev, Sarel, Veris |

- Calibrated on the accounts stored on live today (read-only, not kept): every one fails the start check. Quarters told: Chat 1, 3 of 4 (all but Q1); Chat 3, 1 of 4; Chat 4, 1 of 4 at each cut. So the checks see the live failure.
- The gate without `--spend`: 15 calls, about $0.142, at most $0.762 if every call ran to its 2,000-token limit. The $0.50 cap stops the run before any call that could pass it.

### Round 1 (2026-11-26, arm "now", 3 samples, $0.055 spent of the $0.142 estimated)

Report: `.data/eval-runs/long-account-2026-11-26T04-56-16-295Z.json/.md`. Input sizes as the writer saw them: 39,146 / 67,531 / 94,192 / 115,398 / 151,662 tokens.

**The live failure is reproduced.** On these inputs the writer often tells only a late scene: "Ines's held stillness inside the spell...", "Ines is on watch outside Rin's door..." (70 words), "The Empress rose from her throne unaided...", "Nara invited Tavri into her tent last night...". One answer went on with the story and was refused; one was cut off and stored from the shorter second try. No first-person accounts. Words 70 to 423, none near the 500 asked.

**The start check undercounted.** The code check said 4 of 14 stored accounts open at the start. Reading the 300-character openings by hand gives **7 of 14**:

| Input | By code | By hand (from the openings) |
|---|---|---|
| chat-4-150 (39k) | 1 of 3 | 1 of 3 |
| chat-4-260 (68k) | 2 of 3 | 2 of 3 |
| chat-4-363 (94k) | 0 of 3 | 1 of 3 ("begins with a chance meeting in the Moonwood... shadow-wolves... Rin, newly arrived") |
| chat-1-462 (115k) | 1 of 2 stored | 2 of 2 ("walked into the Horned Crescent camp... a free cup of milk") |
| chat-3-838 (152k) | 0 of 3 | 1 of 3 ("A season ago, Petch... stopped at the Crescent stall") |

The telltales were taken from the Chats' own words, and the accounts paraphrase them ("shadow-wolves" for "hounds", "walked into the camp" for "arrived"). The calibration before the run used only accounts known to be bad, so it could not show this. The quarter counts likely undercount the same way, and cannot be re-scored: the report keeps 300 characters only.

**What round 1 answers:** yes, the input is enough to bring the failure out; about half the first tries skip the start, at every size from 39k tokens up, with no clear growth with length in three samples each. What it does not answer: the coverage of later quarters, and anything about C or D.

### Checks mended (2026-11-26, no spend)

- **A second fault was found while mending:** six coverage patterns were written in the plan as `"\binn\b"`, which JSON reads as a backspace, not a word boundary. They matched nothing in round 1 (`inn`, `mare`, `comb`, `ox`, `Lord`, `map`), so some quarter counts were low for that reason too. They now read `\b`, and the plan check refuses any pattern holding a control character.
- **The start pattern must now be shown to work both ways:** each input carries `startExamples`, openings judged by hand (good: they open at the story's start; bad: they do not), and the plan is refused unless the start pattern passes every good one and fails every bad one. The examples are round 1's own openings plus the live accounts. The start patterns were widened with the words accounts used ("shadow-wolves", "Moonwood", "newly arrived", "walked into", "wandered", "traveller", "stopped at").
- Quarter patterns widened where the counts allowed it without leaking (wolves and Moonwood for Chat 4's first quarter; curse and healed for its last; carving for Chat 1's second; spice and Tarvi for Chat 3).
- Reports now keep each account whole (under the git-ignored `.data/`), and `npm run eval:live -- --memory account-long --rescore last` scores a saved report again by the plan as it is now, sending nothing.
- Round 1 scored again on its openings with the mended start patterns: 7 of 14, the same as by hand. That agreement is by construction (its openings are the examples); round 2's answers are the real test, and can be read whole to check.
- Tests: 23 pass (the new guards seen failing when broken on purpose); typecheck clean.

### Before round 2 (proposed; 1 and 2 done above)

1. Widen each telltale with the paraphrases round 1 showed, and check every pattern on known-good openings as well as known-bad ones (round 1's own, judged by hand above).
2. Keep each account's full text in the local report (`.data/` is git-ignored), so a check can be re-scored without paying again. The 300-character limit was meant to keep the Chats' text out of reports; the account is the model's summary, already stored on live.
3. Run "now", C and D together, 3 samples each: 45 calls; at round 1's real cost about $0.17.

### Round 2 (2026-11-26, arms now, C, D, 3 samples each, $0.095 spent)

Report: `.data/eval-runs/long-account-2026-11-26T05-13-04-820Z.json/.md` (accounts whole). Every opening was also read by hand.

| Arm | Opens at the start, by hand (by code) | Told in the first or second person | Second tries (cut off) | Words |
|---|---|---|---|---|
| now | **9 of 15** (9) | 0 | 1 | 150 to 798 |
| C | **15 of 15** (14) | **3** ("I wake in moonlight...", "I will write the account... You were Rin", "I abandoned lordship...") | **4** | 188 to 1,321 |
| D | **15 of 15** (15) | 0 | 0 | 158 to 1,196 |

- By input, "now" opened at the start: 1/3, 3/3, 1/3, 3/3, 1/3 (Chat 4 at 150, 260, 363; Chat 1; Chat 3). Again no clear growth with length.
- The code's start check disagreed with reading by hand on 3 of 45: one late scene passed because it mentioned "the moss" (Chat 4, "now"); one account that opened at the start in the second person, after a preface, failed (C); one account that copied the Chat's first paragraph word for word failed ("now"). The totals happened to match for "now".
- Coverage of the later quarters is higher with C and D on Chat 4 and Chat 1 (about 3 to 3.7 of 4, against 1.7 to 4 for "now"). On Chat 3 the quarter checks are not reliable: its last quarter's telltale "Tarvi" is a spelling the accounts do not use (they write "Tavri", a name in every quarter). One D account read whole tells the Chat through to its last scene but scores 2 of 4.
- Two "now" answers the app would have stored are not accounts at all: one repeats the writer's own system prompt ("You keep the record of an interactive story..."), one copies the Chat's first paragraph. The output guard catches neither. A separate finding.
- D's accounts run long at times (three over 1,000 words, against "at most 500"), but none reached the 2,000-token cap.

**Reading:** both C and D fix the start on this input (15 of 15 against 9 of 15). C makes the writer slip into the first or second person and run into the cap more often; D does neither. **D is the better of the two**, on three samples a cell. Its cost is in the prompt only: one sentence.

### Built: way D (2026-11-26, the user: "Build D")

- `story-so-far-prompt.ts`: the first try's closing ask is now `STORY_SO_FAR_ASK`, "Write the account now, from the beginning of the story through to the last of the Messages. Open with one sentence on how the story began." The shorter second try after a cut-off is unchanged. Nothing else in the app changed.
- `story-so-far.spec.ts`: the cut-off test now expects D's line on the first try; it was seen failing before the change.
- The eval's arms: "now" is the app's own ask (now D's), "before" keeps the old "Write the account now." to measure against, C and D as measured.
- Full API suite: 2,358 passed, 1 skipped; typecheck clean.
- **Not measured on live.** Deploying it: `vm:deploy` will stop, because `story-so-far-prompt.ts` is a prompt builder and its gate reads only `eval-` reports; this change was measured by the long-input eval (round 2), which the gate cannot see. `--unmeasured` again, said openly, or the gate taught to read `long-account-` reports (its own small change).
- To watch after a deploy: the opening sentence of each new Story so far on live (Chats 1, 3, 4), and that none is in the first person.
- Left open: the two "accounts" that were not accounts (the writer's system prompt repeated; the Chat's first paragraph copied), which the guard would store. A separate fix.

### Deployed (2026-11-26)

- Committed 5447a20 (D) and f9ff26b (the eval), pushed to main, deployed with `npm run vm:deploy -- --unmeasured` (the gate named `story-so-far-prompt.ts`; the measure is the long-input eval, which it cannot read). BUILD_OK, RESTORE_POINT_OK, MIGRATE_OK; live COMMIT f9ff26b; both units active; health 200; the Stories page loads signed in.
- Not yet seen on live: the first Story so far written with D. Check its opening sentence, and that it is not in the first person, on the next update of Chats 3 or 4.

### Seen on live with D (2026-11-26, read-only)

- Four updates of Chat 4 after the deploy (418, 431, 438, 445 Messages): all four open at the story's start, in the third person, 211 to 396 completion tokens (cap 2,000), no second try, no failure, about $0.010 each.
- The newest account (445 Messages) is 222 words. Set against the Chat's own records (its Facts, Items, Goals and the four Scene chapter summaries), it keeps the start, the tree-house, the voice of command, the Empress's healing and its cost, and the last scene, but drops:
  - both Items Rin still holds (the bell from Ines, the silver token from Odile), though the rules ask to keep gifts;
  - Odile as Voice of the Moon, and the Moon Tree's three blossoms opened for Rin's truths;
  - the harekin gran's fifty-year candle, kept for a nine-tailed fox before the Foxmother vanished;
  - the Order of the Eclipse, the bounty and its nine grey-cloaked riders, and the grey robes' trail;
  - the sleeproot tea and the amends for it, and Mireille's proposal on the road;
  - the night of the game, and what it changed between the women and Rin.
- Round 2's D accounts ran 158 to 1,196 words (median about 340), so the eval already shows the short answers; its checks counted the start and the four quarters, not what was dropped.

## Plan: does a longer, item-keeping ask lose less? (written 2026-11-26, not built, nothing spent)

### Step 0: a free baseline from round 2

Round 2 kept all 45 accounts whole. Score them for keepers (below) with `--rescore`, spending nothing: how much D and "before" each drop, before any new arm is asked.

### Keepers: what an account must not lose

- Per input, 8 to 12 keeper telltales, each a regex like the quarter telltales, hand-picked from the Chat's own records as they stood at that input's last Message: Items still held (with their giver), Facts that name a promise, a secret, a curse or a cost, and Scene chapter events.
- The export (`scripts/export-chat.mjs`) gains the Chat's `detail_change` rows of kind item and fact, with the Message each came at, so the picks rest on records and not on memory. Read-only on live; private text stays in `.data/`.
- A new `keepers` list in the plan file, guarded like the start telltale: each keeper must match a hand-judged account that keeps it and must not match one that drops it (the live 222-word account is a ready drop example for six of Chat 4's). The plan is refused otherwise.
- A sixth input, `chat-4-445`, the very input the live account above came from.

### Arms

- `d`: the app now (baseline, asked again so the day's noise is shared).
- `e`: D's ask plus "Use about 450 to 500 words." (the rules' "At most 500 words" left as is).
- `f`: E plus "Keep every item someone still holds and who gave it, every promise, and every secret, even if each gets only a few words."

### Checks per account (by code)

- Keepers kept, as a share of the input's keepers (the main measure).
- The existing ones: opens at the start, the four quarters, first-person words, word count, cut off, second try.
- A longer ask risks the 2,000-token cap: a cut-off or second try counts against an arm.

### Size and cost

6 inputs, 3 arms, 3 samples: 54 calls. Round 2 was 45 calls for $0.095, so about $0.12, with the ledger capped at $0.20.

### Choosing

An arm replaces D only if, against D asked the same day: it keeps clearly more keepers (at least 15 points more on average, and more on Chat 4's 445), opens at the start 18 of 18, puts no account in the first person, and has no more cut-offs or second tries than D. If neither does, the next way is to hand the writer the Chat's Items and Facts as a list (an app change, its own plan).

### Built: keepers (2026-11-26, the user: "Build it"; no spend, no live access)

- `eval-long-account.ts`: an input may carry `keepers` (name, pattern, `kept` and `dropped` examples judged by hand). The plan is refused when a keeper's pattern is empty, holds a control character, has no example on either side, misses a `kept` example or matches a `dropped` one. Each account is checked for each keeper anywhere in its text; a not-stored account keeps none. `--rescore` fills keepers into an older report.
- Arms `e` and `f`, worded as above.
- The scorecard gains a "Keepers kept (avg)" column (share of the input's keepers, stored accounts only) and a "By arm" table: stored, opens at the start, keepers kept, first person, second tries, not stored.
- `scripts/export-chat.mjs`: each copy also carries the Chat's item and fact rows from `detail_change`, with the Character's name and the Message position each came at; the log line counts them.
- Tests seen failing first (9), then passing; full API suite 2,361 passed, 1 skipped; typecheck clean.
- Still to do by hand before step 0: write the keepers for each input into `.data/eval-inputs/long-account.json`, from the new export.

### Keepers written, and step 0 (2026-11-26, no spend)

- Chats 1, 3 and 4 exported again (Chat 4 now 463 Messages; Items and Facts: Chat 4 38, Chat 3 2, Chat 1 none, the feature being newer). Scene chapter summaries and Memories saved read-only to `.data/eval-inputs/records-<id>.json` as the other source for Chats 1 and 3.
- Keepers picked per input from those records (10 to 12 each), and calibrated by reading every round-2 account against every pattern, kept and missed alike; reading and code agree except two story-style non-accounts in chat-4-150/363. Kept examples written by hand (no account keeps the thing): Odile's token (Chat 4), "daughter by fire" (Chat 3).
- New input `chat-4-445`: start and examples as chat-4-363, the live 222-word account as a good opening; its quarters are approximate. The live account keeps 6 of its 12 keepers.
- The plan's guard caught a `\b` written through a shell heredoc as a backspace again; mended from a script file.
- Step 0, round 2 scored again (`long-account-2026-11-26T05-13-04-820Z-rescored.md`), keepers kept on average: "now" of that day (the old ask) 43%, C 67%, D 60%. D keeps more than the old ask but still loses about two in five; on Chat 4 it ranged 39% to 67%.

### Round 3 (2026-11-26, arms D, E, F, 3 samples each, $0.130 spent; the user: "Run it")

Report `.data/eval-runs/long-account-2026-11-26T13-54-45-089Z.md`.

| Arm | Stored | Opens at the start | Keepers kept (avg) | chat-4-445 keepers | First person | Second tries |
|---|---|---|---|---|---|---|
| D (live now) | 18 of 18 | 18 of 18 | 49% | 39% | 0 | 1 |
| E (about 450-500 words) | 18 of 18 | 18 of 18 | 53% | 36% | 0 | 0 |
| F (E + keep items, promises, secrets) | 18 of 18 | 18 of 18 | 67% | 58% | 1, a false hit | 0 |

- F's one "first person" is a song title in the account ("Where We Belong"), not narration: read by hand. No real first person in any arm.
- Asking only for more words (E) barely helped (+4 points); naming what to keep (F) did (+18 overall, +19 on chat-4-445), at about 430 words, with no cut-off.
- Checked by reading: the three F accounts of chat-4-445 against their missed keepers. Each miss was a real omission (the voice of command, the grey-gloved watcher, Severine's standing order); the bounty was told only as "grey-cloak riders", which the keeper counts as dropped, a fair call.
- D on the same inputs scored 49% today against 60% in round 2's rescore: day-to-day noise is about ten points, which is why D was asked again alongside.
- **F meets every condition of "Choosing"**: more than 15 points over D, more on chat-4-445, 18 of 18 at the start, no first person, fewer second tries.

### Built: way F (2026-11-26, after round 3; not committed)

- `STORY_SO_FAR_ASK` is now F's line; the shorter second try after a cut-off is unchanged.
- `story-so-far.spec.ts` expects F's line on the first try; the eval's "now" equals F. Both seen failing before the change.
- Full API suite 2,361 passed, 1 skipped; typecheck clean.
- Deploying needs `--unmeasured` again (the gate cannot read `long-account-` reports), said openly.
- To watch on live after a deploy: the next Chat 4 accounts keep the bell, Odile's token and the Order; length near 450 to 500 words; no cut-off.

### Seen on live with F (2026-11-26, read-only; deployed 363bfad at 14:15 UTC)

- Chat 4, 14:28 to 15:59 UTC: 14 updates (463 to 506 Messages), 2 failed on DeepInfra outages (520, 502) and the next turn's update succeeded. No cut-off, no second try; 500 to 1,083 completion tokens. Cost fell to about $0.0025 an update from 14:36 on (cached input).
- The newest account (506 Messages) is 368 words, opens at the start, third person (its one "first person" is a quoted letter). It names what Rin holds and who gave it (Ines's bell, Odile's token, Mireille's biscuit), the promises standing (the supper, the decree, Rin's search of the records, Odile's oath) and the secret of the Rite of Union. Of chat-4-445's keepers it keeps 6 of 12 by reading (the fox-shape pattern misses "Rin as a fox"); the misses are older threads (the Order, the bounty, the watcher, the voice, the blossoms, Severine's order).
- New: updates now come every 1 to 6 Messages, against 7 to 16 before.

### Why updates come so often (2026-11-26, read-only)

- Every update on Chat 4 today, before F and after, covered all but the newest two Messages: `storySoFarCoverage` hits its floor (`ALWAYS_UNCOVERED`), meaning the room left for word-for-word Messages is below the headroom plus the account's growth allowance. Chat length at each update (usage time) against the coverage logged: 365/363, 381/379 ... 447/445 before F; 465/463 ... 507/506 after.
- F is not the cause: the trigger counts the account's own tokens plus its growth allowance (`STORY_SO_FAR_MAX_TOKENS` minus the account), and that sum stays 2,000 whatever the account's length.
- Message size is steady (about 220 to 250 estimated tokens per Message from 300 to 500). So the gap shrinking from about 13 Messages to about 3 means the room left shrank by about 2,300 estimated tokens during the day: the rest of the turn prompt's fixed part grew. Room left now is about 2,400 estimated tokens, so the Narrator reads only the last 5 or so Messages word for word, the rest through the account.
- Broken down (2026-11-26, the user: "Break it down") with the app's own `promptLayersFor` and the same sums as `storySoFarCoverage`, run on two local copies of the live database in `.data/diag/` (git-ignored): the 06:05 restore point and a read-only dump at 23:30. Fixed part, estimated tokens:

| Part | 06:05 (418 Messages) | 23:30 (512 Messages) | Change |
|---|---|---|---|
| Cast cards | 3,570 (5 Characters) | 4,908 (6: Empress Ysolde added) | +1,338 |
| Reminder + final instruction (names the whole cast) | 1,375 | 1,689 | +314 |
| Feelings (Bonds 9 to 14) | 446 | 719 | +273 |
| Facts, Secrets, Items | 828 | 1,073 | +245 |
| Arcs (5 to 6) | 483 | 602 | +119 |
| Lasting memory + Memory | 3,965 | 3,961 | 0 (capped at 4,000) |
| Story so far | 744 | 537 | -207 |
| Rules, Setting, Identity, Style, Lore reserve, small reserves | 4,504 | 4,575 | +71 |
| **Total** | **17,435** (room 4,565) | **19,617** (room 2,383) | **+2,182** |

- So the cause is the Empress joining Chat 4's cast during the day: her card, her name in the reminder, her Bonds and Arc take about 2,000 of the 2,200 tokens lost. With six full Characters' cards (about 800 tokens each) the 22,000-token turn budget leaves room for only about five Messages word for word.
### Turn budget 28,000 (2026-11-27, the user: "Raise the budget"; not committed)

- `TURN_PROMPT_TOKEN_BUDGET` goes from 22,000 to 28,000. On Chat 4 as it stands the room for the history goes from about 2,400 to about 8,400 estimated tokens: an update then leaves about 2,900 tokens (about eleven Messages) word for word, and the next comes about 4,500 tokens (about 18 Messages) later.
- Why 28,000: the same reasoning as the 16k-to-22k raise (`.scratch/cache-and-voices/spec.md`): the history sits in the cached opening, so on a warm turn the extra 5,000 or so real tokens cost about $0.0006 at GLM-5.3's cached price; a cold turn about $0.0028 more; and far fewer Story so far rewrites mean fewer cold turns and fewer $0.0025 updates. Live turns on GLM-5.3 average $0.0085 now. Real turn prompts would run about 23,000 tokens, well inside the model's window.
- Suggested replies and Write for me read the same budget, as before. The settings page's "long turn" price for DeepSeek V4 Pro becomes $0.04 (GLM-5.3 stays $0.02).
- Tests: a cadence test with a fixed part as large as Chat 4's (seen red at 22k: every update leaves two Messages; at 28k at least eight and about every dozen turns); the budget-bound tests updated (five long Messages fit, not four; 400 Messages to force trimming). Those specs pass; the full suite's only failures are the Meanwhile session's work in progress in the same checkout, not this change.

- Ways open then: raise `TURN_PROMPT_TOKEN_BUDGET` (real turn prompts run about 18,000 tokens against the 22,000 estimate; the narrator model's window is far larger; cost per turn grows, mostly cached); send full cards only for the Characters present and a short line for the rest; or leave it (each Story so far update costs about $0.0025).

### Approvals, each on its own

1. Build: keepers in the harness and its tests, the export's new rows (no spend). Done.
2. Export Chat 4 through 445 and the detail rows for all five inputs (read-only on live).
3. Step 0, the free rescore of round 2.
4. The round, about $0.12.

### Approvals the first long-input plan needed (all given)

1. Build the harness and tests (no spend, no live access).
2. Export Chats 1, 3 and 4 to `.data/eval-inputs/` (read-only on live, private text on the PC).
3. Round 1, about $0.15.
4. Round 2, about $0.30.

## Seams for tests

- `storySoFarRejection` (pure): B's floor as a new rejection reason, tested like the cut-off.
- `StorySoFarManagerService` with a scripted gateway (`story-so-far.spec.ts`): A's keep-the-old-one, and that a refused short answer is asked for once more and the failure path is unchanged.
- Eval Layer 4: a count of accounts that skip the start, on first and second tries apart.

## Out of scope

- The length cap and the shorter second try (their own spec, deployed).
- Rewriting Chat 4's Story so far by hand: live data, only with the user's OK. It will be rewritten by the next update anyway.
- Writing the Story so far in parts (summary of summaries).

## Further notes

- The shorter second try still has not run on live; this finding says nothing about it.
- Free next step before choosing: unknowns 1 and 2 (read-only, no spend).

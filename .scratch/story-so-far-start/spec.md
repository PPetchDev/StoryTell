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

### Approvals this plan needs, each on its own

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

# Spec: Prompt eval run

Status: ready-for-human
Builds on: [Spec: Models and samplers](../models-and-samplers/spec.md) ("The live smoke run": the spend gate, the cap, the report folder), [Spec: Story quality](../story-quality/spec.md) (Established facts, Repeated phrases: the first things worth scoring), [Line repair](../natural-speech/line-repair.md)

Written and built 2026-11-22. Not yet run against a real model: the first run needs the user's go-ahead to spend.

## Problem Statement

When the turn prompt changes, nothing says whether replies got better or worse. Today the only check is the user playing a Chat and noticing. That is slow, it costs play credit, and it catches a regression days late, the way the drifting numbers ("nine summers", "twenty summers", "six summers") and the repeated phrases were caught.

The test suite does not help here. It runs against the fake gateway, so it proves the prompt is assembled as intended, never that a real model follows it. The live smoke run does reach a real model, but it asks one question: does this model work with the app at all? It scores nothing.

## Solution

A **prompt eval run**: one command that plays a fixed set of short scenes through the app's real turn prompt and a real play model, checks each reply against that scene's own checks, and prints a scorecard. Run it before and after a prompt change, and the scorecard shows what moved.

```
npm run eval:live -- all --spend
npm run eval:live -- facts repeats --spend --model deepseek-v4-pro
npm run eval:live -- all --spend --against last
```

- An **eval scene** is a small synthetic Story, a history, the user's turn, and a list of checks. Each scene exists because of one way a reply has gone wrong before.
- A **check** is one yes-or-no question about a reply. A **code check** is answered by code. A **graded check** is answered by a cheap model reading the reply against one written criterion.
- Each scene is played several times, because a model does not write the same reply twice. A check's score is how many of those replies passed.
- The **scorecard** lists every check with its score, the run's cost, and, with `--against`, the change from an earlier run.

It spends real credit, so it never starts without `--spend`, and it stops before any call that could take the run past $0.50.

## User Stories

1. As the app's developer, I want one command that scores the turn prompt against a real model, so that I know whether a prompt change helped before the user plays with it.
2. As the developer, I want the run to refuse to start without `--spend`, so that no credit is ever spent by accident.
3. As the developer, I want the run to stop before a call that could pass the cap, so that a mistake costs at most $0.50.
4. As the developer, I want to name which scenes to play, so that I can check one behaviour cheaply while working on it.
5. As the developer, I want to pick the play model, so that I can score both play models (GLM-5.3 and DeepSeek V4 Pro) against the same scenes.
6. As the developer, I want each scene played several times, so that one lucky or unlucky reply does not decide the score.
7. As the developer, I want a scene for Established facts, so that I know the model keeps a listed number instead of inventing a new one.
8. As the developer, I want a scene for Repeated phrases, so that I know the model drops a phrase the prompt told it not to reuse.
9. As the developer, I want a scene for the reply format, so that I know every Character line starts with `@Name:` and parses with the app's own reply parser.
10. As the developer, I want a scene that checks the model never writes the user's own character's speech or actions, so that the commonest roleplay failure is counted.
11. As the developer, I want a scene for a Character's voice, so that I know the Character still sounds like their example lines.
12. As the developer, I want a scene for reply length, so that I know "medium" produces a medium reply.
13. As the developer, I want a scene for an explicit adult turn between adults, so that I know the model writes it and does not refuse or fade to black.
14. As the developer, I want code checks wherever code can decide, so that most of the scorecard costs nothing to grade and is never wrong for a grader's reasons.
15. As the developer, I want graded checks only where code cannot decide (voice, staying in the scene), so that the scorecard still covers what matters.
16. As the developer, I want a graded check to quote the words of the reply it judged on, so that I can see why it failed without rereading the whole reply.
17. As the developer, I want the scorecard to show each check as passes out of samples, so that I can tell a solid check from a shaky one.
18. As the developer, I want the scorecard to show the run's total cost and each call's cost, so that I know what a run costs.
19. As the developer, I want the full report, with every reply, saved outside the repository, so that I can read the replies and no played text is committed.
20. As the developer, I want each report to record the commit it ran on and whether the working tree had changes, so that I know which prompt a score belongs to.
21. As the developer, I want `--against last` to compare with the previous run, so that I see what a prompt change did, check by check.
22. As the developer, I want a change marked only when it is larger than one sample could explain, so that noise is not read as progress.
23. As the developer, I want a failed call (provider error, timeout) recorded as a failed sample with its error, so that an outage is visible and not counted as a prompt failure.
24. As the developer, I want an unreadable grader answer recorded as "not graded", so that a grader fault never counts as a pass or a fail.
25. As the developer, I want adding a scene to be one small file, so that each new story-quality problem can get its scene the day it is found.
26. As the user who plays Stories, I want prompt changes checked before they reach live, so that my Chats do not get worse after an update.
27. As the user, I want the scenes to be synthetic, so that none of my own Stories or Chats is sent anywhere for testing.

## Implementation Decisions

- **A sibling of the live smoke run, not a part of it.** The smoke run answers "does this model work with the app"; the eval run answers "does this prompt produce good replies". They share the gate, the cap and the report folder's parent, and nothing else. Each sizes a call's worst case against its cap in its own few lines; pulling those into one shared ledger was planned and left out when built, as it would have meant changing the smoke run for a dozen lines.
- **Not collected by the normal test run.** Like the smoke run, the entry is a `*.live.ts` file that only the live vitest config includes, started by an `eval:live` script. Without `--spend` it refuses before it reads the key or touches the network.
- **The key** is read from the root `.env` only once the spend flag is set, and is never printed or written to a report.
- **A scene is data plus checks.** It holds a `TurnPromptInput` without its user text (the same shape the smoke Story uses), the user's turn, the number of samples, and its checks. The run builds the prompt with the app's own turn prompt builder, so a scene always exercises the prompt as it is in the code that day.
- **Every scene is synthetic.** Written for the eval, every person an adult, nothing from the user's Stories. This is a rule of the feature, not a default.
- **A check is one of two kinds.**
  - *Code check:* a function from the reply (and its parse) to pass or fail, with a short reason. The first ones: the reply parses with the app's reply parser and every speech line names a Character of the cast; no line is spoken by, or narrates an action of, the user's character where code can tell (a speech line under the identity's name); the word count is inside the reply length's range; a listed Established fact's value appears and no other number is given for that topic; a phrase the prompt listed as repeated is absent; the reply does not end mid-sentence; no refusal wording.
  - *Graded check:* one written criterion. The grader is asked for JSON: pass or fail, and the words of the reply it judged on. One grader call covers all of a reply's graded checks.
- **The grader is the background model** (DeepSeek V4 Flash), not the play model: cheap, and not marking its own work. Its prompt holds the scene's facts the criterion needs, the reply, and the criteria; it is told to judge only what is written.
- **Samples.** Three per scene by default. A check's score is passes out of graded samples. A sample whose call failed, or whose grader answer could not be read, is counted apart and is not in the score.
- **Sampler values** are the play model's defaults from the app, so the eval scores what a player gets.
- **The first scenes** (seven, one failure each): reply format; never plays the user's character; Established facts held; Repeated phrases dropped; Character voice; reply length; an explicit adult turn. Voice and "never plays the user" carry the graded checks; the rest are code checks only.
- **The report** is one JSON file and one Markdown scorecard under `.data/eval-runs/`, which git ignores. The JSON holds the commit, whether the tree was dirty, the model, each call (prompt and completion tokens, cost, finish reason, error), each reply, and each check's result with its reason or quoted words.
- **Comparing.** `--against last` reads the newest earlier report for the same model; `--against <file>` reads a named one. A check is marked better or worse only when its score moved by two or more samples out of three, or from all-pass to any fail; otherwise it is marked unchanged.
- **The cap is $0.50 a run**, the smoke run's. A full run is expected to cost well under that (see Further Notes); the cap is for mistakes.
- **No app code changes.** Nothing in the running API or the web changes. The eval lives beside the tests and reads the app's prompt builders and parsers.

## Testing Decisions

- A good test here checks what the run does from outside: which calls it sends, what it refuses, what it writes. It never asserts on a model's words.
- **One seam: the run itself, with its HTTP client handed in.** The run takes its OpenRouter client (and so its `fetch`) from the caller, as the smoke run does. Unit tests drive it with a scripted `fetch`; nothing reaches the network and nothing is spent.
- Covered through that seam:
  - refuses without the spend flag, before reading a key;
  - refuses an unknown scene or model name, listing the known ones;
  - is not collected by the normal test run;
  - builds each scene's prompt with the real turn prompt builder;
  - plays each scene the asked number of times;
  - stops before a call that would pass the cap, and says so in the report;
  - scores a scripted good reply as pass and a scripted bad reply as fail, for each code check;
  - sends one grader call per reply with graded checks, and reads its answer;
  - records a failed call and an unreadable grader answer apart from the score;
  - writes the report with the commit, costs, replies and results;
  - marks better, worse and unchanged against an earlier report by the rule above.
- **Prior art:** the smoke run's unit tests (`smoke-run.spec.ts`), which use the same scripted-`fetch` approach.
- The code checks are also plain functions, but they are tested through the run with scripted replies, not one by one, so the tests survive a change to how checks are organised.

## Out of Scope

- The other prompts: the Judge, Memory extraction, Story so far, Character thoughts, Diary, Snapshot prompt, the Story assistant. Each has a pure prompt builder and a parser, so each can get scenes later, in the same shape. The turn prompt comes first because it is what the player reads.
- Any automatic prompt rewriting or optimisation loop (what metaharness does). The eval only measures.
- Running in CI or on a schedule. It spends credit, so only the user's go-ahead starts it.
- A web page for results. The scorecard is a Markdown file.
- Scenes taken from the user's real Chats.
- Thai-language scenes.
- Scoring a multi-turn conversation as a whole (drift over fifty turns). Each scene is one reply after a given history.
- Comparing models for purchase decisions; the smoke run and the blind writing comparison cover that.

## Further Notes

- **Expected cost, an estimate until the first run.** A scene's prompt is small (a short synthetic Story): about 3,000 prompt tokens and 500 written. At GLM-5.3's price that is about $0.003 a call. Seven scenes at three samples is 21 calls, about $0.07, plus the grader's calls at a fraction of a cent each. A full run should land near $0.10. The first real run replaces this estimate.
- **Three samples is thin.** It tells "always fails" from "always passes", not 60% from 80%. That is enough to catch a regression, which is what this is for. `--samples` can raise it for a check under study.
- **A graded check can be wrong.** The quoted words are there so a doubtful result can be checked by eye. A graded check that disagrees with the reader more than once should be rewritten or made a code check.
- **Words.** "Prompt eval run", "eval scene", "check", "code check", "graded check" and "scorecard" are developer-facing only: the player never sees them, so they stay out of `CONTEXT.md`.
- **Defaults taken where the user has not yet said otherwise** (each is one constant or one file to change):
  1. The cap is $0.50 a run, and a run near $0.10 is acceptable.
  2. The first version scores the turn prompt only; the Judge follows in its own change.
  3. The seven scenes above are the first set. A failure seen in play gets its own scene as it is found.

## First runs (2026-11-22)

- **Run 1, GLM-5.3, $0.024 in 27 calls.** A scene's prompt is about 1,800 tokens and a reply about 300, so a full run costs about $0.025, a quarter of the estimate above. Everything passed 3 of 3 but one thing: in scenes with no earlier speech line in the history, GLM-5.3 wrote `@Mira:` for "Mira Vance" in 6 of 9 replies, although the prompt asks for "exactly these names". The app kept such a line by name with no Character link: no picture, colour, Expression or voice. Scenes whose history already showed `@Mira Vance:` passed, which is why live Chats rarely showed it.
- **The fix was in the reply parser, not the prompt:** a speech line names a Character by their whole name, or by one word of it that only one Character has. A word two Characters share names neither.
- **Run 2, same scenes, $0.024.** Every check 3 of 3; "user: parses" and "voice: Mira Vance speaks" marked better.
- **Known weakness found:** "sounds like Mira" passed in run 1 on replies where Mira had no `@` line at all, because the grader read her quoted words in the narration. A graded check about speech should be read beside the code check that the Character speaks.

## Upgrades (2026-11-22, second pass)

The user asked what else the run could be made better with. Assessed against the code and the first runs, ranked by value against cost. Nothing here was run against a real model: every upgrade below is proved with scripted answers, and the first real run of the upgraded set needs the user's go-ahead.

### What was weak

1. **A scene could stop testing what it claims, silently.** A scene only works while the prompt still holds the block it is about (the fact, the repeated phrase). Reword the prompt builder and the scene passes for the wrong reason, on paid calls. Only two scenes had a test for it.
2. **A graded check about speech read the whole reply.** "Sounds like Mira" passed on replies where Mira had no speech line (first runs).
3. **Only the turn prompt was scored.** The Judge moves Scenes, sets Established facts and reveals Secrets; Memory extraction decides what the story carries. Both run on the background model after every turn, and a wrong answer there is a wrong Scene or a lost Memory a few turns later.
4. **Seven scenes left recorded failures uncovered:** a Secret told early, a stage direction inside a speech line, a Character sitting out who speaks anyway, a voice lost to another Character's register after a long history, a reply in Thai because the user typed Thai.
5. **Three samples, and a crude better/worse rule.** Two of three moving was called a change though chance alone does that one time in five; one sample slipping from three of three was called worse.
6. **Nothing said what a run would cost before it spent.** The estimate was a paragraph in this spec, a quarter off.
7. **Calls ran one at a time** (about three minutes a run).
8. **The cost did not show what the host's cache gave back.**
9. **Two play models meant two runs and two scorecards read side by side by eye.**
10. **One reply per scene:** no conversation scored as a whole.

### Built now

- **A scene names what its prompt must hold.** Each scene lists a few words its built prompt must contain (the heading of the block it tests, the fact, the name sitting out). The run checks every named scene before the first call and refuses, naming the scene and the missing words, so no credit goes on a scene that no longer tests its thing. A test checks every scene the same way, so a prompt change that breaks one fails the normal test run.
- **A graded check can be about one Character's speech.** The grader is then shown that Character's speech lines apart and told to judge only those. With no speech line there is nothing to judge: the check is "not graded" and no grader call is made for it. The code check that the Character speaks carries the failure.
- **Judge scenes and Memory scenes.** A scene now has a kind: a turn (as before), a judgement or a Memory extraction. A judgement scene holds the Judge's own input and is built with the app's Judge prompt builder, sent to the background model as the app sends it (JSON mode, the Judge's own temperature), and read with the app's own parser; its checks read the parsed judgement. Memory scenes the same, with the extraction's builder and parser. An answer the parser cannot read fails one check ("reads as a judgement") and leaves the rest not graded. First scenes:
  - Judge: a Scene's condition only promised is not met; the same condition done is met; small talk changes no Bond's label and adds no Arc step; a number said in the reply comes back as a fact; a Secret only hinted at is not revealed.
  - Memory: small talk adds nothing; a promise is added, with `{user}` and never the user's name, known only by those present.
- **Five new turn scenes,** all synthetic, every person an adult: a Secret kept for now stays untold when the user asks straight at it; no stage direction inside a speech line after a history full of them; a Character sitting out neither speaks nor acts; a Character keeps their own voice after a long history in another's register; the user types Thai and the reply is English with no remark on the language. This takes "Thai-language scenes" out of Out of Scope for this one case: the user types Thai, the rule is in the prompt, and one code check decides it.
- **Five samples by default, and a change is marked by odds.** A check is better or worse only when chance alone would move it that far less than about one time in seven (Fisher's exact test on the two runs' passes, one-sided, 0.15), so the rule holds for any number of samples and for runs of different sizes. A check that passed every sample before and failed any now, without clearing that bar, is marked "slipped": look again with more samples. At three samples only all-to-none clears the bar, which is the honest reading of three samples.
- **The cost before spending.** Without `--spend` the run still refuses, and its refusal now says how many calls the named scenes would send and what they would cost: an expected figure (calls sized as the first real run's were) and the most it could cost. No key, no network.
- **Calls in parallel.** Four at a time by default, `--parallel` to change it. The cap counts calls in flight at their worst case, so parallel calls cannot pass it together.
- **Cached tokens.** Each call records the prompt tokens the host read from its cache, and the scorecard says the share. Samples of one scene share a prompt, so this also shows whether the host's cache holds for the turn prompt.
- **Both play models in one go.** `--model all` plays the turn scenes on each play model and writes one more scorecard with a column a model. Judge and Memory scenes run once, as they never use the play model. The cap covers the whole command, not each model.

### Left out, and why

- **Story so far scenes.** It has a pure builder and parser, but a scene needs a long synthetic history (thousands of tokens a call) and its commonest faults are already refused by code in the app. Next in line after the Judge and Memory scenes have had a real run.
- **Character thoughts, Diary, Snapshot prompt, Story assistant.** As before: same shape, later.
- **A conversation scored as a whole** (reply, then a turn on top of it, and so on). Each added turn multiplies the cost and the noise, and its checks can only be tuned against real replies. The failure it would catch that is on record (a voice lost over a long Chat) is covered more cheaply by the one-reply scene after a long history.
- **Pooling several earlier runs for the comparison.** Worth it only once there are enough runs on one prompt; `--samples` does the same job today.
- **A shared spend ledger with the smoke run.** Still a dozen lines each, still not worth changing the smoke run for.
- **Automatic prompt rewriting.** Still out: the eval only measures.

### Built (2026-11-22)

Everything under "Built now" is in, proved through the one seam (the run with a scripted `fetch`): 57 tests, no call to a real model. Nothing in the running app changed; the run only reads the app's prompt builders, its parsers and the Judge's own sampler value.

- **Nineteen scenes:** twelve turns (format, user, facts, repeats, voice, length, adult, secret, directions, sitout, drift, thai), five judgements (judge-waits, judge-moves, judge-quiet, judge-facts, judge-secret) and two Memory extractions (memory-quiet, memory-promise).
- **"Sounds like Mira" now reads only Mira's speech lines,** in the voice scene and the drift scene.
- **Commands:**

```
npm run eval:live -- all                          (spends nothing: says what the run would cost)
npm run eval:live -- all --spend --model all      (each play model, one scorecard side by side)
npm run eval:live -- all --spend --parallel 1     (one call at a time; four unless told)
```

- **What the upgraded run would cost,** as the run itself now says without `--spend`. Prices are the app's catalogue's, calls are sized on the first real run, and no cache discount is taken, so it errs high: it gives $0.040 for the seven first scenes at three samples, which really cost $0.024.
  - every scene, five samples, GLM-5.3: 125 calls, about $0.12, at most $0.33;
  - every scene, three samples (`--samples 3`): 75 calls, about $0.08, at most $0.20;
  - every scene, five samples, DeepSeek V4 Pro: about $0.22;
  - both play models side by side: 215 calls, about $0.34.
- **Not yet known, and only a real run can say:**
  - whether the new scenes' checks are fair to a good reply. A code check written against no real reply can be too strict ("keeps the secret" fails on any mention of a ticket; "no stage directions in speech" fails on any parenthesis in a speech line). The first real run is a check of the checks: read "What did not pass" before believing a low score.
  - whether the Judge and Memory scenes are steady on the background model at its own temperature.
  - whether the host takes four calls at once without a busy answer, and what that does to the cache share (parallel samples of one scene may each miss a cache the first has not yet written).
- **A changed default to note:** five samples a scene, where it was three. `--samples 3` gives the old size.

### First real run of the upgraded set (2026-11-22, with the user's go-ahead)

`all --spend --samples 3` on GLM-5.3, four calls at a time: **$0.043 in 74 calls**, no failed call, no busy answer, every answer finished on its own.

- **The cost line erred high, as said:** it gave about $0.075. The host read 68% of the prompt tokens from its cache, parallel calls and all.
- **Every check passed 3 of 3 but one reply.** The new checks were not too strict on any real reply: read by eye, the replies of the secret, directions, sitout, drift and thai scenes pass for the right reason, and so do the judgements and extractions.
- **The one failure is real, and it is the app's:** in one voice reply GLM-5.3 wrote `@Mira:` alone on a line, then a blank line, then her words, four times over. The reply parser reads a name with nothing after it as an empty speech line and drops it, and the words under the blank line become narration: in a Chat, Mira would say nothing and the Narrator would speak her lines. One reply in 36, so rare, but nothing in the app caught it.
- **Fixed the same day, in the reply parser, on the user's word:** a speech line with no words on it takes the next paragraph as its words, blank line or not; the paragraph after that is narration again. A name with no words after it at all is still dropped, a Character sitting out loses that paragraph too, and the worn identity's name alone still cuts the reply. Seven tests, and the real reply, read again, gives Mira her four speech lines. This is the one change to the running app in this work. What it cannot tell: a name alone followed by a paragraph that is really narration now reads as speech, where before it was the speech that read as narration.
- **The upgrade for the grader held:** on that reply "sounds like Mira" was "not graded" and no grader call was made, where the first runs would have passed it.
- **What a clean sheet does not say:** twelve turn scenes at three samples passing says the prompt holds on short synthetic Stories. It does not say the scenes are hard enough: none of them has yet failed for the reason it was written. A scene earns its place the first time it catches something.
- The report is with the earlier ones, under the main checkout's eval runs, so `--against last` finds it.

## Prose (2026-11-23)

From [the research on harnesses](../../docs/research/story-quality-eval-harnesses.md), gap 4: the scorecard said whether a reply kept the rules, never how worn it read. No outside harness was worth taking whole; this is the first of four ideas borrowed from it.

### Built

- **A prose table at the foot of the scorecard,** one line a turn scene, over all of its samples together:
  - *Overused a thousand:* the words and three-word phrases models overuse against human writing, counted in a thousand words of reply. The lists are sam-paech/slop-score's (MIT; copied under `apps/api/test/live/slop-lists/` with its notice): 1,648 words and 430 phrases. A phrase is three content words in a row with the common words between them left out, so "took a deep breath" is found as "took deep breath".
  - *Most found:* the five found most, each with its count.
  - *Shared between samples:* phrases two or more samples of the scene share, by the app's own Repeated phrases detector. A phrase in most samples means the model has a stock answer for that scene.
- **A number, not a check.** Nothing passes or fails on it. With `--against` the earlier run's number sits beside this one's; no "better" or "worse" is marked, as nothing yet says how far chance alone moves it.
- **Read from the played text, when the scorecard is written.** So a report from before this was built is read the same way, and `--against last` works from the first run. No model call, no cost.
- **A scene's own people are not counted.** "elara" is on the list: worn when a model picks the name freely, no fault when the Story named the Character. A report now keeps each turn scene's names for this; an older report has none, and is read without.
- **Left out of the table:** Judge and Memory scenes (their answers are JSON), and a scene whose every call failed.
- Six tests through the run with scripted replies; nothing was run against a real model, and nothing was spent.

### What the saved runs say (GLM-5.3, read again with this, free)

- Scenes run from 0 to about 15 a thousand; most sit between 5 and 13.
- What is found is mild, and almost all single words: "leaned", "nodded", "glanced", "paused", "streaked", "ticked", "doorframe". A listed phrase was found once in four runs ("leaned back chair").
- "streaked" is partly the user's own "rain-streaked glass" said back, not the model's habit.
- The shared phrases are the more telling half: "Too much for one person" is in the voice scene in every run, and "The bell above the bookshop door" opens several scenes.

### Not in it, and not yet known

- **The number is not slop-score's own score.** That one also weighs "not X, but Y" patterns and scales against its leaderboard. This is the plain count of its words and phrases; the two are not on one scale.
- **A scene writes 600 to 900 words at three samples, so one word found moves the number by more than one.** Read a scene's number beside its words; believe a change only when it holds over runs, or with more samples.
- **Whether the lists suit this app.** They were built from general fiction, in English. "leaned" and "nodded" are on it and are how any scene is told. If the number turns out to follow reply length or scene kind more than prose, the list wants trimming to the phrases, or to the words this app's models overuse.
- **Not on the side-by-side scorecard** (`--model all`): each model's own scorecard has its table.
- **The repeated-phrases detector drops a hyphen** ("halffinished"): the app's own, cosmetic here.
- Left for later, from the research: the "not X, but Y" patterns (ten plain patterns port easily; the rest need a part-of-speech tagger), and a line turning the number into a check once a few runs show what is normal.

## The other three from the research (2026-11-23)

Built the same day as the prose table, on the user's word to carry on. Everything below is proved with scripted answers (2,216 API tests pass); **none of it has been run against a real model**, and nothing was spent.

### Every check has a reply it must fail (research gap 2)

- A test now goes through every code check of every scene and refuses one with no known-good and known-bad reply. Thirteen checks had none (the `habit` and `plain` scenes whole, and the second and third checks of most scenes). All now have one, and every check failed its bad reply: none was too lax.
- **"Never failed yet" on the scorecard.** The scorecard ends with the checks that have passed every sample of every saved run, this one included, each with how many runs it has had. A clean sheet no longer reads as proof: these are the checks that have not yet shown they catch anything.
- **Left out:** distractors written into the scenes to make them harder. A harder scene can only be tuned against real replies, so it follows the next real run.

### A played Chat (research gap 1)

- **A fourth kind of scene:** the user's turns in order, each answered by the play model through the turn prompt with the replies so far as its history, scored as a whole. It takes "a conversation scored as a whole" out of Out of Scope.
- **The first one, `evening`:** ten turns in the bookshop. Its checks: every reply parses, none is written as the user, Mira speaks in each; "nine years" is said when asked at turn 2 and again, asked another way, at turn 9, and no other number of years anywhere; no phrase the earlier replies shared comes back. The graded check, "sounds like Mira", reads the reply to the last turn.
- **"Drops phrases the earlier replies shared"** uses the app's own Repeated phrases detector as the turn prompt does: before each turn it reads the replies so far, and a reply holding a phrase it named is the failure.
- **Cost.** Each time it is played is ten play calls with a growing prompt, so it is played at most twice a run whatever `--samples` says. The run says, without `--spend`: 22 calls, about $0.06, at most $0.12. With it, `all` at five samples is 162 calls, about $0.22, **at most $0.50: the cap can now stop a full run short** if every call runs to its limit. `--samples 3` keeps clear of it.
- **What it does not do:** the Judge does not run between its turns, so Established facts, Bonds and Memories stay as the scene gives them. A call that fails part way makes the whole Chat a failed sample. It is in the prose table, read over all its replies.

### The grader check (research gap 3)

```
npm run eval:live -- --grade                      (spends nothing: says what it would cost)
npm run eval:live -- --grade --spend
npm run eval:live -- --label-sheet                (free: the saved runs' replies, to label by hand)
npm run eval:live -- --grade --labels <file> --spend
```

- **Replies whose right verdict is known are sent to the grader alone,** each twice (`--samples` changes it), and a card says, check by check: how many cases it agreed with, how many fails it missed, how many passes it failed, and how many it answered both ways ("unsteady"). Each disagreement is listed with its label, why, and the words the grader judged on. No play model is called.
- **Sixteen cases are written in** (`eval-grade.ts`), synthetic, every person an adult: for each of the five graded checks a reply that passes and two or three that must fail, one plainly and one in the way a grader is likely to miss (a decision given to Ash with no speech; teasing words that are only in the narration; a Secret hinted at, not said; Tobias acting with no speech line; the narration calling Ash's words foreign). A test refuses a graded check with no pass and no fail case.
- **Hand labels.** `--label-sheet` writes `.data/eval-runs/labels-to-mark.json`: every reply a graded check read in the saved runs, once, with the criterion, `label` empty and the grader's own verdict left out so the reader is not led. Today that is 45 replies. Fill each `label` with `pass` or `fail`; `--labels` adds them to the sixteen. An entry not yet labelled is left out.
- **Cost:** 32 calls, about $0.001, at most $0.03. The $0.50 cap holds here too.
- **Not yet known:** whether the grader agrees. No threshold for "agrees enough" was found in the research; a check the grader gets wrong on a written-in case should be reworded or made a code check, as the spec already says. The research's other question, whether DeepSeek V4 Flash goes easy on DeepSeek V4 Pro's replies, needs the grader check run on labelled replies of both play models, which the label sheet now makes possible.

### For the next real run (needs the user's go-ahead to spend)

1. `npm run eval:live -- --grade --spend` first: under three cents, and it says whether the graded half of the scorecard can be believed.
2. `npm run eval:live -- all --spend --samples 3 --against last`: the first run with the prose table, the played Chat and the never-failed list. Read "What did not pass" before believing a low score on `evening`: its checks have met no real reply.

## First real runs of the three (2026-11-23, late, with the user's go-ahead)

Spent in all: $0.087 ($0.084 on the full run, $0.004 on four grader checks).

### The grader check found two faults in the grader, and both are mended

- **First run, 16 cases twice: 15 agreed, none unsteady, $0.0008.** The miss: "Tobias takes no part" passed a reply in which Tobias wipes his hands and shakes his head, and the grader quoted that very sentence as what it judged on. The check had passed every sample of the two real runs before, so those passes said nothing.
- **Mended by wording the criterion as one thing to find** ("It fails if the narration shows Tobias doing anything or saying anything, even one gesture"), where it had been three things denied at once. Asked three times a case: 3 of 3.
- **That same run showed a second fault:** "leaves Ash to the user" passed the reply where Ash is given a decision, one time in three, again quoting the sentence that broke it. So the fault was not one criterion: now and then the grader answered `"pass": true` to mean "found it".
- **Mended in the grader's own instruction:** the JSON now asks for the quoted words first and the verdict after, and says what each verdict means ("true only when the reply meets the criterion, and false when the words you quoted break it"). Asked five times a case: **80 of 80 agreed, none unsteady, $0.002.**
- **What that does not say:** the instruction was tuned on these sixteen cases, so they no longer test it. The hand-labelled replies (`--label-sheet`, 45 waiting) are the honest test.

### The full run (GLM-5.3, three samples, 106 calls, $0.084, 72% of prompt tokens from the cache)

- Every check passed but one sample of `plain` ("something" twice). The played Chat passed all eight of its checks in both plays. It cost a third of what the run said beforehand ($0.22 expected): the cache again.
- The graded checks in this run were asked with the old instruction; the next run is the first with the new one.
- **"Never failed yet" lists 58 of 65 checks.** Seven have ever failed.

### What reading the played Chat showed, that no check sees

Both plays were read by eye. Each of these is in both, unless said:

1. **Mira takes the scene over.** The user's turns stay small talk to the end (the ferry engine, the sign over the till, "can I come by tomorrow"). By turn 9 Mira has asked Ash to dinner herself, taken his hand and asked him upstairs for the night, and each reply ends by pressing him to answer ("So. Come up. Say yes back."; "Go on. Properly this time."). The Story's setup invites a romance; it does not ask the Narrator to run it past what the user does.
2. **The place moved without the user.** In the second play they are in the flat upstairs by turn 9, so when the user "looks up at the old sign over the till" the reply has to patch it ("the sign downstairs, visible in his mind").
3. **A Secret was told unasked** (second play, turn 9): Mira brings out the note she kept. It is a plain Secret on her card, not a levelled one, so no rule was broken; nothing in the eval says whether that is wanted.
4. **Her voice changed and the grader passed it.** Turn 1 has two or three short lines. Turns 9 and 10 have six or seven speech lines each, some of them speeches, "the dryness gone out of her voice". "Sounds like Mira" passed both: there are still short lines and questions among them.
5. **Every reply closes the same way:** a last line by Mira that hands the turn back with a question, most starting "So." The phrase detector cannot see it: the words differ.
6. One garbled sentence ("looking up a little less than usual wasn't needed").
- The facts held: "nine years" at turn 2 and turn 9, no other number. Every speech line was written `@Mira:`, which the parser now reads.

### What this suggests next (nothing here is built)

- A check on the played Chat that the Narrator does not run ahead of the user: graded, over the whole Chat, with cases in the grader check before it is believed.
- A code check that the number of speech lines a reply does not grow turn over turn, and one that the replies do not all end on a question to the user.
- The place a played Chat is in, kept as the app keeps it (the Judge between turns), so a move the user did not make shows.

## Checks on a whole played Chat (2026-11-24)

Built on the user's word, from what reading the first played Chat showed. Spent: $0.063 ($0.052 on one play of `slow` and `evening` at two samples, $0.011 on grader checks).

### What changed in the plan, and why

The reading had called it "Mira takes the scene over". The turn prompt asks for that: "Characters act on their desires ... without waiting to be asked: one who wants Ash flirts, touches, teases and makes advances when the moment allows." So an advance is no fault, and no check was written against it. Two things in those Chats do go against the prompt, and each has a check now:

1. **A Character stuck on one demand.** From the fourth turn on, every reply closed with Mira pressing Ash to "ask properly" or "say the thing", whatever his turn had been about.
2. **The slow-burn pacing line**, which the Story can set and nothing tested: "don't hurry toward a resolution, a confession or a change of scene."

### Built

- **A played Chat can have checks graded on the whole of it** (`gradedChat`): one more grader call, shown every turn and its reply in order. The cost said before spending counts it.
- **`evening` has "does not press the same demand".**
- **A second played Chat, `slow`:** six turns of small talk under the slow-burn line, with "keeps the slow burn" (no declaration, date, invitation to stay or change of place that no turn of Ash's asked for).
- **The grader check takes whole Chats:** a case can hold the replies to a scene's first turns. Six are written in, a pass and two fails for each new check; the label sheet lists whole-Chat entries with their replies.
- A full run is now 178 calls at five samples: about $0.25, **at most $0.57, over the $0.50 cap**. The first full run cost a third of its estimate, so the cap is unlikely to bite, but `--samples 3` is the safe size.

### What the real grader says of the two new checks

- **"Keeps the slow burn": 3 of 3 cases, steady,** at three and at five asks a case.
- **"Does not press the same demand": unsteady, and left marked so in the scene.** It has to count replies. On five cases (three written, and the two real Chats of 2026-11-23, labelled fail by Claude on reading them) it agreed on three and answered both ways on two. The two real Chats it failed every time. A wording that spelt the counting out was worse (four of five unsteady) and was taken back. **Read this check's result by eye until it is rebuilt.** The likely rebuild: ask the grader about each reply's closing line alone, one yes or no, and count in code.

### One real play of both (GLM-5.3, two samples, $0.052)

- **`slow`: the slow burn held in both plays** by the grader, and by eye there is no confession, invitation or move. Mira still presses "say it" in most replies, which the slow-burn check rightly does not count.
- **`slow`, first play: not one `@Name:` line in six replies.** Every word of Mira's was in quotation marks inside the narration, so in the app the Narrator would have spoken all of it and Mira nothing. The first reply set the shape and five more copied it. "Parses" passed, as a reply with no speech line parses. The scene now also checks that Mira speaks in every reply, which this play fails. One play in six so far; whether the slow-burn line makes it likelier is not known.
- **`evening`: "no other number of years" failed both plays, wrongly.** Mira said "took me two years to stop shelving things where he'd put them" and "fixing engines for what, six years?". Over ten turns other spans of years are bound to come up, so the check is gone from the played Chat; "says nine" at turns 2 and 9 carries the fact, and passed.
- **`evening`, second play:** "sounds like Mira" failed on the last reply, the first fail that check has had, and "does not press the same demand" failed, quoting "Ask me properly, then" from four replies.

### Where this leaves the harness

- It now finds things: the missing `@Name:` lines, the pressing loop, and a voice check that can fail. Three plays ago every line was a pass.
- The pressing loop is in every real Chat played so far (six of six by eye). It is the first thing worth changing in the turn prompt, and the harness can now say whether a change helps, by eye today and by a rebuilt check after.

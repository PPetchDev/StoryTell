# Spec: Long-term memory eval

Status: ready-for-human
Builds on: [Spec: Prompt eval run](../prompt-evals/spec.md) (the run, its gate, its cap, its report, the grader check), [Memory by meaning](../memory-by-meaning/) (how Memories are chosen for a turn)

Written 2026-11-25, and amended the same day on the user's review (see "Amendments"). **Approved to build; not approved to run.** Building the fixture, the scenes and their tests calls no model. Every call that costs money, embeddings included, waits for the user's go-ahead, asked for each time.

## Problem Statement

The app has a full memory system: Memories found by meaning, Beliefs that may be false, Established facts, who knows what, and a Story so far. Nobody knows how well it holds once a Chat is long. The user plays long Stories, and the claim "a Character remembers what happened thirty Chapters ago and acts on it" has never been measured. A fault there shows up weeks into a Chat, when it is costly to notice and hard to trace.

The prompt eval run cannot say today. Every one of its scenes gives the turn prompt an empty Memory list, a played Chat never runs the Judge or the Memory extraction between turns, and there is no scene for the Story so far.

## Solution

Four new groups of eval scenes, each measuring one link of the chain a memory travels, on one shared synthetic long Chat:

1. **Choice:** is the right Memory picked for the turn, out of 245?
2. **Extraction:** is an event stored as a correct Memory in the first place?
3. **Use:** with the Memory in the prompt, does the Character act on it, and only when it fits?
4. **Story so far:** does an early event survive in the account as the story grows long?

A long Chat is not played for real. Thirty Chapters is about 300 turns: an estimated $1.5 to $3 a play, over the cap, and so noisy that a failure could not be traced to a link. The state of a Chat thirty Chapters in is written as a fixture instead, and each link is measured alone.

The first run is a **baseline**. It sets no pass mark. Pass marks are chosen after it, each with its reason.

## User Stories

1. As the app's developer, I want to know whether an early event's Memory is picked thirty Chapters later, so that I know the search works at the size the user plays at.
2. As the developer, I want to see where that Memory ranks and how close it came to the similarity floor, so that a near miss is visible before it becomes a miss.
3. As the developer, I want to know how much of the Memory budget goes on Memories that have nothing to do with the turn, so that I know whether the budget is spent well.
4. As the developer, I want both a turn that names the event and a turn that only relates to it, so that I know whether recall needs the user to spell things out.
5. As the developer, I want to know an extracted Memory says what happened, who was in it and who knows of it, so that I am not counting Memories that are wrong.
6. As the developer, I want a thing a Character was merely told, and that is untrue, stored as that Character's Belief and not as a fact, so that lies in the story do not become truths.
7. As the developer, I want to know a Character acts on a Memory in the prompt, compared with the same turn without it, so that the effect is the Memory's and not the scene's.
8. As the developer, I want to know a Character with no Memory of a thing does not invent a shared past, so that accuracy is measured and not just recall.
9. As the developer, I want to know a Character does not drag an old event into a turn it has nothing to do with, so that timing is measured.
10. As the developer, I want "remembered" told apart from "guessed right", so that a generally warm reply does not count as memory.
11. As the developer, I want to know which early events are still in the Story so far at five lengths of story, so that I know what the summary loses.
12. As the developer, I want lost minor details told apart from lost major events, so that sensible compression is not counted as forgetting.
13. As the developer, I want to know the Story so far gives the later state of a thing that changed, so that an old value does not come back as current.
14. As the developer, I want every graded check tested against replies whose right verdict is known before its score is believed.
15. As the developer, I want the first run saved as a baseline and later runs compared with it, so that a change to the memory system can be shown to help or hurt.
16. As the developer, I want the run to say its cost before spending and to stay under $0.50.
17. As the user who plays long Stories, I want memory faults found by a test and not by me, forty hours into a Chat.
18. As the user, I want none of my own Stories or Chats used, so that nothing of mine is sent anywhere for testing.

## The shared fixture: one long Chat, written by hand

- **A synthetic Story,** written for this eval, every person an adult, nothing from the user's Stories: the river-lock town of Harrowmere. Three Characters (Sera Quill the lock-keeper, Bram Oakes the bargeman, Ilse Varn the apothecary) and the worn identity (Corin Vale, a surveyor), so that "who knows what" can differ between them and one Character can be away from a scene.
- **245 Memories over 30 Chapters** (the plan said about 300; eight or nine a Chapter is what was written), in story order, in the form the app stores them (`{user}` for the worn identity, known-by names). Written into the fixture file by Claude when it is built; no paid model writes them. Each carries a topic tag used only by the eval.
- **Six anchor events,** planted in Chapters 1 to 5. Each has:
  - its Memory, and who knows it;
  - a **telltale detail**: a name, object or number that appears nowhere else in the Story, the history or the other Memories, and that nobody could guess;
  - a **direct cue**: a user turn that names the event;
  - a **context cue**: a user turn that relates to it without naming it or reusing its words;
  - an **unrelated turn**.
- Two of the six are kept for special cases: one is a thing a Character believes that is false, one is an event that a later Chapter changed.

| Anchor | Chapter | What happened | Telltale | Who knows |
|---|---|---|---|---|
| rescue | 2 | Corin pulled Sera's brother Tobin from under the capsized skiff Marigold | Marigold, Tobin | Sera |
| report | 3 | Corin reported Bram's undeclared Vessin lamp oil; Bram was fined forty crowns | Vessin | Bram |
| fire | 4 | Ilse believes Corin burned her drying shed on Candle Night; in truth Bram's dropped lantern did | Candle Night | the Belief is Ilse's; the truth is Bram's |
| key | 2, changed in 18 | Sera wore the silver lock key on a green cord; in Chapter 18 she gave it to Ilse to keep | green cord | all three |
| promise | 5 | Corin promised Ilse ghostcap moss from the Tarn fen before first frost | ghostcap | Ilse |
| secret | 1 | Bram told Corin he cannot read; his niece Odalys keeps his ledger | Odalys | Bram |

## Layer 1: Choice

**What runs.** A new scene kind. The fixture's Memories and each cue are embedded with the app's real embedding model (bge-m3), and the app's own pure choice function picks Memories for the turn, with the app's budget (4,000 tokens) and floor (0.35). The query text is built as the app builds it: the user's turn and the last four messages. No play model and no grader is called. The same vectors give the same answer, so one sample is enough, and vectors are kept on disk by text so a rerun is free.

**Test cases.** Six anchors by two cues (direct, context) is twelve, plus six unrelated turns as controls. One more setting, "crowded", repeats the twelve with locked Memories taking half the budget.

**Reported for each case:**

| Measure | Meaning |
|---|---|
| Found | The anchor is among the chosen Memories, and why it was chosen (meaning, recent, believed) |
| Rank | The anchor's place by similarity among all 300 |
| Score | Its similarity, and its distance from the 0.35 floor |
| Budget | Tokens used of 4,000, and whether the anchor was skipped for room |
| Unrelated share | Of the Memories chosen by meaning, the share whose topic the cue does not list |
| Why not chosen | When the anchor is not sent, the one cause: it has no vector; it scored under the floor; it cleared the floor and was left out for room, with how many Memories ranked above it and the tokens they took |

The causes are kept apart because they call for different mends. Under the floor is the embedding's doing: the cue and the Memory do not read as near. Over the floor and left out is the budget's and the ranking's doing: the search found it and something else took its room.

Over all cases: found at any rank (recall), found in the top 5, 10 and 20, and the mean unrelated share. Memories filled in as "recent" are reported apart: they are unrelated by design.

**Expected, written before any run.** Direct cues find the anchor. Context cues are where it is expected to fail, as the query holds no words near the event. Unrelated turns should not pick an anchor by meaning.

## Layer 2: Extraction

**What runs.** Five Memory scenes, the kind the eval already has: one exchange each, sent to the background model with the app's extraction prompt and read with the app's parser. Five samples.

**Test cases and what each must yield:**

| Scene | Must yield |
|---|---|
| A plain pivotal event | One added Memory naming what happened and who did it, `{user}` not the user's name, known by exactly those present |
| An event with one Character away | The same, and the absent Character not among those who know |
| A lie told to a Character | A Belief held by that Character, and no Memory stating the lie as true |
| A later exchange that changes an earlier Memory | The earlier Memory updated or replaced, not a second Memory that contradicts it |
| A pivotal event buried in small talk | The event added, the small talk not |

**Checks, all by code,** on the parsed answer. For each event the scene lists what a right extraction holds, and each is a check of its own, so the scorecard says which part went wrong:

- *what happened:* an added Memory holds the event's own words (its telltale and its verb);
- *who was in it:* that Memory names the people involved, with `{user}` for the worn identity and never their name;
- *who knows it:* its known-by list is exactly those present;
- *fact or belief:* the lie is a Belief of the Character who was told it, and no added Memory states it as true;
- *the change:* the earlier Memory is updated, merged or archived by its id.

No graded check: the amended plan drops "says what happened, with nothing added", as the parts above are what it would have judged and code reads them without a grader's doubt.

**Expected.** The first, second and fifth are expected to hold. The lie and the changed event are the ones in doubt.

## Layer 3: Use

**What runs.** Turn scenes, the kind the eval already has, with Memories in the prompt for the first time. The play model is GLM-5.3 with the app's own sampler values. Five samples a scene.

**The three anchors used, and why these.** Each tests a different way a past can bear on a reply, and in each the Character's card alone points the other way:

| Anchor | The Character and their card | With the Memory | What it tests |
|---|---|---|---|
| rescue | Sera shows the lock ledger to no one, whoever asks | She lets Corin see it | A debt that makes a Character do what they otherwise refuse |
| report | Bram lends his barge to anyone who asks | He refuses Corin | A grievance that makes a Character refuse what they otherwise grant |
| fire | Ilse serves every customer alike | She is cold to Corin, and does not know of the lantern | A false Belief acted on, and a truth she was never told staying untold |

The key, the promise and the secret are left to Layers 1, 2 and 4: a changed state and a promise are about what is recalled, not about a choice the card opposes.

**Three arms for the rescue and the report, two for the fire: eight scenes.** What Ilse believes of Corin bears on every turn between them, so the fire has no turn it has no bearing on, and no arm C.

| Arm | Memories in the prompt | The user's turn | Wanted |
|---|---|---|---|
| A, with | The anchor, among other Memories filling the budget | Relates to the anchor | The Character acts as that past would make them |
| B, without | The same others, the anchor taken out | The same turn as A | No shared past is invented |
| C, off topic | The same as A | Unrelated | The anchor is not brought up |

**Control of variables.** Within an anchor, the Story, the cast, the history and the other Memories are the same in all three arms. A and B differ by one Memory. A and C differ by the user's turn alone. A test checks this of the built prompts, so a later edit cannot let the arms drift apart.

**Two measures, reported apart and never added together.**

1. **Recall evidence** (code): the reply holds the anchor's telltale detail. It shows the model read the Memory. It does not show the model understood it: a model can copy a name out of its prompt and change nothing.
2. **Behavioural impact** (graded): the Character makes the choice the event points to (Sera lets Corin see the lock ledger; Bram refuses his boat; Ilse turns Corin away or is openly cold). The criterion names the choice alone and says nothing of the telltale, so a reply can pass one measure and fail the other.

The scorecard gives both for every anchor, side by side, with the four outcomes counted: both, recall only (copied, not acted on), impact only (acted, no detail given), neither.

**Other checks, by code.**
- *Arm B, invents no past:* the reply holds neither the telltale nor the event's own words. Its limit: an invented past of some other kind is not caught.
- *Arm C, leaves it alone:* the same words are absent.
- *Fire only, arm A:* the reply does not hold "lantern". Ilse was never told.

**Behavioural impact is a difference.** The same graded check is asked in arm B. Impact is arm A's rate less arm B's. Arm B's rate is what chance and the Character's card give without the Memory. A Character who makes the same choice in both arms has not remembered anything.

**Expected.** Arm A's telltale is the open question. Arm B is expected to hold. Arm C is in doubt: the prompt lists the Memory, and a model tends to use what it is shown.

## Layer 4: Story so far

**Corrected on reading the code.** The first draft had the Story so far summarised from its own earlier summary, five rounds in a row. The app does not do that: each time, it is written from scratch from every Message it covers. So nothing fades from rewrite to rewrite; what can fail is the squeeze, as the covered story grows and the account stays at about 500 words.

**What runs.** A new scene kind. The same story is summarised at five lengths: through Chapter 6, 12, 18, 24 and 30. Each is one call to the background model with the app's own Story so far prompt, read and refused as the app reads and refuses it. The calls do not depend on one another. Three samples a length. The Messages are the fixture's events, told as plain narration, a few each Chapter with a line of the user's between: flatter than played prose, and about 6,000 words at the fifth length, a twelve-to-one squeeze.

**Three groups of things in the story:**

| Group | Items | At each length |
|---|---|---|
| Must stay | Four major events: the rescue, the report, the fire, the promise | Counted by code on its telltale words: there or gone |
| May go | Four minor details | Counted and reported, never a pass or fail |
| Changed later | Two things a later Chapter overturns | By the grader: the later state is given, and the old one is not given as current |

**The changed items have a written timeline,** so "current" has one right answer at each length:

| Item | Before | The change | After |
|---|---|---|---|
| The lock key | From Chapter 2, Sera wears it on a green cord | Chapter 18: Sera breaks her wrist and gives it to Ilse to keep | Ilse holds it; Sera does not |
| Bram's barge | From Chapter 1, Bram owns the Heron | Chapter 21: he sells the Heron to pay a debt | Bram poles a hired flat, the Dunlin; he owns no barge |

- At the lengths before a change (6 and 12 for the key; 6, 12 and 18 for the barge) the "before" state is the right one, and the check is not asked.
- At the lengths after it, the graded check asks one thing an item: who holds the key now; what Bram works now. An account that only names "the silver key" passes nothing: the criterion is about who holds it.
- An account that leaves the item out altogether is "left out", counted apart: silence is a loss, not a wrong state.

**Expected.** Minor details go first. Whether the four major events last to the fifth length is the question. The changed items are the likeliest fault: the early state has more Messages behind it than the change does.

## Metrics and pass marks

- **No pass mark is set before the baseline.** There is no figure today to set one against, and a mark of 100% on every measure would only say the test is easy or the system is failing by decree.
- **The baseline run reports the figures above as they are.** Each expectation in this spec is then marked held or not held.
- **After the baseline, each measure gets its mark, with its reason written beside it,** in this spec. Likely shapes: a Layer 1 measure is deterministic, so any drop is real; Layer 2 to 4 measures are compared by the run's own odds rule, as other checks are.
- **Two results are faults at any rate,** and are reported as such from the first run: an extraction that stores a lie as a fact, and a Story so far that gives a superseded state as current.
- A weak result is reported as weak. Nothing is reworded until it passes.

## Trusting the grader

- Every graded check gets written-in cases in the grader check before its score is read: a reply that passes, one that plainly fails, and one that fails the way a grader is likely to miss.
- The hard cases written for this eval:
  - *Warm, but no:* a kind, sympathetic reply in which the Character still does not make the choice. Behavioural impact must not pass on warmth.
  - *Names the event, but no:* a reply that says the telltale and then refuses. Recall is not impact.
  - *Mentioned as past:* an old state named as what used to be true. It must not count as given as current.
- The grader check runs first, at temperature 0, three asks a case. A check with any disagreement or any unsteady case is marked "read by eye" on the scorecard and is left out of the totals until reworded.
- Where code can decide, code decides: recall evidence, every Layer 2 check, and the must-stay events of Layer 4 need no grader. Five graded checks are left: behavioural impact for three anchors, and the current state of two changed items.
- Hand labels are the honest test, more than the written-in cases. **Not built yet:** the label sheet reads the prompt eval run's reports, not this eval's, so Layer 3's replies are not yet on it.

## Control of variables

- Play model: GLM-5.3, the app's sampler values. Background model and grader: DeepSeek V4 Flash, the grader at temperature 0. Embeddings: bge-m3.
- Prompts are built by the app's own builders on the day, and the report records the commit and whether the tree had changes.
- The fixture is fixed in the repository. A change to it starts a new baseline, and the scorecard says so.
- Two runs are compared only when one thing changed between them.
- Each scene names the words its built prompt must hold, as other scenes do, so a scene cannot stop testing its thing silently.

## Baseline and report

- The run's existing JSON report and Markdown scorecard, under the eval runs folder that git ignores, gain a Memory section: one table a layer, as above, then every failed sample with its reply.
- The first full run is the baseline; `--against` compares a later run with it, layer by layer.
- The spec gets a "First run" section with the real figures, the real cost, and which expectations held.

## Cost

Estimates, to be replaced by the first run. The run prints its own figure without `--spend` before anything is spent.

| Layer | Calls | About |
|---|---|---|
| 1. Choice | Embeddings only, about 12,000 tokens, once | under $0.001, then free |
| 2. Extraction | 25 background | $0.01 |
| 3. Use | 45 play with about 6,000 prompt tokens each, 45 grader | $0.10 to $0.18 |
| 4. Story so far | 15 background with up to about 9,000 prompt tokens, about 15 grader | $0.01 to $0.02 |
| Grader check | about 40 | under $0.01 |

- About $0.15 to $0.20 for all four, under the $0.50 cap. Layer 3 is nearly all of it; at three samples it is about $0.07 to $0.11.
- The cap holds as it does today: the run stops before a call that could pass it.
- These scenes are named groups. They do not join `all`, which is already near the cap.

### Two approvals, kept apart

- **To build** (given 2026-11-25): the fixture, the scenes, the run's code and its tests. Tests use scripted answers and reach no network.
- **To spend** (not given): any call to a model or to the embedding host. The run refuses without `--spend`, and says its cost first. Each spend is asked of the user beforehand, with the figure: the grader check, then each layer or the full run. Approval to build is never read as approval to spend.

## Files

| File | Change |
|---|---|
| `apps/api/test/live/eval-memory-fixture.ts` | New: the Story, the Memories by Chapter, the six anchors, the Messages of Layer 4 |
| `apps/api/test/live/eval-memory-scenes.ts` | New: the cases and scenes of the four layers |
| `apps/api/test/live/eval-memory-run.ts` | New: runs the four layers, counts their cost, writes the Memory report. Layers 2 and 3 are played by the existing run |
| `apps/api/test/live/eval-grade.ts` | The grader check also reads the Memory scenes' graded checks; their written-in cases |
| `apps/api/test/live/eval.live.ts`, `apps/api/scripts/eval-live.mjs` | A `--memory` flag that starts this eval instead of the scenes |
| `apps/api/test/eval-memory.spec.ts` | New: tests through the run with scripted answers |
| this spec | The first run's results and the pass marks |

Changed from the first draft: the scenes stay out of the shared scene list and the run's own file, so `all` cannot pick them up and the existing run is not touched. **No file of the running app changes.** The eval reads the app's choice function, prompt builders and parsers.

## Testing Decisions

- One seam, the one the eval already has: the run itself, with its HTTP client handed in. Scripted answers, no network, nothing spent.
- Covered through it: the choice cases send only embedding calls and reuse saved vectors; each cause of an anchor not chosen is told apart; the three arms of an anchor differ only as this spec says; every new code check has an answer it passes and one it fails; a changed item is asked about only at the lengths after its change; a graded check with no pass case and no fail case is refused; nothing is sent without the spend flag, and the cost said beforehand counts every layer.
- Prior art: the existing eval run tests and the smoke run's.

## Out of Scope

- **Layer 5:** a played Chat that runs the Judge and the extraction between turns. The dearest and noisiest test. It follows only if the four layers pass and live still forgets.
- Any change to the memory system, the prompts or the architecture. This eval only measures.
- Settled Memories (picked in six of the last eight turns): they need a pick history the fixture does not have.
- DeepSeek V4 Pro as play model, until GLM-5.3 has a baseline.
- The user's real Stories and Chats.
- A self-running world, or any new feature.

## Further Notes

- **Four links passing does not prove the chain.** Each link is fed a clean input. A Memory the real extraction words badly may then be missed by the real search. Layer 5 is the answer to that, later.
- **The fixture's Memories are Claude's wording,** tidier than the background model's. Layer 1 may flatter the search for that reason. Once Layer 2 has run, its real extracted Memories of the anchors can replace the hand-written ones in Layer 1.
- **Risks seen in the code, not yet shown:** the Story so far is about 500 words whatever the story's length; the search query is the user's turn and four messages, with a floor of 0.35; a Memory carries no measure of how much it matters, so a major event competes with small ones as an equal.

## Before development is approved

- [ ] The four layers and their order are agreed.
- [ ] A synthetic Story with three Characters is agreed, with nothing from the user's own Stories.
- [ ] Six anchors, two of them the false belief and the changed event, are enough.
- [ ] No pass mark before the baseline is agreed, and the two faults-at-any-rate are agreed.
- [ ] The grader rule is agreed: a check that disagrees with a written-in case is read by eye, not counted.
- [ ] The cost is agreed: about $0.15 to $0.20 a full run, the grader check first, each spend on the user's go-ahead.
- [ ] The file list is agreed, with no change to the running app.
- [ ] Layer 5 stays out for now.

## Amendments (2026-11-25, on the user's review)

1. **Layer 3 reports recall evidence and behavioural impact as two measures,** never one score. Saying the telltale is not taken as proof the Character understood or changed.
2. **Layer 1 says why an anchor was not chosen:** no vector, under the similarity floor, or over the floor and left out for room.
3. **Layer 4's changed items have a timeline** with the state before and after, and the check asks who holds the thing now, not whether its name appears.
4. **The three anchors of Layer 3 are named,** with why each was picked.
5. **Approval to build is apart from approval to spend.**

And one correction of the draft's own, found on reading the code: the Story so far is rewritten from every covered Message each time, so Layer 4 measures five story lengths, not five rounds of a chain.

## Built (2026-11-25)

Built on the user's approval to build. **No model was called, no embedding was made, nothing was spent, nothing is committed.**

- **Four new files and four small edits,** as listed under Files. The one edit outside that list: a constant of the prompt eval run (the grader's answer format) is now exported, so the account grader asks in the same words.
- **28 tests,** every answer scripted; the whole API suite passes (2,328). The run’s code for each layer was written after its tests were seen to fail; the fixture and the scenes, being data, were written before their tests.
- **Counts as built:** 245 Memories, 6 anchors, 30 choice cases (18 plain, 12 with the budget crowded), 5 extraction scenes with 15 checks, 8 use scenes, 5 story lengths, and 17 written-in grader cases for the 5 graded checks.
- **Commands:**

```
npm run eval:live -- --memory                       (spends nothing: says what each layer would cost)
npm run eval:live -- --memory --spend               (all four layers)
npm run eval:live -- --memory choice --spend        (one layer; also extraction, use, account)
npm run eval:live -- --memory --spend --against last
npm run eval:live -- --grade --spend                (the grader check, now with this eval's cases)
```

- **What a run would cost, as the run itself says without `--spend`:** choice, 263 texts to embed once, under a tenth of a cent; extraction, 25 calls, about $0.004; use, 70 calls, about $0.172; account, 24 calls, about $0.009. In all about $0.185, at most $0.434, under the cap. The grader check with the new cases: 86 calls, about $0.004.
- **Reports** go to the eval runs folder under names of their own (`memory-…`), so the prompt eval run never reads them back. Vectors are kept beside them, so Layer 1 is free after its first run.

### Not tested, and only a real run can say

- Whether any check is fair to a real answer. Every check was written against no real reply; the first run is a check of the checks, as it was for the prompt eval run.
- Whether the three use scenes pull the way they were built to: that Sera's card really refuses the ledger without the Memory, Bram's really lends the boat, Ilse's really serves. If a card does not hold in arm B, the difference means nothing for that anchor, and the scene needs rewriting.
- Whether the context cues are fair: related enough that a person would recall the event, yet without its words.
- Whether the grader agrees with the 17 written-in cases.
- The real embedding model's scores. In the tests, vectors are made of shared words; with the four recent Messages in the query, even the direct cue scored under the floor there. That may be the first real finding or an artefact of the test's vectors.
- The account's Messages are the events told flatly, not played prose. A real Chat's Messages are longer and looser.

### Left out of what the spec planned

- The label sheet for Layer 3's replies (above).
- "No vector" is kept as a cause in Layer 1 but cannot happen in this run, as every Memory is embedded first.

## The grader check (2026-11-25, with the user's go-ahead)

`npm run eval:live -- --grade --spend`: 86 calls, **$0.0024**, each case asked twice at temperature 0.

- **All 17 of this eval's written-in cases agreed with their label, none unsteady:** behavioural impact for the rescue (4 of 4), the report (4 of 4) and the fire (3 of 3); the lock key (3 of 3); Bram's boat (3 of 3). That includes the hard ones: warm but no, names the event but no, and an old state given as past.
- So the five graded checks may be counted on the scorecard for now.
- **What that does not say:** the cases are short and clean, and Claude wrote both the cases and the criteria. Real replies are longer and less plain. Two asks a case is thin for "steady".
- Unrelated to this eval: "does not keep pressing" is at 18 of 20 replies with one unsteady, as it was before.

## First run: the baseline (2026-11-25, with the user's go-ahead)

`npm run eval:live -- --memory --spend`, GLM-5.3, five samples: **$0.087**, under half the $0.185 the run had said. The report is `memory-2026-11-25T02-13-56-412Z-glm-5.3` in the eval runs folder. Read by eye before anything below was written.

**This run is a check of the checks first.** Four of its results are the eval's own faults, named as such below. They are not counted as findings about the app.

### Layer 1, Choice

- **A turn that names the event finds its Memory:** 6 of 6 sent, all in the top 20 by score, 4 in the top 5.
- **A turn that only relates to it ranks it far down:** places 6, 52, 53, 69, 93 and 152 of 245. Five were still sent, and the sixth (Bram handed a written contract, who cannot read) was left out for room.
- **Why the five were sent is the finding.** The floor of 0.35 filters nothing with this embedding model: the lowest score any anchor got on any turn was 0.417, and about 139 Memories cleared the floor every time. So the search sends the top 139 or so until the 4,000 tokens are full, which at 245 Memories is more than half the Chat. An unrelated turn sent the anchor too, 5 times in 6.
- **About nine in ten of the Memories sent by meaning are off the turn's topics,** on every kind of turn.
- Live agrees: a recent turn of the user's own Chat logged 53 Memories sent by meaning and 24 settled, with the floor at 0.35.
- **What this layer cannot say at this size:** whether a context cue's Memory is sent in a Chat of 1,000 Memories. At rank 52 to 93 it would not be. The fixture is too small to show it, and should grow or the budget be cut for the test.
- With the budget crowded by locked Memories the ranks are the same and the same one is left out.

### Layer 2, Extraction

| Scene | What the scorecard said | Read by eye |
|---|---|---|
| The rescue | event 5 of 5, known by Sera 5 of 5 | Right. |
| The secret, others away | "known only by Bram" 0 of 5 | **The check's fault.** The lists held Bram and the user; the app drops the user from a known-by list. Bram alone of the cast, 5 of 5. |
| `{user}`, never the name | 1 of 5, 3 of 5, 4 of 5 | **The check's fault.** The model wrote "Corin" most times, and the app rewrites the name to `{user}` itself when it stores a Memory. No fault reaches the Chat. |
| The lie | Ilse's Belief 4 of 5; never stated as fact 5 of 5 | Right, and one answer of five held no operation at all. |
| The lantern, known only by Bram | 1 of 5 | Half the scene's fault: the truth was told in narration only, which a played Chat rarely does. But one answer stored "Corin was at the lock-house all evening" as known by Bram **and Ilse**, giving its reason as "the Narrator confirms it; Bram and Ilse are present and hear it". A Character does not hear the narration. That one is the app's. |
| The key changing hands | 5 of 5 on both | Right: the old Memory was updated by its id every time. |
| The promise in small talk | 5 of 5, no small talk kept | Right. |

### Layer 3, Use

| Anchor | Recall evidence | Behavioural impact, with | Without | Read by eye |
|---|---|---|---|---|
| report (Bram) | 0 of 5 | 0 of 5 | 0 of 5 | Bram lends the boat every time, with his card's own words ("Take her, take her"), and the fine is never mentioned. The Memory says he "has not forgiven it". |
| fire (Ilse) | 1 of 5 | 0 of 5 | 2 of 5 | Ilse makes and sells the draught civilly every time. One reply names Candle Night and sells all the same. The Belief is in the prompt as a line of its own, under "A Character acts on what they believe". |
| rescue (Sera) | 0 of 1 | 0 of 1 | 5 of 5 | **Not measured.** Four of five calls failed: the host was rate-limiting GLM-5.3. And the scene is the eval's fault (below). |

- **The finding, on two anchors and ten replies:** a Memory, and a Belief, that should have turned a Character against the user changed nothing. The card won. Recall evidence was 1 in 10.
- **What it does not yet say:** why. The anchor's line stood first of about 130 Memories in a full 4,000-token layer, and each card has an example line that says the opposite. The same scene with the anchor alone, no other Memories, would tell crowding from the card's pull. That is the next thing worth a few cents.
- **The rescue scene is wrongly built.** The ask was "the count of boats", and Sera gave the count from memory or read it aloud while keeping the book shut, with the Memory and without. The criterion counted reading aloud as showing the ledger, so "without" passed 5 of 5. The ask has to be something only the ledger itself can give.
- **The grader's fault, on real replies:** in the fire's "without" arm it passed two replies in which Ilse is kind and asks questions before selling, reading "has not sold it yet" as "does not serve him". The written-in cases were all plainer than that. The criterion needs a case of that kind, and a rewording.
- No reply without the Memory invented the event, and none brought it up on the off-topic turn: 0 of 25.

### Layer 4, Story so far

- **Ten of fifteen accounts were cut off at the writer's cap** and the app would not have stored them. The five that finished ran 309 to 916 words against the 500 asked for.
- **Partly the fixture's doing:** its Messages are events told one sentence each, so there is little to squeeze, and the writer is told to "keep every detail that could matter later". Played prose has more to drop.
- **But the fault is on live too.** The live API log holds "The Story so far writer was cut off at its length cap" 20 times. Each is an answer thrown away and asked for again, and a second one in a row leaves the Story so far a turn stale. (Corrected 2026-11-25: the log covers twelve days, and that is 20 answers cut off in 15 of 67 updates, of which 5 failed. See [the Story so far length spec](../story-so-far-length/spec.md).)
- What little was measured: through Chapter 6 all four events were in all three accounts. Through Chapter 24, in the two accounts that finished, the rescue and the report were each in one of two, and both changed items gave the later state. Too few to read.
- The layer needs Messages written as played prose before it can say what the account loses.

### Which expectations held

| Expected | Held? |
|---|---|
| Direct cues find the anchor | Yes |
| Context cues are where it fails | Yes by rank; hidden at this size by a floor that filters nothing |
| An unrelated turn does not pick the anchor | No: 5 of 6 |
| A plain event, an absent Character and a buried promise extract well | Yes |
| The lie and the changed event are in doubt | The change held; the lie mostly held |
| The telltale in arm A is the open question | Answered: 1 in 10 |
| Arm B invents nothing | Yes |
| Arm C is in doubt | It held: 0 of 10 |
| Minor details go first; major events are the question | Not measured |

### To mend in the eval before the next run (none of it done)

1. Layer 2: take the user out of the known-by check, and drop the `{user}` check, as the app mends both.
2. Layer 3: a new ask for the rescue; a harder case and a rewording for the fire's criterion; a third arm with the anchor alone.
3. Layer 4: Messages as played prose.
4. Layer 1: a longer Chat or a smaller budget, so being sent is not nearly certain.

### What the app may want, for the user to decide (none of it done)

- The similarity floor is no filter for this embedding model. The Memory layer is full on every turn, mostly with Memories off the turn's subject.
- A Memory or a Belief that cuts against a Character's card loses to the card.
- The Story so far writer overruns its cap, on live as here.
- The extraction can take the narration as heard by those present.

## The eval mended, and a second run of Layers 1 and 3 (2026-11-25, with the user's go-ahead)

### Mended

1. **Layer 2:** the known-by check skips the worn identity, as the app does; the `{user}` check is gone, as the app writes `{user}` itself. Not rerun: on the first run's answers the secret scene is then 5 of 5.
2. **Layer 3:**
   - The rescue's ask is now for the book itself ("sit with the lock ledger himself and copy out the year's passages"), and its criterion fails a reply in which she keeps the book and reads aloud.
   - The fire's criterion is worded as one thing to find, with two cases from real replies added (kind questions before a sale; names the night and serves all the same).
   - **A fourth arm, "alone":** the same turn with the anchor's Memory and no other. It tells a Memory lost in the crowd from one the card overrules. Eleven scenes now.
3. **Layer 1:** twelve more cases with a quarter of the budget (1,000 tokens), which is what a Chat four times as long leaves each Memory.
4. Layer 4 was not touched: it still needs Messages written as played prose.

28 tests still, changed before the code and seen to fail; the eval's 162 tests pass. The grader check, three asks a case: **all 20 of this eval's cases agree, none unsteady** ($0.003).

### The second run: $0.092

**Layer 1, with a quarter of the budget.** A turn that names the event still finds its Memory, 6 of 6. **A turn that only relates to it finds it 1 time in 6.** The other five cleared the floor and were left out for room, at places 52, 53, 69, 93 and 152. So in a Chat about four times this one's size, recall by context is mostly gone, and the floor is not what decides it: the budget is.

**Layer 3, read by eye.**

| Anchor | Among about 130 Memories | Alone | Without it |
|---|---|---|---|
| report (Bram): refuses the boat | 1 of 5 | **4 of 5** | 0 of 5 |
| report: speaks of the fine | 2 of 5 | 5 of 5 | 0 of 5 |
| fire (Ilse): names Candle Night | 1 of 5 | 4 of 5 | not measured |
| fire: refuses or is openly cold | 1 of 5 | 0 of 5 | not measured |
| rescue (Sera): names Tobin or the Marigold | not measured | 4 of 5 | 0 of 5 |
| rescue: hands him the ledger | not measured | 0 of 5 | 2 of 5 |

- **Bram is the clean result: the Memory works, and the crowd buries it.** Alone, he refuses four times in five and gives the forty crowns as his reason. Among the other Memories he lends the boat four times in five with his card's own words. Same card, same turn, same Memory.
- **The fire says the same of recall:** Candle Night named 4 of 5 alone, 1 of 5 in the crowd.
- **Ilse reads the Belief and still serves him.** Alone she is cool (she does not offer her hand; "pleasant the way a counter is pleasant") and sells the draught. That is a fair reading of a Character who "serves every customer alike", and the criterion asks for more than the card allows. Recall and impact came apart here, as the user's review said they might.
- **Sera weighs the debt and keeps the rule,** and says so: "You pulled Tobin out of the water. I know what I owe you for that. If you need a boat, my boat. If you need coin, coin. Not the book." The Memory changed what she offers, not the one choice the criterion names. Counted as no impact; a reader would call it the Memory at work. The criterion is too narrow for her.
- **Her card does not hold without the Memory:** twice in five she set the book in front of him. So for the rescue the difference still means little.
- **A Character used what only another knows, 2 times in 10:** Ilse spoke of "a lantern left carelessly in a dry shed". The Memory of the lantern is tagged as known by Bram alone.
- **The telltale was too narrow for the report:** "Vessin" was never said, and "forty crowns" was, so the scorecard shows recall 0 of 5 where the event was plainly recalled. The figures above count the event's own words.
- No reply without the Memory invented the event.

**Not measured, twice now:** the host rate-limited GLM-5.3 on the first calls of the layer and again later, so the rescue among the others has one reply, and the fire without the Belief has none. The run does not retry a failed call.

### What the two runs say together

- Naming an event finds its Memory. Relating to it does not, once the Chat is long.
- The Memory layer is full on every turn, about nine parts in ten of it off the subject, because the floor filters nothing.
- A Memory that is alone is read and acted on. The same Memory among 130 mostly is not. These two findings are likely one: the crowd the search sends is what buries the Memory the turn needed.
- Each rests on five replies a cell, one Story and one play model. It is a direction to test, not a size.

### Still to mend in the eval (none of it done)

- Retry a rate-limited call, or let a run play named scenes alone, so missing cells can be filled without paying for the layer again.
- The report's telltale; the rescue's and the fire's impact criteria, which ask for a choice the card may rightly refuse.
- Layer 4's Messages.

### For the user to decide about the app (none of it done)

1. The similarity floor and the Memory budget: fewer, nearer Memories a turn.
2. The Story so far writer's cap, overrun on live: 5 updates of 67 failed in twelve days (first written here as "20 times in 30 days", which counted answers, not failures, over the wrong span).
3. A Character using a Memory it is not tagged on.
4. The extraction taking narration as heard by those present.

## The gaps filled (2026-11-25, with the user's go-ahead)

### Built for it

- **A failed call of Layers 2 and 3 is played again,** twice at most, twenty seconds apart, and only the samples that are missing. The app's client already retries a rate limit a few times within a call; the two real runs failed past that.
- **A scene can be named in place of its layer** (`npm run eval:live -- --memory use-rescue-with use-fire-without --spend`), and is then played alone, so a missing cell costs its own calls and not the layer's.
- Three more tests (31 in all), written first and seen to fail.

### The two missing cells: $0.022, 20 calls, none failed

| Cell | Scorecard | Read by eye |
|---|---|---|
| rescue, among the others: names Tobin or the Marigold | 1 of 5 | 1 of 5 |
| rescue, among the others: hands him the ledger | 0 of 5 | **1 of 5.** In the reply that names Tobin she says "The Board is not here", opens the book and tells him "You copy." The grader failed it, quoting an early line where her hand is still on the cover. |
| fire, without the Belief: refuses or is openly cold | 0 of 5 | 0 of 5: she serves him kindly every time, as her card says. |

### The table, complete

| Anchor | Measure | Among about 130 | Alone | Without |
|---|---|---|---|---|
| rescue (Sera) | recall: names Tobin or the Marigold | 1 of 5 | 4 of 5 | 0 of 5 |
| rescue | impact: hands him the ledger | 1 of 5 | 0 of 5 | 2 of 5 |
| report (Bram) | recall: speaks of the fine | 2 of 5 | 5 of 5 | 0 of 5 |
| report | impact: refuses the boat | 1 of 5 | 4 of 5 | 0 of 5 |
| fire (Ilse) | recall: names Candle Night | 1 of 5 | 4 of 5 | 0 of 5 |
| fire | impact: refuses or is openly cold | 1 of 5 | 0 of 5 | 0 of 5 |

- **Recall is the steady result, on all three anchors:** about 1 reply in 4 among the other Memories (4 of 15), about 9 in 10 alone (13 of 15), never without (0 of 15).
- **Impact follows recall only for Bram.** Sera and Ilse read the Memory and keep to their cards, which for each is a fair way to play her. Their criteria ask for the one choice the card forbids, and so measure the card more than the Memory.
- **The grader misread one long real reply of fifteen in this cell** though it agrees with all twenty written-in cases. A verdict on a long reply should be read with its quote: a quote from the reply's first lines, when the choice comes in its last, is the sign.

Spent in all on this eval: **$0.207** (the grader check twice, $0.005; the full run, $0.087; the second run, $0.092; the gaps, $0.022).

## The limits worked on (2026-11-25, on the user's word; built, not yet run)

| Limit | What was done | What is left |
|---|---|---|
| Sera's and Ilse's impact criteria measured the card | Each is now asked for a thing her card leans against and does not forbid. Sera: a loan of twelve crowns (her card: "as a habit she does not lend money"; the ledger rule is gone from it). Ilse: whether he may sit by her stove and draw (not a sale, so "serves every customer alike" does not settle it). | Whether each card now gives a steady "no" and "yes" without the Memory. Only a run can say. |
| The grader failed a long reply on its first lines | Every impact criterion now ends "Judge by how the reply ends". A written-in case is that shape: it opens against the loan and ends by counting the coins out. All ten cases of the two changed scenes are rewritten for the new asks. | The grader check has not been run on them. |
| The report's telltale was too narrow | "Forty crowns" is a telltale beside "Vessin". | |
| Layer 4's Messages had nothing to squeeze | Between the events of each Chapter there is now weather and small talk, 36 lines of it, about as many words again as the events. None holds a thing the account is marked on. | Still not played prose, and the writer may overrun its cap all the same: that would then be the finding. |
| Five replies a cell | `--samples` goes to 10, and a failed call is played again. | The spend. At ten samples Layer 3 could pass the cap if every call ran long, so it wants two commands. |
| One play model | `--model deepseek-v4-pro` already works. | The spend. |
| One Story | Not done. A second Story is a second fixture: a day's writing, not a setting. | All of it. |

33 tests; the whole API suite passes (2,333). The run says, without `--spend`: Layer 3, 100 calls, about $0.21; Layer 4, 24 calls, about $0.013; the grader check, 92 calls, about $0.005. The real runs so far cost about half of what the run said beforehand.

## The third run, after the limits were worked on (2026-11-25, with the user's go-ahead)

The grader check first, three asks a case: **all 20 of this eval's cases agree, none unsteady** ($0.004), the long reply that opens against the loan and ends by making it among them. Then Layers 3 and 4: **$0.112**, no failed call. Every verdict below was read against its reply.

### Layer 3, with asks the cards do not forbid

| Anchor | Measure | Among about 130 | Alone | Without |
|---|---|---|---|---|
| rescue (Sera) | recall | 1 of 5 | 5 of 5 | 0 of 5 |
| rescue | impact: lends the twelve crowns | 2 of 5 | 4 of 5 | 1 of 5 |
| report (Bram) | recall | 1 of 5 | 5 of 5 | 0 of 5 |
| report | impact: refuses the boat | 0 of 5 | 5 of 5 | 0 of 5 |
| fire (Ilse) | recall | 0 of 5 | 4 of 5 | 0 of 5 |
| fire | impact: does not welcome him | 0 of 5 | 5 of 5 | 0 of 5 |
| **all three** | recall | **2 of 15** | **14 of 15** | 0 of 15 |
| **all three** | impact | **2 of 15** | **14 of 15** | 1 of 15 |

- **The cards now hold without the Memory** (1 of 15 the other way), so the difference means something for all three.
- **Alone, the Memory is read and acted on nearly every time.** Sera: "That's not a loan. That's a debt on my side." Ilse: "I will have the truth of the shed first, before you take a seat by my fire." The one "alone" fail is Sera giving the twelve crowns as a payment for the survey: the money given, in another name.
- **Among the others it almost never is.** Bram lends the boat with a joke about the toll man. Ilse tells him where the small logs are.
- **Recall and impact now move together.** In the earlier runs they came apart because the cards forbade the choice.
- No verdict of the grader's was found wrong this time, in 60 graded replies.

### What "among the others" does not separate

The other Memories are not noise. They are the next 25 Chapters of the same people: Corin draws Ilse's book, carries stone with Bram, works Sera's lock for her. A reader could say a year of that outweighs an old grievance, and that the warm reply is the right one. So two causes are still mixed: **the Memory is buried**, and **the later Memories speak against it**. Recall says some of it is burial: an old grievance that is outweighed is still remembered, and here it is mentioned 2 times in 15. A clean test would set the anchor among as many Memories that do not involve that Character and the user. Not built.

For the fire it is plainer, as a Belief is held now: the prompt says Ilse believes he burned her shed, and she offers him the cordial.

### Layer 4, with weather and small talk between the events

- **Nine of fifteen accounts were cut off at the cap again;** from Chapter 24 on, all of them. Those that finished ran 695 to 1,469 words against the 500 asked for.
- So the padding was not the cause. The writer copies the events out in order, a sentence each, under "keep every detail that could matter later", and does not squeeze. Asked for 500 words, it writes until it is stopped.
- In the six that finished, all four major events were there every time, and the one account long enough to be asked gave the key's later state. Minor details fell from 2 of 4 to none by Chapter 18.
- **What the layer was built to ask, which events an account loses as the story grows, is still unanswered,** because past Chapter 18 there is no account to read. That is itself the answer for now: on a long story the app may have no fresh Story so far at all.
- The fixture's story is dense, eight events a Chapter that each could matter. A played Chat has fewer. Live has the same fault (5 failed updates of 67 in twelve days; first written here as "20 times in 30 days"), so it is not only the fixture.

Spent on this eval in all: **$0.323.**

## Buried, or spoken against: a crowd that is not hers (2026-11-25, with the user's go-ahead)

A fifth arm, "among strangers": the anchor's Memory beside as many Memories (about 3,400 tokens) that neither name the Character nor are known by her. Same card, same turn. Three scenes, five samples: **$0.032**, 30 calls, none failed. Three more assertions in the tests; the whole API suite passes (2,333).

| All three anchors | Among the others (the later past of the same two people) | Among strangers | Alone | Without |
|---|---|---|---|---|
| recall | 2 of 15 | 10 of 15 | 14 of 15 | 0 of 15 |
| impact | 2 of 15 | 10 of 15 | 14 of 15 | 1 of 15 |

By anchor, among strangers: the report 5 of 5 on both; the fire 2 of 5 recall by its telltale and 4 of 5 impact; the rescue 3 of 5 recall and 1 of 5 impact.

- **This changes the reading of the third run.** Most of the loss is not burial. A crowd of the same size that says nothing of the two of them costs about four replies in fifteen (14 down to 10). The later Memories of the same two people cost eight more (10 down to 2).
- So the Character is not failing to find the old Memory in a long list. The model reads a year of working side by side and plays the two as on good terms, and the old grievance, debt or Belief goes unsaid.
- **Whether that is a fault depends on the Memory.** An old grievance worn down by a year of friendship is a fair way to tell it, though nothing in the Chat ever said it was mended. A Belief is another matter: the prompt says Ilse believes, now, that he burned her shed, and among the later Memories she offers him the cordial.
- **Burial is real and smaller:** 4 in 15, and uneven. Bram's grievance survives a crowd whole; Sera's debt does not (impact 1 of 5), though she names it 3 times in 5.
- Read by eye, two of the fire's four passes are thin (she lets him draw, unsmiling). Call impact among strangers 9 or 10 of 15.
- Ilse spoke of the lantern once in these five. Over all runs: 3 replies in 20 where its Memory was in the prompt.
- Five replies a cell, one Story, one model, as before.

### What it means for the app (nothing done)

- Cutting the Memory layer to fewer, nearer Memories would win back some recall, not most of it.
- The larger question is one the app has no place for today: **whether a thing between two people is still open.** A Memory is a line in a list; nothing marks a grievance as unmended or a debt as unpaid, and a year of ordinary Memories reads as an answer. Bonds carry feeling as numbers, and were left empty in these scenes; a run with the Bond set would say whether they already do this work.

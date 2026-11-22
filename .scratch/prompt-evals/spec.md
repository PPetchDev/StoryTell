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

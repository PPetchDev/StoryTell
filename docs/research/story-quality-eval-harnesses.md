# Research: Harnesses and techniques to make the prompt eval run better

Asked for: "find a harness to make our system better", area chosen: the quality of the stories the AI writes.
Researched: 2026-11-23. Versions, dates and licences were read that day from each project's own repo, docs, npm or PyPI page.
Scope: what exists outside this repo that could improve the **prompt eval run** (`.scratch/prompt-evals/spec.md`). Nothing was installed, no model was called, no credit was spent. This note makes no decision; each item ends in adopt, borrow the idea, or skip, with the reason.

Words follow `CONTEXT.md` (Chat, Story, Character, Judge, Memory, Established facts) and the eval spec (eval scene, check, code check, graded check, scorecard, grader). "Play model" is GLM-5.3 or DeepSeek V4 Pro; the grader is the background model, DeepSeek V4 Flash.

Marks used below: **(source)** a link to the page that owns the claim. **(inference)** my own reasoning, not something a source says. **(estimate)** my own arithmetic from the spec's first-run figures.

---

## Verdict

No general harness is worth adopting. The ones that fit the language (TypeScript, vitest) either send the simulated user's side to a hosted service, need a newer vitest than the repo has, or were archived this month. What the run already does (spend gate, cap, own prompt builders and parsers, Fisher's exact comparison) is more than any of them would give. The value is in four ideas to borrow, ranked by value against cost:

1. **Score the prose with code checks: a slop score and a cross-reply repetition score.** The word and phrase lists and the method are open (MIT), already in JavaScript, and run with no model call. Cost per run: $0. It fills gap 4 and gives every existing scene a number that is not "all pass". See [gap 4](#gap-4-prose-quality-is-not-scored).
2. **Calibrate the grader before trusting it further.** Hand-label a few dozen replies already saved under `.data/eval-runs/`, add replies written to be bad on purpose, and report how often the grader agrees. Cost: grader calls only, well under a cent a round (estimate). See [gap 3](#gap-3-the-grader-is-trusted-without-calibration).
3. **One "played Chat" scene: 10 to 12 turns with scripted user turns, scored as a whole.** Build it in the existing run (the app's own turn prompt builder in a loop), not with a library. Cost: a few cents a sample (estimate). It is the only way to see repetition and fact drift build up. See [gap 1](#gap-1-no-conversation-scored-as-a-whole).
4. **Make scenes able to fail.** Every check gets a known-bad reply it must fail; scenes get a distractor (a wrong number in the history, a tempting user turn); a scene that never fails on any model is marked as such. Cost: $0 for the first part. See [gap 2](#gap-2-no-scene-is-known-to-be-hard-enough).

Lowest priority, and not recommended now: automatic prompt optimisation ([gap 5](#gap-5-automatic-prompt-optimisation)). It needs a metric that separates good from bad first, which items 1 to 4 build.

---

## Gap 1: No conversation scored as a whole

### What exists

- **The simulated-user pattern.** A second model plays the user against the system under test, and the finished conversation is scored. τ-bench introduced it for tool agents, and added **pass^k**: the share of tasks passed in all of k trials, not just once. Its headline finding is that agents are inconsistent (pass^8 under 25% in one domain). (source: https://arxiv.org/abs/2406.12045)
- **Roleplay versions of it.**
  - PingPong: three roles, a *player* (the Character), an *interrogator* (plays the user in a given situation) and a *judge* (an ensemble of models). It scores character consistency, entertainment value and language fluency, over 64 conversations a model (8 characters by 8 situations), and reports strong correlation with human annotation. English and Russian. (source: https://arxiv.org/abs/2409.06820)
  - RPBench-Auto: the judge model (GPT-4-Turbo) also writes the user's next turn. Each turn the candidate's reply is compared with a baseline model's reply, and "the preferred response is then used to continue the conversation". 5 turns per persona, up to 10 per scene; the result is a win rate. Python, Apache-2.0, last push 2024-09. (sources: https://boson.ai/rpbench-blog/ , https://github.com/boson-ai/RPBench-Auto)
- **Self-chat for drift.** Li et al. let two instructed chatbots talk to each other and measure how fast each stops following its system prompt: "significant instruction drift within eight rounds". (source: https://arxiv.org/abs/2402.10962) This repo's `keeping-characters-in-character.md` already cites it for the finding; the point here is the *method*.
- **Longform degradation.** The EQ-Bench longform writing benchmark has a model write eight chapters of about 1,000 words in sequence and scores each chapter 0 to 20, so a decline can be read from the per-chapter scores. MIT. (source: https://github.com/EQ-bench/longform-writing-bench)
- **Library support for the loop.**
  - `openevals` (LangChain, MIT, npm 0.2.3 of 2026-10-22) has `runMultiturnSimulation` and `createLLMSimulatedUser` in TypeScript. The app is a function that takes the latest user message and a `threadId`; the simulated user is a function of the trajectory; `maxTurns` or a `stoppingCondition` ends it; `trajectoryEvaluators` run once on the final trajectory. The prebuilt simulated user takes "a LangChain chat model instance". (source: https://github.com/langchain-ai/openevals , README "Multiturn simulation")
  - promptfoo has a `simulated-user` provider (`instructions`, `maxTurns` default 10, `###STOP###` to end). **Its user side runs on promptfoo's servers:** "By default, SimulatedUser uses Promptfoo's hosted conversation models." (source: https://www.promptfoo.dev/docs/providers/simulated-user/) The provider's source posts the instructions, the whole conversation `history` and the user's `email` to the remote endpoint, and when remote generation is disabled it returns an error ("SimulatedUser requires Promptfoo's conversation simulation models") instead of using a local model. (sources: https://github.com/promptfoo/promptfoo/blob/main/src/providers/promptfoo.ts , https://github.com/promptfoo/promptfoo/blob/main/src/providers/simulatedUser.ts) The privacy notice confirms these features "send prompts to Promptfoo's servers". (source: https://www.promptfoo.dev/privacy/)
  - promptfoo also has a *scripted* multi-turn form: tests that share a `conversationId` share one history through the `_conversation` variable, run one at a time. No model plays the user. (source: https://www.promptfoo.dev/docs/configuration/chat/)
  - DeepEval has a `ConversationSimulator` (a `ConversationalGolden` with `scenario`, persona and `expected_outcome`; a `model_callback` wraps the app; `max_user_simulations` default 10; the simulator model can be any custom model). The page shows Python only. (source: https://deepeval.com/docs/conversation-simulator) Its Role Adherence metric scores a conversation as assistant turns in role over all assistant turns, one grader question per turn, and that page does show TypeScript. (source: https://deepeval.com/docs/metrics-role-adherence)

### What it would take here

- A new scene kind, a **played Chat**: an Opening, then N user turns. Each reply is appended to the history and the next turn is built with the app's own turn prompt builder, exactly as a scene is built today. About 100 to 150 lines in `apps/api/test/live/eval-run.ts` (inference from its current 697 lines and its existing scene kinds).
- **Scripted user turns first, not a model playing the user.** A fixed list of user turns is free, repeats exactly, and keeps `--against` comparisons clean. A model-played user adds its own noise and its own cost, and its text would have to be written by the background model. This is promptfoo's `_conversation` idea, not its simulated user. (inference)
- **Checks that only a whole conversation can answer**, mostly code checks:
  - the same phrase in how many of the N replies (the app's own repeated-phrases detector, `speech/repeated-phrases.ts`, run over the conversation);
  - the slop score of reply 1 against reply N (gap 4);
  - an Established fact asked at turn 2 and again at turn 10: same value both times;
  - reply length at turn 1 against turn N;
  - one graded check per Character over all their speech lines, DeepEval's Role Adherence shape: lines in voice over all lines.
- **What it leaves out.** The real app runs the Judge and Memory extraction between turns, and they feed Established facts and Memories into the next turn. A played Chat that skips them tests the turn prompt on a growing history only. Running them too doubles the calls and tests the whole loop. Start without; say so on the scorecard. (inference)
- **Cost (estimate).** The first real run cost $0.024 for 27 calls at about 1,800 prompt tokens, so about $0.0009 a call. In a 12-turn played Chat the prompt grows by a reply and a user turn each time, so the average call is about twice that size: about $0.02 a conversation, $0.06 at three samples, before any cache discount. Inside the $0.50 cap; the cap's worst-case sizing needs to know the history grows.
- **Samples and odds.** Three conversations give three values per check, the same thin footing as three samples a scene. τ-bench's pass^k is the honest way to report it: "held in all 3 of 3".

### Verdict

**Borrow the idea; build it in the existing run.** Skip promptfoo's simulated user (the user side of an adult scene would go to a hosted service with an email attached). Skip `openevals` for now: its loop is about 30 lines of our own code, and its prebuilt user wants a LangChain model the repo does not otherwise have. Come back to a model-played user (PingPong's interrogator) only if scripted turns prove too easy.

---

## Gap 2: No scene is known to be hard enough

### What exists

- **Edge cases by design.** Anthropic's eval guide says to mirror the real task and "factor in edge cases", listing irrelevant input, overly long input, poor or harmful user input, and ambiguous cases; and to "prioritize volume over quality". (source: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- **Criteria come from reading outputs, not before.** Shankar et al. call it *criteria drift*: "users need criteria to grade outputs, but grading outputs helps users define criteria". Their tool, EvalGen, proposes candidate checks (code or grader prompts), has the user grade a sample, and keeps the candidates that agree with those grades. (source: https://arxiv.org/abs/2404.12272) This matches the spec's own rule that "a scene earns its place the first time it catches something".
- **Reliability over trials.** τ-bench's pass^k (above): a scene that passes 3 of 3 may still fail 1 in 8. (source: https://arxiv.org/abs/2406.12045)
- **Planning the size of a run.** Miller treats an eval as an experiment and gives formulas for standard errors, for comparing two runs, and for deciding how many samples a given difference needs. (source: https://arxiv.org/abs/2411.00640)
- **A measure of whether a judge separates strong from weak.** Judgemark scores a judge model on "how well it separates strong from weak creative outputs" and "how stable the judge's rankings are across repeated runs". (source: https://github.com/EQ-bench/Judgemark-v2) The same two questions apply to a scene: does it separate, and is it stable.
- **Generated adversarial inputs.** promptfoo's red team generates attacks, by default through "a remote service"; local generation is possible but "generally low" quality by its own docs. Its targets are safety and security failures, not story quality. (source: https://www.promptfoo.dev/docs/red-team/configuration/)

### What it would take here

All inference from the sources above, sized against the current code:

- **Known-bad replies (negative controls).** For each check, one scripted reply that must fail it, run through the existing scripted-`fetch` seam. The spec already tests code checks this way; extend it to *graded* checks by sending a few known-bad replies to the real grader (see gap 3). $0 for code checks.
- **Distractors.** Make the wrong answer tempting inside the synthetic scene: the Established fact says "eleven summers" while the history says "nine" twice and "six" once (the exact live failure); the user's turn narrates half an action and invites the model to finish it for them; the Secret scene has the user guess the Secret correctly. Each is an edit to one scene file.
- **Mine failures, keep scenes synthetic.** When play shows a failure, write down its *shape* (what the prompt held, what the reply did) and rebuild that shape with synthetic people. Nothing from a real Chat leaves the PC.
- **A discrimination column.** Record, per scene, whether it has ever failed on any model or prompt. A scene that never has is "unproven", not "passing". One way to prove a scene without spending: run the set once on a free, weaker model (the story-quality spec already used a free OpenRouter model for a rule check). If the weak model also passes everything, the scenes are too easy.
- **A prompt with the rule removed.** Build the scene's prompt with the block under test deleted (no Established facts block, no repeated-phrases line). If the reply still passes, the scene does not test the block. This costs one extra sample set per scene, once, not every run.

### Verdict

**Borrow the ideas** (negative controls, distractors, the discrimination column, pass^k wording). **Skip** promptfoo's red team: wrong target, and its good generation is hosted.

---

## Gap 3: The grader is trusted without calibration

### What exists

- **Known judge biases.** Zheng et al. name position bias, verbosity bias and self-enhancement bias, and find a strong judge reaches over 80% agreement with human preference, "the same level of agreement between humans". (source: https://arxiv.org/abs/2306.05685)
- **Self-preference is real and tied to self-recognition.** LLM evaluators rate their own outputs higher than humans do, and the bias grows with the model's ability to recognise its own text. (source: https://arxiv.org/abs/2404.13076) G-Eval's authors flag the same risk: LLM evaluators may favour LLM-written text. (source: https://arxiv.org/abs/2303.16634)
- **Use a different model to grade.** "Generally best practice to evaluate with a different model from the one used to generate the evaluated output." (source: https://platform.claude.com/docs/en/test-and-evaluate/develop-tests)
- **Align the grader to human grades on a sample.** EvalGen's whole method: grade a subset by hand, keep the grader prompts that agree. (source: https://arxiv.org/abs/2404.12272)
- **Pairwise judging with bias controls**, as EQ-Bench creative writing does it: every comparison runs "in both A/B and B/A orders" and is averaged; outputs are cut to 4,000 characters "to limit length bias"; the judge writes its reasoning first, then picks a winner per criterion with a margin; the README lists the biases it does *not* control, including judge self-bias and "NSFW content aversion". (source: https://github.com/EQ-bench/creative-writing-bench , README and `data/pairwise_prompt.txt`)
- **Rubric shape.** The same benchmark's absolute rubric scores 22 named criteria 0 to 20, nine of them "lower is better" (Purple Prose, Overwrought, Tell-Don't-Show, Weak Dialogue, Meandering, Amateurish, Unsurprising or Uncreative, Unearned Transformations, Incongruent Ending Positivity), asks for a written analysis before the scores, and says "Do not penalize NSFW output". (source: https://github.com/EQ-bench/creative-writing-bench , `data/creative_writing_criteria.txt`, `data/negative_criteria.txt`, `data/creative_writing_judging_prompt.txt`)
- **Reward models trained on human labels** beat a general judge in the roleplay papers: CharacterEval's CharacterRM correlates with human judgment better than GPT-4 (Chinese data); CharacterBench's CharacterJudge the same (11 dimensions, bilingual). Both are trained models, not prompts. (sources: https://github.com/morecry/CharacterEval , https://arxiv.org/abs/2412.11912)

### What it would take here

- **A labelled set from replies already paid for.** The reports under `.data/eval-runs/` hold every reply. Mark 30 to 50 of them pass or fail by hand for each graded check ("sounds like Mira", "never plays the user"). Add 10 or so replies written to be wrong on purpose, because the real runs were nearly all passes and a grader that says "pass" to everything would score well on them. Keep the file beside the reports, outside git, as the replies are.
- **A `--grade-only` mode** that sends the labelled replies to the grader and prints: agreement, the two error counts (passed a bad reply, failed a good one), and each disagreement with the grader's quoted words. A handful of grader calls: well under a cent (estimate from the spec's "a fraction of a cent each").
- **Grader stability.** Send each labelled reply three times. A check whose verdict flips on the same reply is noise; rewrite its criterion or make it a code check (the spec already says this for disagreement with the reader).
- **Watch the family tie (inference).** The grader is DeepSeek V4 Flash and one of the two play models is DeepSeek V4 Pro. The self-preference finding is about a model grading its *own* text; whether it carries to a sibling model is not shown by the paper. The cheap test: in the labelled set, compare the grader's error rate on GLM-5.3 replies against DeepSeek V4 Pro replies.
- **Pairwise for prose quality, absolute for rules.** A yes-or-no graded check suits a rule ("did it speak for the user?"). "Is this prose better than before the prompt change?" suits a pairwise call: old reply against new reply for the same scene, both orders, winner per criterion. That is two grader calls per pair and fits `--against`, which already loads the earlier report. Borrow EQ-Bench's three "avoids" criteria: clichés, "flowery verbosity", "gratuitous metaphor or poetic overload".
- **Reason first, verdict second.** The grader today returns pass or fail plus the quoted words. Both EQ-Bench prompts put the analysis before the scores. Worth one A/B on the labelled set; the story-quality spec found that letting Flash *think* used up its answer budget, so keep it to a sentence.

### Verdict

**Adopt the method** (labelled set, negative controls, agreement report): it is the cheapest item here after gap 4 and it decides how much any graded check is worth. **Borrow** pairwise judging in both orders for a later "prose got better or worse" check. **Skip** trained reward models (CharacterRM, CharacterJudge): Chinese or bilingual research models, not usable through OpenRouter.

---

## Gap 4: Prose quality is not scored

### What exists

- **Slop score (sam-paech/slop-score).** One number for how much a text leans on words and phrases that models overuse compared with human writing. "Slop words make up 60%, not-x-but-y patterns 25%, and slop trigrams 15%." The "not X, but Y" detector is regex: 10 patterns on the plain text, then 35 on part-of-speech-tagged text. **The code is JavaScript** (`js/`, `.mjs` scripts) and the score "will be computed locally, in browser". The lists are JSON in `data/`: 1,648 single words, a bigram list and 430 trigrams (counted from the files on 2026-11-23); examples from the trigram list are "voice barely whisper", "took deep breath", "heart pounding chest" (stop words removed). Code and lists are MIT by the README; `js/wordfreq.js` is Apache-2.0 and one data file is CC-BY-SA 4.0. Last push 2025-11-22. (source: https://github.com/sam-paech/slop-score , README and `data/`)
- **Where the lists come from.** The Antislop paper profiles a model's output against human baselines; some patterns appear "over 1,000x more often in LLM output than in human text". Its sampler and fine-tuning method need control of the model's logits or weights, which a hosted API does not give. (source: https://arxiv.org/abs/2510.15061 ; code https://github.com/sam-paech/antislop-sampler , Apache-2.0)
- **EQ-Bench creative writing v3.** 32 prompts by 3 iterations; a rubric score, then pairwise matchups rated with Glicko-2; about $10 a model with Claude Sonnet 4.6 as judge; Python; no licence file found. Its `core/metrics.py` computes three code metrics beside the judged score:
  - a *slop index*: weighted count of listed phrases per 1,000 words;
  - a *repetition metric*: words a model uses far more than general English does (against the `wordfreq` table), counted only when they recur across several different prompts;
  - a *complexity index*: Flesch-Kincaid grade and the share of words with three or more syllables.
  (source: https://github.com/EQ-bench/creative-writing-bench , README and `core/metrics.py`)
- **A rubric that names prose faults** (gap 3): Purple Prose, Overwrought, Tell-Don't-Show, Weak Dialogue, Meandering, and the pairwise "avoids" criteria. (same source)
- **Roleplay benchmarks' criteria.** PingPong: character consistency, entertainment value, fluency. (source: https://arxiv.org/abs/2409.06820) RoleBench: speaking-style imitation and role-specific knowledge, 168,093 samples, 100 roles. (source: https://arxiv.org/abs/2310.00746) CharacterEval: 13 metrics on 4 dimensions, Chinese, 1,785 dialogues. (source: https://arxiv.org/abs/2401.01275) CharacterBench: 11 dimensions in 6 aspects, split into *sparse* dimensions (the trait shows only in some replies) and *dense* ones (it shows in every reply). (source: https://arxiv.org/abs/2412.11912)
- **None of them scores agency** (the AI acting for the user's character) as its own criterion, as far as their abstracts and READMEs say. The eval's own "never plays the user" checks are ahead of the benchmarks here.

### What it would take here

- **A slop code check.** Copy the three list files into the eval folder (MIT; keep the licence note), count hits per 1,000 words over a reply with stop words removed for the trigram match, and report the number and the top hits. Pure code, no dependency, no model call: perhaps 60 lines plus the lists (inference). The "not X, but Y" tier-1 regexes can be ported the same way; the part-of-speech tier needs a tagger package, so leave it out at first.
- **Score, do not pass or fail, at first.** The scorecard today is passes out of samples. A slop score is a number per reply. Report the mean per scene and its change under `--against`; turn it into a check ("under N per 1,000 words") only after a few runs show what a normal value is. (inference)
- **Repetition across replies.** Two places:
  - across the samples of one scene: the same four- or five-word run in most samples means the model has a stock answer for that scene. The app's detector already finds such runs across replies; point it at a scene's samples.
  - across the replies of a played Chat (gap 1): EQ-Bench's rule transfers directly, count only what recurs across *different* turns.
- **A corpus view, at no cost and sending nothing.** The same code can read the replies in old eval reports and say which listed phrases this app's play models overuse most. That list is the natural seed for new scenes and for the app's own repeated-phrases work. Whether to point it at the user's real Chats in the local database is the user's call: it is local code and nothing leaves the PC, but the spec's rule is that scenes stay synthetic. (inference)
- **Purple prose, pacing, agency in prose.** No code metric found for these. They are graded checks: borrow the criterion names above, one criterion per check as today, and calibrate each on the labelled set (gap 3) before believing it. CharacterBench's sparse/dense split is a useful warning: a "voice" check on a reply where the Character barely speaks has nothing to judge, which the spec already met with "sounds like Mira".
- **Limits.** The lists were built from general fiction prompts, in English. How well they fit second-person roleplay replies and explicit scenes is untested. A word like a fantasy name on the list ("aelara", "aethelgard") is slop in a model's free choice of names and harmless when the Story itself named the Character; filter out the scene's own cast and Place names, as the app's detector already does for names.

### Verdict

**Adopt the slop lists and the scoring idea as code checks** (port, do not install). **Borrow** the repetition rule and the rubric's criterion names. **Skip** running EQ-Bench itself: it ranks models on its own prompts with a paid judge, which the spec already rules out ("comparing models for purchase decisions"), and it does not run the app's prompt.

---

## Gap 5: Automatic prompt optimisation

### What exists

- **"metaharness" names two things.** The paper *Meta-Harness: End-to-End Optimization of Model Harnesses* (Lee et al., 2026) searches over harness *code*, with a coding agent that reads the source, scores and execution traces of every earlier candidate from the filesystem. (source: https://arxiv.org/abs/2603.28052 ; official code https://github.com/stanford-iris-lab/meta-harness) `SuperagenticAI/metaharness` is an unofficial Python library after that paper, aimed at coding-agent harnesses, marked alpha, Python 3.11+. (source: https://github.com/SuperagenticAI/metaharness)
- **DSPy** is "a Python framework for building AI systems"; its optimizers (GEPA, MIPROv2, BootstrapFewShot) take examples and a scoring function. Its own example run shows "Cost $2.18 · 200 examples". MIT, 3.5.0 of 2026-11-10. (source: https://dspy.ai/)
- **GEPA** reflects in plain language on sampled runs, proposes prompt edits, tests them, and keeps a Pareto set of the best; the paper reports it beats MIPROv2 by over 10% and needs far fewer runs than reinforcement learning. Also usable alone, MIT. (sources: https://arxiv.org/abs/2507.19457 , https://github.com/gepa-ai/gepa)
- **TypeScript ports** exist (`@ax-llm/ax`, Apache-2.0; `dspy.ts`, MIT) per npm. Their optimizers were not examined.

### What it would take here

- Every optimiser needs a metric that tells a better prompt from a worse one. Today every scene passes, so every candidate prompt would tie. Gaps 2 to 4 come first. (inference)
- Each candidate prompt costs a full eval run: about $0.04 to $0.12 on the current set by the spec's own figures. Twenty candidates is $1 to $2.50, over the $0.50 cap by design, and each needs the user's go-ahead. (estimate)
- The turn prompt is not one string. It is a builder with a cached standing system message and trailing blocks placed for cost and weight (the story-quality spec explains why Established facts sit where they do). An optimiser that rewrites text freely would break the cache layout and the test suite's prompt assertions. Meta-Harness, which edits code, fits that shape better than DSPy, which wants to own the prompt. (inference)
- With a dozen scenes, an optimiser will fit the scenes, not the Chats. DSPy's own example uses 200 examples.

### Verdict

**Skip for now.** The cheap version of the same idea needs no tool: when a check fails, read the failing replies, change the builder by hand, run `--against last`. Revisit GEPA (the lightest of the three) once there are scenes that fail and a calibrated grader.

---

## The general harnesses against the constraints

| Tool | Language | Licence | Account or hosted data | Multi-turn / simulated user | Custom provider and checks | Last release seen | Fit |
|---|---|---|---|---|---|---|---|
| **promptfoo** | TypeScript / Node; CLI and `promptfoo.evaluate()` | MIT; "now part of OpenAI" | Evals "run 100% locally"; usage telemetry on by default (no prompts), off with `PROMPTFOO_DISABLE_TELEMETRY=1`. Simulated user and red-team generation go to promptfoo's servers | Scripted via `_conversation`; simulated user is hosted only | A provider can be a JS function; an assertion can be a JS function | npm 0.126.0, 2026-11-18 | Closest fit, but it would replace the run's gate, cap, cost line and Fisher comparison with its own runner, for little gain. **Skip; borrow** the scripted-conversation shape |
| **Inspect AI** (UK AISI, Meridian Labs) | Python | MIT | None found; logs go to `./logs` locally | Agent and multi-agent primitives | Model API extension; composable scorers | PyPI 0.3.291, 2026-11-17 | Python only: the app's prompt builders and parsers are TypeScript. **Skip** |
| **DeepEval** | Python; also an npm `deepeval` package | Apache-2.0 | Core runs without an account; logs to Confident AI after `deepeval login` | `ConversationSimulator` (Python shown); conversational metrics such as Role Adherence (TypeScript shown) | Any custom judge model | PyPI 4.3.4 and npm 0.9.26, both 2026-11-11 | The npm package needs Node 22+ and lists many peer packages. **Skip; borrow** the Role Adherence shape |
| **Braintrust autoevals** | TypeScript and Python | MIT | No account needed. If `OPENAI_BASE_URL` is unset it falls back to the Braintrust gateway | None | `LLMClassifierFromTemplate` for a custom graded check; pass any OpenAI-compatible client | npm 0.5.0, 2026-11-19 | A library of scorers, mostly for RAG and QA. Our grader call is simpler than its wrapper. **Skip** |
| **OpenAI Evals** | Python | Custom (GitHub shows no standard licence) | Needs an OpenAI key; README now points to the OpenAI Dashboard | Not examined | "Not accepting evals with custom code" for contributions | Last push 2026-04-14 | Tied to OpenAI's API and dashboard. **Skip** |
| **Langfuse** | TypeScript platform, self-hostable | MIT outside `ee/` folders | Self-host needs two app containers plus Postgres, Redis, ClickHouse and blob storage | Not examined | Not examined | Active (pushed 2026-11-23) | A tracing platform with five services to run, for one developer and a Markdown scorecard. **Skip** |
| **Evalite** | TypeScript, vitest-based | MIT | Local | Not examined | Not examined | npm 0.19.0, 2025-11-06 | "Evalite is no longer maintained"; repo archived 2026-11-09. **Skip** |
| **vitest-evals** (Sentry) | TypeScript, vitest | Apache-2.0 | Local; JSON report and a local UI | Not documented | `createHarness(...)` for any app; a judge is an object with `assess(ctx)` | npm 0.18.1, 2026-11-07 | Peer dependency `vitest >=5 <6`; the repo is on vitest ^4.1.12. Built around agents and tool calls. **Skip**; look again after a vitest upgrade if a UI for reports is ever wanted |
| **openevals** (LangChain) | TypeScript and Python | MIT | LangSmith optional | `runMultiturnSimulation`, `createLLMSimulatedUser` | App and user are plain functions; prebuilt user wants a LangChain chat model | npm 0.2.3, 2026-10-22 | The only TypeScript simulated-user loop that stays local. Still about 30 lines we can own. **Borrow the shape** |

Sources for the table, in row order:
- promptfoo: https://github.com/promptfoo/promptfoo ; https://www.promptfoo.dev/docs/configuration/telemetry/ ; https://www.promptfoo.dev/docs/usage/node-package/ ; https://www.promptfoo.dev/docs/providers/simulated-user/ ; https://www.promptfoo.dev/docs/red-team/configuration/ ; https://registry.npmjs.org/promptfoo
- Inspect AI: https://inspect.aisi.org.uk/ ; https://inspect.aisi.org.uk/eval-logs.html ; https://github.com/UKGovernmentBEIS/inspect_ai ; https://pypi.org/project/inspect-ai/
- DeepEval: https://github.com/confident-ai/deepeval ; https://deepeval.com/docs/conversation-simulator ; https://deepeval.com/docs/metrics-role-adherence ; https://registry.npmjs.org/deepeval ; https://pypi.org/project/deepeval/
- autoevals: https://github.com/braintrustdata/autoevals ; https://registry.npmjs.org/autoevals
- OpenAI Evals: https://github.com/openai/evals
- Langfuse: https://langfuse.com/self-hosting ; https://github.com/langfuse/langfuse/blob/main/LICENSE
- Evalite: https://github.com/mattpocock/evalite ; https://registry.npmjs.org/evalite
- vitest-evals: https://github.com/getsentry/vitest-evals ; https://registry.npmjs.org/vitest-evals
- openevals: https://github.com/langchain-ai/openevals ; https://registry.npmjs.org/openevals

Two facts in the table that decide more than the rest:
- promptfoo's default grader is chosen "from the credentials available in the environment" and can be overridden per suite, test or assertion; `select-best` is its comparison assertion. (source: https://www.promptfoo.dev/docs/configuration/expected-outputs/model-graded/) So grading can stay on OpenRouter; only the simulated user and red-team generation cannot.
- Hosted eval services were not weighed at all. Explicit adult scenes rule out any tool whose normal use uploads prompts and replies.

---

## Not verified

- **LangSmith** itself (the hosted product) was not examined; only the open `openevals` library was.
- **SillyTavern community practice** for judging output quality: no primary source was found or searched in depth. SillyTavern's own docs describe prompt and sampler features, not an eval.
- **Which "metaharness" the eval spec meant.** Two candidates are described above; the spec does not say.
- **promptfoo:** what its hosted simulated-user model is, how long sent prompts are kept, and whether OpenAI now operates that service. The privacy notice names none of these.
- **DeepEval:** whether the npm package includes the `ConversationSimulator`; whether any telemetry is sent without `deepeval login`, and how to turn it off.
- **Langfuse:** whether LLM-as-a-judge evals and datasets are in the MIT part of a self-hosted install; minimum resources.
- **Inspect AI:** whether it has a ready-made simulated user (only agent primitives were confirmed).
- **vitest-evals:** multi-turn support; the README does not describe it.
- **EQ-Bench creative-writing-bench:** its licence (no licence file found; GitHub reports none). The slop lists were taken as MIT from the *slop-score* repo's README; GitHub's own licence detection on that repo says "other", because of the mixed licences. Read the `LICENSE` file before copying the lists.
- **EQ-Bench metrics:** the repetition and slop definitions above were read from `core/metrics.py` function names, docstrings and the visible code, not from documentation; the README does not define them.
- **CharacterEval:** the names of its 13 metrics and 4 dimensions (shown only in an image).
- **Zheng et al. (2306.05685):** whether the paper compares pairwise with single-answer grading; the abstract does not say. **Miller (2411.00640):** clustered standard errors and resampling advice; only the abstract was read.
- **RoleBench:** how it scores (the abstract does not name the metrics).
- **TypeScript DSPy ports** (`@ax-llm/ax`, `dspy.ts`): only npm metadata was read.
- **No agreement threshold** ("the grader is good enough at X%") comes from a source. The 80% figure is what one paper measured for GPT-4 on its own task.
- **Self-preference between sibling models** (DeepSeek V4 Flash grading DeepSeek V4 Pro) is a question raised here, not a finding of the cited paper.
- **Every cost figure marked (estimate)** is arithmetic from the eval spec's first runs, not a measurement.
- **Whether the slop lists suit roleplay replies and explicit scenes.** Untested; the lists come from general fiction prompts in English.

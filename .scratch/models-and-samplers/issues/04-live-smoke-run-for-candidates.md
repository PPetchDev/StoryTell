# 04 — A live smoke run for candidate play models

**Status:** ready-for-agent

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** Per the spec's "More play models".

**The candidates.** The real model table gains a candidates record outside `PLAY_MODELS` and the catalogue, holding provisional pinned entries for Kimi K3.1-Pro, Kimi K2.6 and Qwen3.5-397B:
- id, host `deepinfra`, and the reasoning settings to try in order;
- stop strings assumed on;
- prices, offered samplers and maker suggestions from the research.

The reasoning setting type gains `{ effort: 'none' }`.

**The run.** A live smoke run, outside the normal test suite, that the user starts with one npm script and a candidate name (or "all"):
- It refuses to start without an explicit spend flag, and stops before passing a $0.50 running total.
- It sends each candidate's calls through the real OpenRouter client and request builder:
  1. one tiny prompt per reasoning setting;
  2. a stop-string probe;
  3. a short turn with all its offered samplers set;
  4. two turns of a small synthetic adult Story through the real turn prompt builder;
  5. one Suggested replies call.
- It writes the full report under `.data/` (gitignored) and prints a summary table.

Build it; never run it. Running it spends credit and is ticket 05, the user's.

**Blocked by:** [02 — Sampling reaches the play model](02-sampling-per-play-model.md) (the run sends sampler values through its request builder)

- [ ] Candidates can't be chosen. Settings doesn't list them, and `PUT /api/settings` refuses them (test).
- [ ] The run is not collected by the normal API test run, and refuses to start without the spend flag (checked without a key and without network).
- [ ] The run's request bodies come from the real request builder. A unit check with a scripted `fetch` shows, per candidate:
  - [ ] the pinning, each reasoning setting and the sampler values;
  - [ ] the stop probe;
  - [ ] the turn prompt.
- [ ] The spending cap stops the run before a call that would pass it (scripted `fetch` with synthetic costs).
- [ ] The report goes under `.data/` and records, per call: model, reasoning setting, text, finish reason, prompt, completion and reasoning tokens, cost, and error.
- [ ] The synthetic Story is the test's own, with adult Characters and nothing from real Stories.
- [ ] A short "how to run it" note in the ticket's `## Comments` (the npm script, the flag, where the report lands) for ticket 05.
- [ ] No paid API is called while building this ticket.

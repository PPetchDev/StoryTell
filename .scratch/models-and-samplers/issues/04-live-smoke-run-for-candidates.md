# 04 — A live smoke run for candidate play models

**Status:** done

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

- [x] Candidates can't be chosen. Settings doesn't list them, and `PUT /api/settings` refuses them (test).
- [x] The run is not collected by the normal API test run, and refuses to start without the spend flag (checked without a key and without network).
- [x] The run's request bodies come from the real request builder. A unit check with a scripted `fetch` shows, per candidate:
  - [x] the pinning, each reasoning setting and the sampler values;
  - [x] the stop probe;
  - [x] the turn prompt.
- [x] The spending cap stops the run before a call that would pass it (scripted `fetch` with synthetic costs).
- [x] The report goes under `.data/` and records, per call: model, reasoning setting, text, finish reason, prompt, completion and reasoning tokens, cost, and error.
- [x] The synthetic Story is the test's own, with adult Characters and nothing from real Stories.
- [x] A short "how to run it" note in the ticket's `## Comments` (the npm script, the flag, where the report lands) for ticket 05.
- [x] No paid API is called while building this ticket.

## Comments

**How to run it (ticket 05; it spends real OpenRouter credit, at most $0.50 a run).** From `apps/api`:

```bash
npm run smoke:live -- kimi-k2.6 --spend
```

- Name one candidate (`kimi-k3.1-pro`, `kimi-k2.6`, `qwen3.5-397b`), several separated by spaces, or `all`. In the PowerShell Terminal tab use `npm.cmd`.
- Without `--spend` it refuses before reading a key or touching the network. The key comes from `OPENROUTER_API_KEY` in the root `.env` (or the environment), and is never printed.
- It stops before any call whose worst case (estimated prompt plus every allowed output token) would take the running total past $0.50, and says so in the summary.
- Per candidate, through the real `OpenRouterClient` and request builder: one tiny prompt per reasoning setting to try (in the order in `CANDIDATE_MODELS`), then on the setting with the fewest reasoning tokens: the stop probe (`stopStrings('Ash')`), a short turn with every offered sampler value set (maker's suggestion where there is one, else temperature 0.8, min-p 0.05, top-p 0.95, repetition penalty 1.05, so `require_parameters` is sent), two turns of the synthetic adult Story through `buildTurnPrompt`, and one Suggested replies call.
- The console prints one line per call (reasoning setting, finish reason, prompt/output/reasoning tokens, cost, and a quick result such as "stop held" or the error). The full report, with the played text, is written to `.data/smoke-runs/smoke-<time>-<candidates>.json` (gitignored).
- Files: `apps/api/test/live/smoke-run.ts` (the run), `smoke-story.ts` (the synthetic Story), `smoke.live.ts` (the entry, collected only by `vitest.live.config.ts`), `apps/api/scripts/smoke-live.mjs` (the npm script). Unit checks with a scripted `fetch`: `apps/api/test/smoke-run.spec.ts`.
- The candidates live in `CANDIDATE_MODELS` in `apps/api/src/service/model-gateway/real/model-table.ts` (prices and `supported_parameters` re-read from OpenRouter's endpoints API on 2026-11-09: all three list the four sampler parameters on DeepInfra).
- Not run while building this ticket: only `vitest list` was used to check which config collects the entry.

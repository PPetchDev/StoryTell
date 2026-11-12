# 05 — Smoke-test Kimi K3.1-Pro, Kimi K2.6 and Qwen3.5-397B (spends credit)

**Status:** ready-for-human

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** Nothing to build: the user runs ticket 04's live smoke run against the three candidates and decides, model by model, whether each joins the play-model list. This is the one step that spends real credit. The run's cap is $0.50 in all, and the expected spend is a few cents per model, most of it on Kimi K3.1-Pro. Whether these models write adult fiction and honour "reasoning off" is untested until now.

Steps for the user (an agent may prepare the command and read the report afterwards, but only the user starts the run):
1. Re-read each candidate's DeepInfra endpoint on OpenRouter (links in `docs/research/models-samplers-embeddings.md` §2) for price and `supported_parameters`, and glance at the Kimi K3.1-Pro and Qwen3.5 licences.
2. Run the smoke run with the spend flag, for all three candidates.
3. Read the report under `.data/`, and record the verdict per model in `## Comments`.

**Blocked by:** [04 — A live smoke run for candidate play models](04-live-smoke-run-for-candidates.md)

- [x] The user approved the spend and ran it. The total cost is recorded.
- [ ] For each candidate, `## Comments` records:
  - [ ] the reasoning setting that worked and its reasoning tokens (or "none works": fail);
  - [ ] stop strings honoured (yes / no);
  - [ ] which sampler parameters were accepted with `require_parameters`;
  - [ ] the status and wording of any "no endpoint takes these parameters" refusal seen;
  - [ ] whether both adult turns were written without refusal, in the app's `@Name:` format;
  - [ ] whether Suggested replies parsed;
  - [ ] the cost of one turn;
  - [ ] the verdict: **offer** or **don't offer**, with the reason.
- [ ] Each "offer" ticket (06–08) is left `ready-for-agent` for an offered model, or set to `wontfix` with the reason for a refused one.
- [ ] No played text from the run is pasted into the repository. Short quotes of refusal wording are fine.

## Comments

**2026-11-11, run 1.** The user approved the spend in chat ("รันเลย") and the agent started `npm.cmd run smoke:live -w apps/api -- all --spend`. Report: `.data/smoke-runs/smoke-2026-11-11T02-13-13-824Z-kimi-k3.1-pro+kimi-k2.6+qwen3.5-397b.json`. **Total $0.0351** of the $0.50 cap. One OpenRouter 429 was retried and went through. Every call finished `stop` with no error.

The agent read only the numbers and a mechanical scan of the text: word counts, a count of refusal phrases ("I can't", "I'm sorry", "as an AI", "fade to black", ...), and the `@Name:` speech lines. The prose itself is the user's to read and judge.

| | Kimi K3.1-Pro | Kimi K2.6 | Qwen3.5-397B |
|---|---|---|---|
| Reasoning setting that worked | `effort: none`, 0 tokens (`enabled: false` also 0; `minimal` gave 35) | `enabled: false`, 0 tokens (`effort: none` also 0) | `enabled: false`, 0 tokens (`effort: none` also 0) |
| Stop strings honoured | yes | yes | yes |
| Samplers accepted with `require_parameters` | all four | all four | all four |
| "No endpoint takes these parameters" refusal | none seen | none seen | none seen |
| Adult turn 1 / 2 | 175 / 448 words | 121 / 489 words | 333 / 383 words |
| Refusal phrases in the adult turns | 0 | 0 | 0 |
| `@Name:` format | every speech line `@Mira Vance:` (4 + 4) | every speech line `@Mira Vance:` (2 + 4) | every speech line `@Mira Vance:` (2 + 2) |
| Suggested replies | three read | three read | three read |
| Cost of one turn (adult turn 2) | $0.0081 | $0.0026 | $0.0022 |

**Verdict:** all three pass every mechanical check. Whether each one is offered waits on the user reading the adult turns in the report for quality.

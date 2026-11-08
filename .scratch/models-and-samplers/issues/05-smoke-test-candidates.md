# 05 — Smoke-test Kimi K3.1-Pro, Kimi K2.6 and Qwen3.5-397B (spends credit)

**Status:** ready-for-human

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** Nothing to build: the user runs ticket 04's live smoke run against the three candidates and decides, model by model, whether each joins the play-model list. This is the one step that spends real credit. The run's cap is $0.50 in all, and the expected spend is a few cents per model, most of it on Kimi K3.1-Pro. Whether these models write adult fiction and honour "reasoning off" is untested until now.

Steps for the user (an agent may prepare the command and read the report afterwards, but only the user starts the run):
1. Re-read each candidate's DeepInfra endpoint on OpenRouter (links in `docs/research/models-samplers-embeddings.md` §2) for price and `supported_parameters`, and glance at the Kimi K3.1-Pro and Qwen3.5 licences.
2. Run the smoke run with the spend flag, for all three candidates.
3. Read the report under `.data/`, and record the verdict per model in `## Comments`.

**Blocked by:** [04 — A live smoke run for candidate play models](04-live-smoke-run-for-candidates.md)

- [ ] The user approved the spend and ran it. The total cost is recorded.
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

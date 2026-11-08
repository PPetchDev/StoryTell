# 01 — One play-model catalogue, with prices in Settings

**Status:** ready-for-agent

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** Prefactor, and the first thing the user sees. Per the spec's "One play-model catalogue":
- A play-model catalogue, keyed by play model, sits beside `PLAY_MODELS` in the gateway's interface module, where `SNAPSHOT_MODEL_PRICES` already sits for the same reason: callers outside the gateway read it, with the real or the fake gateway. Each entry holds the display name, list price and offered sampler parameters, with the maker's suggestions where the research gives one. The real model table keeps only the provider facts (id, host, reasoning, stop strings).
- The Settings API builds its play-model options from the catalogue, each with its price per million tokens and what a long turn costs.
- The Settings page shows that price line under the Play model select.
- The Chat's Drift notice takes both model names from the API, and the web's own model-name map goes. The Settings Drift warning names no model and is left as it is.

After this, adding a play model touches only `PLAY_MODELS`, the catalogue and the real model table.

**Blocked by:** None — can start immediately

- [ ] Re-read OpenRouter's endpoints API for `z-ai/glm-5.3` and `deepseek/deepseek-v4-pro` on DeepInfra, and put their current list prices and `supported_parameters` (of the four the spec offers) in the catalogue, with the date read.
- [ ] The catalogue is typed over every play model, so a play model without an entry doesn't compile.
- [ ] `GET /api/settings` play-model options carry `priceUsdPerMillion` and `longTurnUsd` as the spec defines them, and labels come from the catalogue. The hard-coded options list is gone.
- [ ] The Chat response's `drift` carries `lastModelLabel` and `playModelLabel`. A stored model id no longer in the catalogue comes back as the id.
- [ ] The Settings page shows "$X in / $Y out per million tokens · a long turn about $Z" for the chosen play model, and it follows a change of model.
- [ ] The Chat's Drift notice reads both names from the API. The web has no model-name map of its own.
- [ ] API tests (Settings options with prices, Drift labels including an unknown stored id) and the Settings e2e (price line; the Drift warning still shows on a model change) pass, and the existing suites stay green.

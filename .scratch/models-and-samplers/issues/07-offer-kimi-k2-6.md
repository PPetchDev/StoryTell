# 07 — Offer Kimi K2.6 as a play model

**Status:** needs-info

**Waiting on:** ticket 05's paid smoke-test results, which only the user runs (see [05 — Smoke-test the candidates](05-smoke-test-candidates.md)).

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** If ticket 05's verdict for Kimi K2.6 is "offer", the user can choose it as the play model in Settings. Its name joins `PLAY_MODELS`, its provider facts join `TEXT_MODELS`, and its display facts join the play-model catalogue, with:
- the confirmed reasoning setting, stop-string support and sampler parameters;
- the re-read prices;
- the display name "Kimi K2.6";
- the maker's instant-mode suggestion (temperature 0.6, top-p 0.95) as its Sampling hints.

Its candidate entry goes. Its 16,384-token output cap sits above every play-model kind's `maxTokens`. If the verdict is "don't offer", set this ticket to `wontfix` with the reason instead.

**Blocked by:** [05 — Smoke-test the candidates](05-smoke-test-candidates.md)

- [ ] The entries match ticket 05's `## Comments` exactly.
- [ ] Contract test: a turn on it is sent to `moonshotai/kimi-k2.6`, pinned to DeepInfra with `allow_fallbacks: false` and the confirmed reasoning setting. Stop strings are sent or left out as confirmed.
- [ ] `GET /api/settings` lists it with its price, offered samplers and suggestions. `PUT /api/settings` takes it, and the Chat's Drift notice names it.
- [ ] No other code changes are needed beyond `PLAY_MODELS`, the catalogue and the real model table.

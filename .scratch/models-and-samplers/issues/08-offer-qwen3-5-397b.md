# 08 — Offer Qwen3.5-397B as a play model

**Status:** ready-for-agent

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** If ticket 05's verdict for Qwen3.5-397B is "offer", the user can choose it as the play model in Settings. Its name joins `PLAY_MODELS`, its provider facts join `TEXT_MODELS`, and its display facts join the play-model catalogue, with:
- the confirmed reasoning setting, stop-string support and sampler parameters;
- the re-read prices;
- the display name "Qwen3.5-397B";
- the maker's non-thinking suggestion (temperature 0.7, top-p 0.8) as its Sampling hints.

Its candidate entry goes. The maker also suggests top-k 20 and presence penalty 1.5, which the app doesn't offer. Ticket 05 says whether the model writes acceptably without them. If the verdict is "don't offer", set this ticket to `wontfix` with the reason instead.

**Blocked by:** [05 — Smoke-test the candidates](05-smoke-test-candidates.md)

- [ ] The entries match ticket 05's `## Comments` exactly.
- [ ] Contract test: a turn on it is sent to `qwen/qwen3.5-397b-a17b`, pinned to DeepInfra with `allow_fallbacks: false` and the confirmed reasoning setting. Stop strings are sent or left out as confirmed.
- [ ] `GET /api/settings` lists it with its price, offered samplers and suggestions. `PUT /api/settings` takes it, and the Chat's Drift notice names it.
- [ ] No other code changes are needed beyond `PLAY_MODELS`, the catalogue and the real model table.

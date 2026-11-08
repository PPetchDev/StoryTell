# 06 — Offer Kimi K3.1-Pro as a play model

**Status:** ready-for-agent

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** If ticket 05's verdict for Kimi K3.1-Pro is "offer", the user can choose it as the play model in Settings. Its name joins `PLAY_MODELS`, its provider facts (id, host, the reasoning setting and stop-string support ticket 05 confirmed) join `TEXT_MODELS`, and its display facts (the name "Kimi K3.1-Pro", the prices it re-read, the confirmed sampler parameters) join the play-model catalogue; its candidate entry goes. Settings shows its price line (about $0.04 for a long turn at the research prices) and its Sampling fields, and the Drift warning shows on switching to it. If the verdict is "don't offer", set this ticket to `wontfix` with the reason instead.

**Blocked by:** [05 — Smoke-test the candidates](05-smoke-test-candidates.md)

- [ ] The entries match ticket 05's `## Comments` exactly: reasoning setting, `stopStrings`, offered samplers, prices.
- [ ] Contract test: a turn on it is sent to `moonshotai/kimi-k3.1-pro`, pinned to DeepInfra with `allow_fallbacks: false` and the confirmed reasoning setting. Stop strings are sent or left out as confirmed.
- [ ] `GET /api/settings` lists it with its price and offered samplers. `PUT /api/settings` takes it, and the Chat's Drift notice names it.
- [ ] No other code changes are needed beyond `PLAY_MODELS`, the catalogue and the real model table. If any were, the catalogue prefactor missed something: note it here.

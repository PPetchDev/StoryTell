# Choose the text LLM

Type: grilling
Status: resolved
Blocked by: 02
Part of: [Map: Storytell AI MVP](../map.md)

## Question

Given the findings of Text LLMs that allow adult fiction for adult users, which text model (and fallback) will Storytell AI use, accessed how, within the $10–30/month budget?

## Answer

Grilled 2026-11-03. Provisional — **How one AI turn behaves** confirms or swaps the order of primary and fallback.

- **Planning load:** moderate use (~60 turns/day, ~16k context) with room for occasional heavy days. $30/month is a hard ceiling; pick the best quality under it rather than exceed it.
- **Access:** OpenRouter, host pinned with `provider.only` and `allow_fallbacks: false`. Exclude first-party DeepSeek/Z.ai and Together. Prefer Zero Data Retention endpoints where available, but don't require them. Record the retention policy of each host in use.
- **Primary (Story turns):** GLM-5.3 on DeepInfra (~$8–18/month at moderate use). Thinking/reasoning off.
- **Fallback:** DeepSeek V4 Pro on GMICloud (~$9/month cached at moderate use). Thinking off.
- **Background calls** (Memory extraction, summaries, whatever Memory design and Bond/Arc tickets need): DeepSeek V4 Flash on DeepInfra — near-zero cost, no prose voice involved.
- **Fallback is manual, never automatic.** The model is one app-wide setting the user can change at any time. If the primary refuses or its host is down, the app shows an error with retry, not a silent switch — a silent switch would cause Drift unnoticed.
- **Drift warning:** changing the model mid-Chat shows a warning that Characters may drift (play differently under the new model).
- **Budget:** prepaid OpenRouter credit is the hard cap; when it runs out, play stops. The app shows this month's spend and warns when remaining credit is low (~20%). Running out of credit does not itself cause Drift.
- **Left to the prototype:** willingness to write adult content, and multi-Character quality, tested on GLM-5.3 and DeepSeek V4 Pro with the same prompts. If GLM-5.3 refuses or plays worse, V4 Pro becomes primary.
- Glossary: added **Drift** to `CONTEXT.md`.

## Comments

- 2026-11-03: Considered uncensored Hugging Face models (roleplay fine-tunes, abliterated weights), either self-hosted or as a third prototype contender. Kept GLM-5.3 and DeepSeek V4 Pro only. Reasons: such models fix refusals but are much weaker at keeping long stories coherent, which means more Drift. Dedicated or self-hosted GPUs also cost far over $30/month, unless a home GPU is used. Revisit if both models refuse in the prototype.
- 2026-11-03: [How one AI turn behaves](07-one-ai-turn-prototype.md) confirmed the order: GLM-5.3 primary, V4 Pro fallback. Neither model refused adult content. Two corrections:
  - "Thinking off" isn't possible for GLM-5.3 on DeepInfra; the endpoint rejects it as mandatory. Send `reasoning: {effort: "minimal"}` there (0–120 reasoning tokens per call) and `enabled: false` for the DeepSeek models.
  - GMICloud's V4 Pro endpoint has no `stop` support, so the backend output check must stop the model from writing for the user.

  OpenRouter credit is account-wide and reserved per in-flight request, so the $30 cap needs a dedicated account or a per-key limit.

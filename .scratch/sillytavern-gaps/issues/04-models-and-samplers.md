# Choosing play models and sampler settings

Type: grilling
Status: resolved
Blocked by: none

## Question

Should the user get more play models and control over sampling (temperature and friends), and how open should that list be?

## SillyTavern

Any backend and any model, a full sampler panel (temperature, top-p, top-k, min-p, repetition / frequency / presence penalty, DRY, XTC, mirostat) and saved presets.

## Storytell today (checked 2026-11-08)

- `PLAY_MODELS = ['glm-5.3', 'deepseek-v4-pro']` (`apps/api/src/service/model-gateway/model-gateway.ts:50`); background calls use V4 Flash. Each model is pinned to one OpenRouter host (DeepInfra) with `allow_fallbacks: false` and its own reasoning setting (`real/model-table.ts`).
- Only `max_tokens` is sent (`real/openrouter-client.ts:109`); no temperature or other sampler. Settings holds `playModel` only (`model/settings/entities/settings.entity.ts`).
- The list is short on purpose: each model+host was checked for an adult-content-friendly policy, stop-string support and reasoning behaviour ([Text LLMs](../../storytell-mvp/issues/02-text-llm-for-adult-roleplay.md), [Choose the text LLM](../../storytell-mvp/issues/05-choose-text-llm.md)).

## Options

- **A. Samplers only** — Settings gets temperature (and maybe min-p / repetition penalty) per play model, applied to turns only; background calls keep their defaults.
- **B. A + more vetted models** — each new model goes through a research check (host policy, stop strings, reasoning, price) before joining the list.
- **C. Free-form** — any OpenRouter model id typed by the user.
- **D. Not now.**

## Recommendation

A now; B later, one research ticket per candidate model. C throws away the host pinning and policy checks that let adult play work at all.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: options A + B. Settings gets sampler values per play model (only parameters the pinned host supports; turns, Suggested replies and Write for me use them, background calls keep their defaults), and the play-model list grows by models that pass the research check in `docs/research/models-samplers-embeddings.md`. Never free-form model ids: host pinning and adult-content policy are why the list is curated.

Spec and tickets: [.scratch/models-and-samplers/](../../models-and-samplers/spec.md).

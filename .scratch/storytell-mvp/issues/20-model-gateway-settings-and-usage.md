# Real Model Gateway, Settings and the usage view

Type: task
Status: ready-for-agent
Blocked by: 19
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Real Model Gateway**, behind the interface from ticket 19:
  - **Text calls** go through OpenRouter, with `provider.only` set to the pinned host and `allow_fallbacks: false`. The host and settings for each model:
    - GLM-5.3: DeepInfra, `reasoning: {effort: "minimal"}`, stop strings on
    - DeepSeek V4 Pro: GMICloud, `reasoning: {enabled: false}`, stop strings never sent
    - DeepSeek V4 Flash: DeepInfra, `reasoning: {enabled: false}`, JSON mode
  - **Image calls** go to Venice, as decided in ticket 18:
    - Reference images: `POST /image/generate` with `qwen-image-3`, `aspect_ratio: "2:3"`.
    - Snapshots: `POST /image/multi-edit` with `seedream-v4-edit` by default, and `qwen-edit-uncensored` as the manual alternative in Settings. Up to 3 reference images are sent, and the response is raw image bytes. Prompt limits differ by model (1500 characters for `qwen-edit-uncensored`); read them from `GET /models`.
    - `safe_mode: false` on every call.
    - Treat `x-venice-is-blurred` or `x-venice-is-content-violation` as a refusal.
    - Venice reports no per-image cost, so record list price.
  - **Typed errors.** Provider failures map to the typed errors:
    - OpenRouter's "would exceed your available credits" maps to out of credit.
    - Venice's 402 maps to out of image credit.
    - Venice's 422 maps to refusal.
  - **Remaining credit** is read from each provider. Venice's `GET /billing/balance` needs an **Admin** API key; the inference key returns 401. So either configure a separate Admin key just for reading the balance, or show image spend from UsageRecords only.
  - **No silent fallback.** The gateway never switches model or provider on its own.
- **UsageRecord.** The gateway writes one per call: time, kind, credit pool (text or image), model and host, tokens or images, cost, and the Chat or Story it served.
- **Settings** (one per app):
  - play model (GLM-5.3 default, DeepSeek V4 Pro fallback)
  - image model
  - a low-credit threshold per pool (default 20%)
  - changing the play model shows a Drift warning before saving
- **Usage view:** this month's spend per pool, remaining credit per pool, and a low-credit banner shown app-wide when a pool is below its threshold.

## Acceptance criteria

- [ ] Contract tests check against recorded, synthetic responses:
  - each model's request pins its host with `allow_fallbacks: false`
  - each model gets the right reasoning setting
  - stop strings are omitted for GMICloud
  - usage and cost are read from the response
  - each provider error maps to the right typed error
- [ ] API tests: monthly spend sums the UsageRecords per pool; the low-credit warning appears below the threshold; settings persist.
- [ ] Playwright: changing the play model shows the Drift warning.
- [ ] One manual smoke call per model, made with the real keys from ticket 17, is recorded in `## Comments`.

## User stories covered

125, 127, 128, 129, and the Settings half of 126.

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

- [x] Contract tests check against recorded, synthetic responses:
  - each model's request pins its host with `allow_fallbacks: false`
  - each model gets the right reasoning setting
  - stop strings are omitted for GMICloud
  - usage and cost are read from the response
  - each provider error maps to the right typed error
- [x] API tests: monthly spend sums the UsageRecords per pool; the low-credit warning appears below the threshold; settings persist.
- [x] Playwright: changing the play model shows the Drift warning.
- [x] One manual smoke call per model, made with the real keys from ticket 17, is recorded in `## Comments`.

## User stories covered

125, 127, 128, 129, and the Settings half of 126.

## Comments

**Built (agent, 2026-11-04).** On branch `claude/dazzling-pasteur-96895e`, on top of master (ticket 19). `Status:` is left for the user.

- **Real gateway** (`apps/api/src/service/model-gateway/real/`): `RealModelGateway` picks the model from the call kind and Settings, `OpenRouterClient` and `VeniceClient` hold the request shapes and error mapping, `model-table.ts` is the model table. The app's own model names (`glm-5.3`, `deepseek-v4-pro`, `deepseek-v4-flash`, `seedream-v4-edit`, `qwen-edit-uncensored`, `qwen-image-3`) are what Settings store, results report and UsageRecords carry; the OpenRouter ids and hosts stay in the table.
  - Text: `provider.only` + `allow_fallbacks: false` on every call; GLM-5.3 on DeepInfra with `reasoning: {effort: "minimal"}` and stop strings, V4 Pro on GMICloud with `reasoning: {enabled: false}` and stop strings never sent, V4 Flash on DeepInfra with `reasoning: {enabled: false}` and `response_format: json_object` when the caller asks for JSON. Usage and cost come from `usage` in the response. (`usage: {include: true}` is still sent as in the prototype; OpenRouter's docs now say usage is always included.)
  - Images: Reference images through `POST /image/generate` with `qwen-image-3`, Snapshots through `POST /image/multi-edit` with the Settings model, both `aspect_ratio: "2:3"`, `safe_mode: false`, JPEG. Prompt limits are read once from `GET /models` (the `image` and `inpaint` lists; `qwen-edit-uncensored` is 1500, the other two 10000) and a longer prompt is cut to fit; built-in fallbacks cover a failed read. List price is recorded: $0.05 Seedream edit, $0.04 Qwen edit, $0.04 qwen-image-3.
  - **No fallback.** A 429 or 503 is retried up to 3 times on the same host (`Retry-After` honoured, else 1 s / 2 s / 4 s); nothing else is retried and no call ever moves host or model.
  - **Errors:** OpenRouter 402, "would exceed your available credits", "insufficient credits" or a budget `limit_source` → `402.001.003`; moderation metadata, `content_policy_violation`/`refusal` or a `content_filter` finish → `422.001.002`; Venice 402 → `402.001.004`; Venice 422, `x-venice-is-blurred` or `x-venice-is-content-violation` → `422.001.002`; a reply with no text or no image → `502.001.005`; everything else, including a network failure → `502.001.001`. No new codes.
  - **Credit:** OpenRouter from `GET /credits` (works with the normal key: total_credits − total_usage), with `GET /key` (`limit_remaining`) as the fallback if `/credits` is ever refused. Venice `GET /billing/balance` needs an Admin key, so there is an optional `VENICE_ADMIN_KEY`; without it the image pool reports remaining credit as unknown and the Usage view shows spend only. A provider that can't be read leaves its pool unknown instead of failing the view. Readings are cached for 30 s.
  - The Venice key is read from `VENICE_API_KEY` or `VENICE_INFERENCE_KEY`; `RUNWARE_API_KEY` is gone.
- **UsageRecord** (`usage_record`): time, kind, pool, model, host, prompt/completion tokens or image count, cost, story and chat ids (plain columns, no foreign keys, so records outlive what they served). One row per answered call; a refused or failed call is not billed and gets no row.
- **Settings** (`settings`, one row, id 1): play model, Snapshot model, low-credit percent per pool (default 20) and, so the percent has a base, the credit cap per pool (default $22 text / $8 image, the spec's split). `GET/PUT /api/settings`; the response also lists the choosable models.
- **Usage view:** `GET /api/usage` gives the month (server local time) and, per pool, this month's spend and call count, remaining credit (or null), cap, threshold and `lowCredit` (remaining known and ≤ threshold % of cap). Frontend: `/usage` page, `/settings` page with the Drift warning shown as soon as the play model differs from the saved one, a nav (Stories / Usage / Settings) and the low-credit banner in the layout, re-read on each navigation.
- **Migration** `1762700000000-CreateSettingsAndUsageRecord` (well apart from ticket 21's). Expect a two-line merge in `migration/index.ts` and `entities.ts`.
- **Test harness:** `startTestApp({ modelGateway: 'real', fetch, providerKeys })` runs the real gateway against a scripted `fetch` (the `GATEWAY_FETCH` provider); `test/harness/recorded-fetch.ts` replays fixtures and records requests; `test/harness/gateway-under-test.ts` wires the real gateway with in-memory Settings and usage for the contract tests.

**Verified:**
- `npm run typecheck`: clean for both apps.
- `npm run test:api`: 59 passed. New: `test/gateway/openrouter.contract.spec.ts` (23: host pinning and `allow_fallbacks: false` per model, reasoning per model, stop strings omitted for GMICloud and sent for DeepInfra, JSON mode for Flash, kind → model routing, usage and cost read from the response and written to the UsageRecord, every error mapping including the credit-reservation message, 429/503 retry on the same host and give-up, credit from `/credits` and the `/key` fallback), `test/gateway/venice.contract.spec.ts` (13: generate and multi-edit bodies, raw bytes back, Settings model and prompt limit from `/models`, 402/422/header/outage mapping, 503 retry with `Retry-After`, `/models` failure fallback, balance with and without an Admin key), `test/settings.spec.ts` (defaults, persistence, validation), `test/usage.spec.ts` (monthly spend summed per pool from real UsageRecords, the low-credit warning at and above the threshold, following a Settings change, and off when credit is unknown). All fixtures under `test/fixtures/` are synthetic.
- `npm run test:e2e`: 5 passed, including `e2e/settings.spec.ts` (changing the play model shows the Drift warning).
- **Manual smoke, one real call per model through the built gateway, with the keys from `.env` (2026-11-04):**
  - GLM-5.3 on DeepInfra (turn): "Blue.", 30 + 4 tokens, $0.000027.
  - DeepSeek V4 Pro on GMICloud (turn): "Sky blue.", 22 + 3 tokens, $0.000027.
  - DeepSeek V4 Flash on DeepInfra (judge, JSON mode): `{"ok": true}`, 17 + 6 tokens, $0.0000026.
  - qwen-image-3 on Venice (Reference image): JPEG, 127 KB, 7 s, $0.04 list.
  - seedream-v4-edit on Venice (Snapshot from that Reference image): JPEG 1640×2456, 309 KB, 19 s, $0.05 list; same woman and clothing, placed in the new scene.
  - qwen-edit-uncensored on Venice (same Snapshot): JPEG, 159 KB, 46 s, $0.04 list.
  - Text credit before/after: $4.530121 → $4.530065 (OpenRouter `/credits`; its limit is $25, the total ever purchased). Image credit: unknown (no Admin key configured), as designed. All six wrote the expected UsageRecord.

**Not verified / notes:**
- The Venice Admin key path is covered by contract tests only; no Admin key exists in `.env`. Add `VENICE_ADMIN_KEY` to see image credit in the Usage view.
- OpenRouter's `limitUsd` is the account's total purchased credit, not a monthly cap, so the percent threshold uses the cap from Settings, not the provider's number.
- `GET /api/usage` asks both providers on each call (cached 30 s); the banner reads it on every navigation.

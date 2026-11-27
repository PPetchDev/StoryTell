# NanoGPT as the first text host

Status: ready-for-agent (live waits for the key's logging to be turned off)

## Problem

Live text costs about $17.50 a month on OpenRouter (DeepInfra): turns on GLM-5.3, and the Judge, Memory extraction, Thoughts and Story so far on DeepSeek V4 Flash. In the last 30 days OpenRouter answered 429 about 270 times. Retries saved most calls, but 6 of 1,150 turns failed.

The user's budget for the app and for developing it is $20 a month in total. On 2026-11-27 they subscribed to NanoGPT Pro, $12 a month:

- 60M input tokens a week, cached input counted in full, output free on included models;
- it resets on Mondays at 00:00 UTC;
- GLM-5.3 and DeepSeek V4 Flash are both included at 1x;
- API use is included.

The same allowance is also meant for a coding agent the user develops the app with.

## Solution

Add `nanogpt` as a host in the text chain (.scratch/text-fallback/spec.md) and put it first on live: `TEXT_HOSTS=nanogpt,openrouter,free`.

- **Every text call kind goes to NanoGPT first,** play and background alike, with the same model the call asks for. That covers turns, Judge, Memory extraction, Thoughts, Story so far, diaries and suggestions. Decided 2026-11-28.
- **When the Weekly allowance is used up, or NanoGPT stays busy,** calls move on to OpenRouter, which is paid, until Monday.
- **While that lasts, a banner in the app says so.**

## Facts

All probes used made-up text; no live Chat text was sent. $0 was spent; the probes used about 80k tokens of the allowance and 3 of the day's images.

### Measured (2026-11-27/28)

- **Pro is active on the key:** `GET /api/subscription/v1/usage` reads `active: true`, `state: active`, 60M weekly, 100 images a day, `paidOverageEnabled: false`.
- **GLM-5.3** (`z-ai/glm-5.3`), streamed, 8.5k-token prompt, about 900 tokens out:
  - first token in 1.4–1.8 s;
  - done in 8.6–9.4 s;
  - 115–129 tokens a second;
  - the second and third calls reported 8,448 of 8,494 prompt tokens cached.
- **DeepSeek V4 Flash** (`deepseek/deepseek-v4-flash`), 6.4k-token prompt, about 400 tokens out: first token in 2.1–3.4 s, done in 7.2–7.8 s.
- **Four GLM-5.3 calls at once:** all four were done in 8.0 s. There was no 429 and no slowdown.
- **Reasoning:**
  - GLM-5.3 refuses `reasoning_effort: none` with 400, `"GLM 5.3 always thinks and does not support disabling reasoning."`
  - With `reasoning_effort: minimal` or `low` it answered in 1.3–1.9 s, with 0 reasoning tokens reported and a clean reply.
  - DeepSeek V4 Flash takes `reasoning_effort: none`: 0 reasoning tokens.
  - So the model table's settings map as they are: an effort for GLM-5.3, off for DeepSeek.
- **Zero Data Retention:** `provider: { zdr: true }` is refused with 400 `zero_data_retention`:
  - message: `"Request/response logging stores content and cannot be used while Zero Data Retention is required. Turn off logging for this API key or turn off ZDR."`;
  - so request and response logging is currently ON for this key.
- **Quality:**
  - natural Thai prose;
  - slips of the kind seen on live: typos, and once "ten tails" for Rin's nine;
  - it is not known whether NanoGPT's GLM-5.3 is quantized, and there was no side-by-side with DeepInfra.
- **No plan, $0 balance (before Pro):** HTTP 402, `"Insufficient balance"`. This is the plain balance error. It is **not** what the used-up allowance returns (see below).
- **The free model `kitani/evolve-beta`:** never used. Its own description says it trains on every conversation sent to it.

### Built and probed (2026-11-28, after logging was turned off)

- **ZDR:** with `provider: { zdr: true }`, GLM-5.3 answered in 1.7 s and DeepSeek V4 Flash in 1.0 s. Both have Zero Data Retention routes, so every call requires ZDR (`NANOGPT_TEXT_MODELS`, `zdr: true`).
- **The prompt eval on NanoGPT** (`npm run eval:live -- all --spend --host nanogpt --samples 1`): 63 calls, $0, 54% of prompt tokens from the cache.
  - Every Judge and Memory check passed.
  - The play checks that failed are ones that have also failed on DeepInfra before: stage directions, Tobias sitting out, "something", and "does not ask again".
- **Empty answers:**
  - 2 of 48 GLM-5.3 turns in that run came back `stop` with 240-320 completion tokens and no text.
  - A second run of the two long scenes (32 turns) and 43 single probes, streamed and not, had none.
  - DeepInfra never did this.
  - So NanoGPT's client refuses an answer with no text as busy, and the chain moves it to OpenRouter. The WARN line gives its completion and reasoning tokens.
- **Concurrency:** 12 calls at once gave one 429; the app sends at most about 4.

### From NanoGPT's docs and terms (read 2026-11-28)

- **Used-up allowance: 429, not 402.**
  - The support FAQ says the request "continues to return 429 until the included limit resets".
  - No page gives the exact body or error code.
  - `GET /api/subscription/v1/usage` turns `routing.recommendedMode` to `paygo` or `unavailable` when it is used up.
  - The chain's out-of-credit rule (`OutOfCreditError`, a 402 or "insufficient ...") would not catch this case. That is why the busy rule and the balance read below carry it.
- **Rate limits on the subscription:**
  - 16 requests at once and 60 a minute (docs rate-limits page);
  - a February 2026 post also names a burst bucket of 10 requests per 10 seconds.
  - The app sends at most about 4 at once. The limits are shared with the coding agent on the same account.
- **Parameters:** `stop`, `min_p`, `repetition_penalty` and `response_format: json_object` are all documented as passed upstream. The build still probes them once.
- **Adult fiction:**
  - The terms ban sexual content involving anyone under 18, and sexual content depicting real people without their consent.
  - There is no general ban on adult content.
  - The roleplay page says adult roleplay is allowed.
- **Personal use:**
  - "Subscription plans are intended for personal, non-commercial use only."
  - "Each subscription is intended for use by a single individual."
  - Live has had one active Account in the last 30 days (UsageRecords by `user_id`).
- **ZDR:** set per account and per API key, or per request with `provider.zdr: true`. It is best-effort, based on providers' claims, and does not cover images.

## Decisions

### The host

- A new `TEXT_HOSTS` value, `nanogpt`, read from `NANOGPT_API_KEY`. Like the others, it is refused at start-up when named but unset.
- **`NanoGptTextClient`**, built like `VeniceTextClient`:
  - an `OpenRouterClient` subclass;
  - base URL `https://nano-gpt.com/api/v1`;
  - its own model ids from a table: `z-ai/glm-5.3`, `deepseek/deepseek-v4-flash`, `deepseek/deepseek-v4-pro`. DeepSeek V4 Pro counts 2x against the allowance.
- **The body:**
  - model, messages, `max_tokens`;
  - `stream_options: { include_usage: true }` on streams;
  - `reasoning_effort`: `minimal` for GLM-5.3 and `none` for the DeepSeek models, from the model table's reasoning setting;
  - `response_format` when the call asks for JSON;
  - `stop` and every sampler, as on Venice.
- **No embeddings:** `embeds: false`.
  - NanoGPT's subscription list has no bge-m3, and stored vectors must keep matching, so embeddings stay on OpenRouter.
  - The chain already sends embeddings only to hosts that embed.
- **No stopped-stream bill lookup:** `looksUpStoppedBills: false`.
- **The UsageRecord:**
  - host `nanogpt`;
  - the configured model;
  - cost $0 for an included model;
  - prompt and cached tokens as returned.

### Moving on

- **Busy:** a 429 or 503 from NanoGPT that lasts through every retry moves the call once to the next host. Decided 2026-11-28.
  - This is new for `nanogpt` only; other hosts still fail a busy play call as now.
  - It also catches the used-up allowance, which answers 429.
  - A stream moves on only while nothing has streamed, as now.
- **Out of credit:** a 402 or "insufficient balance" moves on, as for every host.
- **The Weekly allowance read:** `credit()` reads `GET /api/subscription/v1/usage`.
  - With the subscription active, `routing.recommendedMode` of `subscription`, and tokens left, the balance is unknown (`remainingUsd: null`), which never blocks.
  - Otherwise it reads $0, and the chain passes NanoGPT over up front, with no 429 round trips and retries first.
  - The reading is cached for 30 s, as for the other hosts, so a Monday reset is noticed within 30 s.

### The banner

- **When:** while the text chain is passing NanoGPT over because the Weekly allowance reads used up, a banner shows in the app. It is the same kind as the failed-backup banner.
- **The words:** "NanoGPT's Weekly allowance is used up. Text runs on OpenRouter, which costs credit, until it resets on Monday at 07:00." The reset time is shown in the browser's own zone. Decided 2026-11-28.
- **Who sees it:** the Owner only.
- **No push alert.**

### Usage page

- **The heading:** the Text card reads `Text (NanoGPT)` while NanoGPT serves.
- **The Weekly allowance line:** "41.2M of 60M input tokens left this week, resets Monday 07:00".
- **Spend:** the month's text spend still sums every host's records. NanoGPT's adds $0.
- **The API:** `PoolUsage` gains `weeklyAllowance: { used, limit, resetAt } | null`, filled only for NanoGPT.

### Evals

- `npm run eval:live` stays on OpenRouter by default, so results compare with earlier runs.
- A `--host nanogpt` flag sends a run to NanoGPT and spends the Weekly allowance instead of credit. Decided 2026-11-28.
- The run says which host it uses when it starts (`Text host: nanogpt ...`). On NanoGPT, text calls cost $0 and embeddings still go to OpenRouter.

### Turning it on (live)

1. The user turns off request/response logging on the NanoGPT key (or for the account), unless Q1 below decides otherwise. This is a setting on NanoGPT's site.
2. The key goes into `/etc/storytell/api.env` as `NANOGPT_API_KEY`. The user does this or says so; the file is never printed.
3. Set `TEXT_HOSTS=nanogpt,openrouter,free`.
4. Restart `storytell-api`.

To roll back, drop `nanogpt` from `TEXT_HOSTS` and restart.

## Testing

- **Contract** (`test/text-fallback.spec.ts`, scripted fetch through the real gateway):
  - NanoGPT answers a turn and a Judge call: its body (reasoning effort per model, samplers, stop, JSON), recorded as `nanogpt` at $0;
  - a 429 through every retry on NanoGPT moves to OpenRouter with the WARN line;
  - a 402 moves on too;
  - a busy OpenRouter play call still fails as now;
  - a stream refused before any text moves on, and a stream refused mid-stream does not;
  - embeddings never go to NanoGPT;
  - the Weekly allowance read gives unknown with tokens left and `subscription` routing, and $0 when used up or inactive;
  - a $0 reading passes NanoGPT over up front.
- **Config** (`test/config.spec.ts`): `nanogpt` is accepted, and refused without `NANOGPT_API_KEY`.
- **Banner and Usage page:** in the web unit tests that cover the backup banner and the Text card.
- **Evals:** `--host nanogpt` sends text to NanoGPT and embeddings to OpenRouter (checked by hand; the eval runner has no unit test of its launcher).
- **A live probe before switching live**, a throwaway that is not committed:
  - one real turn prompt built by `buildTurnPrompt` from made-up input;
  - one Judge prompt and one Memory extraction prompt;
  - each checked for a clean reply, valid JSON and no planning text.
  - Free, from the allowance.

## Out of scope

- **Images on NanoGPT.** Pro includes 100 images a day, and `qwen-image` edits a Reference into Expressions in 28–33 s. Joy and surprise were as good as ModelScope's Qwen-Image-2.1. Anger came out cartoonish, and the output is 768×1024. ModelScope is free already, so this waits; it could later be a fallback for ModelScope's 429s.
- **Pinning NanoGPT's upstream provider** or checking for quantization.
- **A token reserve** that keeps part of the week for the app against the coding agent.

### Privacy (decided 2026-11-28)

- **The user turns request/response logging off** on the NanoGPT key, on NanoGPT's site. Live is not switched before that.
- **Every call sends `provider: { zdr: true }`,** so only Zero Data Retention routes serve it.
- **The build first probes** GLM-5.3 and DeepSeek V4 Flash with ZDR once logging is off.
  - If either has no ZDR route (`zdr_provider_required`), that model's calls are sent without `zdr`.
  - That model is then served with logging off only, and the spec records which.

### Members (decided 2026-11-28: not built now)

- NanoGPT's subscription is for one person, and live has had one active Account in the last 30 days.
- Nothing routes Members differently now.
- **Before a Member is added,** their calls must be kept off NanoGPT, for example by skipping the `nanogpt` host for any Account that is not the Owner. That is a change of its own, made then.

### The coding agent's share (decided 2026-11-28)

- **Accepted:** the agent and the app share 60 requests a minute and 16 at once. A burst from the agent can make an app call 429 and move to OpenRouter, which is paid.
- **After a week of use,** count the "skipped nanogpt" WARN lines in the API log. If they are many, give the agent its own key with a lower limit.

Status: ready-for-agent once the user has turned logging off on the key. The code can be built before that; only the ZDR probe and turning live on wait.

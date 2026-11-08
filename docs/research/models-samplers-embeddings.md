# Research: samplers, extra play models, and embeddings

Researched: 2026-11-08. Scope: public docs, model cards, and OpenRouter/DeepInfra/Venice listing pages only. No paid API call, no account, no model tested with adult content. Prices and endpoint data change often; re-check before building. Builds on `docs/research/text-llm-for-adult-roleplay.md` (policy findings for DeepInfra, OpenRouter, Venice are not repeated in full).

## 1. Sampler parameters

### What OpenRouter accepts

Source: [OpenRouter parameters reference](https://openrouter.ai/docs/api/reference/parameters).

| Parameter | Type | Range | Default |
|---|---|---|---|
| `temperature` | float | 0.0 to 2.0 | 1.0 |
| `top_p` | float | 0.0 to 1.0 | 1.0 |
| `top_k` | int | 0 or above | 0 (disabled) |
| `min_p` | float | 0.0 to 1.0 | 0.0 |
| `top_a` | float | 0.0 to 1.0 | 0.0 |
| `repetition_penalty` | float | 0.0 to 2.0 | 1.0 |
| `frequency_penalty` | float | -2.0 to 2.0 | 0.0 |
| `presence_penalty` | float | -2.0 to 2.0 | 0.0 |
| `seed` | int | no range listed | none |

- The listed defaults are conventional values, not ones OpenRouter injects. If you omit a parameter, OpenRouter sends nothing upstream and the provider's own default applies. Sending `temperature: 1.0` explicitly is forwarded and can differ from omitting it (same page).
- The page does not describe `supported_parameters` by name; it tells you to check the model's provider section.

### How to tell what a provider supports

- The per-model endpoints API lists `supported_parameters` for each provider endpoint: `GET https://openrouter.ai/api/v1/models/{author}/{slug}/endpoints` (examples fetched below).
- By default an unsupported parameter is silently ignored. Set `provider.require_parameters: true` to route only to providers that support every parameter in the request ([provider selection guide](https://openrouter.ai/docs/guides/routing/provider-selection)). With `only: ['deepinfra']` and no fallbacks, that flag would turn a silent ignore into an error, which is useful for tests.
- Reasoning control: `reasoning.effort: "none"` disables reasoning entirely, `reasoning.enabled: false` also works, and `reasoning.exclude: true` only hides it. Each model entry in `GET /api/v1/models` may carry `mandatory: true`, meaning the model rejects `effort: "none"` ([reasoning tokens guide](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens)).

### DeepInfra endpoints (from the endpoints API, 2026-11-08)

| Model | `supported_parameters` on DeepInfra | Source |
|---|---|---|
| `z-ai/glm-5.3` (fp4) | reasoning, include_reasoning, max_tokens, temperature, top_p, stop, frequency_penalty, presence_penalty, repetition_penalty, top_k, seed, min_p, logit_bias, response_format, structured_outputs, tools, tool_choice, reasoning_effort | [endpoints](https://openrouter.ai/api/v1/models/z-ai/glm-5.3/endpoints) |
| `deepseek/deepseek-v4-pro` (fp8) | same list, same set | [endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-pro/endpoints) |

- Both support `min_p`, `top_k`, `repetition_penalty`, `seed`, `logit_bias`. Neither lists **`top_a`**, so it would be dropped silently.
- Flash was not fetched; check its endpoints URL the same way before relying on it.

### Makers' recommended sampling

- **GLM-5.3** ([model card](https://huggingface.co/zai-org/GLM-5.3)): no single recommendation. Benchmark footnotes use temperature 1.0 with top_p 0.95 or 1.0, and 0.95 with top_p 1.0 for one benchmark. The card documents `reasoning_effort` of low, high or max (default max) and `clear_thinking=true` for chat; it does not say how to switch thinking off. OpenRouter lists `reasoning_effort` as supported on DeepInfra, which is how the app currently sets "minimal".
- **DeepSeek V4** ([V4-Pro card](https://huggingface.co/deepseek-ai/DeepSeek-V4-Pro)): for local deployment `temperature = 1.0`, `top_p = 1.0`. Three modes: Non-think, Think High, Think Max.
- No maker publishes roleplay-specific sampler advice. Starting point: temperature near 1.0, optionally `min_p` 0.02-0.05 to trim the tail, and a light `frequency_penalty` or `repetition_penalty` only if repetition shows up. These last values are an inference from the ranges above, not from a source; tune by play-testing.

## 2. Additional play-model candidates

All are on DeepInfra and so inherit its terms ([DeepInfra terms](https://deepinfra.com/terms), §11, no adult-content clause, as recorded in the earlier research). DeepInfra's [privacy policy](https://deepinfra.com/privacy) says it will "not store, sell, or train using this data unless we have your explicit consent". Prices below are from the OpenRouter endpoints API (per 1M tokens, input / output / cached input).

| Model (OpenRouter id) | DeepInfra price | Context (max out) | Reasoning off? | Notes |
|---|---|---|---|---|
| `moonshotai/kimi-k3.1-pro` (bf16) | 1.90 / 9.50 / 0.19 | 1,048,576 (943,718) | `reasoning`, `include_reasoning`, `reasoning_effort` listed, so effort can be set; "none" not verified | Strongest prose option. Earlier research ranks Kimi K3.1-Pro #2 on EQ-Bench CW v3 (2173). About 3.8x GLM-5.3's output price. [endpoints](https://openrouter.ai/api/v1/models/moonshotai/kimi-k3.1-pro/endpoints) |
| `moonshotai/kimi-k2.6` (fp4) | 0.75 / 3.50 / 0.15 | 262,144 (16,384) | Yes at maker level: `thinking: {type: disabled}` ([card](https://huggingface.co/moonshotai/Kimi-K2.6)). OpenRouter lists `reasoning`/`include_reasoning`, no `reasoning_effort` | Card recommends temperature 1.0 thinking / 0.6 instant, top_p 0.95. Modified MIT licence. Max output only 16k. Longform 78.5 per earlier research. [endpoints](https://openrouter.ai/api/v1/models/moonshotai/kimi-k2.6/endpoints) |
| `qwen/qwen3.5-397b-a17b` (fp8) | 0.45 / 3.00 / 0.22 | 262,144 (81,920) | Yes at maker level: `enable_thinking: false` via chat template ([card](https://huggingface.co/Qwen/Qwen3.5-397B-A17B)). OpenRouter lists `reasoning`/`include_reasoning`, no `reasoning_effort` | Card: non-thinking temperature 0.7, top_p 0.8, top_k 20, presence_penalty 1.5; Apache-2.0. Roleplay quality and willingness untested here. [endpoints](https://openrouter.ai/api/v1/models/qwen/qwen3.5-397b-a17b/endpoints) |
| `qwen/qwen3.8-27b` (bf16) | 0.15 / 1.875 / 0.0375 | 262,144 (235,929) | `reasoning_effort` listed; "none" not verified | Cheap dense mid-size model; a possible background/utility or budget play model. Not benchmarked here. [endpoints](https://openrouter.ai/api/v1/models/qwen/qwen3.8-27b/endpoints) |
| `sao10k/l3.1-euryale-70b` (fp8) | 0.85 / 0.85 | 131,072 (16,384) | No reasoning at all (not a reasoning model) | OpenRouter describes it as "aimed at creative roleplay". Llama 3.1 base, so Meta's licence applies (not reviewed). No cache price. Likely weakest on long-story coherence. [endpoints](https://openrouter.ai/api/v1/models/sao10k/l3.1-euryale-70b/endpoints) |

Also on DeepInfra per its [OpenRouter provider page](https://openrouter.ai/provider/deepinfra): `moonshotai/kimi-k3` (2.85 / 14.25, already covered), `z-ai/glm-5.2`, `z-ai/glm-5.3-flash`, `deepseek/deepseek-v4.1-flash`, `minimax/minimax-m3`, `nvidia/nemotron-3-ultra-550b-a55b`, `sao10k/l3-lunaris-8b`. No Hermes model is listed there. MiniMax and Nvidia terms were not reviewed. DeepInfra's own [text model list](https://deepinfra.com/models/text-generation) did not show Llama, Mistral, Hermes or MiniMax on its first page.

Caveats:
- "Reasoning can be turned off" means the maker's card or OpenRouter's parameter list says so. None was tested; use `provider.require_parameters` and a smoke test per model.
- Whether each model complies with explicit requests is untested, as in the earlier research.

## 3. Embeddings

### Who offers an embeddings API

- **OpenRouter**: yes, `POST /embeddings` with `model`, `input` (string or array) and `provider` routing preferences ([docs](https://openrouter.ai/docs/api/reference/embeddings)). Its [embeddings model list](https://openrouter.ai/api/v1/embeddings/models) has 40 models, including `baai/bge-m3` ($0.01/M, 8,194 context, 1,024 dims), `qwen/qwen3-embedding-8b` ($0.01/M, 40,960), `qwen/qwen3-embedding-4b` ($0.02/M), `intfloat/multilingual-e5-large` ($0.01/M, 512 context, 1,024 dims), `openai/text-embedding-3-small` ($0.02/M), plus Cohere, Voyage, Google, Mistral, Perplexity and free Nvidia models. Per-model endpoint pages show **DeepInfra and Parasail** serving `baai/bge-m3` ([endpoints](https://openrouter.ai/api/v1/models/baai/bge-m3/endpoints)), and Nebius, DeepInfra and SiliconFlow serving Qwen3-Embedding-8B ([endpoints](https://openrouter.ai/api/v1/models/qwen/qwen3-embedding-8b/endpoints)). So `provider: {only: ['deepinfra']}` is possible with the same routing code.
- **DeepInfra (direct)**: yes. [Embeddings list](https://deepinfra.com/models/embeddings): BAAI/bge-m3 ($0.01/M, 8k input, "100+ languages"), bge-m3-multi, Qwen3-Embedding-0.6B / 4B / 8B ($0.01 / 0.02 / 0.01, 32k input), multilingual-e5-large (1024 dims, 100 languages, 512 input), google/embeddinggemma-300m ($0.002, multilingual), Nvidia Nemotron embed models (34 languages; 2048 or 4096 dims).
- **Venice**: yes. The [embeddings reference](https://docs.venice.ai/api-reference/endpoint/embeddings/generate) accepts up to 2048 inputs of up to 8192 tokens each, optional `dimensions`; models include `text-embedding-bge-m3`, `text-embedding-qwen3-8b`, `text-embedding-qwen3-0-6b`, `text-embedding-multilingual-e5-large-instruct`. [Pricing](https://docs.venice.ai/welcome/pricing): bge-m3 $0.15 in / $0.60 out per M (15x DeepInfra), Qwen3 and E5 $0.0125 per M; all labelled "Private" with no definition of that word.

### Thai + English

- bge-m3 is described on DeepInfra as covering 100+ languages; Thai coverage specifically is not stated on these pages. The [BGE-M3 model card](https://huggingface.co/BAAI/bge-m3) is the place to confirm Thai (not fetched here). Qwen3-Embedding multilingual claims are likewise not stated on DeepInfra's list ("Not stated"); verify on the [Qwen3-Embedding card](https://huggingface.co/Qwen/Qwen3-Embedding-8B) (not fetched). Treat Thai quality as unconfirmed until a small retrieval test on real Thai text.

### Content policy for adult text

- OpenRouter's embeddings route through the provider's terms like chat does (see earlier research on the Terms). DeepInfra's terms have no adult clause, so pinning DeepInfra matches the chat setup. Some other OpenRouter embedding listings state retention or training use (the Liquid free model does), so always pin the provider.
- Venice's terms are self-contradictory about "pornographic" user content (earlier research), so it is not recommended for story text even though its embeddings are "Private".
- Embedding input is the user's story text, so retention matters: DeepInfra's privacy policy says it does not store or train on inference data without consent ([privacy](https://deepinfra.com/privacy)); its separate inference-data article was not retrieved.

### Recommendation

**`BAAI/bge-m3` on DeepInfra, called through OpenRouter (`baai/bge-m3`, `provider: {only: ['deepinfra'], allow_fallbacks: false}`)**: $0.01/M tokens (500 chunks of 500 tokens is about 0.25M tokens, so roughly $0.0025 per full index), 1,024 dims, 8k input, multilingual. It reuses the existing OpenRouter key and pinning code. Fallback if Thai recall is poor: `qwen/qwen3-embedding-8b` on DeepInfra (also $0.01/M, 32k input). Store the model id with the vectors, since changing models means re-embedding everything.

## Open items

- Confirm Thai quality for bge-m3 vs Qwen3-Embedding with a small test set.
- Fetch endpoints for `deepseek/deepseek-v4-flash` to confirm its `supported_parameters`.
- Review the Meta Llama licence (Euryale), Kimi K3.1-Pro licence, and Qwen3.8 licence before use.
- Test refusal behaviour for any candidate before adding it as a play model.

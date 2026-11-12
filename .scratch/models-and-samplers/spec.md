# Spec: Play models and Sampling

Status: ready-for-agent
Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).
Decision: [Choosing play models and sampler settings](../sillytavern-gaps/issues/04-models-and-samplers.md) (options A + B)
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) ("Model Gateway", "Settings, usage and credit")
Research: [Samplers, extra play models, and embeddings](../../docs/research/models-samplers-embeddings.md) §1–2, [Text LLMs for adult roleplay](../../docs/research/text-llm-for-adult-roleplay.md)

## Problem Statement

The user can pick one of two play models, GLM-5.3 and DeepSeek V4 Pro, and nothing else about how they write. When a Character's lines feel flat, repetitive or too wild, there is no dial to turn: the app sends only `max_tokens`, so every play call runs on the host's defaults. Stronger writers exist on the same trusted host (Kimi K3.1-Pro ranks #2 on the creative-writing benchmark), but nobody knows yet whether they write adult fiction or honour "reasoning off", so they can't simply be added. And the Settings page doesn't say what a play model costs, which matters once one of them costs nearly four times another.

## Solution

Settings gets **Sampling** for each play model: temperature, min-p, top-p and repetition penalty. Each is blank by default, and blank means nothing is sent, so the host's own default applies exactly as today. A value set for a model goes with every turn, Suggested reply and Write for me on that model. Story drafting, the Story assistant, field rewrites and every background call keep their defaults. One tap on "Reset to defaults" clears a model's values.

The play-model list grows, but only through a check. Each candidate (Kimi K3.1-Pro, Kimi K2.6, Qwen3.5-397B first) gets a pinned entry in the model table. Then the user runs a short **live smoke run** that spends a few cents of credit and shows whether the model writes adult fiction, turns reasoning off, stops at stop strings and takes the sampler values. Only a model that passes joins the list. Free-form model ids never come. Settings shows each play model's price and roughly what a long turn costs on it, and the Chat's Drift notice names every model in the list by its proper name. (The Settings Drift warning names no model, so it already works for any.)

## User Stories

1. As a player, I want to set the temperature of my play model, so that I can make the Narrator more adventurous or more steady.
2. As a player, I want to set min-p, so that I can trim the odd word choices a high temperature brings without making the prose dull.
3. As a player, I want to set top-p, so that I can follow a maker's recommended setting for a model.
4. As a player, I want to set a repetition penalty, so that I can push back when a model keeps repeating the same details.
5. As a player, I want each sampling value to be blank until I set it, so that nothing changes for me unless I choose to.
6. As a player, I want a blank value to mean "not sent at all", so that the host's own default applies rather than a guess of the app's.
7. As a player, I want sampling stored per play model, so that switching from GLM-5.3 to DeepSeek V4 Pro and back keeps what I tuned for each.
8. As a player, I want the Sampling section to show the values of the play model I have chosen, so that I always know which model I am tuning.
9. As a player, I want a "Reset to defaults" button, so that one tap undoes an experiment that went badly.
10. As a player, I want a value outside its range refused with a plain message beside the field, so that I can't save a setting that would break turns.
11. As a player, I want each field to say in a few words what it does, so that I don't need to know sampler jargon.
12. As a player, I want the maker's suggested value shown where the maker gives one, so that I have a sensible starting point.
13. As a player, I want sampling to save as I type, like every other setting, so that there is no Save button to forget.
14. As a player, I want only the parameters the model's host supports offered, so that I never set a value that is silently ignored.
15. As a player, I want my sampling used on every turn: send, Retry, Continue, Regenerate and a User Message edit, so that the story reads consistently.
16. As a player, I want Suggested replies and Write for me to use the same sampling, so that what is written for me sounds like the story.
17. As an author, I want Story drafting, the Story assistant and field rewrites to keep their defaults, so that a play-tuned temperature never breaks their structured answers.
18. As a player, I want the Judge, Memory extraction, Snapshot descriptions and the Story so far to keep their defaults, so that the story's bookkeeping stays reliable. (Since 2026-11-12, the Judge sends a fixed temperature 0.3 of its own instead: see .scratch/scene-flow/spec.md, "Judge temperature".)
19. As a player, I want a turn to fail loudly, telling me to reset Sampling, if the host stops taking one of my values, so that I never play on a setting that silently stopped working.
20. As a player, I want changing Sampling not to raise a Drift notice, so that the notice keeps meaning "a different model wrote this".
21. As a player, I want to see each play model's price per million tokens in Settings, so that I know what I'm choosing.
22. As a player, I want to see roughly what a long turn costs on each play model, so that the price means something to me.
23. As a player, I want more play models to choose from, so that I can find the writer I like best.
24. As a player, I want a model offered only after it has been shown to write adult fiction on our host, so that choosing it never breaks play.
25. As a player, I want every offered model pinned to a host whose terms allow adult fiction, with no fallback to another host, so that a request never lands somewhere it is forbidden.
26. As a player, I want every offered model to run with reasoning off or as low as it goes, so that I don't pay for hidden thinking on every turn.
27. As a player, I want every offered model to honour stop strings, or to have them left out, so that the Narrator stops before writing my lines.
28. As the user, I want to run the smoke check myself and approve each spend, so that no credit is used without my say-so.
29. As the user, I want the smoke run to refuse to start without an explicit spend flag and to stop at a small spending cap, so that a slip can't cost much.
30. As the user, I want the smoke run's played text kept out of the repository, so that adult test output never lands in git.
31. As the user, I want the smoke run to report reasoning tokens, cost and finish reason per call, so that I can judge a model on facts.
32. As a player, I want the Drift notice in a Chat to name every model in the list by its proper name, so that a new model doesn't show as a raw id. (The Drift warning in Settings names no model, so a new model needs nothing there.)
33. As a player, I want a Chat whose last reply came from a model that has since left the list to still show a readable Drift notice, so that old Chats keep working.
34. As a player, I want the Usage page to keep counting spend from what OpenRouter reports, so that a pricier model shows its real cost.
35. As a player, I want never to be able to type a model id of my own, so that the curated, pinned list keeps adult play working.

## Implementation Decisions

### One play-model catalogue (prefactor)

- **Where model facts live today.** Two places, split by who reads them:
  - The real gateway's model table (`TEXT_MODELS` in the gateway's `real/model-table.ts`) holds what only the real gateway needs: each text model's OpenRouter id, host, reasoning setting and stop-string support.
  - The gateway's interface module (`model-gateway.ts`) holds the app's model names (`PLAY_MODELS`) and the facts callers outside the gateway read. The price pattern to follow is `SNAPSHOT_MODEL_PRICES` there: the Settings controller shows those prices, and the real model table takes its image prices from them.
- **The play-model catalogue** follows that pattern: a `PLAY_MODEL_CATALOGUE`, keyed by `PlayModel`, beside `PLAY_MODELS` in the interface module. Each entry holds:
  - its display name ("GLM-5.3");
  - its list price per million tokens, as `{ input, output, cachedInput }` in USD, read from OpenRouter's endpoints API;
  - the sampler parameters its host lists in `supported_parameters`;
  - the maker's suggested sampler values, if the maker publishes any.

  It sits there, not in the real model table, because the Settings controller and the Chat manager read it, and they must read it when the fake gateway runs too (every API test and e2e). Typing it as a record over `PlayModel` makes a play model without an entry a compile error.
- The prices are for display only. UsageRecords keep the cost OpenRouter reports.
- The Settings controller builds its play-model options from the catalogue instead of its own hard-coded list.
- The Drift notice stops relying on the web's own model-name map: the Chat response's `drift` gains `lastModelLabel` and `playModelLabel`. A model no longer in the catalogue shows its stored id.
- The web drops its `MODEL_LABELS` map and reads names from the API.
- The Settings page's Drift warning ("A different model plays Characters differently…") shows whenever the chosen Play model differs from the saved one and names no model, so it needs no change for a new model.
- Each play-model option gains `priceUsdPerMillion: { input, output, cachedInput }` and `longTurnUsd`. `longTurnUsd` is the full turn prompt budget (about 16k tokens) at the uncached input price, plus the Long reply's `maxTokens` at the output price, rounded to the cent (at least $0.01).
- Settings shows, under the Play model select: "$0.56 in / $2.50 out per million tokens · a long turn about $0.01".
- The `play_model` column has no CHECK constraint, so adding a model needs no migration; `PLAY_MODELS` and the DTO's `IsIn` are the gate.

### Sampling

- **Parameters offered:** four, named in the app as `temperature`, `minP`, `topP`, `repetitionPenalty`. They are sent as OpenRouter's `temperature`, `min_p`, `top_p`, `repetition_penalty`.
  - Both current models list all four on DeepInfra.
  - Not offered: `top_k`, `frequency_penalty`, `presence_penalty`, `seed`, `top_a` (DeepInfra doesn't list it), DRY, XTC, mirostat, presets.
  - A model is offered only the parameters its host lists.
- **Ranges** (inclusive, at most two decimal places). They are narrower than OpenRouter's where the extremes only break prose:

  | Parameter | Range | Step in the UI |
  |---|---|---|
  | temperature | 0.00–2.00 | 0.05 |
  | minP | 0.00–0.50 | 0.01 |
  | topP | 0.05–1.00 | 0.01 |
  | repetitionPenalty | 1.00–1.50 | 0.01 |

- **Storage:** Settings gains `samplers`, a jsonb column, `NOT NULL DEFAULT '{}'`, added by one migration. A key is present only for a value that is set, and an absent key means default (not sent). The type shape encodes that decision:

  ```ts
  type SamplerParam = 'temperature' | 'minP' | 'topP' | 'repetitionPenalty';
  type SamplerValues = Partial<Record<SamplerParam, number>>;   // absent = not sent
  samplers: Partial<Record<PlayModel, SamplerValues>>;          // per play model
  ```

  A key for a model that has left the list is kept but never read.
- **Which calls use them:** `turn` (every send, Retry, Continue, Regenerate and User Message edit), `suggested_replies`, and Write for me's call kind once it exists (named by [Spec: Write for me](../write-for-me/spec.md); whichever lands second adds it to the set).
  - The gateway holds this as its own set of **sampled kinds**, a subset of the play-model kinds.
  - `story_draft`, `story_assistant` and `field_rewrite` still run on the play model but send no sampler values: their JSON and structured answers were tuned on host defaults.
  - Background kinds never send them. Neither does Thai reading, which runs on the background model.
- **Gateway:** callers never pass sampler values, just as they never name a model.
  - The gateway's Settings read gains the current play model's `SamplerValues`.
  - The OpenRouter request builder adds the set values for a sampled kind.
  - With at least one value in the body, it also sends `provider.require_parameters: true`. With only `deepinfra` allowed and no fallbacks, a host that stops taking a parameter then fails the call instead of silently ignoring it.
  - With no values set, the body is exactly what it is today.
- **A refused parameter:** when values were sent and OpenRouter answers that no endpoint takes the request's parameters, the gateway raises `ProviderOutageError` (502.001.001). Its message reads: "DeepInfra no longer takes one of the Sampling values for <model>. Reset Sampling for it in Settings." The turn shows it with Retry, as any outage. The exact status and wording OpenRouter uses is confirmed by the smoke run (ticket 05).
- **API:**
  - `GET /api/settings`:
    - `settings` gains `samplers` (as stored);
    - each `playModels` option gains `samplers: [{ param, min, max, step, suggested: number | null }]`, listing the parameters that model is offered, in the order above, with the maker's suggestion where there is one.
  - `PUT /api/settings/samplers/:playModel` with `{ temperature?, minP?, topP?, repetitionPenalty? }`:
    - each value is a number to set it, `null` to reset it to default, or absent to leave it;
    - it answers the whole Settings response, like `PUT /api/settings`;
    - an out-of-range or over-precise value is a 400 validation error;
    - an unknown play model in the path is a 400;
    - a parameter the model is not offered is refused with a new `SamplerNotOfferedError`, at the next free 422 code in the Model Gateway domain (001), listed in `docs/error-codes.md`.
  - "Reset to defaults" is that route with all four `null`.
- **Settings page:** in the Models card, right under the Play model select, its price line and the Drift warning, comes a **Sampling** fold for the chosen model.
  - The note at its top reads: "Blank uses the host's default and sends nothing. Used for turns, Suggested replies and Write for me."
  - One field per offered parameter. Each field:
    - is a number input that may be blank, with "Default" as its placeholder;
    - has a one-line plain explanation ("Higher is more surprising, lower more predictable");
    - shows "Maker suggests 0.6" when there is a suggestion;
    - shows the range error beside itself, like the credit fields;
    - autosaves through the page's existing autosave queue, and clearing a field sends `null`.
  - "Reset to defaults" clears every field of that model, and is disabled while all are blank.
  - Switching the Play model shows that model's values.
- **Drift:** unchanged. The notice still compares the model an AI Message records with the current play model. A Sampling change is not a Drift.

### More play models

- **The bar a model must clear:**
  - DeepInfra (the host whose terms are already checked), pinned with `allow_fallbacks: false`;
  - a reasoning setting that leaves reasoning tokens at or near zero;
  - stop strings honoured, or the entry marked `stopStrings: false`;
  - the four sampler parameters accepted with `require_parameters`, or the entry lists only those that are;
  - a short adult scene written without refusal through the app's own turn prompt;
  - a known price.
- **Candidates** go into the real model table as their own record, beside `TEXT_MODELS` but outside `PLAY_MODELS` and the catalogue, so neither Settings nor the DTO can choose them, and only the smoke run (which uses the real client) reads them. Each holds a provisional entry (id, host `deepinfra`, the reasoning settings to try, stop strings assumed on, prices, offered samplers, maker suggestions). The research gives them:

  | Candidate | OpenRouter id | Price in / out / cached (per M) | Reasoning settings to try, in order | Maker's suggestion |
  |---|---|---|---|---|
  | Kimi K3.1-Pro | `moonshotai/kimi-k3.1-pro` | 1.90 / 9.50 / 0.19 | `effort: none`, `effort: minimal`, `enabled: false` | none published |
  | Kimi K2.6 | `moonshotai/kimi-k2.6` | 0.75 / 3.50 / 0.15 | `enabled: false`, `effort: none` | temperature 0.6, topP 0.95 (instant mode) |
  | Qwen3.5-397B | `qwen/qwen3.5-397b-a17b` | 0.45 / 3.00 / 0.22 | `enabled: false`, `effort: none` | temperature 0.7, topP 0.8 (non-thinking) |

  The reasoning setting type widens from `{ effort: 'minimal' } | { enabled: false }` to include `{ effort: 'none' }`.
- **The live smoke run** is a test file outside the normal suite (`*.spec.ts` only is collected), run with its own npm script.
  - **Spending:**
    - it refuses to start unless an explicit spend flag is set;
    - it reads the OpenRouter key from the root `.env`;
    - it stops before any call that would take the running total past a cap of $0.50.
  - **Calls:** it sends each named candidate's calls through the real OpenRouter client and request builder:
    1. a tiny prompt per reasoning setting to try, recording reasoning tokens;
    2. a stop-string probe whose answer would run past a marker;
    3. a short turn with all offered sampler values set, so `require_parameters` is sent;
    4. two turns through the real turn prompt builder on a small synthetic adult Story (adult Characters, a consensual scene the user steers into explicit territory);
    5. one Suggested replies call.
  - **Results:**
    - it writes a report (per call: text, finish reason, prompt, completion and reasoning tokens, cost, error) under `.data/`, which is gitignored, so no played text enters the repository;
    - it prints a summary table to the console.
  - **Who runs it:** writing the run is agent work; running it spends credit and is the user's. The agent that builds it never runs it.
- **Offering a model** that passed means:
  - adding its name to `PLAY_MODELS`, its provider facts (id, host, the reasoning setting and stop-string support the smoke run confirmed) to `TEXT_MODELS`, and its display facts (name, prices, the samplers the smoke run confirmed, suggestions) to the catalogue, then dropping its candidate entry;
  - a contract test of its request body;
  - nothing else, since Settings, the Drift notice and Usage read the catalogue.
  - A model that failed is recorded as such, with its reason, in the smoke ticket, and its "offer" ticket becomes `wontfix`.
- Kimi K2.6 caps output at 16,384 tokens, above every `maxTokens` the play-model kinds ask for (the largest is 8,000). The others are higher.

## Testing Decisions

- Test external behaviour only: the request body the real gateway sends, the Settings API's answers, and what the Settings page shows. No test reaches a paid API. Every OpenRouter response in a test is a synthetic recorded fixture.
- **Contract tests** through the real gateway on a scripted `fetch` (prior art: the OpenRouter contract tests and their gateway-under-test harness):
  - with no Sampling set, a turn's body has none of the four keys and no `require_parameters`;
  - with values set for the play model, `turn`, `suggested_replies` and `write_for_me` (once it exists; integration: "Write for me's inputs") carry exactly those values under OpenRouter's names, plus `provider.require_parameters: true`, alongside the unchanged pinning;
  - `story_draft`, `story_assistant`, `field_rewrite` and a background kind carry none of them;
  - the values of another play model are not sent;
  - the "no endpoint takes these parameters" answer maps to the outage with the Settings hint;
  - each offered model's body (id, host, reasoning, stop strings).
- **API tests** (prior art: the Settings API tests):
  - `GET` lists each play model with its price, long-turn cost and offered samplers;
  - `PUT .../samplers/:playModel` sets, keeps absent ones, resets with `null` and answers the whole Settings;
  - range and precision limits are 400;
  - an unknown model is 400;
  - a parameter not offered is the new 422;
  - values persist per model across a play-model switch.
- **Drift test** (prior art: the Drift notice tests in the Chats API tests): the notice carries both labels, and a stored model id that is no longer in the catalogue comes back as its id.
- **e2e (Playwright, 390px, prior art: the Settings e2e that checks the Drift warning):**
  - the price line shows;
  - typing a temperature saves and survives a reload;
  - an out-of-range value shows its error and is not saved;
  - "Reset to defaults" blanks the fields;
  - switching the play model shows the other model's (blank) values.
- **The live smoke run** is not part of any suite and never runs in CI or in an agent session.

## Out of Scope

- Free-form model ids, other hosts than DeepInfra for play models, and any provider fallback.
- `top_k`, frequency and presence penalties, `seed`, `top_a`, DRY, XTC, mirostat, logit bias, and named presets.
- Sampling for Story drafting, the Story assistant, field rewrites and background calls; Sampling per Story or per Chat.
- Changing the background model or its fallback.
- Candidates beyond the three named (Qwen3.8-27B, Euryale 70B, GLM-5.3-Flash and others): each would be one more row in the candidate table, one more smoke run and one more offer ticket.
- Per-model spend on the Usage page.

## Further Notes

- Prices and supported parameters change; whoever builds ticket 01 re-reads the endpoints API for the two current models, and the smoke ticket re-reads them for each candidate.
- Licences: the research lists the Kimi K3.1-Pro and Qwen licences as not yet reviewed. The smoke ticket asks the user to glance at each before offering the model.
- Open question: should `require_parameters` be sent always, not only when Sampling is set? Recommended: only when set. Today's requests stay byte-for-byte the same, and a host dropping an unused parameter can't break play.
- Open question: should a candidate whose host ignores stop strings be offered with `stopStrings: false`? Recommended: yes. The reply parser already cuts a line written as the worn identity, and streaming's guard aborts there, so stop strings are a saving, not a safety.
- Open question: should a model's maker suggestion be applied when the user leaves a field blank? Recommended: no. Blank means not sent, and the suggestion is a hint only.
- Glossary: no new term is strictly needed. "Sampling" is used as plain English for the per-model values. If it should become a defined term, it belongs in `CONTEXT.md` under Playing.

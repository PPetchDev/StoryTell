# 02 — Sampling reaches the play model, starting with Temperature

**Status:** done

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** Per the spec's "Sampling": the user sets a Temperature for the chosen play model in Settings, and every sampled call on that model sends it. The API and the gateway take all four parameters from the start; the page shows only Temperature here, and ticket 03 adds the rest of the fold.
- Every value is blank by default, and blank is never sent.
- Set values go with every sampled call on that model: turns, Suggested replies, and Write for me (`write_for_me`) once it exists. Drafting, the Story assistant, field rewrites and background calls keep their defaults.
- With any value sent, the request also asks OpenRouter to require the parameters, and a refusal tells the user to reset Sampling.

Covers the jsonb `samplers` column and its migration, the `PUT /api/settings/samplers/:playModel` route, the `samplers` fields on `GET /api/settings`, the gateway's sampled kinds and request body, the new `SamplerNotOfferedError`, and the Sampling fold with its note and the Temperature field.

**Blocked by:** [01 — One play-model catalogue](01-play-model-catalogue.md)

- [x] Contract tests:
  - [x] with no Sampling set, every request body is exactly as before;
  - [x] with values set, `turn` and `suggested_replies` on that model send them as `temperature`, `min_p`, `top_p`, `repetition_penalty`, plus `provider.require_parameters: true`; other kinds and other models' values are not sent;
  - [x] OpenRouter's "no endpoint takes these parameters" answer, when values were sent, is a `ProviderOutageError` whose message says to reset Sampling in Settings.
- [x] If Write for me's call kind exists when this lands, it is a sampled kind with a contract test. If not, the [Write for me spec](../../write-for-me/spec.md)'s ticket owes it (integration: "Write for me's inputs").
- [x] API tests: the route sets, leaves absent ones, resets with `null` and answers the whole Settings response; ranges and two-decimal precision are enforced (400); an unknown model is a 400; a parameter the model isn't offered is `SamplerNotOfferedError` (next free 422 in domain 001, added to `docs/error-codes.md`); values persist per model across a play-model switch.
- [x] A Sampling change raises no Drift notice.
- [x] The Settings page's Sampling fold, under the price line and the Drift warning: its note ("Blank uses the host's default and sends nothing. Used for turns, Suggested replies and Write for me.") and the Temperature field (blank meaning default, autosave, clearing sends `null`, the range error inline).
- [x] e2e at 390px: a temperature saves and survives a reload; an out-of-range value is refused inline and not saved.

## Comments

- Write for me's call kind did not exist when this landed, so it is not in the gateway's sampled kinds yet. The [Write for me spec](../../write-for-me/spec.md)'s ticket owes it (integration: "Write for me's inputs"): add `write_for_me` to `SAMPLED_KINDS` in `apps/api/src/service/model-gateway/real/model-table.ts`, with a contract test beside the ones in `apps/api/test/gateway/sampling.contract.spec.ts`.
- The refusal is matched on OpenRouter's 404 "No endpoints found…" when `require_parameters` was sent (`SamplerRefusedError` in `openrouter-client.ts`); ticket 05's smoke run confirms the exact status and wording.
- Migration `1763970000000-Samplers` is applied to the dev DB.

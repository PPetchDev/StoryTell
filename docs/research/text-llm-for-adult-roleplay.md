# Research: Text LLMs that allow adult fiction for adult users

Ticket: `.scratch/storytell-mvp/issues/02-text-llm-for-adult-roleplay.md`
Researched: 2026-11-03. Policy text and prices change often, so re-check them before deciding.
Scope: published usage policies, terms, pricing and context limits only. No accounts were created and no model was tested with adult content. "Permitted" below means the provider's own published policy does not prohibit consensual, fictional, adult sexual content for an adult user. It does **not** mean the model will write it without refusing. Willingness has to be tested in a later prototype ticket.

## Summary

- **Closed frontier APIs mostly rule it out.** The OpenAI Model Spec (2026-10-29) still says "GPT should not generate erotica" and calls a "grown-up mode" something OpenAI is only "exploring". Google's Generative AI Prohibited Use Policy bans "Sexually explicit content". Anthropic was already excluded.
- **Two first-party APIs permit it on paper.** The xAI (now "SpaceXSI") Acceptable Use Policy (effective 2026-08-14) bans only sexual content involving real people's likenesses or children. The Mistral Usage Policy (effective 2026-06-11) bans CSAM, non-consensual intimate imagery and "sexual services", and its moderation guardrails are opt-in.
- **The Chinese labs' own APIs prohibit it, but their open weights do not.** DeepSeek's Terms of Use ban content that "is pornographic, obscene, or sexually explicit (e.g., sexual chatbots)", and Z.ai's terms ban "sexually explicit" content. The weights, however, carry permissive licences: DeepSeek V4.x is MIT, and GLM-5.3 and Kimi K3 use MIT-style licences whose only content condition is "comply with applicable laws". These models can therefore be used through a third-party host whose terms don't ban adult content. **DeepInfra** is one, verified here.
- **OpenRouter** adds no adult-content ban of its own. It passes through the terms of the *model* and of the *provider* serving the request, so the provider has to be pinned (`provider.only`) to hosts that allow it. **Together AI** explicitly bans "pornography" and must be excluded.
- **Budget.** A heavy single user (150 turns/day, 32k-token context) fits within $10–30/month on DeepSeek V4 Flash (about $5–13), Mistral Small 4 (about $7–23) and, with prompt caching, Mistral Large 4 (about $33, slightly over). The quality leaders (Kimi K3, Grok 4.7, GLM-5.3) cost about $36–150/month at that volume, or fit only at moderate volume. A flat-rate subscription (Featherless Chat, $25/month, unlimited tokens) is a budget hedge, but its 32k context and its "human typed interactive chat use only" clause are real limits.
- **Shortlist (no decision):** (1) DeepSeek V4 Pro / V4 Flash through a pinned third-party host on OpenRouter; (2) GLM-5.3 through a pinned third-party host; (3) Mistral Large 4 / Small 4 first-party. Grok is the fallback when quality matters more than price.

## Comparison table

Prices are USD per 1M tokens (input / output / cached-input read), from OpenRouter's per-provider endpoint API on 2026-11-03. OpenRouter bills inference at the provider's list price and adds a 5.5% fee on credit purchases ([OpenRouter pricing](https://openrouter.ai/pricing)). Quality comes from EQ-Bench Creative Writing v3 (Elo) and Longform (score out of 100). Both are LLM-judged, so treat them as soft evidence (see [Quality evidence](#quality-evidence-soft)).

| Model (host) | Adult fiction allowed by policy? | Context | Streaming | Price in / out / cache | EQ-Bench CW v3 Elo | EQ-Bench Longform | Heavy-user cost/mo* |
|---|---|---|---|---|---|---|---|
| DeepSeek V4 Flash (DeepInfra, via OpenRouter) | Yes: MIT weights, and DeepInfra terms have no ban. **Not** on DeepSeek's own API | 1,048,576 | Yes (SSE) | 0.09 / 0.18 / 0.018 | 1559 | 66.0 | ~$5 (cached) – $13 |
| DeepSeek V4 Pro (DeepInfra / GMICloud, via OpenRouter) | Same as above | 1,048,576 | Yes | 1.30 / 2.60 / 0.10 (GMICloud 0.957 / 1.914 / 0.08) | 1553 | 75.6 | ~$41–55 (cached) – $193 |
| GLM-5.3 (DeepInfra, via OpenRouter) | Yes: permissive licence, DeepInfra terms. **Not** on Z.ai's own API | 1,048,576 | Yes | 0.563 / 2.50 / 0.125 | 2076 | n/a (GLM-5.2: 77.9) | ~$36 (cached) – $87 |
| Kimi K3 (DeepInfra, via OpenRouter) | Yes: permissive licence, DeepInfra terms. Moonshot's own terms are vague | 1,048,576 | Yes | 2.85 / 14.25 / 0.285 | 2083 | n/a (K2.6: 78.5) | ~$147 (cached) – $442 |
| Grok 4.7 (xAI first-party) | Yes: AUP bans only real-person and child sexual content | 500,000 | Yes (SSE) | 2.00 / 6.00 / 0.50 | 2012 | n/a (4.20-beta: 68.5) | ~$129 (cached) – $302 |
| Grok 4.3 (xAI first-party) | Yes (same AUP) | 1,000,000 | Yes | 1.25 / 2.50 / 0.20 | n/a | n/a | ~$65 (cached) – $186 |
| Mistral Large 4 (Mistral first-party) | Yes: no adult ban, guardrails opt-in | 1,048,576 | Yes | 0.70 / 2.10 / 0.07 | n/a | n/a | ~$33 (cached) – $106 |
| Mistral Small 4 (Mistral first-party, or Apache-2.0 weights) | Yes | 262,144 | Yes | 0.15 / 0.60 / 0.015 | n/a | 43.2 | ~$7 (cached) – $23 |
| Cydonia 24B v4.1 (Parasail, via OpenRouter) | Fine-tune marketed as "Uncensored". Parasail terms not reviewed | 131,072 | Yes | 0.30 / 0.50 / 0.15 | n/a | n/a | ~$27–44 |
| Featherless "Chat" plan (any open model) | Yes: terms ban only illegal use and violations of model licences | 32K on Chat plan | Yes | **$25/mo flat, unlimited tokens** | depends on model | depends on model | $25 |
| NovelAI Opus (Xialong, a GLM-4.6 fine-tune) | Yes: 18+ service, no content prohibition in terms | 28,672 | (not verified) | **$25/mo flat** | n/a | n/a | $25 |
| OpenAI GPT models | **No**: Model Spec "should not generate erotica" | | | | | | |
| Google Gemini | **No**: bans "Sexually explicit content" | | | | | | |
| DeepSeek / Z.ai first-party APIs | **No**: explicit bans | | | | | | |
| Together AI (any model) | **No**: bans "obscene … pornography" | | | | | | |

\* Heavy scenario B from the [cost estimate](#cost-estimate): 150 turns/day × 30 days, 32k input and 500 output tokens per turn, giving 144M input and 2.25M output tokens per month. "Cached" assumes 80% of input tokens are prompt-cache hits. The OpenRouter 5.5% fee is not included.

## Per-provider notes

### OpenAI: not usable for this content

- The [Usage Policies](https://openai.com/policies/usage-policies/) (effective 2026-11-20, changelog dated 2026-10-21) prohibit "sexual violence or non-consensual intimate content" and everything involving minors, including "underaged sexual or violent roleplay". They do not explicitly ban consensual adult erotica.
- Model behaviour is governed by the [Model Spec](https://model-spec.openai.com/2026-10-29.html) (2026-10-29), at "System" authority: "GPT should not generate erotica, depictions of illegal or non-consensual sexual activities, or extreme gore, except in scientific, historical, news, artistic or other contexts where sensitive content is appropriate." It goes on: "We're exploring how to let developers and users generate erotica and gore in age-appropriate contexts through the API and ChatGPT".
- The spec's own example of a compliant answer to a request for an explicit story is a refusal ("I can't create sexually explicit content…"). Press reports of a ChatGPT "adult mode" were not confirmed by any OpenAI primary source for the API.
- **Verdict:** excluded for now. Worth re-checking if the Model Spec changes.

### Google Gemini: not usable

- The [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy) says: "Do not engage in sexually explicit, violent, hateful, or harmful activities. This includes generating or distributing content that facilitates: … Sexually explicit content -- for example, content created for the purpose of pornography or sexual gratification."
- There is a discretionary carve-out ("We may make exceptions … based on educational, documentary, scientific, or artistic considerations"), but personal erotic roleplay is not what that is for.
- The open-weight Gemma licence / prohibited-use policy was not reviewed (the policy URL redirected).

### xAI / "SpaceXSI" (Grok): permitted by policy

- The [Acceptable Use Policy](https://x.ai/legal/acceptable-use-policy) (effective 2026-08-14) "applies to anyone using our Service, including consumers, developers and businesses". Its only sexual-content prohibitions are:
  - "Undressing or nudifying real persons, or otherwise altering a real person's image or likeness to depict them in an intimate or sexual context"
  - "Depicting likenesses of persons in a pornographic manner"
  - "Sexualizing or exploiting children"
- It also says "Jailbreaking, adversarial prompting, or prompt injection" and circumventing safeguards are prohibited. If the model refuses, you cannot work around it.
- Fictional characters are not "likenesses of persons". Stories should not be based on real people.
- The [Enterprise ToS](https://x.ai/legal/terms-of-service-enterprise) lets xAI "throttle or block specific Inputs or Outputs" it believes violate the AUP. It offers Zero Data Retention, otherwise User Content is deleted within 30 days.
- **Models and price** ([docs.x.ai/docs/models](https://docs.x.ai/docs/models)): grok-4.7 has a 500k context at $2.00 in / $6.00 out per 1M tokens. On OpenRouter, grok-4.3 (1M context) is $1.25 / $2.50. Streaming is via SSE with `"stream": true` ([streaming guide](https://docs.x.ai/docs/guides/streaming-response)).
- **Quality (soft):** grok-4.7 scores 2012 Elo on EQ-Bench CW v3, in the top 10. Its configurable reasoning adds output tokens.

### Mistral: permitted by policy

- The [Usage Policy](https://legal.mistral.ai/terms/usage-policy/) (effective 2026-06-11) prohibits:
  - "Content that enables or exploits individuals, including through human trafficking or sexual services"
  - CSAM ("zero tolerance")
  - "Non-consensual intimate imagery … intimate images of any person without the explicit consent of all individuals involved"
- It contains no prohibition on consensual adult fiction.
- Scope: "This Usage Policy does not apply to … our open-source AI models", so Apache-2.0 weights such as Mistral Small 4 are governed only by their licence.
- Guardrails are opt-in. [Moderation & Guardrailing](https://docs.mistral.ai/studio/safety-moderation) describes "Custom guardrails [that] let you declare moderation rules directly in your API requests". The "sexual" category is something you can choose to block, not a default.
- **Price:** Mistral Large 4 has a 1,048,576 context at $0.70 / $2.10 (cache $0.07). Mistral Small 4 has a 262,144 context at $0.15 / $0.60 (OpenRouter endpoint data; served by Mistral itself). The [pricing page](https://mistral.ai/pricing) confirms 90% cached-input discounts and 50% batch discounts.
- **Quality (soft):** Large 4 is not on EQ-Bench yet. Small 4 scores 43.2 on Longform, weak beyond the early chapters. Older Mistral Medium 3.1 scores 1476 Elo.

### DeepSeek: first-party prohibited, open weights fine

- The [DeepSeek Terms of Use](https://cdn.deepseek.com/policies/en-US/deepseek-terms-of-use.html) (last update 2026-03-27), §3.4: "You will not use the Services to generate, express or promote content or a chatbot that: … (5) is pornographic, obscene, or sexually explicit (e.g., sexual chatbots)". Do not use api.deepseek.com.
- The weights (DeepSeek-V4-Flash, V4-Pro, V4.1-Flash and others) are **MIT**-licensed according to their [Hugging Face model cards](https://huggingface.co/deepseek-ai). That licence has no use restrictions.
- On OpenRouter, the V4 Flash and V4 Pro endpoints are served by third parties (DeepInfra, GMICloud, Parasail, Fireworks, Novita and others). DeepSeek's own API was not among the listed providers on 2026-11-03.
- **Price/context:** both have a 1,048,576 context. V4 Flash on DeepInfra is $0.09 / $0.18 (cache $0.018). V4 Pro on DeepInfra is $1.30 / $2.60, or $0.957 / $1.914 on GMICloud.
- **Quality (soft):** V4 Pro scores 75.6 on Longform, about the level of Kimi K2.6 / GLM-5.2, with low degradation across 8 chapters. Its CW v3 Elo is 1553. V4 Flash scores 66.0 on Longform and 1559 Elo, which is very strong for its price.

### Z.ai (GLM): first-party prohibited, open weights fine

- The [Z.ai Terms of Use](https://docs.z.ai/legal-agreement/terms-of-use) prohibit "(f) Creating or disseminating obscene, pornographic … content" and "(g) Submitting, creating or disseminating content that is sexually explicit, suggestive…".
- The [GLM-5.3 licence](https://huggingface.co/zai-org/GLM-5.3/raw/main/LICENSE) grants rights "without restriction". Its only conduct condition is "The Licensee's use of the Software must comply with applicable laws and regulations". The security-review clause applies only to Model-as-a-Service businesses with more than $10B revenue. GLM-5.3-Flash and GLM-5.2 are plain MIT.
- **Price/context:** 1,048,576 context. DeepInfra charges $0.563 / $2.50 (cache $0.125). Exclude the `Z.AI` provider on OpenRouter.
- **Quality (soft):** GLM-5.3 scores 2076 Elo on CW v3, #7 overall, ahead of Grok 4.7. GLM-5.2 scores 77.9 on Longform. It is a reasoning model, so keep thinking off or low to control output cost.

### Moonshot (Kimi K3): ambiguous first-party, open weights fine

- The [Kimi Open Platform terms](https://platform.kimi.ai/docs/agreement/modeluse.md) (last updated 2026-07-30) don't name sexual content. They prohibit only "sexualize children" and vague grounds: "harmful impact on physical or spiritual health or that violate ethical principles" and "any other uses prohibited or restricted by applicable laws". That is too vague to rely on.
- The [Kimi K3 licence](https://huggingface.co/moonshotai/Kimi-K3/raw/main/LICENSE) is MIT-style. Its only content condition is to comply with applicable laws. Its attribution and agreement clauses apply only above $20M revenue or 100M MAU, and internal use is exempt.
- **Price:** this is the problem. Output tokens cost $9–22/M depending on host (DeepInfra $2.85 / $14.25). It is by far the best creative writer here (2083 Elo; K3.1-Pro 2173, #2 overall) and by far the most expensive.

### OpenRouter (aggregator): pass-through, pin the provider

- The [Terms](https://openrouter.ai/terms) (last updated 2026-08-31) contain no adult-content ban of their own. Prohibited conduct includes posting content "that is unlawful, or is not in compliance with the Terms of Service for the Model or Provider you are using". By §5.1, using a model means agreeing "to comply with the applicable terms for each Model". OpenRouter screens inputs for "known child sexual abuse material (CSAM)".
- **Consequence:** with default routing, a request can land on a provider whose terms ban adult content (Together, possibly Azure/Bedrock/Vertex, or the labs' own APIs). Use `provider.only` / `order` with `allow_fallbacks: false` ([provider selection docs](https://openrouter.ai/docs/guides/routing/provider-selection)) to restrict routing to verified hosts. ZDR-only routing is also available.
- Streaming is SSE with `stream: true`. Mid-stream errors arrive as SSE events, and aborting the connection cancels billing on supported providers ([streaming docs](https://openrouter.ai/docs/api/reference/streaming)).
- Fee: 5.5% on credit purchases (Standard plan). Inference is billed at the provider's list price ([pricing](https://openrouter.ai/pricing)).

### DeepInfra (open-weight host): permitted

- The [Terms](https://deepinfra.com/terms), §11 "Restrictions on Use", restrict competitive use, reverse engineering, security abuse, malware, "any illegal, fraudulent, or deceptive purpose", reselling and high-risk uses (nuclear, aviation and so on). They contain no adult-content clause.
- It serves DeepSeek V4/V4.1, GLM-5.3, Kimi K3 and others with long context and prompt-cache pricing. It is usable directly (OpenAI-compatible API) or as a pinned OpenRouter provider.

### Together AI: prohibited

- The [Terms of Service](https://www.together.ai/terms-of-service) (updated 2026-05-19), §4: "You are strictly prohibited from using the Services to communicate any message or material that (i) is libelous, harmful to minors, obscene, or constitutes pornography". Exclude it (`provider.ignore: ["together"]`).

### Fireworks AI: not verified

- The terms URL redirects to a PDF ("Terms of Service (7.10.26)") whose text could not be extracted. **Treat as unknown** and leave it out of any provider allowlist until it has been read manually.

### Featherless (flat-rate open-model host): permitted, with limits

- The [Terms](https://featherless.ai/terms) prohibit illegal use and violating "policies of third-party providers that power the models". They contain no adult-content clause.
- [Pricing](https://featherless.ai/pricing): the **Chat** plan is $25/month, "Unlimited tokens, 32K context, 4 concurrent units, Any model in the catalogue". The **Developer** plan is from $50/month, per-token, up to 256K context.
- **Catch:** "The chat plan is limited to human typed interactive chat use only … Not for reselling, app/API traffic, background automation". It is advertised to work with SillyTavern, so a personal front-end is the intended use. However, Storytell's background calls (Memory extraction, Bond/Arc updates) might count as "background automation". The 32K context is also tight for a multi-Character Story with Memory.

### Venice.ai: contradictory terms, don't rely on them

- The [Terms](https://venice.ai/legal/tos) (2026-06-08) refer to a "mature content filter" that only under-18s must not disable, which implies adults may. Yet §10.9 makes the user warrant that "User Content" (defined as Input plus Output) is not "objectionable, profane, indecent, pornographic". Because the policy contradicts itself, it was not shortlisted, even though Venice is also an OpenRouter provider.

### NovelAI: permitted, niche

- The [Terms](https://novelai.net/terms) (effective 2025-12-08) require users to be "18 years or older" and contain no content prohibitions. Misconduct is limited to licence and abuse items, but §9.1.4 forbids access "in any unauthorized or unsupported manner".
- [Opus](https://docs.novelai.net/en/subscription/) costs $25/month for a 28,672-token context and the Xialong model (a GLM-4.6 fine-tune). It is tuned for story completion rather than chat, the context is small, and whether a third-party app may use the API is not clearly documented. Low priority.

### Roleplay fine-tunes (Cydonia, Hermes and others)

- **TheDrummer Cydonia 24B v4.1** is described on OpenRouter as an "Uncensored and creative writing model based on Mistral Small 3.2 24B". It is $0.30 / $0.50 with 131k context on Parasail; Parasail's terms were not reviewed.
- **Nous Hermes 4 405B** (Llama-based, so Meta's licence applies) is $1.00 / $3.00 with 131k context. It scores 51.2 on Longform.
- **MiniMax M2-her** is a "dialogue-first … immersive roleplay" model, but it has only 65k context, a 2,048-token output cap and a weak 34.8 Longform score. MiniMax's terms were not reviewed.
- These models are more *willing* than the large general models, but per the benchmarks they lag far behind on long-story coherence.

## Quality evidence (soft)

- **EQ-Bench Creative Writing v3** ([eqbench.com/creative_writing.html](https://eqbench.com/creative_writing.html)) and **Longform** ([creative_writing_longform.html](https://eqbench.com/creative_writing_longform.html)) are the most systematic public creative-writing leaderboards.
  - Both are judged by an LLM ("Outputs are evaluated with a scoring rubric by Claude Sonnet 4.6").
  - Longform runs an 8-chapter story and its rubric includes "Maintaining character integrity across chapters". It is the closest proxy found for long Chats and for keeping Characters in character (drift).
  - Neither benchmark tests multi-turn interactive roleplay, several characters sharing a scene, or explicit content. All the prompts are SFW.
- **No reputable benchmark of multi-character roleplay was found.** OpenRouter publishes usage rankings by domain, but those measure popularity, not quality, and the roleplay breakdown was not retrievable.
- **Reading the numbers:**
  - Among the policy-permitted models, Kimi K3 and GLM-5.3 lead CW v3 (≈2080 Elo), then Grok 4.7 (2012), then DeepSeek V4 (≈1555).
  - On Longform, DeepSeek V4 Pro (75.6) is close to the best open models (Kimi K2.6 78.5, GLM-5.2 77.9).
  - Mistral and the small fine-tunes trail, and degrade faster over long stories.
- **Unknown until tested:** whether each model actually *complies* with explicit requests under a permissive system prompt. Policy permission is not model willingness. Post-training refusals vary, and the xAI AUP forbids jailbreaking to get around them.

## Cost estimate

Assumptions:
- One Narrator call per turn.
- Input = system prompt + Story/Setting/Characters + Memory + Chat history.
- Output is 500 tokens with reasoning off. Reasoning tokens bill as output and can multiply output cost by 2–10×.
- No extra background calls. Memory/Bond extraction calls would add perhaps 10–30%.
- Prompt caching works best when the prefix is stable (Story, then Characters, then history appended). Editing Memory or earlier messages invalidates the cache from that point on.

| Scenario | Tokens/month | DS V4 Flash | Mistral Small 4 | GLM-5.3 | Mistral Large 4 | DS V4 Pro (DeepInfra) | Grok 4.3 | Grok 4.7 | Kimi K3 |
|---|---|---|---|---|---|---|---|---|---|
| A moderate: 60 turns/day, 16k ctx | 28.8M in / 0.9M out | $1–3 | $2–5 | $8–18 | $8–22 | $12–40 | $14–38 | $28–63 | $36–95 |
| B heavy: 150 turns/day, 32k ctx | 144M in / 2.25M out | $5–13 | $7–23 | $36–87 | $33–106 | $55–193 | $65–186 | $129–302 | $147–442 |

The lower figure in each range assumes 80% cached input; the higher assumes no caching. Add 5.5% if paying through OpenRouter credits. DeepSeek V4 Pro on GMICloud comes to about $9 (A) and $41 (B) with caching. Flat-rate options cost $25/month regardless (Featherless Chat at 32K context, NovelAI Opus at 28K).

What this means for the $10–30 budget:
- At heavy use, only DeepSeek V4 Flash and Mistral Small 4 fit comfortably. Mistral Large 4 and GLM-5.3 fit only with caching and some restraint. DeepSeek V4 Pro fits at moderate use.
- Grok and Kimi are over budget at heavy use.
- Context length is the biggest cost lever. Capping the history window (rolling summary into Memory) at about 16k tokens roughly halves every figure.

## Shortlist (for the decision ticket)

1. **DeepSeek V4 Pro + V4 Flash via OpenRouter, pinned to DeepInfra/GMICloud.**
   - *For:* MIT weights. Both 1M context. Strong long-story coherence (Pro 75.6 Longform). Flash is extremely cheap and could serve background calls or be the default, with Pro as an upgrade.
   - *Against:* DeepSeek's own API is banned for this use, so provider pinning is mandatory. CW v3 prose scores sit mid-pack. Willingness is untested.
2. **GLM-5.3 via a pinned third-party host (DeepInfra).**
   - *For:* best CW v3 score among affordable permitted models (2076). 1M context. Permissive licence.
   - *Against:* about $36/month at heavy use even with caching. The reasoning model needs thinking kept low. Z.ai's own API is banned for this use.
3. **Mistral Large 4 / Small 4, first-party.**
   - *For:* the cleanest legal position. A first-party policy permits it, there are no routing games, and guardrails are opt-in. Large 4 has a 1M context and fits the budget with caching. Small 4 has Apache-2.0 weights as an exit route.
   - *Against:* weaker on creative-writing benchmarks. Large 4 is not yet benchmarked, and Small 4 degrades over long stories.

**Fallback:** Grok 4.3/4.7 (first-party, policy-permitted, good prose) if quality outweighs budget, or a $25 flat Featherless Chat plan if usage proves very heavy and 32K context is acceptable.

**Follow-ups this research does not settle:**
- A refusal/willingness prototype on 2–3 shortlisted models.
- Manual reading of the Fireworks, Parasail and MiniMax terms if any of them is wanted in the provider allowlist.
- Re-checking the OpenAI Model Spec for a "grown-up mode".

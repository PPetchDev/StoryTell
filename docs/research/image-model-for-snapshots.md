# Research: Image models for Snapshots

Ticket: `.scratch/storytell-mvp/issues/03-image-model-for-snapshots.md`
Researched: 2026-11-03. All sources were accessed on that date. Prices and policies change often, so re-check them before building.

## Question

Which image-generation providers allow mature content for adult users under their own published policies? What does each one cost per image, and what are its API and latency like? And how do we keep a Character looking the same across Snapshots when the only description of them is text, since Characters have no avatar image?

## Summary

- **Three hosted APIs plainly allow lawful adult imagery and have a switch to turn it on.** These are **Venice.ai**, **Runware** and **Replicate**.
  - **Venice.ai** is the most explicit. Its docs say "Unblurred adult (NSFW) images are available to every API user" and offer `safe_mode: false`. It hosts NSFW-tuned checkpoints (Lustify, WAI-Illustrious) at **$0.01/image**, plus uncensored multi-reference edit models at about $0.04–0.06.
  - **Runware** requires users to be 18+. Its terms ban only content involving minors and real people's likeness, and its safety check is opt-in. It bills by compute and adds identity tools (IP-Adapter, PuLID, ACE++, LoRA).
  - **Replicate** bans "illegal pornographic content" and non-consensual nudity, which by implication leaves lawful adult content allowed. Its docs say the safety checker can be turned off through the API.
- **xAI (Grok Imagine) is permissive on paper but uncertain in practice.** Its AUP bans pornographic depiction of *real* persons and minors, but does not ban adult fiction. Its text API even offers an opt-in `nsfw: decline` control, which implies the default allows it. Image output still passes "content policy review" (a `respect_moderation` flag), and how much explicit fictional content gets through isn't documented. Price is **$0.02/image**, or $0.04 for 2.0.
- **Black Forest Labs (FLUX) has no general adult-content ban.** Its usage policy prohibits only sexual content of real people and minors. However, every endpoint runs output moderation (`safety_tolerance` 0–5, max 5), and BFL doesn't say whether nudity passes at 5.
- **fal.ai is gated.** Its AUP lists "sexually explicit content" among prohibited items, and turning off its safety checker "requires account authorization".
- **Ruled out by their own policies:** OpenAI (explicit content off by default on the API), Google Gemini/Imagen, and Stability AI's hosted API.
- **Text-only consistency is the hard part.** A fixed seed with a fixed prompt only reproduces *the same image*, and the identity drifts as soon as the scene text changes. Every robust technique needs an image of the Character at some point. Options are a reference image generated once and reused through a multi-reference edit model or IP-Adapter/PuLID, or a per-Character LoRA trained on generated images (as in "The Chosen One"). **That conflicts with the map's "Character avatar images: out of scope".** The difference between a hidden internal reference and a user-visible avatar needs a domain decision. This document does not make it; see the open questions.
- **The budget is comfortable at the cheap end.** $10–30/month (shared with the text model) buys roughly 500–2,000+ Snapshots at $0.01–0.02 each, or about 200–600 at $0.04–0.06 with reference-based editing.

## Comparison table

"Adult stance" means what the provider's **own published policy** says about lawful sexual content involving fictional adults. It does not mean what the model can technically produce.

| Provider / model(s) | Adult stance (own policy) | Price per image | API shape | Latency (published) | Consistency features |
|---|---|---|---|---|---|
| **Venice.ai**: Lustify SDXL/v7/v8, WAI-Illustrious, Chroma, Seedream v4/v5, Qwen Image 3 (all flagged `uncensored: true`) | **Allowed via API.** Docs: "Unblurred adult (NSFW) images are available to every API user"; set `safe_mode: false` (default `true`, which blurs). *Conflict:* ToS §10.9(c) has a broad warranty that User Content is not "pornographic" ([ToS](https://venice.ai/legal/tos), updated 2026-06-08) | Lustify / WAI / Chroma / Z-Image **$0.01**; Grok Imagine $0.03; Seedream V4.5 $0.05; Flux 2 Pro $0.03. Edits: `qwen-edit-uncensored` $0.04, Seedream V5 Pro Edit $0.06 + $0.00345 per extra ref ([pricing](https://docs.venice.ai/overview/pricing)) | REST, **synchronous**. `POST /image/generate` returns base64 JSON or binary; `POST /image/edit` and `/image/multi-edit` (up to 3 refs by default) ([guide](https://docs.venice.ai/guides/media/image-generation), [edit guide](https://docs.venice.ai/guides/media/image-editing)) | No figures; the response includes `timing.total` ms | `seed` ("Reuse the same seed for more consistent iterations"); multi-reference edit; `style_references` only on Krea v2 / Luma Uni-1. **No LoRA upload** |
| **xAI Grok Imagine**: `grok-imagine-image`, `grok-imagine-image-2.0` | **Not banned for fictional adults.** The AUP bans "Depicting likenesses of persons in a pornographic manner" and "Undressing or nudifying real persons" under the *privacy / right of publicity* heading, plus "Sexualizing or exploiting children" ([AUP](https://x.ai/legal/acceptable-use-policy), effective 2026-08-14). Output is "subject to content policy review" ([docs](https://docs.x.ai/docs/guides/image-generations)). The text API's opt-in `nsfw: decline` ([moderation controls](https://docs.x.ai/developers/advanced-api-usage/custom-moderation-controls.md)) implies NSFW is allowed by default, at least for text | **$0.02** (`grok-imagine-image`), **$0.04** (2.0) ([models](https://docs.x.ai/docs/models)) | OpenAI-compatible `POST /v1/images/generations` and `/v1/images/edits` (multi-reference **up to 5** images, referenced as `<IMAGE_0>`…); optional `deferred` + polling/webhooks ([images API](https://docs.x.ai/developers/rest-api-reference/inference/images.md)) | Not published | Multi-reference edit (5). **No `seed` documented**, no LoRA |
| **Runware**: any Civitai SDXL/Pony/Illustrious/FLUX checkpoint (by AIR id), FLUX Kontext dev, Seedream 4 | **Allowed (adults only).** ToS: "All users must be at least 18 years of age". Bans "sexually explicit material involving minors" and replicating "the identity, likeness … of a living person without their consent". No general adult ban ([ToS](https://runware.ai/terms), updated 2026-09-29). Safety check is **opt-in**: `safety.checkContent` "Enable or disable content safety checking" ([SDXL schema](https://runware.ai/docs/models/sdxl/schema.json)) | Compute-billed for community models (no public rate; `includeCost: true` returns the USD cost). Seedream 4.0 **$0.03**. Example from Runware's own pricing doc: Z-Image 1024² 20 steps $0.0045 ([pricing doc](https://runware.ai/docs/models-api/pricing)) | REST/WebSocket task API; SDKs; also a Vercel AI SDK provider | Measured examples: Z-Image 1024² ≈ 17 s; Seedream 4 examples 16–140 s (multi-ref / high-res) ([examples](https://runware.ai/docs/models/bytedance-seedream-4-0/examples.json)) | `seed`, **LoRA**, **IP-Adapters** ([doc](https://runware.ai/docs/learn/ip-adapters)), **PuLID** (FLUX), **ACE++** portrait mode, PhotoMaker v2, Kontext `referenceImages` |
| **Replicate**: FLUX dev/schnell/1.1 pro + community models | **Lawful adult allowed by implication.** ToS §2.7(d)(v) prohibits use "to create non-consensual nudity or illegal pornographic content" ([terms](https://replicate.com/terms), updated 2026-04-01). The safety checker is on for web predictions; "you can disable the safety checker when running the model with the API" ([docs](https://replicate.com/docs/topics/predictions/safety-checking)) | flux-dev $0.025, flux-schnell $0.003, flux-1.1-pro $0.04; community models per GPU-second (L40S $0.000975/s) ([pricing](https://replicate.com/pricing)) | REST predictions (sync-wait or async + webhooks) | Not published per model | `seed`; **LoRA training ~$1.5–2 per run** (≈2 min on 8×H100 at $0.0122/s, ~20 images) ([fine-tune docs](https://replicate.com/docs/get-started/fine-tune-with-flux)); community LoRA/IP-Adapter models |
| **Black Forest Labs API**: FLUX.2 pro/flex/max/klein, FLUX.1 Kontext | **No general adult ban.** Prohibits content that would "realistically depict a real person in a sexual, intimate, degrading" manner without consent, and "any content depicting minors in any sexual … manner" ([usage policy](https://bfl.ai/legal/usage-policy), revised 2026-08-04). **But** every endpoint has output moderation: `safety_tolerance` 0 = "Most strict", 5 = "Least strict", default 2. Moderated results are not charged ([help](https://help.bfl.ai/articles/4212278032-my-prompt-is-getting-moderated)). Whether nudity passes at 5 is not documented | 1 credit = $0.01; Kontext pro 4 credits / max 8 credits per a mirrored BFL table ([EU docs](https://docs.eu.bfl.ai/quick_start/pricing)); FLUX.2 priced per megapixel (numbers not rendered on [docs.bfl.ai](https://docs.bfl.ai/quick_start/pricing)); Flux 2 Pro is $0.03 resold via Venice | Async: submit, then poll | Not published | Multi-reference: FLUX.2 [pro]/[flex]/[max] up to 8 via API, [klein] up to 4 ([overview](https://docs.bfl.ai/flux_2/flux2_overview)); Kontext iterative editing |
| **fal.ai** | **Gated / ambiguous.** The AUP lists "violent, or sexually explicit content" among prohibited items ([AUP](https://fal.ai/legal/acceptable-use-policy)), yet the Trust & Safety page says fal "has formally adopted a comprehensive NSFW content policy" without publishing it ([T&S](https://fal.ai/legal/trust-and-safety)). `enable_safety_checker` defaults to true: "Disabling it requires account authorization" ([flux-lora API](https://fal.ai/models/fal-ai/flux-lora/api)) | (not gathered; out of the running) | Queue REST | — | seed, LoRA |
| **OpenAI** (gpt-image) | **Excluded.** By default OpenAI "does not allow the generation of explicit sexual content" (via [ConductAtlas excerpt](https://conductatlas.com/platform/openai/openai-usage-policies/restrictions-on-sexual-and-adult-content/); openai.com returned 403). Image API `moderation: low` is only "Less restrictive filtering" ([guide](https://developers.openai.com/api/docs/guides/image-generation)) | — | — | "Complex prompts may take up to 2 minutes" | Edits with reference images |
| **Google** (Gemini / Imagen) | **Excluded.** The Prohibited Use Policy bans "Sexually explicit content -- for example, content created for the purpose of pornography or sexual gratification" (exceptions only for educational, documentary, scientific or artistic use) ([policy](https://policies.google.com/terms/generative-ai/use-policy)) | — | — | — | — |
| **Stability AI** | **Excluded.** The AUP heading reads "We Prohibit Sexually Explicit Content", including "content relating to sexual intercourse, sexual acts". It claims to cover "self-hosting Stability AI code or weights" ([AUP](https://stability.ai/use-policy), effective 2026-09-30) | — | — | — | — |
| **Self-hosted** SDXL derivatives on serverless GPU (e.g. RunPod) | Model-license-dependent. The SDXL base licence (CreativeML Open RAIL++-M) Attachment A bans harming minors, defamation and similar uses, but **has no adult-content clause and does not reference Stability's AUP** ([license](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md)) | GPU time only: 24 GB serverless $0.75/h ≈ $0.00021/s ([RunPod](https://www.runpod.io/pricing)) | Your own worker (ComfyUI/diffusers) | Cold starts (not quantified here) | Everything open: seed, LoRA, IP-Adapter, InstantID/PuLID |

Not researched to a conclusion: Together AI (its AUP URL returned 404 and no primary text was found) and NovelAI. NovelAI's ToS (effective 2025-12-08) says "you may not use of botnets or automated systems in the Services" unless allowed, so a backend integration is risky ([terms](https://novelai.net/terms)).

### Policy caveats worth flagging

1. **Venice: docs vs. ToS.** The API docs explicitly offer unblurred adult output to every API user. ToS §10.9(c), though, warrants that User Content is not "objectionable, profane, indecent, pornographic". That clause sits under a heading about rights to submitted content and isn't limited to public content. The docs are the more specific and more recent operational statement, but the conflict is real.
2. **SDXL-based NSFW checkpoints and Stability's AUP.** Stability's AUP claims to cover self-hosted weights "under the applicable license terms". The SDXL licence itself doesn't incorporate that AUP. This matters for Lustify / Illustrious / Pony (all SDXL derivatives), whether hosted by Venice or Runware or self-hosted. This is a licensing ambiguity, not legal advice.
3. **xAI: enforcement climate.** xAI is under regulatory scrutiny over sexualized images of real people (for example California AG investigation, Jan 2026, per [Euronews](https://euronews.com/next/2026/01/21/elon-musks-grok-still-being-used-to-generate-explicit-images-despite-new-safeguards-study-)). Output moderation may tighten without notice.
4. **Hard lines common to every provider:** no minors, and no sexual depiction of real, identifiable people. Story authoring should make sure Characters are fictional adults.

## Consistency techniques (text-only Characters)

Ordered from cheapest to strongest.

1. **Canonical appearance string and fixed seed.** Store a short, fixed "visual tag" per Character (hair, eyes, build, distinguishing marks, outfit), injected verbatim into every Snapshot prompt in the same order. Add a fixed seed per Character where supported.
   - fal's docs: "The same seed and the same prompt given to the same version of the model will output the same image every time" ([fal](https://fal.ai/models/fal-ai/flux-lora/api)). The flip side is that once the scene text changes, the seed no longer pins identity. It only stabilises composition (Venice: reuse `seed` to compare prompt changes "without the composition changing").
   - Anime/Illustrious-style checkpoints respond better to tag-style descriptors than photoreal models do.
   - Cost: zero. Strength: weak to moderate.
   - xAI documents no seed.
2. **Generate a reference once, then reuse it with a multi-reference edit model.** Generate a "character sheet" (neutral pose, full body) from the text description once, let the user pick a candidate, store it, and pass it as a reference image on every Snapshot ("subject from image 1, scene from the prompt").
   - **FLUX.1 Kontext:** the paper reports "improved preservation of objects and characters, leading to greater robustness in iterative workflows" ([arXiv 2506.15742](https://arxiv.org/abs/2506.15742)).
   - **FLUX.2:** up to 8 references via the API. BFL's prompting guide advises naming each reference's role ([guide](https://docs.bfl.ai/guides/prompting_guide_flux2)).
   - **xAI** images edit takes up to 5 references. **Venice** `/image/multi-edit` works with uncensored Seedream / Qwen edit models.
   - Multi-Character Snapshots become a multi-reference request: one image per Character present.
   - Cost: one extra generation per Character, plus about $0.04–0.06 per Snapshot.
   - **This needs a stored Character image, which runs into the map's "no avatar" scope line.**
3. **IP-Adapter / face-ID adapters on open models.** IP-Adapter injects image-prompt features through decoupled cross-attention, using an adapter of "about 22M" parameters ([arXiv 2308.06721](https://arxiv.org/abs/2308.06721)).
   - Face-identity variants: InstantID ([arXiv 2401.07519](https://arxiv.org/abs/2401.07519)), PhotoMaker ([arXiv 2312.04461](https://arxiv.org/abs/2312.04461)), PuLID ([arXiv 2404.16022](https://arxiv.org/abs/2404.16022)).
   - Runware exposes `ipAdapters`, `puLID` (`idWeight` 0–3) and ACE++ `portrait` mode. Its weight guidance: 0.5–0.7 balanced; 1.0+ "can overpower the prompt" ([Runware IP-Adapters](https://runware.ai/docs/learn/ip-adapters)).
   - Also needs the stored reference from technique 2.
4. **Per-Character LoRA (DreamBooth-style fine-tune).** LoRA ([arXiv 2106.09685](https://arxiv.org/abs/2106.09685)) and DreamBooth ([arXiv 2208.12242](https://arxiv.org/abs/2208.12242)) bind an identity to a token.
   - For a text-only Character, the training set has to be generated first. "The Chosen One" ([arXiv 2311.10093](https://arxiv.org/abs/2311.10093)) automates this from a text prompt alone. It generates many images, clusters them by identity, and refines the identity over repeated rounds.
   - Replicate trains a FLUX LoRA for about $1.5–2 (about 20 images, about 2 min). Runware and Replicate can then run inference with that LoRA. Venice cannot load custom LoRAs.
   - Strength: highest, and it works with any scene prompt. Cost: setup per Character, and a Character that changes appearance (for example through an Arc) means retraining.
5. **Training-free batch consistency (ConsiStory, StoryDiffusion).** These share attention or activations between images generated *together*: ConsiStory is "without requiring a single optimization step" ([arXiv 2402.03286](https://arxiv.org/abs/2402.03286)); StoryDiffusion ([arXiv 2405.01434](https://arxiv.org/abs/2405.01434)).
   - They don't fit on-demand, one-at-a-time Snapshots taken across separate requests unless self-hosted with cached features. Not offered by the hosted APIs above. Mentioned for completeness.

**Practical reading:** without any stored image, only technique 1 is available, and it gives "same type of person" rather than "same person". Techniques 2–4 all need a reference image that the app keeps per Character, whether or not the user ever sees it.

## Shortlist (no decision)

### A. Venice.ai: Lustify / WAI-Illustrious for text-only, Seedream/Qwen uncensored edit for reference-based

- **For:**
  - The clearest operational adult permission (`safe_mode: false`, documented for every API user).
  - Cheapest per image ($0.01).
  - One vendor that can also serve the text model: the same API key and billing, which matters for the shared $10–30 budget.
  - Synchronous responses keep the NestJS side simple.
  - Uncensored multi-reference edit gives a path to technique 2.
  - "Private" models are claimed not to store prompts.
- **Against:**
  - The ToS §10.9(c) "pornographic" warranty conflicts with the docs.
  - No custom LoRA, and no IP-Adapter/PuLID controls, so consistency stops at seed+tag or multi-edit.
  - The SDXL-derivative/Stability-AUP ambiguity.
  - "Anonymized" models (Seedream, Qwen) go to third parties that may store content.
  - No published latency.

### B. Runware: Civitai SDXL/Illustrious/Pony or FLUX checkpoints with LoRA + IP-Adapter/PuLID

- **For:**
  - The ToS requires 18+ and has no general adult ban.
  - The safety check is opt-in.
  - The widest consistency toolbox on a hosted API: seed, LoRA, IP-Adapter, PuLID, ACE++, Kontext references. That covers every technique from 1 to 4.
  - Compute-billed community models are likely around a cent or less per image, and failed requests are free.
- **Against:**
  - No public per-image price for community models. Measure it with `includeCost`.
  - More integration surface (task API, model AIR ids, adapter tuning).
  - Separate vendor from the text model.
  - Same SDXL licensing ambiguity for SDXL-based checkpoints.

### C. xAI Grok Imagine: `grok-imagine-image` with multi-reference edits

- **For:**
  - $0.02/image.
  - OpenAI-compatible endpoints.
  - Multi-reference edits (5 images) for technique 2.
  - Strong prompt following for scene composition.
  - A single vendor if Grok is also picked as the text model.
- **Against:**
  - Output moderation of explicit fictional content is undocumented, and outputs come back with a `respect_moderation` flag, so some Snapshots may be filtered with no recourse.
  - No seed, no LoRA.
  - The regulatory climate makes policy drift likely.

*Also viable, not shortlisted:*

- **Replicate:** lawful adult content allowed, LoRA training for about $2, but per-second billing on community models is less predictable.
- **BFL direct:** permissive policy text, but nudity at `safety_tolerance: 5` is unverified.
- **Self-hosting** on serverless GPU: maximum control, but cold starts and ops work for a single-user app.

## Open questions for the map

- **Hidden reference image vs. "Character avatar images: out of scope".** Every technique stronger than seed+tag needs a stored per-Character image, so one of these has to change:
  - allow a non-displayed reference image (the domain glossary would need a term for it, distinct from an avatar); or
  - accept looser "same type of person" consistency.
- Whether a Character's look can change over a Chat (an Arc that alters appearance), which affects LoRA vs. reference-image choices.
- A hands-on check (out of scope here: no images were generated) of whether xAI and BFL at `safety_tolerance: 5` actually return explicit fictional-adult images. Do it only once a provider is picked and the user signs up.

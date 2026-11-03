# Image models for Snapshots

Type: research
Status: resolved
Blocked by: none
Part of: [Map: Storytell AI MVP](../map.md)

## Question

Which image-generation models/providers permit mature content for adult users under their own published policies, what do they cost per image, what are their APIs/latency, and what techniques keep a Character visually consistent across Snapshots when the only description of them is text (no avatar image)?

## Answer

Findings: branch `research/image-model-for-snapshots`, file `docs/research/image-model-for-snapshots.md` (commit f6a7482).

- Providers whose own policy clearly allows adult images for adult users: Venice.ai (docs: NSFW available to every API user via `safe_mode: false`; ~$0.01/image on Lustify/Illustrious), Runware (18+ users; bans minors and real people; safety checker opt-in), Replicate (bans illegal pornographic and non-consensual content; checker can be disabled via API).
- Uncertain: xAI Grok Imagine ($0.02; AUP bans only real people and minors, but outputs pass an undocumented filter), BFL/FLUX (no general ban, but output moderation on every endpoint, `safety_tolerance` max 5, unclear whether nudity passes), fal.ai (disabling the checker needs approval). Ruled out: OpenAI, Google, Stability.
- Policy conflicts to watch: Venice ToS §10.9(c) warrants content is not "pornographic", contradicting its own docs; Stability's AUP claims to cover SDXL-derived models (e.g. Lustify, Illustrious) even self-hosted, while the SDXL licence doesn't reference it.
- Character consistency: same seed + same text description gives "the same type of person", not the same person. Every technique that really works needs a stored reference image per Character — multi-reference edit models (Kontext, FLUX.2, Grok, Venice multi-edit), IP-Adapter / PuLID, or a per-Character LoRA trained on generated images ("The Chosen One" approach; ~$2/Character on Replicate).
- Shortlist (no decision): Venice (cheapest, could share a provider with the text model, no LoRA), Runware (best consistency tooling, no published per-image price for community models), xAI ($0.02, 5 reference images, no seed, opaque filtering). Budget of $10–30/month ≈ 500–2,000 Snapshots at $0.01–0.02.
- Open for "Choose the image model and how a Snapshot behaves": is a hidden, never-shown reference image per Character acceptable given user-visible avatars are out of scope? If not, accept loose consistency.
- Caveats: OpenAI policy page returned 403 (cited via a ConductAtlas copy); Together AI original not found; NovelAI not checked conclusively. No images were generated, so whether xAI / BFL at tolerance 5 actually return explicit images needs testing after choosing.

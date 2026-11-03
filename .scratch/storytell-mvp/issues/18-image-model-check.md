# Check the image model before building Snapshots

Type: task
Status: resolved
Blocked by: 17
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to do

Spend under $1 to confirm that the default image model works for this app, before any Snapshot code is built.

- Generate a handful of images with Seedream 4 on Runware: a fictional adult Character's Reference image (full-body, neutral pose, plain background), then 3–4 scenes using it as a reference, including explicit ones.
- A throwaway script is fine. The agent may write it, but the user runs it and judges the images.

## How to run it

The script is ready in `prototypes/image-check/`; its README has the details.

The script now runs on Venice; see Comments for why Runware was dropped.

1. Put `VENICE_API_KEY=...` in `prototypes/image-check/.env` (gitignored).
2. Optionally edit the models, the Character or the scenes in `check.json`.
3. From the repo root, run `node prototypes/image-check/check.mjs --dry-run` to see the exact requests. This spends nothing.
4. Then run `node prototypes/image-check/check.mjs`. It makes 1 Reference image (`qwen-image-3`) and 4 scenes (`qwen-edit-uncensored` multi-edit), about $0.20 in all.
5. Open the printed `out/<run>/index.html` to compare faces. Blurred, flagged or blocked images are marked there and fail the run.

Rerun with `--ref <file>` to keep the same reference image, or add `--edit-model seedream-v4-edit` to compare Seedream.

## Acceptance criteria

- [x] Venice returns explicit fictional-adult images that are not blocked, blurred or flagged.
- [x] The Character's face and build hold across the scenes from one Reference image.
- [x] Cost per image is recorded (expected ~$0.04).
- [x] The verdict is appended under `## Comments`. If it fails, rerun the same check on Venice (Seedream V5 Pro Edit or `qwen-edit-uncensored`) and record which becomes the default image model.

## User stories covered

38, 42, 109–113 (they depend on this verdict).

## Comments

- 2026-11-03: Runware was dropped before the check ran:
  - **The key worked.** The first real run got `thirdPartyInsufficientCredits`: third-party models like Seedream need paid credit.
  - **Runware's minimum top-up is $20** (https://help.runware.ai/articles/7648578038-payments-and-credits). That is well over the $8/month image budget, so the user chose to run the check on Venice instead.
  - **Venice, per its docs** (as read 2026-11-03):
    - prepaid credit that doesn't expire, and a 402 when the balance runs out, so it works as a hard cap
    - `qwen-edit-uncensored` at $0.04 and Seedream edit at $0.05 per image
    - `POST /image/multi-edit` takes up to 3 reference images, and `safe_mode: false` turns off the adult blur
    - not confirmed: the minimum card top-up. Venice's ToS section 10.9(c) is ambiguous about pornographic content.
  - **Rejected:**
    - OpenRouter image models: they are served first-party by ByteDance or Alibaba, whose adult terms are unclear.
    - fal.ai: its acceptable-use policy bans sexually explicit content.
    - Replicate: it has no hard spend cap any more.
- 2026-11-03: **First Venice run** (`qwen-image-3` for the reference, then `qwen-edit-uncensored` multi-edit, `safe_mode: false`):
  - **Blocking:** all 5 images came back; none was blurred, flagged or blocked. That includes the nude and explicit scenes, so the API side of adult content works.
  - **Time:** about 6 s for the reference and about 34 s per scene. The 4 scenes ran in parallel.
  - **Cost:** about $0.20 at list price ($0.04 per image). Exact spend couldn't be read (see below).
  - **Face consistency,** checked by the agent on the three non-nude images (reference, tavern, close-up): the same person in each. Same black tied-back hair, grey-green eyes, the eyebrow scar in the same place, and a similar face shape and build, even in dark and candlelit scenes.
  - **Small issues:**
    - The scar is drawn as a fresh red cut. Reword it to "faint old scar".
    - The close-up kept the reference image's tank top. An edit model carries clothing over from the base image, so the Snapshot prompt writer should name clothing explicitly.
    - The tavern window shows snow instead of rain.
  - **Still to do:** the user judges the intimate and explicit images (face match and whether they're explicit enough) and records the verdict here.
  - **Balance:** `GET /billing/balance` returns `401 Admin API key required` with an inference key, so the app can't read Venice's remaining credit with the key it plays with. This is noted on ticket 20.
- 2026-11-03: **Anime run** (`--style anime`; same models and prompts, only the style text changed):
  - **Blocking:** all 5 images came back; none was blurred, flagged or blocked. About 6 s for the reference and about 30 s per scene, $0.20 at list price.
  - **Consistency is weaker than the photo run** (agent's check of the three non-nude images):
    - Identity holds roughly: the same black tied-back hair, the scar on the same side through the eyebrow, and a lean build.
    - **Eye colour drifted** from grey in the reference to amber-brown in both scenes.
    - **The art style drifted too:** the reference is flat, soft line art, while the scenes are glossy TV-anime cel shading. That makes the Character look like a slightly different person.
  - **Likely cause:** with Venice, the scene prompts say "same face, same scar" but don't restate the Appearance, so the edit model gets eye colour only from the base image.
  - **Fixes to try:**
    - Put the Appearance's key traits (eye colour, scar, hair) into every Snapshot prompt; spec ticket 31 already says the prompt writer reads Appearance.
    - Compare `seedream-v4-edit`.
  - **Also seen:** rain was right this time, and the tank top carried over to the close-up again. In the tavern, the viewer's hands pour the drink instead of Mira.
- 2026-11-03: **Anime rerun with the Appearance traits in every scene prompt** (eye colour, faint old scar, hair, build, "same art style"). Both runs reuse the same anime reference image.
  - **Blocking:** all 8 scenes came back; none was blurred, flagged or blocked, for either model.
  - **`qwen-edit-uncensored`** ($0.04, about 35 s per scene):
    - **Fixed:** eye colour is right now (grey-green).
    - **Unchanged:** the scar is right and so is the hair. The scenes are still glossier cel shading than the reference's flat line art. The close-up still keeps the reference's tank top.
  - **`seedream-v4-edit`** ($0.05, about 14–24 s per scene, output 1640×2456):
    - **Best consistency of every run.** It has green eyes and reproduces the reference's distinctive scar, which runs from brow to cheek through the eye. Its line art is the closest to the reference.
    - **It follows the scene better.** In the tavern, Mira pours the drink while the viewer's hand holds the glass, a correct first-person view. The close-up drops the reference's clothing.
  - **Agent's recommendation:** use `seedream-v4-edit` as the default Snapshot model, with `qwen-edit-uncensored` as the manual alternative. Always restate the Appearance's key traits in the Snapshot prompt.
  - **Still to do:** the user judges the intimate and explicit images of both runs, then records the verdict and closes this ticket.
- 2026-11-03: **Verdict (user): Seedream passes**, including the intimate and explicit images. The image model is decided:
  - Provider: **Venice**.
  - Snapshots: **`seedream-v4-edit`** through `POST /image/multi-edit` ($0.05).
  - Reference images: `qwen-image-3` through `POST /image/generate`, the model this check used ($0.04).
  - Manual alternative: `qwen-edit-uncensored`.
  - The Snapshot prompt must restate the Appearance's key traits.

  Venice credit used by the check: about $0.76 at list price.

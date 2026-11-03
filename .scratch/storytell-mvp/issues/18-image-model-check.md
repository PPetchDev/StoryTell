# Check the image model before building Snapshots

Type: task
Status: ready-for-human
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

- [ ] Venice returns explicit fictional-adult images that are not blocked, blurred or flagged.
- [ ] The Character's face and build hold across the scenes from one Reference image.
- [ ] Cost per image is recorded (expected ~$0.04).
- [ ] The verdict is appended under `## Comments`. If it fails, rerun the same check on Venice (Seedream V5 Pro Edit or `qwen-edit-uncensored`) and record which becomes the default image model.

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

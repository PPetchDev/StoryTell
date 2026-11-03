# Check Seedream 4 on Runware before building Snapshots

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

1. Put `RUNWARE_API_KEY=...` in `prototypes/image-check/.env` (gitignored).
2. Optionally edit the Character or the scenes in `check.json`.
3. From the repo root, run `node prototypes/image-check/check.mjs --dry-run` to see the exact requests. This spends nothing.
4. Then run `node prototypes/image-check/check.mjs`. It makes 1 Reference image and 4 scenes, about $0.15 in all, and takes a few minutes.
5. Open the printed `out/<run>/index.html` to compare faces. `results.json` holds the cost, NSFW flag and time per image.

Rerun with `--ref <file>` to keep the same reference image.

## Acceptance criteria

- [ ] Runware returns explicit fictional-adult images without a block or a content stop.
- [ ] The Character's face and build hold across the scenes from one Reference image.
- [ ] Cost per image is recorded (expected ~$0.03).
- [ ] The verdict is appended under `## Comments`. If it fails, rerun the same check on Venice (Seedream V5 Pro Edit or `qwen-edit-uncensored`) and record which becomes the default image model.

## User stories covered

38, 42, 109–113 (they depend on this verdict).

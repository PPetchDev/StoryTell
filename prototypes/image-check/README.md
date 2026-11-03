# PROTOTYPE — Image model check (ticket 18)

Throwaway. Answers [ticket 18](../../.scratch/storytell-mvp/issues/18-image-model-check.md); not production code.

Run from the repo root (Node 22+, no install):

```bash
node prototypes/image-check/check.mjs --dry-run
node prototypes/image-check/check.mjs
```

- The key comes from the `RUNWARE_API_KEY` env var or `prototypes/image-check/.env` (gitignored).
- `--dry-run` prints the exact requests and spends nothing.
- A real run makes one Reference image and then the 4 scenes in `check.json`, each using that reference. That's 5 images on Seedream 4.0 (`bytedance:5@0`, 1664×2496), about $0.15. The safety check is turned off explicitly.
- `--ref <file>` reuses an existing reference image, so a rerun costs 4 images.
- Each run writes to `out/<time>/` (gitignored, because it holds explicit images): the images, `results.json` (cost, NSFW flag, seed and seconds per image) and `index.html` for comparing faces side by side.
- Edit `check.json` to change the Character, the style or the scene prompts.

Seedream 4.0 averages about 74 s per image. A task still running after 120 s comes back "processing", and the script polls `getResponse` for it instead of resending.

# PROTOTYPE — Image model check (ticket 18)

Throwaway. Answers [ticket 18](../../.scratch/storytell-mvp/issues/18-image-model-check.md); not production code. It runs on **Venice**. Runware was dropped because its minimum top-up is $20; the Runware version of this script is in commit `4ca8a49`.

Run from the repo root (Node 22+, no install):

```bash
node prototypes/image-check/check.mjs --dry-run
node prototypes/image-check/check.mjs
```

- The key comes from `VENICE_API_KEY`, either in the environment or in `prototypes/image-check/.env` (gitignored).
- `--dry-run` prints the exact requests and spends nothing.
- A real run makes one Reference image, then the 4 scenes in `check.json`, about $0.20 at list price:
  - the Reference image comes from `POST /image/generate` with `qwen-image-3`, in 2:3
  - each scene is a `POST /image/multi-edit` with `qwen-edit-uncensored` that edits that reference image into the scene
  - `safe_mode` is false on every call
- Options:
  - `--ref <file>` reuses an existing reference image.
  - `--edit-model seedream-v4-edit` compares another edit model.
- Each run writes to `out/<time>/` (gitignored, because it holds explicit images):
  - the images
  - `results.json`, with time, blur and content-violation flags per image
  - `index.html`, for comparing faces side by side
- The run counts as failed when an image is blurred (`x-venice-is-blurred`), flagged as a content violation, or blocked (422).
- Edit `check.json` to change the models, the Character, the style or the scene prompts. `qwen-edit-uncensored` accepts prompts of up to 1500 characters.

Venice reports no per-image cost. The script reads `/billing/balance` before and after the run, and its spend figure is only accurate if nothing else uses the key at the same time.

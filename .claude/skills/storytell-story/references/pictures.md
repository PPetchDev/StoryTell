# Pictures: Characters, Expressions, Covers, Places

Every route here either costs money or takes the user's time to judge. Ask before each paid step, and show every candidate before anything goes on live.

The details change often. The current recipes, with file paths and what was tried and lost, live in memory. Read the matching file before you start a step:
- `memory/free-pictures-modelscope.md`: the free Character route, background colours, cut-out tools, and what the user picked per Character.
- `memory/moving-cover-recipe.md`: the moving Cover.
- `memory/clean-cutout-recipe.md`: the app's own cut-out, and how to redo existing cut-outs.
- `memory/reference-candidates-user-picks.md`: how the app's Generate rounds behave.

`memory/` is `C:\Users\titiw\.claude\projects\C--Users-titiw-Downloads-Storytell-AI\memory\`.

## Character Reference (the portrait every other picture starts from)

1. **Draw for free first.** Use ModelScope with `Trapdaar/ClearAnime_MossSft`, from text, at 832x1248. The token is `MODELSCOPE_API_TOKEN` in the repo's root `.env`. Never print it.
2. **Prompt.** Use the style line of `.scratch/clearanime-upgrade/ines/i-ines-pose-14.txt` unchanged: very large round eyes, round pupil, two highlights, soft pastel painting. Add the Character's body, outfit and colour from her Appearance. The template is `.scratch/clearanime-upgrade/template-b.md`.
3. **Background colour.** Take the Character's palette first. Then pick a muted colour that is not in it, never neon and never white (`palette.mjs` helps). Draw on that colour from the start. A white or near-background part with no outline is lost in the cut-out for good.
4. **Draw 3–4 candidates.** Zoom into each face and hand at full size. Lay them beside Rin's and Ines's faces (the `tamsin/_faces-style.jpg` layout). Check head size: skull-to-chin over skull-to-feet should match the cast's.
5. **Show the user every candidate. Wait for their pick.** Small fixes (empty hands, sharper eyes) are one Qwen-Image-2.1 edit of the pick, not a new round.
6. Use Venice (seedream-v5-pro, or the app's Generate button) only if the user asks. Its credit is scarce. A Generate pick deletes the other candidates, so show them all first.

Check every picture for an extra arm, leg or foot before showing it.

## Expressions (21 per Character)

Start only after the user approves the Reference, and ask first. A set was once withdrawn after 20 pictures.

- Edit each Expression from the Reference with `Qwen/Qwen-Image-2.1` (`.scratch/clearanime-upgrade/edit.mjs`, `SHORT=1`). Give it a short instruction: say what changes, then what stays, including "keep the flat <colour> background".
- Zoom into hands and mouths at full size.
- Cut out with the app: "Soft cut-out · free" for the best edges, or "Cut out · free". Then look at each cut-out on black.
- Fix tools for hair that has taken the background's colour: `hairfix.cjs`, `tintfix.cjs`, `patchfix.cjs`. Which one fits is in the memory file.

## Still Cover

- It shows the cast, posed together in a glamorous gacha-style group. Never Rin's own picture, and never a man.
- The user can draw it on tensor.art for free. Write them a prompt like `.scratch/story-drafts/tensor-art-cover-prompt.md`.
- Venice group covers ran the credit out once (about $3). Draw portraits first, then at most one Cover round, and only on the user's go.

## Moving Cover

Only after the still is approved, and only when the user says to start.
1. Make the clip with Venice `kling-o3-standard-image-to-video`, 5 s. Quote first (it was $0.46). The prompt keeps everyone's eyes open, with quick blinks only, and a still camera with subtle motion. Check a face strip every 0.25 s.
2. Make the loop with ffmpeg: crossfade the end into the start, into a **lossless** animated WebP.
3. Encode with sharp, `webp({quality:80,effort:4})`. Keep it under 15 MB.
4. Never upload ffmpeg's lossy WebP: its block seams show on every thumbnail.

## Places

Each Place has day, evening and night pictures.
- Free: Cloudflare `flux-2-klein-4b` (keys `CLOUDFLARE_*` in `.env`, 10,000 free neurons a day). Draw from the name and the looks, never the Story's world paragraph.
- Or the user uploads their own pictures on the Style tab, per light.
- Or the app's Draw button, which costs credit.

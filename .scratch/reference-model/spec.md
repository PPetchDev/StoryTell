# Reference images drawn with seedream-v5-pro

Status: ready-for-human

Reference images were drawn with `qwen-image-3` ($0.04). The user found that they looked nothing
like the portraits made for the same Characters with `seedream-v5-pro`, even with the same Story
Image style ("soft pastel anime…") in the prompt: the two models read the same words as different
art. The style was never hard-coded; the model was.

## Decisions

1. `REFERENCE_IMAGE_MODEL` is `seedream-v5-pro`. Reference images are still drawn at 2K, now
   $0.11 each, so a round of 3 candidates costs $0.33 instead of $0.12.
2. `qwen-image-3` stays the text-to-image model of a `qwen-edit-uncensored` Snapshot with no
   Reference image in frame, under its own constant `QWEN_TEXT_IMAGE_MODEL`. Snapshots don't change.
3. The prompt is unchanged: full body, neutral pose, plain background, the Story's Image style,
   the Appearance.

# Spec: The soft cut-out

Status: ready-for-human
Builds on: [Spec: The app's own background remover](../own-cutout/spec.md) ("A choice of two")

Written and built 2026-11-23, after Rin's pictures were redrawn on a flat muted purple and cut out by hand with a script.

## Problem Statement

Both cut-out makers fail on Rin. The app's own remover eats white tails and a white dress drawn on white, leaves stair-step edges, and takes dark fur at the foot for a ground shadow. Venice's leaves a fringe of the old background and costs $0.03 a picture.

The way out that worked: draw the picture on one flat colour that the figure does not use, and never neon (for Rin a muted purple, chosen as the muted colour farthest from her palette). On such a picture the figure can be told from the background by colour alone.

## Solution

A third cut-out maker, the soft cut-out. It reads the figure's shape from the colour, with no model, and unmixes each pixel along the edge into figure colour and background colour. The edge is smooth, fine fur is kept, white parts with no outline are kept, and no tint of the background is left on the edge. It costs nothing.

An Expression has a third button, "Soft cut-out · free", beside "Cut out · free" and "Venice cut-out". It replaces the cut-out there, like the other two.

## User Stories

1. As the author, I want a picture drawn on a flat colour cut out with a smooth edge, so that the figure does not stand on the stage in a jagged outline.
2. As the author, I want white fur that touches the background with no outline kept, so that a white tail tip is not eaten.
3. As the author, I want dark fur at the foot kept, so that it is not taken for a ground shadow.
4. As the author, I want no tint of the old background on the edge, so that the figure carries no purple line onto a dark place.
5. As the author, I want background showing through a closed gap cleared, so that no patch of it sits between strands of hair.
6. As the author, I want to be told when a picture is not fit for it, so that I use another maker instead of getting a bad cut-out.
7. As the owner, I want it to cost nothing and need no file put in place, so that it works on every computer.
8. As the author, I want cut-outs nobody chose to stay as they are, so that existing Characters do not change.

## Implementation Decisions

- **A third maker by name only.** `?with=soft` on the three cut-out routes, and `cutoutBy: 'soft'` to the gateway. A cut-out nobody chose (after a drawing, in "Draw all", a dressed stage's sprite) is still the app's own where set up. The soft cut-out was tuned on one Character and takes no ground shadow out, so it is not a default.
- **Fit means a flat, tinted background.** Nine tenths of the picture's outer ring within a small distance of its median colour, and that colour's strongest and weakest channel at least 24 apart. White, grey and black have no tint to tell them from white fur, grey shading or a black outline. Anything else is refused (409.002.016), with no record and no call. Whether the figure itself uses the background's colour is not checked: that is the author's choice of colour.
- **No model.** A pure function from the picture's colours to a see-through picture, about a second for a 1664 by 2496 picture on the PC.
- **Pixel distances scale with the picture's width**, measured on 832: a picture twice as wide gets a band twice as wide.
- **The usage record** is written as for any image call: model `soft-key`, host `local`, cost 0, image pool. It needs no image credit.
- **The answer is a PNG**, the size the picture came in, as the other makers answer.

## Testing Decisions

- The function is tested with small synthetic pictures: a white part with no outline, a half-mixed edge pixel, a closed gap, a stray speck, a white background, a background that is not one colour.
- The maker is tested for the form of its answer, and that a refused picture does not stop the next.
- The gateway is tested through its contract harness: made by name with no call and no cost; never made unasked; a refusal leaves no record.
- The editor's e2e presses the third button and sees the gateway asked for `soft`.
- Checked against the hand-made cut-out of Rin's Joy at 1664 by 2496: the alpha differs on 492 pixels of 4.15 million, all of them where the hand-made one was patched afterwards at the ears.

## Known limits

- The highlight on Rin's black ears is close to her purple background, so thin slits and a bumpy edge are left there. They were patched by hand for the pictures on live; this maker does not do that.
- A ground shadow drawn on the background is kept wherever it is far from the background's colour.
- A PNG at 1664 by 2496 is about 4.3 MB; the hand-made ones on live are lossless WebP at 1.3 MB.

## Out of Scope

- Enlarging a picture two times before the cut-out (the MoSR Soft model). On the live VM (2 cores) one 832 by 1248 picture took more than 15 minutes, against 60 seconds on the PC, so it cannot run at cut-out time there.
- Drawing a picture on a colour picked from outside its palette: the drawing prompts still ask for the Story's own background.
- Making it the default maker for a fit picture.

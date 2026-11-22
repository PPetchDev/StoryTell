# Spec: The app's own background remover

Status: ready-for-human
Builds on: [Spec: Stage pictures](../stage-pictures/spec.md) (the cut-out, the `image_cutout` call, "Upload a cut-out")

Written and built 2026-11-22, after Ines Varro's 21 cut-outs came back from Venice with a white fringe.

## Problem Statement

A cut-out made by Venice's background remover leaves a thin edge of the old background, and patches of it between strands of hair, when the picture was drawn on white. On the novel stage, over a dark place, Ines stood in a white outline. Erosion, opening, colour dilation and unmixing the white were all tried on the finished cut-out: each either thinned her hair, brought the fringe back or broke the edge.

Each cut-out also costs $0.03, so cutting a Character's 21 Expressions is $0.63, every time they are redrawn.

## Solution

The app removes backgrounds itself, on the computer it runs on, with a matting model trained on drawn characters, followed by a clean-up for pictures drawn on one flat colour. A cut-out then costs nothing and has no fringe.

Nothing changes in how a cut-out is asked for: "Cut out", "Draw all" and a dressed stage's sprites all get it. The editor's button reads "Cut out · free". Where the model file is not on the computer, cut-outs go to Venice as before, at Venice's price.

## User Stories

1. As the author, I want a cut-out with no edge of the old background, so that a Character stands cleanly on the place behind them.
2. As the author, I want thin strands of hair kept, so that a cut-out does not look trimmed.
3. As the author, I want the small marks drawn beside a Character (a heart, spark lines, a "!?") kept, so that the Expression still reads.
4. As the author, I want white clothes inside the drawing's outline kept, so that gloves and frills are not eaten with the white background.
5. As the author, I want background showing through a loop (a tiara, a curl of hair) cleared, so that no white patch sits inside the figure.
6. As the author, I want a soft shadow drawn on the ground left out, so that the figure does not carry a grey smear onto the stage.
7. As the author, I want the same result on a dark flat background as on a white one, so that it does not matter what the picture was drawn on.
8. As the author, I want a picture on a scenery background still cut out, by the model alone, so that the feature never refuses a picture.
9. As the owner, I want a cut-out to cost nothing, so that redrawing a Character's Expressions is only the price of drawing.
10. As the owner, I want the Usage page to show these cut-outs at $0.00, so that the count is still there and the money is right.
11. As the author, I want the button to say what a cut-out costs now, so that I know before I press it.
12. As the author, I want "Draw all" to price its run without a cut-out fee when cut-outs are free, so that the estimate is right.
13. As the owner, I want the app to start and run without the model file, so that a computer that lacks it (a fresh checkout, the tests) still works, on Venice.
14. As the owner, I want no new setting to fill in, so that putting one file in place is the whole set-up.
15. As the author, I want cut-outs made one at a time, so that a "Draw all" does not starve the computer while I play.
16. As the author, I want a cut-out that fails to leave the Expression as it was and say so, as it does today, so that nothing is lost.
17. As the developer, I want the clean-up testable without the model, so that the test suite needs no 176 MB file.
18. As the author, I want an uploaded cut-out still accepted, so that a picture I cut out elsewhere wins over the app's.

## Implementation Decisions

- **Inside the real Model Gateway, behind the same call.** `image_cutout` stays the one call kind. The real gateway asks its own remover first when the remover is available, and Venice otherwise. Callers (Expressions, Your faces, the dressed stage) do not change, and the fake gateway does not change, so every existing test still describes the app.
- **Available means the model file is there.** The model's path defaults to `models/isnet-anime.onnx` beside the image folder, as the speech folder defaults beside it; `CUTOUT_MODEL` can name another path. No file, no error: Venice makes the cut-out.
- **The model** is `isnet-anime` (176 MB, from the rembg project's releases), run with onnxruntime inside the API process, loaded on the first cut-out and kept. It reads a 1024-pixel square and answers how much of each pixel is figure; that matte is scaled back to the picture's size. It is not in the repository.
- **The clean-up runs only where the background is one flat colour**, read from the picture's outer ring (nine tenths of it within a small distance of its median colour). There:
  - a pixel the model left out that is coloured or dark comes back: the marks drawn beside the figure.
  - a ground shadow never does. A shadow is the background's own colour made darker: every channel down by much the same share (Morra's shadow on beige paper is darker beige, which a plain "is it coloured" test took for a mark, 2026-11-22). At the figure's foot (the lowest tenth of its height), what the model itself kept of a shadow is cleared from the see-through area inward; the drawing's outlines, far darker than a shadow, stop that, so shoes stay.
  - a pixel of the background's colour that the model was not sure of goes: the gap inside a loop.
  - a pixel of the background's colour that can be reached from the see-through area through others like it goes. The drawing's outlines stop the spread, which is what keeps white gloves.
- **On any other background the model's matte is used as it is.**
- **The edge** is softened by under a pixel and never widened.
- **One picture at a time**, in the order asked. A failed one does not block the next.
- **The usage record** is written as for any image call, with the remover's model name, the host `local` and a cost of 0, in the image pool. No provider's credit is read or spent.
- **Settings' answer carries the cut-out's price now** (0, or Venice's), so the web shows "Cut out · free" and prices "Draw all" without the fee. Until it has loaded, the web assumes Venice's price.
- **A new dependency:** onnxruntime's Node package, in the API only.
- **Known limits.** A white thought bubble on a white background loses its inside: only its outline is kept. A mark drawn in soft grey, or in a darker shade of the background's own colour, is taken for a shadow. A part of the figure at its foot in the shadow's colour, with no outline around it, can be cleared with the shadow. A white part of the figure that touches the background with no outline between them can be eaten.

## Testing Decisions

- A good test here says what a cut-out looks like from outside: which pixels are see-through, what was recorded, what was called. Never how the matte was worked out.
- **The clean-up is a pure function** from a picture's colours and a matte to a matte. It is tested with small synthetic pictures: a mark the model dropped, a shadow, a fringe, a glove inside an outline, a gap in a loop, a dark background, a background that is not flat.
- **The remover is tested with a stand-in model** handed in where the real one would load: the size and form of what it answers, one picture at a time, a failure not blocking the next, and that it is available only where its file is.
- **The gateway is tested through its existing contract harness** (a recorded `fetch`): with the remover available there is no call to Venice and the record costs 0; without it, Venice is called at its price.
- **One test runs the real model** on a drawn figure, and only where `CUTOUT_MODEL` names the file: skipped everywhere else, so the suite needs no model.
- Prior art: the Venice contract tests, and the speech folder's config test.

## Out of Scope

- Recutting pictures that already have a cut-out. Each still has its "Cut out" only while it has none; an author replaces one with "Upload cut-out" or by redrawing.
- A second model for scenery backgrounds, or for photographs.
- Running the model on a graphics card.
- A setting to choose between Venice and the app's own remover.
- Removing Venice's remover from the code: it is the fallback.

## Further Notes

- **Measured on the PC:** about 1.5 seconds a 1024 by 1536 picture. On the live VM (2 cores, 12 GB) the same model through rembg took about 5 seconds a picture and 1.4 GB at its peak.
- **Checked by eye** on Ines (white background), Tamsin (pale grey) and Mireille (dark): no fringe, marks kept, gloves kept. The API's remover gives the same pixels as the prototype it was written from.
- **Set-up on a computer:** put `isnet-anime.onnx` in the `models` folder beside the image folder. Nothing else.

## A choice of two (2026-11-22, the same day)

All 143 Expressions on live were recut with the app's own remover, and then each was measured against the cut-out it replaced. Eight Characters came out the same or better (Ines: no fringe; Morra and Tavri: no ground shadow). The Role, Rin, came out worse: about 5% of every picture gone. She is drawn on white with white tails and a white dress that have no outline against the background, so the clean-up that clears "background colour touching the see-through area" ate into them. Her 21 cut-outs were put back from the backup.

So neither maker is right for every picture, and the author chooses:

- **Two buttons on an Expression, side by side:** "Cut out · free" (the app's own remover) and "Venice cut-out · ~$0.03". Where the app's own remover is not set up there is one, as before, at Venice's price.
- **Both are there whether or not the picture has a cut-out:** the new one replaces the old, so a poor cut-out is one press from the other maker's. (Before, the button went away once a picture had a cut-out.)
- **The API takes `?with=own|venice`** on the three cut-out routes (a Character's, the Role's, a Persona's Expression). Left out, the gateway chooses as before: its own remover where set up, else Venice. Asking for its own where it is not set up is refused (409.002.015), with no call.
- **Only Venice's cut-out needs image credit.** The check for an empty image pool no longer refuses a free cut-out.
- **A cut-out nobody chose** (after a drawing, in "Draw all", a dressed stage's sprite) is still the app's own where set up. An author whose Character is white on white recuts those with Venice's button.
- **Settings' answer says both:** whether a free cut-out can be asked for, and Venice's price.
- **Tests:** the route passes the named maker to the gateway and refuses an unknown one; the gateway goes to Venice when Venice is named though its own remover is there, and refuses its own by name where the file is missing; in the editor each button asks for its maker and the second press replaces the first cut-out.
- **Not done:** making the clean-up safe for white on white (it would need to tell fur from background without an outline); a per-Character default maker.

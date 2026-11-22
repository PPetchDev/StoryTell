# Spec: Stage pictures

Status: ready-for-agent

## Problem Statement

In the Visual novel view, the speaking Character's Expression showed large over the Backdrop. On live (Nara, 2026-11-18) two things looked wrong:

- **The poses were odd in every picture.** Each Expression is an edit of the whole Reference image, and the prompt asked for "facial expression and body language", with words like "shoulders hunched, leaning back". The edit model bent the whole figure: Nara leaned forward with bent knees for fear, and threw her head back for joy.
- **The background came along.** The Reference image has a flat beige background, so every Expression did too. On the stage it showed as a beige box over the Backdrop, where a visual novel has the figure standing in the scene.

The user also wants more feelings for intimate scenes: one "love" covered tender, flirting, aroused and longing alike.

## Solution

- **One gesture per emotion, body upright.** The drawing prompt keeps the person, outfit, style and full-body framing, keeps the figure standing upright in a natural pose with the legs and feet as drawn, and changes only the face and the arms and hands, to one named gesture. Fear, for example, is both hands raised close to the chest, and surprise is a hand over the mouth. It asks for a plain flat background, which the cut-out then takes away.
- **Six intimate emotions:** Teasing, Desire, Flustered, Longing, Passion and Afterglow. That makes thirteen with the seven everyday ones.
  - The Judge gives them only in an intimate or sexual moment between adults.
  - A line with one of them, from a Character without that picture, shows the nearest everyday Expression: Teasing and Afterglow show Joy, Desire, Longing and Passion show Love, and Flustered shows Embarrassment.
  - "love" now means tender, affectionate, warm and fond. The arousal and longing it used to cover are Desire and Longing.
- **Cut-outs.** A drawn Expression is cut out by itself, with Venice background-remove. The Reference image is cut out too the first time an Expression is drawn, so it can stand as the stage's neutral picture.
  - An upload is not cut out by itself; Cut out in its row does it.
  - The Expression stands when its cut-out fails, without one.
- **The stage.**
  - A cut-out stands on the Backdrop from the knees up. It is drawn 128% of the stage's height with its top at the stage's top, so the stage's bottom edge cuts it below the knees, and it has a soft drop shadow.
  - It breathes a little. It enters each line in a way that fits its emotion:
    - Joy and Teasing hop.
    - Fear and Surprise startle.
    - Desire and Longing sway.
    - Passion trembles.
    - Afterglow breathes slowly.
  - With reduced motion it stands still.
  - A picture without a cut-out shows as before, whole.
  - It is held to the stage's top, as a cut-out is, so on a phone a long line's box doesn't cover the face. Until 2026-11-22 it sat at the bottom, and the box hid all but the hair.
  - It stands in front of the place picture, as a cut-out does. Until 2026-11-21 it was unpositioned, so the place picture (positioned, earlier in the page) covered it once its fade-in ended: an uploaded Expression showed for a moment and went.
- **The Story editor.**
  - The six intimate feelings sit under their own heading, "Intimate scenes (18+)".
  - **Draw all 13** redraws every Expression in turn, with its price, and stops at the first failure. Since 2026-11-20 it runs on the server and draws only what is missing: `.scratch/expression-drawing/spec.md`.
  - Each row says whether it is cut out, and offers **Cut out** when it is not.

## User Stories

1. As a player, I want a Character's pose in the novel view to look natural for each feeling, so that the scene doesn't look broken.
2. As a player, I want the Character to stand in the scene, not in a beige box, so that it looks like a visual novel.
3. As a player on a 360px phone, I want the Character shown from the knees up, so that I can see the face and hands.
4. As a player, I want the Character to move a little, and to react to each line's feeling, so that the stage feels alive.
5. As a player with reduced motion on, I want the Character to stay still.
6. As a player in an intimate scene, I want Characters to show teasing, desire, flustered, longing, passion and afterglow, so that the pictures follow the scene.
7. As an author, I want to draw all thirteen Expressions with one button, seeing the price first.
8. As an author, I want my uploaded picture cut out when I ask.
9. As an author whose Story was drawn before this, I want intimate lines to show the nearest feeling I have, until I draw the new ones.

## Implementation Decisions

- **Emotions.**
  - `EMOTIONS` and `EXPRESSION_EMOTIONS` gain `teasing`, `desire`, `flustered`, `longing`, `passion` and `afterglow`; `INTIMATE_EMOTIONS` lists them.
  - Migration `StagePictures1764460000000` widens both check constraints, on `character_expression.emotion` and on `message_part.emotion`. Its down migration nulls those line emotions and deletes those Expressions.
  - The Judge's meanings for the six begin "only in an intimate or sexual moment", and "love" loses "flirtatious, aroused, longing". This changes the Judge's system message once: the prompt cache restarts once.
- **The cut-out call** is an image call kind, `image_cutout`, on `generateImage` with the one picture as its reference image and no prompt. It goes through the Monthly cap, the usage record and the fake like any image call.
  - Real: `POST /image/background-remove` on Venice, which answers a PNG with transparency.
  - Its price is not on Venice's pricing page (read 2026-11-18). $0.01 was the first estimate; on 2026-11-22 sixteen cut-outs took $0.48 from the Venice balance, so $0.03 is recorded (`IMAGE_CUTOUT_PRICE_USD`).
  - Unscripted in the fake, it succeeds with the fake PNG.
- **Storage.**
  - `character_expression.cutout_path`.
  - A `reference_cutout` table (`character_id` primary key, `image_path`, `cut_from`). It is a table of its own so a Character autosave never writes it. `referenceCutoutPath` is answered only while `cut_from` is the Character's Reference image.
  - Files: `expressions/…-<emotion>-<token>-cutout.png` and `reference-images/…-cutout-<token>.png`.
  - A replaced or removed Expression, a new or removed Reference image, and Character or Story deletion delete the cut-out files.
  - Duplicate copies the cut-outs.
- **Routes:** `POST …/expressions/:emotion/cutout` cuts out an Expression that is there, and the Reference image when it has no current cut-out.
  - Without the Expression it is a 404. With the Venice pool used up it is 402.001.004, refused before the call. A failed call answers its error and changes nothing.
  - `draw` cuts out the drawing, and the Reference image when needed, best effort: a failure is logged and the Expression stands.
- **Web.**
  - `linePicture` answers `cutout` with `whole`, and falls back from an intimate emotion to the everyday one.
  - The novel view draws a cut-out as `.stage-figure`, with `data-emotion` choosing the entrance. The motion is in `globals.css`, inside `prefers-reduced-motion: no-preference`.
  - Embarrassment's label is "Embarrassed" now, since "Flustered" is the new intimate feeling.

## Real-model check (2026-11-18)

- One fear Expression of Nara on seedream-v5-pro-edit (what live draws Expressions with) with the new prompt:
  - It came back upright, both hands raised close to the chest, and the face, outfit and tail kept.
  - background-remove gave a clean 832×1248 PNG with transparency. Laid on a dark colour, it showed no beige edge.
  - The before-and-after picture is at `.scratch/nara-fear-before-after.jpg`.
- The other four test drawings (joy, embarrassment, teasing, desire) were refused: the Venice balance ran out after the first. **Not yet checked on a real model:** the five other everyday gestures and all six intimate ones.

## Testing Decisions

- API: `test/stage-pictures.spec.ts` (real Nest app and database, fake gateway) covers:
  - drawing all six intimate emotions, each cut out, with the Reference image cut out once;
  - a failed cut-out keeps the Expression, and Cut out later makes it;
  - Cut out on an upload, and a 404 without the Expression;
  - a failed Cut out changes nothing;
  - removal and a new Reference image delete cut-outs;
  - Duplicate copies them;
  - the Judge parses the six.

  `test/expressions.spec.ts` counts the cut-out calls and files. `test/expression-prompt.spec.ts` checks the upright pose, one gesture per emotion and no whole-body bending.
- e2e: `e2e/stage-pictures.spec.ts` covers:
  - the knee-up cut-out with `data-emotion`, and the Love-to-Reference fallback for Passion, at 390, 360 and 320px;
  - reduced motion standing still;
  - the editor's heading, Draw all, and Cut out on an upload.

  `e2e/line-picture.spec.ts` covers the cut-out and the fallbacks in `linePicture`.

## Out of Scope

- Outfits that change with the story: the sprite keeps the Reference image's outfit. A Snapshot shows the scene as it is.
- More than one pose per emotion, and lip or eye animation.
- Cutting out Snapshots.

## Further Notes

- Redrawing Nara's and Dulcie's Expressions on live needs Venice credit: about $1 per Character for all thirteen, with the cut-outs.

## Upload a cut-out (2026-11-21)

With Venice credit out, nothing can be cut out, and an uploaded Expression always shows whole, with its own background, on the novel stage. The user takes the background away elsewhere (ChatGPT) and wants to give the app that see-through picture as the Expression's cut-out.

- **What:** each Expression that is there (a Character's, the Role's, a Persona's) gets "Upload cut-out". The picture becomes that Expression's cut-out, replacing any there. The Expression's own picture stays as it is, so its round face and face square don't change. It is free: no model call.
- **API:** `PUT …/expressions/:emotion/cutout`, multipart `image`, for `stories/:storyId/characters/:characterId`, `stories/:storyId/role` and `personas/:personaId`. It answers what the Expression's other writes answer (the Story, or the Persona).
  - The picture must be a PNG or WebP with see-through pixels. A JPEG, or a PNG with no see-through pixel (a fake checkerboard included), is refused with 415.002.014 "A cut-out must be a PNG or WebP with a see-through background."
  - It is refused with no Expression for that emotion (404), with no file (400.002.008), with a file that is not a picture (415.002.009) and with one over the upload limit (413.002.010).
  - The file is stored next to the Expression's (`…-cutout.png` or `.webp`), and the cut-out it replaces is deleted. If the Expression is redrawn, uploaded or removed meanwhile, the new file is deleted and the answer is 404.
- **Web:** the Expression's panel shows "Upload cut-out" beside "Cut out · ~$0.03", also when it is already cut out (to replace that cut-out). The file is sent as it is, so its transparency is kept; only a picture over the upload limit is shrunk, to a PNG. The panel's hint then says "Cut out: stands on the Backdrop in the novel view." A refused picture shows the 415.002.014 message in plain words.
- **Testing:** the API tests cover the Character, Role and Persona routes and every refusal. An e2e uploads an opaque PNG (refused in plain words) and then a see-through one in the Expressions card at 360 px. It checks that the panel says it is cut out, that the stored cut-out is the same bytes and that the Expression's own picture is unchanged. The novel stage already shows any `cutoutPath` as a cut-out, and that is tested elsewhere.

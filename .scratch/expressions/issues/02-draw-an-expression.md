# 02 — Draw an Expression from the Reference image

**Status:** ready-for-agent

**What to build:** On each Expression row, "Draw · $price" makes that emotion's picture from the Character's Reference image in one tap, with a confirm before drawing over an existing one. It is logged as an image call of its own kind, and drawn Expressions show "Drawn from an earlier Reference image" once the Reference image changes. Per the spec's "Authoring API" (Draw, the drawing prompt, Reference image changes) and "In the Story editor" (Draw):

- the `expression_image` image call kind, sent with the Reference image to the Settings Snapshot model at 1K;
- the pure drawing prompt per emotion;
- `drawn_from` and `outdated`;
- `NoReferenceImageToDrawError` when there is no Reference image ("Add a Reference image first: Expressions are drawn from it.");
- the out-of-credit pre-check;
- the Usage page label "Expression pictures" for the kind, under "Images and audio (Venice)";
- the editor's price from Settings, "Drawing…", and inline errors.

**Part of:** [Spec: Expressions](../spec.md)

**Blocked by:** [01 — Expressions on a Character](01-expressions-on-a-character.md)

- [ ] Pure test: each emotion's prompt holds its description and the Character's name, and says to keep the person, outfit, framing and style.
- [ ] API tests:
  - Draw sends one `expression_image` call carrying the Reference image and stores the result;
  - drawing again keeps the crop and replaces the file;
  - no Reference image is refused with `NoReferenceImageToDrawError` and no call;
  - out of image credit is refused with no call;
  - replacing the Reference image marks the drawn one `outdated`, and not an uploaded one;
  - a gateway failure leaves the old Expression as it was;
  - the Usage summary counts `expression_image` in the image pool.
- [ ] The real gateway contract test: `expression_image` with one reference goes to the Settings Snapshot model on the multi-edit endpoint and records its 1K list price.
- [ ] e2e at 390px: Draw shows the price, then fills the thumbnail; Draw again asks first; the Usage page lists "Expression pictures".
- [ ] `docs/error-codes.md` lists `NoReferenceImageToDrawError`, with the next free code at implementation time.
- [ ] Typecheck and the whole suites stay green.

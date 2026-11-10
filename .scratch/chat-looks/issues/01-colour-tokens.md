# 01 — Every colour a token, and the contrast check beside them

**Status:** done

**What to build:** A prefactor with no visible change. Every colour literal in the web app's `.css`, `.ts` and `.tsx` files becomes a role-named token on `:root` with today's value. That covers notices, toasts, pills, chips, banners, events, errors, the status box, the cover badge, the placeholder, and the rest. Character colours (today hex literals in the TypeScript colour helper) become `--character-1…8`, `--character-neutral` and `--on-character`, and the colour helper answers `var(...)`. These stay literal, with a comment saying why:

- picture scrims and the Snapshot viewer's black stage;
- PWA metadata;
- the placeholder Cover gradients of a Story with no Cover (they stand in for a picture, so they keep their dark hues in both themes);
- the Cover upload's canvas fill, which is baked into the stored JPEG.

The Friendly UI contrast check moves into the web app's scripts:

- its token table covers `dark` and `light` (light values may equal dark until ticket 02);
- its pairs name the tokens;
- `node <script> dark --fail` passes.

Per the spec's "Colour tokens (prefactor)".

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** None — can start immediately.

- [x] A search of the web app's `.css`, `.ts` and `.tsx` files (app, components and lib; hex, `rgb(a)` and `hsl(a)`) finds no colour literal outside `:root`, except the commented scrims, viewer stage, PWA metadata, placeholder Cover gradients and Cover canvas fill.
- [x] The contrast check passes in `dark`, with the same ratios as the Friendly UI run for unchanged pairs.
- [x] Screenshots at 390px of Home (with a Story that has no Cover), a Chat, the Memory drawer, the Dashboard, the Story editor and Settings look the same as before (compared by eye against master).
  Compared by eye 2026-11-09 against the pre-token phone build: Chat list and Chat screen, dark, 375px; colours identical.
- [x] Typecheck and the whole e2e suite pass. The Memory graph and Portrait initials still show Character colours.

**Notes:** The contrast check now lives at `apps/web/scripts/contrast-check.mjs` (`node apps/web/scripts/contrast-check.mjs dark|light [--fail]`). It also fails when its token table and `app/globals.css` disagree. `.scratch/friendly-ui/contrast-check.mjs` is kept unchanged as a historical record. Its "after" pairs all give the same ratios here. The Character card stand-in picture (built after the spec) reads the Character colour and `--on-character` from the computed style, as the spec says for anything that needs a value. Borders that were `#3a3150` now use `--line`, which has that value. `e2e/theme.spec.ts` checks the dark palette on names, initials and the Memory graph.

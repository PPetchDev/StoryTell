# 01 — Every colour a token, and the contrast check beside them

**Status:** ready-for-agent

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

- [ ] A search of the web app's `.css`, `.ts` and `.tsx` files (app, components and lib; hex, `rgb(a)` and `hsl(a)`) finds no colour literal outside `:root`, except the commented scrims, viewer stage, PWA metadata, placeholder Cover gradients and Cover canvas fill.
- [ ] The contrast check passes in `dark`, with the same ratios as the Friendly UI run for unchanged pairs.
- [ ] Screenshots at 390px of Home (with a Story that has no Cover), a Chat, the Memory drawer, the Dashboard, the Story editor and Settings look the same as before (compared by eye against master).
- [ ] Typecheck and the whole e2e suite pass. The Memory graph and Portrait initials still show Character colours.

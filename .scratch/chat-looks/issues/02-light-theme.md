# 02 — A light theme, and Dark / Light / Match phone in Settings

**Status:** ready-for-agent

**What to build:** Settings gains a "Theme" card above Text size with Dark (the default), Light and Match phone, kept on this device. The whole app follows from the first frame, with no flash. The phone's status bar colour follows too, and Match phone tracks the phone's setting as it changes. Per the spec's "Light theme":

- the `storytell.theme` per-device preference (in `localStorage`, so the server can't render it);
- the blocking inline head script that sets `data-theme` and the `theme-color` meta before first paint and before hydration, and the client effect that keeps them in step;
- `:root[data-theme='light']` overriding every token, with `color-scheme: light` and a light Character palette;
- the offline page under `prefers-color-scheme: light`;
- the contrast check's light values.

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** [01 — Every colour a token](01-colour-tokens.md)

- [ ] The contrast check passes with `--fail` in both `dark` and `light`.
- [ ] e2e:
  - Dark is the default;
  - choosing Light applies at once and after a reload, and the inline script has already set `data-theme="light"` before hydration (an init script records the attribute at `DOMContentLoaded`, before any React code runs), so no dark frame shows;
  - Match phone follows an emulated `prefers-color-scheme` both ways.
- [ ] Checked by eye in Light at 390px and 1440px: Home, a Chat (bubbles, narration, Character names, Portrait initials), the Memory drawer and graph, the Dashboard, the Story editor (status box, assistant sheet), Settings, Usage, the Gallery and the Snapshot viewer (stage still dark).
- [ ] Typecheck and the whole e2e suite pass.

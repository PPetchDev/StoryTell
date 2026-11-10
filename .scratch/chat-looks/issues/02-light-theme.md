# 02 — A light theme, and Dark / Light / Match phone in Settings

**Status:** done

**What to build:** Settings gains a "Theme" card above Text size with Dark (the default), Light and Match phone, kept on this device. The whole app follows from the first frame, with no flash. The phone's status bar colour follows too, and Match phone tracks the phone's setting as it changes. Per the spec's "Light theme":

- the `storytell.theme` per-device preference (in `localStorage`, so the server can't render it);
- the blocking inline head script that sets `data-theme` and the `theme-color` meta before first paint and before hydration, and the client effect that keeps them in step;
- `:root[data-theme='light']` overriding every token, with `color-scheme: light` and a light Character palette;
- the offline page under `prefers-color-scheme: light`;
- the contrast check's light values.

**Part of:** [Spec: Chat looks](../spec.md)

**Blocked by:** [01 — Every colour a token](01-colour-tokens.md)

- [x] The contrast check passes with `--fail` in both `dark` and `light`.
- [x] e2e:
  - Dark is the default;
  - choosing Light applies at once and after a reload, and the inline script has already set `data-theme="light"` before hydration (an init script records the attribute at `DOMContentLoaded`, before any React code runs), so no dark frame shows;
  - Match phone follows an emulated `prefers-color-scheme` both ways.
- [ ] Checked by eye in Light at 390px and 1440px: Home, a Chat (bubbles, narration, Character names, Portrait initials), the Memory drawer and graph, the Dashboard, the Story editor (status box, assistant sheet), Settings, Usage, the Gallery and the Snapshot viewer (stage still dark).
  Not yet done by a person. Waiting for the user: check the Light theme by eye at 390px and 1440px on the screens listed.
- [x] Typecheck and the whole e2e suite pass.

**Notes:** The head script also makes the `theme-color` meta itself. A meta rendered by React came back on the client with the server's dark colour as a second meta, so the root layout no longer sets `themeColor` in `viewport`. The script and its constants are in `lib/theme-script.ts`, which has no React import, because the root layout is a Server Component. The e2e check records `data-theme` when `<body>` first exists (the head is parsed and no app script has run) and again at `DOMContentLoaded`. Light `--text` (`#15111e`) and `--muted` (`#4a4360`) are a little darker than the spec's starting palette. That keeps the read-only field (opacity .6) and the Snapshot placeholder's pulse (opacity .75) at 4.5:1. `--on-picture-text` and `--on-picture-warning` sit on literal picture scrims, so they keep one value in both themes.

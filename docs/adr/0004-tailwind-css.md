# The web app is styled with Tailwind CSS v4 utilities over the existing colour tokens

`apps/web` moves from CSS Modules plus one `app/globals.css` to Tailwind CSS v4 utilities. The UI audit (`docs/ui-audit.md`) found the same faults repeated file by file: targets under 44px, 1px focus edges, z-index numbers and font sizes picked per file, a 720px breakpoint beside 1024px. Every one of them came from each module choosing its own values. With Tailwind the values are the theme's scales, written where the element is, and a fix to a shared class reaches every screen. The colour tokens stay exactly as they were: CSS variables on `:root` (dark) and `:root[data-theme='light']`, set before the first paint by the head script in `lib/theme-script.ts`. Tailwind's colours are mapped onto those variables, so a utility follows the theme with no `dark:` variants.

This file is the rulebook for the conversion. When it and the code disagree, fix one of them.

## Setup

- `tailwindcss` and `@tailwindcss/postcss` 4.3.5, devDependencies of `apps/web`.
- `apps/web/postcss.config.mjs`. Turbopack reads it from the Next.js project folder, not from `turbopack.root` (the repo root, set in `next.config.ts`); a production build confirms it (`@apply` is expanded, the layers are emitted).
- `app/globals.css` imports `tailwindcss/theme.css` and `tailwindcss/utilities.css` with `source('..')`, so classes are found in `apps/web` only, never in `.claude/worktrees/`.

## Colours: tokens only

`@theme inline` maps every token to a colour utility of the same name, and `--color-*: initial` clears Tailwind's palette, so `bg-red-500` does not exist.

| Utility | Answers |
|---|---|
| `bg-bg`, `bg-surface`, `bg-surface-raised` | `var(--bg)`, `var(--surface)`, `var(--surface-raised)` |
| `text-text`, `text-muted`, `text-faint` | body, secondary and disabled text |
| `bg-accent-fill text-accent-text`, `text-accent`, `bg-accent-soft`, `border-accent-line` | the accent |
| `border-line` | hairlines between things |
| `border-field-line` | the edge of a field, a select, an outlined button or a chip: 3:1 or more on the page and the surface (audit H14) |
| `text-danger`, `bg-danger-soft text-danger-text`, `text-warning`, `bg-warning-surface` … | the danger and warning roles |
| `bg-quiet-fill`, `bg-notice-surface`, `text-error-text`, `text-event`, `bg-scrim` … | every role token in `:root` |
| `text-character-1` … `text-character-8`, `bg-bond-trust` … | Character and Bond colours |

`inline` matters: the utility reads `var(--surface)` at the element, so it changes with `data-theme`.

A new colour is a new token. Add it to both `:root` blocks in `globals.css`, to `--color-*` in `@theme inline`, and to both tables in `apps/web/scripts/contrast-check.mjs`, with a pair for every text or edge it sits under. `node apps/web/scripts/contrast-check.mjs dark --fail` and `… light --fail` must both pass; the script also fails when its tables drift from `globals.css`. `public/offline.html` repeats some tokens: keep it in step.

Placeholders are `--muted` everywhere (a base rule, audit H15). Don't colour them per field.

## The light theme

There is no `dark:` variant: the tokens already change. When something must differ in the light theme beyond its tokens, use the `light:` variant, which matches `[data-theme=light]` on `<html>`: `shadow-lg light:shadow-sm`.

## Scales

| Scale | Values | Use |
|---|---|---|
| Spacing | Tailwind's default, 4px a step | `p-4` is 1rem, `gap-2` is 8px. Don't use arbitrary spacing. |
| Breakpoints | `md` 768px, `lg` 1024px | Mobile first: unprefixed is the phone. `lg` is the desktop layout with the side rail; `max-lg:` is everything below it. The old 720px is gone (M8). |
| Radius | `rounded-sm` 0.5rem, `rounded-md` 0.75rem, `rounded-lg` 0.875rem, `rounded-xl` 1rem, `rounded-2xl` 1.25rem, `rounded-full` | fields · banners · cards · dialogs and sections · sheets · pills and round buttons |
| Type | `text-xs` 12px, `text-sm` 13px, `text-md` 14px, `text-note` 15px, `text-base` 16px, `text-lg` 18px, `text-xl` 20px, `text-2xl` 28px, `text-3xl` 32px | Nothing smaller than `text-xs` (M7). Each sets line-height 1.5, the headings tighter. Body text is `text-base`. |
| Layers | `z-below` -1, `z-raised` 1, `z-sticky` 10, `z-nav` 20, `z-drawer` 20, `z-popover` 30, `z-sheet` 40, `z-dialog` 50, `z-toast` 60 | Never a bare `z-30` (M4). The values are `--z-*` on `:root`. |
| Motion | `duration-fast` 120ms, `duration-base` 180ms; `animate-sheet-in`, `animate-sheet-out`, `animate-fade-in`, `animate-fade-out`, `animate-pulse-soft` | An exit is quicker than its entrance. Put every animation and transition behind `motion-safe:` (or `motion-reduce:animate-none`). |

The type scale uses Tailwind's names with this app's sizes: `text-sm` here is 13px, not Tailwind's 14px.

## Layers: what wins

Tailwind v4 puts its output in cascade layers: `theme`, `base`, `components`, `utilities`, in that order. A rule outside any layer beats every layered rule, whatever its specificity. So:

1. **`base`**: element defaults in `globals.css` (`html`, `body`, `h1`, `a`, `[hidden]`, `:focus-visible`, `::placeholder`).
2. **`components`**: the shared classes in `globals.css`. A utility on the same element overrides them: `button button-quiet w-full`.
3. **`utilities`**: Tailwind's, and the custom ones in `globals.css`.
4. **Unlayered**: what is not converted yet. The `.module.css` files and the area files under `app/styles/` beat everything above, as they did before the move.

The rule: **no new unlayered CSS.** New styling is utilities in the component. A pattern every screen repeats may become a shared class in `@layer components`; a one-off property Tailwind lacks may become an `@utility`.

## The shared classes

These stay as classes, layered, because every screen uses them. Their audit fixes are in them.

| Class | What it is |
|---|---|
| `page` | the page column; full width beside the rail from `lg` |
| `button` | the accent button: 44px each way (H22, H23), darker on hover and press (M1), the focus ring (M2), `cursor: not-allowed` when disabled or `aria-disabled`, `progress` only with `aria-busy` (L4) |
| `button-quiet`, `button-danger` | with `button`: the quiet fill, the danger fill |
| `button-small` | with `button`: 32px to look at, 44px to tap through an invisible hit area; keep 8px from its neighbours |
| `card`, `notice`, `banner`, `warning`, `pill`, `pill-ok` | boxes |
| `field` | a label over an input, select or textarea: 44px tall (M40), a `border-field-line` edge |
| `field-row`, `actions`, `toolbar`, `page-header`, `section-header`, `card-header` | rows |
| `breadcrumbs` | its links are 44px tall (H32) |
| `chip`, `chip-muted`, `chip-pick` | a label; a pick is a 44px target with its own checked and focus looks (H31); 8px between chips |
| `muted`, `hint`, `small`, `field-error`, `turn-error`, `save-state`, `confirm`, `confirm-warning` | text |
| `visually-hidden` | an alias of Tailwind's `sr-only` (L38). Write `sr-only` in new code. |
| `bare-button` | a `<button>` without the browser's look. Needed while preflight is off (below); harmless after. |

Custom utilities:

- `focus-ring`, `focus-ring-inset`: the one focus ring (2px accent), outside or inside the element. Every focusable element already gets the ring from `base`; use these where a component has removed or replaced the outline.
- `hit-area`: grows the tap target to 44px without changing the look.
- `press`: the darker fill under the finger, and on hover where there is one.
- `z-*`, `duration-fast`, `duration-base`: the scales above.

## Shared components to use

- `components/icons`: `PlayIcon`, `PauseIcon`, `StopIcon`, `ArrowLeftIcon`, `ArrowRightIcon`, `ArrowUpIcon`, `ArrowDownIcon`, `ChevronLeftIcon`, `ChevronRightIcon`, `ChevronDownIcon`, `CloseIcon`, `PencilIcon`, `UndoIcon`, `BranchIcon`, `MoreIcon`, `SparkleIcon`, `PinIcon`, `TargetIcon`, and the Story clock's `DawnIcon`, `MorningIcon`, `NoonIcon`, `AfternoonIcon`, `EveningIcon`, `NightIcon`. Decorative by default (`aria-hidden`); `size` (20), `title` to name one, any SVG prop. They replace every emoji and text glyph used as an icon (M10).
- `components/query-state`: `<Loading label lines className />` (a skeleton in a `role="status"`) and `<ErrorState error title onRetry className />` (`role="alert"`, Try again). `useApiQuery` returns `retry` (M9).
- `components/announcer`: `announce(message, 'polite' | 'assertive')` says something once through the layout's live regions, for changes nothing on screen shows.
- `ConfirmButton` (`components/story-editor/fields.tsx`): asks in place and moves focus to Cancel; give it `ariaLabel` when its label repeats down a list, and `focusAfter` to say where focus goes once the item is gone (H2, M11).
- `OrderButtons`: keeps focus on a usable button and says the new position (M36).
- `TextField`: takes `type`, `inputMode`, `spellCheck`, `autoCapitalize`, `autoComplete` (M39).
- `SaveStatus`: shows Try again after a failed save; `useAutosave` keeps failed edits and sends what is waiting when the page is hidden (H1).
- `Sheet`: drag the grip down to close, a short exit, scroll that stays in the panel (L1–L3).

## What may stay plain CSS

Utilities can't say everything. These may stay CSS:

- `@keyframes`. Prefer adding an `--animate-*` to `@theme` in `globals.css`.
- SVG styling: the Memory graph, the Bond chart (`fill`, `stroke`, `paint-order`, states on `<g>`).
- Selectors utilities can't reach cleanly: `:has()` across components, styling the HTML a Markdown renderer makes, `::-webkit-*` parts.

Such CSS goes in the area's file under `app/styles/` (never back into `globals.css`), inside `@layer components`. Those files are imported by `globals.css`, so `@apply`, `@variant` and `var(--breakpoint-lg)` work in them as they are. A stylesheet Tailwind processes on its own (a `.module.css` kept for a reason) needs `@reference '../../app/globals.css';` (its own relative path) at its top before it can use them. Rules moved into `app/styles/` unlayered by the foundation are leftovers to convert, not a place to add to.

## The area files

The foundation moved each screen's rules out of `globals.css`, unchanged, so each conversion session owns one file and nothing collides in `globals.css`:

| File | Owner | Holds |
|---|---|---|
| `app/styles/home.css` | Home, Gallery, Personas, Settings, Usage | the New Story panel, Character card import, Personas, the Gallery and Snapshot viewer leftovers, Usage's facts |
| `app/styles/editor.css` | Story editor | status card, sub-sections, line lists, Starting Bonds, reference images, the assistant's marks |
| `app/styles/chat.css` | Chat screen | Chat headings, message edit, the Dashboard link target, rollback notice, the Memory toast |
| `app/styles/chats.css` | Chats list, Dashboard, Memory | the Chats list, `message-text` |
| `app/styles/dashboard.css` | Chats list, Dashboard, Memory | the Dashboard and the Bond chart |
| `app/styles/memory.css` | Chats list, Dashboard, Memory | the Memory drawer, its graph, Show Bonds |

`globals.css` imports them in their old order. `.bond` is in both `editor.css` and `dashboard.css`, and both match every `.bond`; dashboard's padding wins by import order. Convert both together or give the editor its own class first.

When an area is converted, its file is empty: delete it and its `@import`.

## Class order

Write classes in this order, so a diff reads the same everywhere: the shared class first, then layout (`relative`, `flex`, `grid`, `items-*`, `gap-*`), box (`size-*`, `min-h-*`, `w-*`, `p-*`, `m-*`), border and radius, background, text (`text-*` size, `font-*`, `leading-*`, colour), effects, interaction (`cursor-*`, `press`, `focus-ring`), then state variants (`hover:`, `active:`, `aria-*:`, `disabled:`), then breakpoints (`md:`, `lg:`), then `motion-safe:`. Long lists go in a constant or an array joined with spaces, not one 200-character string. Don't run prettier on existing files (the repo is hand-formatted); there is no class-sorting plugin.

## TODO: turn preflight on

Preflight (Tailwind's reset) is off: `globals.css` imports only Tailwind's theme and utilities, and its own base rules stand in for the reset, because the unconverted screens rely on browser defaults (button padding, list bullets, heading margins). Until it is on, put `bare-button` on every `<button>` that isn't a `.button`, and set margins on headings and lists yourself.

Once all four areas have converted and every `app/styles/*.css` file is gone, the final integration:

1. Replaces the two imports with `@import 'tailwindcss' source('..');`.
2. Deletes the base rules that preflight now covers (`* { box-sizing }`, `html, body { margin }`), keeping the colours, the font, `h1`, `a`, `:focus-visible` and `::placeholder`.
3. Checks every screen in both themes at 375px and 1280px for spacing that preflight removed.

## Considered Options

- **Keep CSS Modules and add tokens for spacing, radius and type:** fixes the scales but keeps every value a file away from its element, and keeps 40 files each deciding its own button height.
- **Tailwind v3 with a JS config:** v4 is CSS-first, maps CSS variables natively with `@theme inline`, and is what Next.js documents now.

## Consequences

- Until every area converts, two systems live side by side, and unlayered leftovers silently beat utilities on the same element. A utility that "does nothing" is usually losing to a module class or an `app/styles/` rule.
- The colour utilities are only as good as the tokens: a colour that isn't a token can't be written as a class.
- With preflight off, Tailwind's `border` and `outline` utilities still work (they set their own style), but a bare `<button>` keeps the browser's look until `bare-button` or preflight removes it.

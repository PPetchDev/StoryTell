# Spec: Chat looks — Backdrop, light theme and the Visual novel view

Status: ready-for-agent
Builds on: [Spec: Friendly UI](../friendly-ui/spec.md) (tokens and contrast), [Spec: Desktop layout, folding cards and Character pictures](../desktop-and-folds/spec.md), [Story cover](../story-cover/issues/01-story-cover.md), [Spec: Streaming replies](../streaming/spec.md), [Spec: Reply versions](../swipe/spec.md), [Spec: Expressions](../expressions/spec.md), [Spec: Read aloud](../read-aloud/spec.md)
Decision: [Theme and Visual Novel mode](../sillytavern-gaps/issues/14-theme-and-visual-novel.md)
Research: [SillyTavern feature details](../../docs/research/sillytavern-feature-details.md) §9 Visual Novel mode, backgrounds, themes

Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

Every Chat looks the same: dark purple, lines on a flat page, whatever the Story is about. The pictures the user has made for a Story (its Cover, the Snapshots of a Chat) live only on Home, in the Gallery and inline in the thread, never around the story as it plays. In daylight, or on a PC by a window, the dark-only theme is hard to read, and the phone's own light setting is ignored. And there is no way to play the story as a visual novel, one line at a time with the speaker large on screen. The bigger picture is what makes Expressions and Reference images worth having.

## Solution

Three looks, none of which changes what a Chat is:

1. **Backdrop.** Per Story, the author picks what sits behind a Chat's Messages: nothing (as today), the Story's Cover, or the Chat's newest Snapshot. It is dimmed and softly blurred, so every line stays readable in either theme.
2. **Light theme.** Settings gains a theme choice per device: Dark (today's), Light, or Match phone. The whole app follows, with every text colour meeting WCAG AA in both themes. First, a prefactor moves every hard-coded colour into tokens.
3. **Visual novel view.** A per-device toggle in the Chat's top bar shows the Chat one part at a time:
   - the speaking Character's Expression (or Reference image) large over the Backdrop, and their words in a box below;
   - narration in the box with no picture;
   - tap to go on.
   It works while a reply streams, with Continue, Again and Reply versions, with Snapshots, and with Read aloud. The thread stays the source of truth: the view only shows the same Messages another way.

## User Stories

### Backdrop

1. As an author, I want to choose a Backdrop for my Story's Chats (none, the Cover, or the Chat's newest Snapshot), so that each Story has its own mood.
2. As an author, I want the choice on the Story editor's Style tab, saved like every other field, so that I find it with the Story's other looks.
3. As an author, I want a new Story to have no Backdrop, so that nothing changes until I choose one.
4. As a player, I want the Backdrop dimmed and softly blurred behind the thread, so that the lines are easy to read over any picture.
5. As a player, I want lines, narration and the composer to stay readable over the brightest and the darkest picture, in dark and in light, so that a Backdrop never costs readability.
6. As a player, I want "newest Snapshot" to mean the newest one still in this Chat's thread, so that the Backdrop shows where this story is now, not a moment an edit or Reset took away.
7. As a player, I want the Backdrop to change when I take a new Snapshot, so that the scene behind follows the story.
8. As a player, I want a Chat with no Snapshot yet to show the Cover instead, and a Story with neither to show no picture, so that the choice never leaves a broken image.
9. As a player, I want the Cover's focus point respected, so that the Backdrop shows the part of the picture the author chose.
10. As a player on a PC, I want the Backdrop to fill the Chat area beside the side rail, with the reading column and the docked Memory drawer over it, so that the wide screen shows the picture.
11. As an author, I want Duplicate Story to keep the Backdrop choice, so that a copy looks the same.

### Light theme

12. As a user, I want a Theme setting with Dark, Light and Match phone, so that I can read comfortably in any light.
13. As a user, I want the theme kept on this device only, like the text size, so that my phone and my PC can differ.
14. As a user, I want Dark to stay the default, so that the app looks as it always has until I choose.
15. As a user, I want Match phone to follow the phone's light or dark setting as it changes, so that the app turns dark at night by itself.
16. As a user, I want the right theme from the first frame, with no flash of the other one, so that opening the app at night never blinds me.
17. As a user, I want every text, icon and Character colour to meet WCAG AA in both themes, so that the light theme is as readable as the dark one.
18. As a user, I want Character colours that read well on a light page, so that names stay distinct in both themes.
19. As a user, I want the phone's status bar and browser chrome to match the theme, so that the app looks whole.
20. As a user, I want pictures, Snapshots and the Snapshot viewer to keep their dark stage in both themes, so that images are framed as before.
21. As a user, I want the offline page to follow the phone's setting, so that it matches when the API can't be reached.

### Visual novel view

22. As a player, I want a button in the Chat's top bar that switches between the thread and the Visual novel view, so that I can play either way.
23. As a player, I want the view I chose remembered on this device for every Chat, so that I don't switch each time.
24. As a player, I want the view to show one part at a time, so that each line gets the whole screen.
25. As a player, I want the speaking Character shown large: their Expression for the line's emotion, else their whole Reference image, else their initial on their colour, so that I see who is talking and how they feel.
26. As a player, I want narration shown in the box with no picture, so that the story's voice reads apart from the Characters.
27. As a player, I want my own lines shown in the box under the name I wore, so that the conversation reads both ways.
28. As a player, I want the speaker's name in their Character colour above their words, so that it matches the thread.
29. As a player, I want to tap anywhere on the stage, or press Space, Enter or →, to go on, so that reading is effortless.
30. As a player, I want a back control (and ←) to step back one part, across Messages, so that I can re-read what I missed.
31. As a player, I want a long part to scroll inside the box, so that nothing is cut off.
32. As a player, I want long narration split by paragraph, one step each, as the thread splits it, so that steps stay short.
33. As a player, I want the view to open on the newest reply's first part, so that I pick up where the story is.
34. As a player, I want switching back to the thread to scroll to the Message I was reading, so that I don't lose my place.
35. As a player, I want a Snapshot of a Message to come up as its own step after that Message, filling the stage, so that pictures appear at their moment.
36. As a player, I want a tap on a Snapshot step's Open button to open the Snapshot viewer, so that I can see it full and act on it as in the thread.
37. As a player, I want the composer under the stage as in the thread, so that I can write without switching back.
38. As a player, when I send, I want to see my line and then the reply as it is written, so that the view feels live.
39. As a player, I want to read a streaming reply at my own pace, with a writing indicator when I reach the end of what has arrived, so that I'm never pushed ahead.
40. As a player, I want Continue, Again and ‹ n/m › Reply versions on the newest reply's last step, so that I can steer the story from the view.
41. As a player, I want Again or choosing another version to show the new reply from its first part, so that I read the take I asked for.
42. As a player, I want Edit to take me to the thread with that Message open for editing, so that editing stays in the one place built for it.
43. As a player, I want Reset to show the Opening's first part, so that the view starts over with the Chat.
44. As a player, I want a Snapshot being drawn to show as a small "Drawing a Snapshot…" chip, so that I know it is coming.
45. As a player, I want the rollback notice, errors, Retry and the background notice shown as in the thread, so that nothing is hidden in this view.
46. As a player, I want the Memory drawer, Dashboard and every menu item to work the same from this view, so that it is a full way to play.
47. As a player listening with Read aloud, I want the view to show the part being read and move on with the audio, so that I can watch and listen together.
48. As a player, I want ▶ in the box to read from the shown part to the end of its Message, so that I can listen from where I am.
49. As a player on a PC, I want the stage in the reading column with the Backdrop across the Chat area and the Memory drawer docked as usual, so that the view suits a wide screen.
50. As a player using a screen reader or keyboard, I want the box announced as it changes and a real Next button, so that the view is usable without seeing the screen.
51. As a player with reduced motion on, I want no slide or fade between steps, so that the view is calm.

## Implementation Decisions

### Colour tokens (prefactor)

- Every colour in the web app's `.css`, `.ts` and `.tsx` files (the app, components and lib folders) becomes a token on `:root`. That covers about 86 literals across the global stylesheet, the CSS modules and a few components: notices, toasts, pills, chips, banners, events, field errors, the confirm warning, the Gallery's "earlier" mark, the status box, the cover badge, the Snapshot placeholder. It also covers the literals in TypeScript: the Character colours in the colour helper (`lib/character-colour.ts`, below), the placeholder Cover gradients in the Home helper (`lib/home.ts`), and the Cover upload's canvas fill (`lib/cover.ts`).
  - New tokens are named by role, for example `--notice-surface`, `--notice-line`, `--toast-surface`, `--toast-line`, `--ok-surface`, `--ok-text`, `--event`, `--error-text`, `--caution-text`, `--quiet-fill`.
  - Four kinds of literal stay literal. They are the same in both themes and are commented as such:
    - picture scrims (black overlays on images, the Snapshot viewer's black stage);
    - PWA metadata (the manifest and the root layout's `themeColor`);
    - the placeholder Cover gradients of a Story with no Cover: they stand in for a picture, framed and labelled as one, so they keep their dark hues in both themes as pictures do;
    - the Cover upload's canvas fill behind a see-through PNG: it is baked into the stored JPEG, so it must not depend on the theme of the device that uploaded it.
- **Character colours** become tokens `--character-1` … `--character-8` and `--character-neutral`, plus `--on-character` for an initial drawn on one.
  - The colour helper returns `var(--character-n)` rather than a hex, so SVG and CSS both follow the theme.
  - Nothing that needs a literal colour value uses them today (the one canvas, the Cover upload, fills with a fixed dark colour, above). If something does, it reads the computed style.
- **No visual change in dark.** Every token keeps today's value.
- **The contrast check** moves from the Friendly UI folder into the web app's scripts. It reads its token values for both themes from one table, which must match the global stylesheet, and runs `node <script> dark|light [--fail]`.
  - Its pairs are renamed from literals to the new tokens.
  - It gains the Backdrop pairs (below).
  - The Friendly UI copy is left as a historical record. The ticket notes the move.

### Light theme

- **Choice:** per device (`devicePreference`, key `storytell.theme`), one of `dark | light | system`, default `dark`. It goes in a Settings card "Theme" above Text size, as a three-way segmented control: "Dark", "Light", "Match phone".
- **Applying it:**
  - The root `<html>` carries `data-theme="dark|light"`, the resolved theme.
  - The preference is in `localStorage`, which the server can't read, so the server-rendered HTML can't carry the theme (the root layout renders a bare `<html lang="en">`). Instead a small blocking inline script in the root layout's head reads the preference (safely, defaulting to dark), resolves `system` with `matchMedia('(prefers-color-scheme: light)')`, and sets the attribute and the `theme-color` meta before first paint and before hydration, so no frame shows the other theme.
  - A client effect keeps both in step when the preference or the phone's setting changes. `<html>` is marked to ignore the hydration difference that attribute makes.
  - Check this Next version's docs for inline head scripts before writing it (apps/web/AGENTS.md).
- **CSS:** `:root` keeps the dark values and `color-scheme: dark`. `:root[data-theme='light']` overrides every token, with `color-scheme: light`, so form controls and scrollbars follow. No component changes beyond the prefactor's tokens.
- **Light values:** the contrast check is the gate, at 4.5:1 for text and 3:1 for icons and non-text, on every pair. A starting palette:
  - page `#f6f4fa`, surface `#ffffff`, raised surface `#ece8f4`;
  - text `#1d1828`, muted `#585070`, faint `#6c6486`;
  - accent text `#5b3fd9`, accent fill `#6a4ff0` under white;
  - line `#d9d2e6`;
  - danger `#b3243a`, warning text `#8a5a00`.
  - Character colours are darker versions of the dark set's hues.
- **Out of the theme:** the Snapshot viewer's black stage and picture scrims stay dark in both themes. The offline page repeats the light tokens under `@media (prefers-color-scheme: light)`, since it can't run the app's script. The manifest's colours stay dark: they only colour the splash screen.

### Backdrop

- **Schema:** `story.backdrop` (enum `none | cover | snapshot`, default `none`), one migration.
  - `PATCH /api/stories/:storyId` accepts `backdrop`. A value outside the set is a 400 validation error.
  - The Story response gains `backdrop`.
  - Duplicate copies it.
  - The Story assistant and drafting don't set it.
- **Editor:** the Style tab (where the Narration voice and the Story's Saved replies and Replace rules cards also sit, per [integration](../sillytavern-gaps/integration.md)) gets "Chat backdrop", a three-way choice: "None", "Cover", "Newest Snapshot". The hint reads "Dimmed behind the Messages. Without a Snapshot yet, the Cover shows."
- **Which picture:** a pure web helper `backdropOf(story, snapshotsOfChat)` answers `{ src, focus } | null`:
  - `none` → null.
  - `cover` → the Story's Cover (its picture and focus), else null.
  - `snapshot` → the newest Snapshot of this Chat that is still in the thread (it has a Message), else the Cover, else null.
  - It uses data the Chat page already loads: the Story, and the Chat's Snapshots, which the screen refreshes after a Snapshot finishes.
- **Drawing it:**
  - A fixed layer behind the Chat screen, covering the Chat area: the whole viewport on a phone, and the viewport minus the side rail from 1024px.
  - The picture is `object-fit: cover` at the focus point, blurred about 3px, under an overlay of the page colour (`--backdrop-dim`, about 85% opacity, per theme).
  - The top bar, Scene strip and composer keep their own surfaces. User bubbles and Character bubbles are unchanged. Narration, speaker names and timestamps sit on the dimmed picture.
  - The Memory drawer, sheets and dialogs keep opaque backgrounds.
- **Readable:** the contrast check adds `--text`, `--muted`, `--accent` and the Character colours over the overlay on a pure white and on a pure black picture, in both themes. The overlay strength is whatever makes every one of those pass. The blur is decoration, not counted.
- **Performance:** one image element, with no per-frame work. The blur is a static CSS filter.

### Visual novel view

- **Toggle:** an icon button between the title and ⋯ in the Chat top bar, labelled "Visual novel view" with `aria-pressed`. It holds a per-device preference (`storytell.chatView`, `thread | novel`, default `thread`).
- **The steps:** a pure web helper `novelSteps(input)` turns the Chat into steps, from the same data the thread renders: the Messages, the pending User line, the streaming reply, a reply being replaced, the Chat's `onAi` Replace rules, and the Chat's Snapshots in thread order. Each step has a stable key so the position survives the list growing:
  - **Shown text:** as in the thread ([Saved replies and Replace rules](../saved-replies-and-replace-rules/spec.md)), the rules are applied to each AI part's text, stored or streaming, **before** it is split into steps: a narration part before its paragraphs are split (so a rule can remove a whole paragraph, and its step with it), a speech part before `*…*` becomes italics. Names are never touched. Every step holds shown text, and a step's paragraph index counts the shown text's paragraphs.
  - **User Message** → one `user` step: the identity name and text, with no picture.
  - **AI Message part** → narration gives one `narration` step per paragraph, and speech gives one `speech` step (Character id, speaker name, text, emotion).
  - **Snapshots of a Message** → one `snapshot` step each, after that Message's last part.
  - **The streaming reply** → its parts so far as steps, keyed as live steps, and replaced by the stored Message's steps when the turn settles. The key maps live part n to stored part n, so the position holds.
  - **A reply being replaced by Again** is left out, as the thread hides it.
- **The stage:**
  - The Backdrop, or the plain page when there is none.
  - For a `speech` step, the picture is bottom-centred, as tall as about 60% of the stage, `object-fit: contain`. It comes from the shared line-picture helper of [Expressions ticket 03](../expressions/issues/03-judge-tags-emotions.md), asked for the **whole** picture rather than the round crop: the Expression for the emotion, else the whole Reference image, else a large initial on the Character colour.
  - A `narration` or `user` step shows no picture.
  - A `snapshot` step shows the Snapshot filling the stage (`contain`), with an "Open" button that opens the Snapshot viewer as the thread's thumbnail does, and no box.
- **The box:**
  - It spans the bottom of the stage, on the surface colour.
  - It holds the speaker name in their Character colour (none for narration, which is italic as in the thread; the user's identity name for a `user` step), then the text with `*actions*` in italics as the thread does.
  - At most about 40% of the stage's height, scrolling inside.
- **Going on and back:**
  - The stage is one big Next button: a tap, Space, Enter or → goes to the next step. A drag that scrolls the box is not a tap.
  - A small "‹ Back" button in the box's corner, or ←, goes back one step.
  - At the last step, Next does nothing more. On the newest AI Message's last step, the box shows the action row instead: ‹ n/m ›, ↺ Again, 📷 Snapshot, then ▶ Read aloud after them as in the thread's row (it arrives with ticket 06), and "Edit in thread". ไทย and ⑂ Branch stay in the thread.
  - With reduced motion, steps change with no transition. Otherwise a short cross-fade of the picture.
- **Where it opens:** the first step of the newest AI Message, or the newest step when there is no AI Message after the user's line. Switching to the thread scrolls to the Message of the step on show.
- **While playing:**
  - **Send:** the view moves to the user's line, then to the reply's first part once it arrives.
  - **Streaming:** when the user is on the last step and a new step arrives from a turn started in this tab, the view moves to it once. After that the user taps at their own pace. Next past the last arrived step shows the writing dots in the box until the next step arrives, then shows it.
  - **Continue and Retry:** as Send, without the user line.
  - **Again or choosing a Reply version:** the view goes to that Message's first step.
  - **Reset:** the Opening's first step.
  - **"Edit in thread":** switches to the thread with that Message's Edit open.
- **Everything else is shared:** the composer (with rollback notice, errors, Retry and the background notice), the top bar and its menu, the Memory drawer (docked on a PC), the Snapshot sheet and viewer, the Character profile (a tap on the large picture opens it). Snapshot jobs in flight show as a chip "Drawing a Snapshot…" at the stage's top corner, and a failed one as "Snapshot failed" with the existing Retry in the composer's notice.
- **Read aloud:** the player lives on the Chat screen, so it keeps playing across a view switch.
  - Read aloud speaks the shown text, split as these steps are, so its items line up with them. When it reads a Message, the view shows the step of the item being read: the step of the item's `partIndex`, and for narration the step of the item's `paragraph` (its index among the shown text's paragraphs). Several items of one step (the `*action*` spans and words of one line, or a long paragraph split in two) all show that step. It moves on as the audio does.
  - ▶ in the box reads the shown step's Message from that item.
  - Auto-read works the same in both views.
- **Accessibility:**
  - The box is an `aria-live="polite"` region.
  - The Next and Back buttons have labels, and the large picture has the Character's name as its alt text.
  - Focus stays on the stage between steps.
- **Desktop:** the stage and composer sit in the ~48rem reading column. The Backdrop spans the Chat area, and the Memory drawer docks as in the thread. The picture can grow to about 70% of the stage's height.
- **No API change.** The view reads only what the thread reads.

### Glossary

Uses `CONTEXT.md`'s Backdrop, Visual novel view, Expression, Portrait, Reference image, Snapshot, Reply version, Continue, Regenerate, Read aloud. "Theme" (dark, light or match phone) is used as a plain UI word.

## Testing Decisions

- Test external behaviour: what the API stores and answers, and what the Chat, Settings and editor show at 390px and at 1440px. The web has no unit-test runner, and adding one is a new dependency the brief asks to avoid, so the pure web helpers (`backdropOf`, `novelSteps`) are exercised through e2e scenarios that hit their cases.
- **Contrast check:** `--fail` passes for both `dark` and `light`, including the Backdrop pairs. It runs in the light-theme and Backdrop tickets' verification. It is not wired into CI: there is none.
- **API tests** (prior art: `story-authoring.spec.ts`, `story-duplicate.spec.ts`): `backdrop` defaults to `none`, round-trips, refuses an unknown value, and is copied by Duplicate.
- **e2e (Playwright, fake gateway; prior art: `settings.spec.ts`, `chat-reading.spec.ts`, `snapshots.spec.ts`, `streaming.spec.ts`, `reply-versions.spec.ts`, `folds-and-pictures.spec.ts`):**
  - **Theme:**
    - choosing Light sets the light theme at once and after a reload, with no dark first frame: the inline script has set the attribute before hydration (checked with an init script that records `data-theme` at `DOMContentLoaded`, before any React code runs);
    - Match phone follows an emulated `prefers-color-scheme`;
    - Dark is the default.
  - **Backdrop:**
    - Cover shows the Cover behind the thread;
    - Newest Snapshot shows the newest in-thread Snapshot, and a new Snapshot replaces it;
    - with no Snapshot it shows the Cover;
    - None shows nothing.
  - **Visual novel view, stored Messages:**
    - the toggle persists across reloads;
    - a reply with narration and two speakers steps narration (no picture), speaker A (their Reference image), speaker B (the initial when they have none);
    - Back returns;
    - a Snapshot step appears after its Message and opens the viewer;
    - switching to the thread scrolls to the Message shown;
    - with a tagged line and an Expression, the large picture is the Expression;
    - with an `onAi` Replace rule, the steps show the replaced text, and a rule that removes a narration paragraph removes its step.
  - **Visual novel view, while playing:**
    - a send shows the user line, then the streaming reply's first part;
    - Next past the arrived parts shows the writing dots, then the next part;
    - Again shows the new reply from its start;
    - ‹ n/m › works from the last step;
    - "Edit in thread" opens the Edit.
  - **With Read aloud:** reading a Message moves the shown step with the player's item, also with a Replace rule that changes or removes a paragraph; with auto-read on, a send plays the new reply and the view follows it.
  - **Desktop at 1440px:** the Backdrop spans the area beside the rail; the stage sits in the reading column; the docked Memory drawer leaves it usable.

## Out of Scope

- Custom CSS, theme files, colour pickers, fonts, or more than two themes.
- A per-Chat Backdrop choice, uploading a Backdrop picture, or the AI choosing one.
- Several Characters on stage at once, sprite positions, moving sprites, or animations beyond a short cross-fade.
- Editing a Message, Branch, Write for me or Suggested replies inside the Visual novel view's box. Those stay in the thread and the composer, which the view still shows.
- An auto-advance timer (Read aloud is the way to play hands-free).
- Server-side storage of the theme or the view.

## Further Notes

- **Blocking edges across features:**
  - The Visual novel view's stored-Messages ticket is blocked by [Expressions 03](../expressions/issues/03-judge-tags-emotions.md), which brings the shared line-picture helper (with its whole-picture output) and the `emotion` on speech parts, and by [Replace rules on AI Messages](../saved-replies-and-replace-rules/issues/04-replace-rules-on-ai-messages.md), which brings the Chat's `onAi` rules and the web's apply function.
  - The Read aloud follow-along ticket is blocked by [Read aloud 03](../read-aloud/issues/03-read-a-message-aloud.md), which brings the player and the items' `paragraph`, and by [Read aloud 04](../read-aloud/issues/04-auto-read-new-replies.md), which brings auto-read.
  - The light theme does not wait on either.
- The decision named the view's background "a Snapshot background". This spec uses the Backdrop instead, so the author's one choice drives both views, and a Story with no Backdrop shows the plain page in the Visual novel view.
- The picture in the Visual novel view is the **whole** Expression or Reference image (2:3), not the round Portrait square. Both are drawn at 2:3, so they stand naturally on the stage.
- Open question: should Match phone be the default theme instead of Dark? Recommended: Dark. It keeps today's look, and the user turns on Match phone once if they want it.
- Open question: should the Backdrop default to Newest Snapshot for new Stories? Recommended: None. Nothing should change until the author chooses, and many Chats have no Snapshot early on.

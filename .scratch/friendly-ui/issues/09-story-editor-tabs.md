# Story editor in tabs, with linked missing items and calmer fields

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Story editor variant D).

## What to build

Per the spec's "Story editor" section, except the Assistant, which is ticket 10.

- **Tabs:** Story / Style / Role / Characters / Bonds / Scenes. The selected tab is kept in the URL, and a dot marks any tab with a missing field.
- **Header:** back, the title with the save status, Assistant, and Play. Play is disabled unless the Story is playable.
- **Status box:** tapping a missing item switches to its tab, scrolls to the field, focuses it and highlights it.
- **Fields:**
  - a missing required field is marked "Needed to play"
  - ✨ rewrite sits in the label row (the existing call), with a spinner while it runs and a highlight when it lands
  - every field has a one-line plain hint
  - text boxes grow to fit, so the Opening is never clipped
  - POV, tense and reply length are segmented controls
- **Opening preview:** a sheet that renders the Opening through the Chat's Message rendering from ticket 01, plus Play.
- **Delete Story:** a quiet danger link at the bottom of the Story tab, with the existing confirmation.

## Acceptance criteria

- [x] Playwright at 390px: on a Story missing a Scene goal, tapping that item lands on the Scenes tab with the field focused.
- [x] Playwright: Play is disabled until the last missing field is filled, then enabled.
- [x] Playwright: the Opening preview shows the Opening's narration and named speech.
- [x] Playwright: a 12-line Opening is fully visible without scrolling inside its box.
- [x] The existing story-editor and story-draft e2e specs are updated.
- [x] The full suites pass.

## User stories covered

55–64, 68.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-09-editor-tabs-893b6e`, not merged.
  - **Tabs:**
    - `editor-tabs.ts` holds the six tabs and `placeOf`, which maps a missing item's field key to its tab and its input's DOM id.
    - Characters and Scenes are matched by position; their inputs are named by id.
    - The tab is kept in `?tab=` through `history.replaceState`, so reload and back return to it. The selected tab scrolls into sight in the bar.
    - A tab with a missing field has a dot, and its name says ", has missing fields".
    - The arrow keys, Home and End move along the tab bar.
  - **Header** (`editor-header.tsx`):
    - back, the title with the save status under it, ✨ Assistant (the old panel, unchanged, for ticket 10), and Play.
    - Play is `aria-disabled` until the Story is playable. A tap, long-press or hover then says how many fields are missing.
    - The header and tabs stick to the top.
  - **Status box** (`status-box.tsx`):
    - "N to fill in before you can play", with each item a link.
    - A link switches tab (`flushSync`), scrolls the field to the centre, focuses it, and lights it for 2.6s through `FieldMarksContext`.
    - "At least one Character" lands on Add Character.
  - **Fields** (`fields.tsx`, `fields.module.css`):
    - ✨ in the label row: the existing rewrite, spinning while it runs, and the field lights up when the answer lands.
    - Every field has a one-line hint.
    - An empty required field shows a "Needed to play" mark beside its label, linked as a description, so the field's name stays its label.
    - Textareas grow to fit their text, and refit on width and font changes.
    - POV, tense and reply length are radio-group segments.
  - **Bonds tab:** StartingBonds moved out of the Character card into `starting-bonds-card.tsx`, one card per Character.
  - **Delete Story:** a quiet danger link at the bottom of the Story tab, with the existing confirmation.
  - **Opening preview** (`opening-preview.tsx`):
    - A `Sheet` that first sends pending edits, then calls the new `GET /api/stories/:id/opening`.
    - The endpoint answers the stored Opening split by the Chat's own `parseReply` (guard off), the same call a new Chat makes.
    - The parts render through ticket 01's `MessageBody`, unedited, plus Play.
  - **Styles:**
    - All in CSS modules.
    - New tokens `--warning-surface`, `--warning-line` and `--warning-soft` are in `:root`.
    - The editor's old global rules (`.field-head`, `.field-changed`, `.add-bond`, …) are now unused but left in `globals.css`, so this branch doesn't edit that file beside parallel tickets. They can go in a later cleanup.
  - **Tests:**
    - API: 3 new "Opening preview" tests in `story-authoring.spec.ts`: narration and stamped speech with an unknown speaker; the guard off for a line as the Role; an empty Opening and a 404.
    - New `e2e/story-editor-tabs.spec.ts` (3 tests at 390×844 with touch):
      - a missing Scene goal: its link lands on the Scenes tab with the field focused and marked; the tab survives a reload; filling the field enables Play
      - the preview shows narration and named speech
      - a 12-line Opening has no inner scroll, also after a reload
    - Updated `story-editor`, `story-draft`, `story-assistant` (it clicks the tabs itself until ticket 10), `cast-changes` and `reference-image` (they open `?tab=characters`).
  - **Verified:**
    - `npm run typecheck` is clean.
    - `npm run test:api` passed 266/266 (20 files).
    - `npm run test:e2e` passed 31/31 on ports 3461/3462.
    - Screens were checked at 390px in screenshots.
  - **Review:** `/code-review` against master. Fixed:
    - Add Character not lit after a jump
    - the stale-answer race in the preview
    - a segment group unreachable by Tab when its value isn't an option
    - the rewrite props copied four times (now `FieldRewrites` with `rewritableField`)
    - the ✨ icon and arrow-key code duplicated
    - the hard-coded warning colours, now tokens
    - the "Bonds" names, now StartingBonds in code
    - naming

    Left as is:
    - `aria-disabled` on Play, so it can say why it's disabled
    - the tab label "Bonds", which is the ticket's own word
    - the Opening DTO in its own file, because the chat DTOs import the story DTOs
  - **Merge notes:**
    - Ticket 11 swaps the header's inline save `<p>` for its `<SaveStatus>`; the place is marked in `editor-header.tsx`.
    - Hand-over for ticket 10 is in the session notes (`friendly-ui-09-handover.md`).
  - **Not done:** looking at it on the real Android phone, and measuring contrast with a checker; both are by hand per the spec.

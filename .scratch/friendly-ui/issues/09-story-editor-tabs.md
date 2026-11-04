# Story editor in tabs, with linked missing items and calmer fields

Type: task
Status: ready-for-agent
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

- [ ] Playwright at 390px: on a Story missing a Scene goal, tapping that item lands on the Scenes tab with the field focused.
- [ ] Playwright: Play is disabled until the last missing field is filled, then enabled.
- [ ] Playwright: the Opening preview shows the Opening's narration and named speech.
- [ ] Playwright: a 12-line Opening is fully visible without scrolling inside its box.
- [ ] The existing story-editor and story-draft e2e specs are updated.
- [ ] The full suites pass.

## User stories covered

55–64, 68.

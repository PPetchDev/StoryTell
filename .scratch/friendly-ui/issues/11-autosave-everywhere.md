# Autosave for Memory, Personas and Settings

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)

## What to build

- **Reuse the editor's autosave hook and save-status component** for Memory adds and edits in the drawer, Persona name and description, and Settings.
- **The Save buttons go.** Each page shows the same "Saving… / Saved / Couldn't save: <reason>" in its header.
- **Settings' numeric fields** save once they hold a valid value. An invalid value shows its error and isn't sent.
- **A failed save keeps the typed text.**

## Acceptance criteria

- [x] Playwright: edit a Persona's description, reload, and see the change kept, with no Save button on the page.
- [x] Playwright: the same for a Memory edit and for a Settings change.
- [x] Playwright: when the API fails a save, "Couldn't save" shows and the text stays.
- [x] The existing memory, personas and settings e2e specs are updated.
- [x] The full suites pass.

## User stories covered

69–71.

## Comments

- 2026-11-05: **Built and verified** on branch `claude/friendly-ui-11-autosave-16de97`, not merged.
  - **Shared pieces, kept in `components/story-editor/`** so ticket 09's imports don't move:
    - `autosave.ts`:
      - `queue` is generic now (types only).
      - New `cancel(key)` drops a field edit still waiting to be sent, once the field holds a value that must not be saved.
      - Exports the `Autosave` type.
    - New `save-status.tsx` (`SaveStatus`) is the header line the editor already showed. The editor uses it too.
  - **Memory drawer:**
    - The status sits in the drawer header. Edit opens the text and Known-by fields, which save as you type, with Done to close.
    - "Add a Memory" opens the same form: its first save with text adds the Memory and later saves edit it. The Memory stays out of the list until the form closes.
    - Emptied text shows an error and isn't sent.
    - Done closes only once everything has saved. After a failed save it stays open with the text and tries once more.
    - `MemoryDrawerProps` is unchanged, for ticket 03.
  - **Personas:**
    - Every card is an open Name and Description form that saves as you type.
    - "New Persona" makes a Persona named "New Persona" at once and focuses its name. The button is disabled while that runs.
    - An empty name shows an error and isn't sent.
    - The status sits in the page header.
  - **Settings:**
    - The models save on change.
    - Numbers are held as typed and save once valid: percents are whole numbers from 0 to 100, pools are USD to the cent. An invalid value shows its error and isn't sent, and neither is the valid one typed just before it.
    - The Drift warning shows while the play model differs from the one the page opened with.
    - The text-size card is untouched.
  - **Tests:**
    - New `e2e/autosave.spec.ts` at 390px with touch. Persona description, Memory edit and add, and a Settings change are each kept after a reload with no Save button. A failed save shows "Couldn't save: <reason>" and keeps the text, for a Persona and for a Memory, where Done keeps the editor open.
    - The settings test types an out-of-range value in steps. A mutation check confirmed it fails when the waiting save isn't cancelled.
    - `memory`, `personas` and `settings` specs are moved to the new UI at phone width.
  - **Verified:**
    - `npm run typecheck` is clean.
    - `npm run test:api` passed 263 of 263.
    - `npm run test:e2e` passed 33 of 33.
    - `/code-review` against master ran, and its findings are fixed.
  - **Not done / notes:**
    - When the API can't be reached, the existing hook reports it and leaves "Saving…" showing. That is unchanged hook behaviour, also in the editor.
    - The hook's "Unsaved changes" label, shown during the typing pause, is kept from the editor.
    - Leaving a fresh "New Persona" unrenamed keeps it under that name.
    - Not looked at on the real Android phone.

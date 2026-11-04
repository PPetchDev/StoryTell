# Autosave for Memory, Personas and Settings

Type: task
Status: ready-for-agent
Blocked by: 01
Part of: [Spec: Friendly UI](../spec.md)

## What to build

- **Reuse the editor's autosave hook and save-status component** for Memory adds and edits in the drawer, Persona name and description, and Settings.
- **The Save buttons go.** Each page shows the same "Saving… / Saved / Couldn't save: <reason>" in its header.
- **Settings' numeric fields** save once they hold a valid value. An invalid value shows its error and isn't sent.
- **A failed save keeps the typed text.**

## Acceptance criteria

- [ ] Playwright: edit a Persona's description, reload, and see the change kept, with no Save button on the page.
- [ ] Playwright: the same for a Memory edit and for a Settings change.
- [ ] Playwright: when the API fails a save, "Couldn't save" shows and the text stays.
- [ ] The existing memory, personas and settings e2e specs are updated.
- [ ] The full suites pass.

## User stories covered

69–71.

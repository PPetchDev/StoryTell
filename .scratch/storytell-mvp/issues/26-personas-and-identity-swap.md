# Personas and swapping identity mid-Chat

Type: task
Status: ready-for-agent
Blocked by: 24
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **App-level Personas** (Name and Description only): create, read, update, delete.
- **Swap identity.** In a Chat, the user can swap the worn identity between the Story's Role and any Persona at any time. The swap is Chat state and is never rolled back by an edit; reset keeps it.
- **Effect of a swap.** The prompt's identity block, the stop strings and the guard all use the worn identity's name and description. Bonds toward the user carry over, so they stay keyed to the user, not the Persona.
- **Stamped names.** Each User Message stores the worn identity as a reference and a stamped name. Old Messages keep their stamped name after a Persona is renamed or deleted.
- **Deleting a worn Persona** falls its Chats back to the Role.

## Acceptance criteria

- [ ] API tests:
  - after a swap, the prompt carries the Persona and not the Role
  - the guard cuts lines written as the Persona's name
  - an edit doesn't undo a swap, and reset keeps it
  - renaming or deleting a Persona leaves old stamped names intact
  - deleting a worn Persona falls the Chat back to the Role
- [ ] Playwright: swap to a Persona mid-Chat and see the next User Message under the Persona's name.

## User stories covered

43–47.

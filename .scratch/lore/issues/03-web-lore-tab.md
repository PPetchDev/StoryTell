# Lore tab in the Story editor and Lore in play in the Memory drawer

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Lore](../spec.md)

## What to build

A Lore tab after Scenes: one card per entry (name, keywords, text, Always include, remove) and Add Lore entry, all autosaved. The assistant sheet labels Lore changes. The Memory drawer lists the Lore in play.

## Acceptance criteria

- [x] e2e: an entry added in the Lore tab autosaves and survives a reload; after a turn that mentions it, the Memory drawer lists it.
- [x] Typecheck, unit tests and the whole e2e suite pass.

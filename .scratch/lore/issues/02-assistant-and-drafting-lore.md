# Story assistant and drafting write Lore

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Lore](../spec.md)

## What to build

The `lore` target in the assistant's change set (set, add, remove; no removal confirmation), the Lore in the Story the assistant reads, and up to 8 `lore` entries in a draft.

## Acceptance criteria

- [x] API tests: the assistant adds, sets (including `keywords` and `alwaysOn`) and removes an entry; an unknown entry is an invalid change set; a draft with Lore creates its entries.

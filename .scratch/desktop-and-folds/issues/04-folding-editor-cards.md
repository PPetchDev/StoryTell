# Story editor: folding Character, Starting Bond, Scene and Lore cards

Type: task
Status: done

Each card's header gets a fold button; keys `character:<id>`, `bonds:<characterId>`, `scene:<id>`, `lore:<id>`. The fields stay in the page while folded (hidden). A jump to a field unfolds its card. A folded card with a needed field says "Needs filling in". The Character header shows the avatar.

## Acceptance criteria

- [x] All four card kinds fold, unfold and remember.
- [x] A missing item's link and an assistant change into a folded card unfold it and land on the field.
- [x] e2e: fold a Character card, reload, still folded; jump from a missing item unfolds it.

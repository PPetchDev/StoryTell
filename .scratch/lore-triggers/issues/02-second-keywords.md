# 02 — Second keywords and the More triggers fold

**Status:** done

**What to build:** An author can give a Lore entry second keywords with a mode, "Also needs one of" or "Unless one of" (spec: "The Lore entry", "Matching"). They only filter an entry whose name or keyword came up, and are looked for in the scanned Messages, any extra scan text and the text of entries already chosen, by the keyword rule. A failed condition puts the entry in Lore in play's left-out list with the `condition` reason ("needs one of: night" / "not with: last year"). The Lore card gets the **More triggers** fold (spec: "The Lore card in the editor"):

- closed by default;
- its open state kept per device in the web's fold store under `loreMoreOpen:<id>`, present while open. The store keeps only folds that are not in their starting state; every fold so far starts unfolded, this one starts folded, so its key means "open". The store's comment says so, and the fold's title reads the key that way through an option, leaving the card folds untouched;
- its header reading "More triggers" and the spec's summary, or "None";
- the foot line saying changes apply to the whole Chat as if they had always been so.

This ticket puts only the Second keywords field and its mode inside, so its summary pieces are "Also needs: night, storm" and "Unless: last year"; later tickets add their fields and pieces in the spec's order. Columns `secondary_keywords` and `secondary_mode` in a migration with defaults; the DTO, the Story response and Duplicate Story carry them.

**Blocked by:** [01 — Lore in play says why each entry is in](01-lore-in-play-says-why.md)

- [ ] Existing entries behave as before (defaults: no second keywords, mode `alsoNeeds`).
- [ ] Second keywords are cleaned like keywords (trimmed, blanks and repeats dropped; at most 20 of at most 100 characters).
- [ ] Pure tests: both modes; a second keyword found in a scanned Message and in a chosen entry's text; a Thai second keyword matches anywhere; second keywords alone never bring an entry up; the `condition` reason.
- [ ] API tests: CRUD carries both fields; Duplicate copies them; a turn leaves out an entry whose condition fails and Lore in play says so.
- [ ] The card folds behave as before: their keys still mean "folded", and a device with nothing stored shows every card unfolded and every More triggers fold closed.
- [ ] e2e (390px): More triggers is closed on a new card; opening it and setting second keywords and "Unless one of" autosaves and survives a reload, and the open state survives too; the header reads "More triggers" with "Unless: last year".

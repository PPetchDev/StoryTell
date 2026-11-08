# 03 — Patterns (regular-expression triggers)

**Status:** ready-for-agent

**What to build:** An author can give a Lore entry patterns, one per line in the More triggers fold, that bring it up like keywords (spec: "Matching"). Each is compiled case-insensitive, Unicode and multi-line, and tested against each scanned text as stored, so `^@Mira:.*silver` finds only Mira's lines. A pattern that matches is the trigger Lore in play shows. Recursion (a later ticket) searches entry text with the same patterns. A pattern that doesn't compile is refused on save with the new `InvalidLorePatternError` (next free `422.003.0NN`, listed in `docs/error-codes.md`), naming the pattern and the reason; the editor shows it under the Patterns field, keeps the typed text, and opens the fold if it is closed. Column `patterns` in a migration; DTO (at most 10, each at most 200 characters), Story response and Duplicate Story carry it; the summary gains "1 pattern" / "n patterns".

**Blocked by:** [02 — Second keywords and the More triggers fold](02-second-keywords.md)

- [ ] Pure tests: a pattern brings an entry up; case-insensitive; `^` matches at a line start inside an AI Message's `@Name:` text; a pattern's source is the `cameUp` trigger; second keywords still filter a pattern-triggered entry.
- [ ] API tests: a broken pattern is `InvalidLorePatternError` and nothing of that write is saved; limits are validated; Duplicate copies patterns; a turn whose scan matches a pattern carries the entry.
- [ ] e2e (390px): typing a broken pattern shows the error under Patterns; fixing it saves and survives a reload, and the header shows "1 pattern".

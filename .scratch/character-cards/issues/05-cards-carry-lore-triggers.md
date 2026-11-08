# 05 — Cards carry Lore trigger settings both ways

**Status:** ready-for-agent

**What to build:** Once Lore entries have their trigger settings ([Spec: Lore triggers](../../lore-triggers/spec.md)), import and export map them to and from the card's lorebook entries, so a lorebook keeps working as its author tuned it. Import:

- `secondary_keys` with `selective: true` → Second keywords; the mode from `extensions.selectiveLogic` (0 "and any" → Also needs one of, 2 "not any" → Unless one of; 3 "and all" → Also needs one of and 1 "not all" → Unless one of, each listed as approximated in the preview's "Won't come along");
- keys written `/…/flags`, or every key of a V3 entry with `use_regex: true` → Patterns (flags dropped, at most 10, each at most 200 characters; one that doesn't compile is left out and counted);
- `extensions.sticky`, `cooldown`, `delay` → Stays for, Rests for, Waits until (clamped to 0–50);
- `extensions.probability` with `useProbability` → Chance;
- the first label of `extensions.group` → Group;
- `extensions.exclude_recursion` → "Brought in by other entries" off.

Export writes the same fields back: `secondary_keys` with `selective` and `selectiveLogic` 0 or 2, patterns as `/source/i` keys (and V3 `use_regex: false`, since the plain keys are not regex; SillyTavern reads `/…/` keys as regex either way), `extensions.sticky`, `cooldown`, `delay`, `probability` with `useProbability`, `group`, `exclude_recursion`. The "regex keys" line leaves the preview's left-out list.

**Blocked by:** [04 — Export a Character as a card PNG](04-export-a-character-as-a-card.md), [03 — Preview a card and choose its greeting](03-preview-and-choose-the-greeting.md), [Lore triggers 07 — Groups](../../lore-triggers/issues/07-groups.md) and [Lore triggers 06 — Chance](../../lore-triggers/issues/06-chance.md) (every setting exists by then)

- [ ] Before starting, confirm SillyTavern's `selectiveLogic` numbers and the `extensions` key names against its source (the research file paraphrases them).
- [ ] Pure tests: each mapping both ways; clamping; a broken regex key left out and counted; the approximated modes listed; export then import keeps every trigger setting.
- [ ] API tests: a card with a sticky, grouped, 50% entry with second keys and a regex key imports with those settings; exporting it writes them back.

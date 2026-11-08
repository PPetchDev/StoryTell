# Lore entries: which SillyTavern World Info features to add

Type: grilling
Status: resolved
Blocked by: none

## Question

Which of World Info's extra controls, if any, should Lore entries gain?

## SillyTavern

Primary keys plus secondary keys with AND/NOT logic, regex keys, case and whole-word options, scan depth, recursion (an entry's text triggers other entries), insertion order and position (before/after character, at depth, around the Author's Note), trigger probability, inclusion groups, sticky / cooldown / delay timed effects, character filters, a token budget.

## Storytell today (checked 2026-11-08, `apps/api/src/manager/chat/lore/lore-select.ts`)

- Triggers: the entry's name and keywords, case-insensitive; a Latin trigger must start a word, a Thai one matches anywhere.
- Scan: the user's new message plus the newest 4 Messages (`LORE_SCAN_MESSAGES`).
- Always include, or triggered; one fixed position (start of the trailing system message, kept there for caching); cap ~1,500 tokens, entries that don't fit are skipped; order: always-on, then by how recently mentioned.
- So an entry drops out 4 Messages after its last mention, and an entry named only inside another entry's text never fires.

## Options (pick any)

- **Sticky** — a triggered entry stays for N more turns.
- **Recursion** — one level: entries named inside chosen entries' text come along.
- **Secondary keys / logic, regex keys, probability, cooldown/delay, insertion position, inclusion groups.**
- **None.**

## Recommendation

Later, and then only Sticky and one-level Recursion — they fix the two real blind spots above. The rest is tuning for prompt layouts Storytell doesn't have; insertion position would break the caching design.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: Lore entries gain **secondary keywords** (two modes: also needs one of / unless one of), **regex triggers**, **Sticky**, **Cooldown**, **Delay**, **Probability**, **Recursion** (entries named in the text of entries already chosen come along, a few steps deep, with a per-entry opt-out) and **Groups** (at most one entry per group per turn). Not insertion position — Lore stays in the trailing system message so the cached prefix holds — and no case/whole-word toggles (the existing word-start rule stays).

Spec and tickets: [.scratch/lore-triggers/](../../lore-triggers/spec.md).

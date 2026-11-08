# 04 — Entries brought in by other entries

**Status:** done

**What to build:** After the Always and came-up entries are chosen, the text of the chosen entries is searched for the names, keywords and patterns of entries not yet chosen, at most 3 steps deep (spec: "Recursion"). Entries found rank after the came-up ones, by step then position, and take what room is left under the cap; they still pass their second-keyword condition, looked for in the scanned Messages plus the chosen entries' text. Lore in play shows them as "brought in by <name>", naming the first chosen entry whose text did it. Each entry gets "Brought in by other entries" (Yes / No, default Yes) in the More triggers fold; No keeps it from being brought in, though it can still come up from the scan or be Always included. The summary gains "Not from other entries" when it is off. Column `recursable` in a migration; DTO, Story response and Duplicate Story carry it.

**Blocked by:** [03 — Patterns](03-patterns.md) (recursion searches entry text with patterns too)

- [ ] Pure tests: one step; a chain of three steps comes in, a fourth does not; the opt-out; the reason names the bringer; brought-in entries are cut by the cap before came-up ones; a brought-in entry already chosen is not added twice.
- [ ] API tests: a turn that mentions only entry A carries entry B named in A's text, after A in the block; with B's opt-out off it doesn't; Lore in play says "brought in by A"; Duplicate copies the flag.
- [ ] e2e (390px): switching "Brought in by other entries" to No autosaves and survives a reload, and the header shows "Not from other entries".

# 06 — Chance

**Status:** done

**What to build:** An entry's Chance (0–100%, default 100 = no roll) is the share of the times it would come in (Always, came up or brought in) that it actually does (spec: "Chance"). The roll is fixed per point: a number in [0, 100) from a SHA-256 hash of the entry's id, the point, and the text of the Message just before the point, passing when below the Chance. So Regenerate, choosing a Reply version, a reload, Lore in play, Suggested replies and Write for me all agree, and an edited Message rolls again. A staying entry is not rolled again during its stay; replayed past points roll the same way, so a stay that started on a lucky roll stays. Lore in play shows "· 40% chance" beside an entry in play below 100, and the left-out reason "lost its 40% chance". The More triggers fold gains "Chance … %"; the summary gains "40%". Column `chance` in a migration (default 100); DTO, Story response and Duplicate Story carry it.

**Blocked by:** [05 — Stays for, Rests for, Waits until](05-stays-rests-waits.md)

- [ ] Pure tests: the same Messages give the same answer on every call; a different text before the point can change it; 0 never goes in and 100 always does; a staying entry is not rolled again; over many points a 50% entry goes in roughly half the time (a loose bound, deterministic inputs).
- [ ] API tests: Regenerate gives the same Lore block for a Chance entry; Lore in play shows the chance and the `chance` left-out reason; Duplicate copies it.
- [ ] e2e (390px): setting Chance to 40 autosaves, survives a reload and shows "40%" in the header.

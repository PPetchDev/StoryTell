# 07 — Groups

**Status:** done

**What to build:** An entry can name a Group (at most 60 characters, compared ignoring case; blank = none). At most one entry per group goes in at a point: the first of the group in the selection order that passes its earlier checks, so a staying member keeps the group, otherwise an Always member wins, otherwise the one that came up most recently, position breaking ties (spec: "Groups"). The winner then takes its chance at the room like any entry; if it doesn't fit, no member of that group goes in. The others are left out with "the group <group> went to <winner>". The More triggers fold gains "Group" with a hint saying how the one is picked; the summary gains "Group: weather". Column `group_name` in a migration (default empty); DTO, Story response and Duplicate Story carry it.

**Blocked by:** [05 — Stays for, Rests for, Waits until](05-stays-rests-waits.md) (a staying member holds its group)

- [x] Pure tests: two came-up members, the more recent wins; equal recency, position wins; a staying member beats a newer mention; an Always member beats all; group names match ignoring case; a winner that doesn't fit leaves the group empty; members brought in by recursion compete too.
- [x] API tests: a turn mentioning two members of a group carries only the winner; Lore in play lists the loser with the `group` reason; Duplicate copies the group.
- [x] e2e (390px): two entries in one group, both mentioned in a turn; the Memory drawer shows one in play and the other in the left-out fold; the header shows "Group: weather".

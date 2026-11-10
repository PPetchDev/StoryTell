# 08 — The Story assistant sees the trigger settings and keeps them

**Status:** done

**What to build:** The Story assistant's rendered Story shows, under each Lore entry with a non-default trigger setting, one line "More triggers: " followed by the exact summary the More triggers fold shows (spec: "The Lore card in the editor"), for example "More triggers: Also needs: night · 1 pattern · Stays 4 · 50% · Group: weather", so its advice takes them into account (spec: "Story assistant and drafting"). The assistant and AI field rewrites share the drafting module's rendered Story, so the line sits behind a new rendering option that only the assistant turns on: a field rewrite's prompt does not change. The assistant's prompt says trigger settings are set in the editor and lists only the fields it may set. Its `set` (name, keywords as the primary list, text, alwaysOn) and `add` never touch the new fields: a set keeps them, an add and a draft entry get the defaults. A `set` naming any new field stays an invalid change set.

**Blocked by:** [06 — Chance](06-chance.md), [07 — Groups](07-groups.md) (every setting exists by then)

- [x] API tests through the fake gateway: the assistant's rendered Story carries the summary line, in the fold's exact words, for an entry with settings and none for a default entry; a field rewrite's prompt for the same Story has no summary line; a `set` of keywords keeps second keywords, patterns, Sticky, Chance and Group; a `set` of `sticky` is an invalid change set; an `add` and a draft's entries have every default.
- [x] A pure API test pins the summary for the spec's all-settings example, word for word; the web's header shows the same words (checked by the e2e of tickets 02–07).
- [x] No other prompt changes: the field rewrite and drafting prompts are byte-for-byte as before, and the existing assistant and drafting tests pass.

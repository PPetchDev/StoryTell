# 03 — Replace rules: store, check and manage

**Status:** ready-for-agent

**What to build:** Replace rules exist and can be managed, with nothing applied yet. App-wide rules in a "Replace rules" card in Settings, a Story's own in a "Replace rules" folding card in the Story editor's Style tab (beside ticket 01's "Saved replies" card; no new tab); each rule card has Find, Replace, the Regex / Ignore case / On AI Messages / On my Messages switches, up/down order buttons, Remove, and a "Try it" box. A rule that doesn't compile, matches empty text, or is too slow on the probe texts is refused at save with a plain reason shown under Find, and so is a rule on my Messages that would change its own result if run twice. Per the spec's "Replace rules: storage and API" and "Management UI": the `replace_rule` table, routes and reorder (with `InvalidOrderError` widened), the shared pure `applyReplaceRules` (API copy and web copy, one table of cases), the worker-thread checks, "Try it" run in a Web Worker, `replaceRules` on the Story response and the Chat detail, and Duplicate Story copying them.

**Blocked by:** 01 — Saved replies: store and manage (the Style tab's folding cards and the error domain)

Part of: [Spec: Saved replies and Replace rules](../spec.md)

- [ ] Migration adds `replace_rule` (nullable `story_id` with cascade, `find` untrimmed, `replace`, `regex`, `ignore_case`, `on_ai`, `on_mine`, `position`, `created_at`).
- [ ] CRUD and `PUT …/order` in both scopes; app-wide routes answer the list, per-Story ones the Story; limits and unknown ids refused with the spec's errors (listed in `docs/error-codes.md`).
- [ ] An incomplete reorder is `InvalidOrderError`, widened from `'Characters' | 'Scenes'` to Replace rules in both scopes with the spec's messages; its code and the existing messages are unchanged (API test for both scopes, and the existing Character and Scene reorder tests stay green).
- [ ] Save checks, each `InvalidReplaceRuleError` with its message: a regex that doesn't compile; a pattern that matches empty text; a pattern too slow in a worker thread with a 250 ms limit (e.g. `(a+)+$`); a rule with On my Messages on whose second run changes its own output (`cat` → `cats` refused, `colour` → `color` accepted; the same `cat` → `cats` accepted with only On AI Messages on). Switching On my Messages on for a saved rule runs the twice-run check. Normal rules save quickly.
- [ ] `applyReplaceRules` passes the spec's table of pure cases (plain literal `$`, ignore case, `$1` / `$<name>`, empty replacement, order, Thai, the 20,000-character guard, a throwing rule skipped) in the API's vitest; the table lives in one file the e2e reads too.
- [ ] The Chat detail carries `replaceRules` in apply order (app-wide, then Story), parked rules left out; Duplicate Story copies a Story's rules; deleting the Story removes them.
- [ ] Settings card and the Style tab's folding card: add, edit (autosave), switch, reorder, remove, survive a reload; a bad regex shows its error at once (web compile, which never runs the pattern) and a refused save shows the API's message under Find with the typed text kept.
- [ ] "Try it" never runs a pattern on the main thread: it runs the rule in a Web Worker terminated after 250 ms, showing "This pattern is too slow" on time-out; a new keystroke cancels a run still going.
- [ ] Management e2e (the web has no unit runner, so this is where the web copy is checked), as listed in the spec's Testing Decisions: add, edit, switch, reorder and remove in both places with a reload; the web compile error and a refused save's message; every single-rule case of the shared table typed into "Try it" shows the expected output; "Try it" on `(a+)+$` shows "This pattern is too slow" and the page stays responsive.
- [ ] Pure and API tests from the spec's Testing Decisions pass; typecheck and the existing suites stay green.

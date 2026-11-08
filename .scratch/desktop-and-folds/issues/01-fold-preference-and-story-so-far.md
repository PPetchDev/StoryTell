# Folds, remembered per device, starting with the Story so far

Type: task
Status: done

A per-device fold store (`storytell.folded`, a list of folded keys) and a fold button (chevron, `aria-expanded`). The Story so far card in the Memory drawer folds and unfolds and reopens the way it was left (key `storySoFar`, the same for every Chat).

## Acceptance criteria

- [x] Story so far has a header button that folds and unfolds it; its state survives a reload and applies to every Chat.
- [x] Blocked storage still folds for this tab.
- [x] e2e: fold, reload, still folded; unfold, reload, open.

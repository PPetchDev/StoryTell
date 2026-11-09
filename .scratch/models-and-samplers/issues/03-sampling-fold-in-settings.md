# 03 — The whole Sampling fold in Settings

**Status:** done

Part of: [Spec: Play models and Sampling](../spec.md)

**What to build:** Per the spec's "Settings page": the Sampling fold shows every parameter the chosen play model is offered, not just Temperature, and one tap undoes an experiment.
- Min-p, Top-p and Repetition penalty join Temperature, each only when the model is offered it, in the spec's order.
- Each field has its one-line plain explanation and, where the maker gives one, "Maker suggests 0.6".
- "Reset to defaults" clears every field of the model (the route with all four `null`), and is disabled while all are blank.
- Switching the Play model shows that model's values.

No API change: ticket 02's route and fields already carry all four.

**Blocked by:** [02 — Sampling reaches the play model, starting with Temperature](02-sampling-per-play-model.md)

- [x] Each offered parameter's field: blank meaning default, its explanation, the maker's suggestion where there is one, autosave with clearing sending `null`, and its range error inline.
- [x] A parameter the model isn't offered has no field.
- [x] "Reset to defaults" blanks every field and saves that; it is disabled while all are blank.
- [x] e2e at 390px: setting min-p and top-p saves and survives a reload; Reset blanks the fields; a model switch shows that model's (blank) values and switching back shows the first model's.
- [x] The existing Settings e2e stays green.

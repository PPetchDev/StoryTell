# 03 — A passed-by Scene moves on

**Status:** done

**What to build:** From the 20th reply in a Scene, the Judge may say the story passed the Scene by, and the Scene then moves on to the next one in order, ignoring its condition and gates. Follow the spec's "Passed by":
- the passed-by threshold as an app constant;
- the passed-by rule in the Judge prompt only at or past the threshold;
- `passed_by` in the output and the parser;
- in `apply-judgement`:
  - reject it under the threshold or in free play, logged;
  - `move_on` wins when both are true;
  - otherwise move to the next Scene, or to free play from the last one;
- the event "The story moved past {Scene}: {reason}";
- a `log` line with the reason.

**Blocked by:** [01 — Lingering Scenes](01-lingering-scenes.md) (the reply count), [02 — The Judge reads substance](02-judge-reads-substance.md) (the same prompt)

**Part of:** [Spec: Scenes that keep moving](../spec.md)

- [x] Pure tests:
  - the passed-by rule is in the Judge prompt only from the threshold;
  - the parser reads `passed_by`, and a missing one is false.
- [x] API tests, with a scripted Judge:
  - at 19 replies it is rejected and the Scene stays;
  - at 20 it moves to the next Scene, past an unmet condition and an unheld gate, with the event text;
  - `move_on` and `passed_by` together advance once;
  - from the last Scene it goes to free play;
  - the count starts again after an advance;
  - an edit rolls the move back;
  - a Branch keeps its own count.
- [x] Typecheck and the whole suites stay green.

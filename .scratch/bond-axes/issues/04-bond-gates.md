# 04 — Bond gates on Scenes

**Status:** done

**What to build:** An author adds Bond gates to a Scene in the Story editor. Each gate names a Character, toward whom, an axis, and the least level, picked by its word. The Scene moves on when every gate holds, together with its move-on condition when it has one. A gates-only Scene moves on by its gates alone. Follow the spec's "Storage" (`scene_bond_gate`) and "Bond gates and the Scene":
- the pure gate check;
- the check inside the judge's record, after this turn's Bond changes, with the advance's event naming the gates;
- "(gates only)" in the Judge prompt;
- the playable rule (a non-last Scene needs a condition or a gate);
- the gates in words on the Narrator's Scene line and in the Scene strip;
- `PUT .../scenes/:sceneId/gates` with its validation;
- `gates` on each Scene in the Story response;
- Duplicate copying the gates.

**Blocked by:** [01 — The Judge sets Bond levels](01-bond-levels-from-the-judge.md)

**Part of:** [Spec: Bond axes](../spec.md)

- [x] Pure tests: the gate check for each axis; toward the user and toward a Character; an unmeasured Bond does not hold.
- [x] API tests:
  - a Scene with a condition and gates waits for both;
  - a gates-only Scene advances in the same judgement that opens it, and the event names the gate;
  - a gate on an unmeasured Bond holds back;
  - gates API validation;
  - the playable rule;
  - Duplicate copies gates.
- [x] e2e at 390px: add a gate by its word in the Scene editor; it shows as "Waiting for: …" in the Scene strip.
- [x] Typecheck and the whole suites stay green.

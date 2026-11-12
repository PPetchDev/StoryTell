# 01 — The Narrator draws a lingering Scene toward its end

**Status:** done

**What to build:** Count the replies in the Chat's current Scene, and from the 8th the Narrator's Scene line asks the Characters to open the way toward the move-on condition and the gates, in character, without writing the user's part. Follow the spec's "Replies in the Scene", "Thresholds" and "The Narrator's Scene line":
- a pure reply count from the Chat's Messages and Scene advances (the Opening never counts; free play has none);
- the lingering threshold as an app constant;
- the lingering Scene line, for a condition, gates, and gates-only, with no numbers;
- the turn passes the count to the prompt, and so do Suggested replies, Write for me and any other reader of the Scene layer.

**Blocked by:** none

**Part of:** [Spec: Scenes that keep moving](../spec.md)

- [x] Pure tests:
  - the count with no advance, after an advance, and in free play;
  - the Opening is never counted;
  - the Scene line under and at the threshold;
  - the lingering line for a condition, gates and gates-only, with no digit.
- [x] API test: the turn prompt shows the calm Scene line with 7 replies in the Scene and the lingering line with 8; after a Scene advance it is calm again.
- [x] Typecheck and the whole suites stay green.

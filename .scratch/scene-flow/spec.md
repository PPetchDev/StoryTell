# Spec: Scenes that keep moving

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (Scene, Background judge), [Bond axes](../bond-axes/spec.md) (Bond gates)
Decided on 2026-11-11, after finding a dev Chat stuck in its first Scene for 43 replies. Terms: `CONTEXT.md` — Scene, Lingering Scene, Passed-by Scene.

## Problem Statement

A Scene moves on only when the Judge finds its move-on condition fully met and its Bond gates holding. When the story goes somewhere else, nothing brings it back, and the Scene never ends. In the dev Chat 2, the first Scene's condition was "The user tastes the milk and openly asks where the tribe keeps its cows". The user tasted the milk in the first exchange, but the story then went to the guest tent, a day at the stall and a lord at the fire. Nobody ever mentioned the cows again. After 43 replies the Scene strip still shows the first Scene, the later Scenes have never been reached, and the Narrator still says "Don't hurry toward it."

The Narrator doesn't know how long a Scene has lasted, and nothing tells it to open the way. The Judge reads the condition word for word, and it has no way out when the story has clearly passed the Scene by.

The user must never skip a Scene by hand, because that would skip the story. Scenes must keep moving by themselves.

## Solution

Three steps, in order of preference:

1. **The Narrator draws a lingering Scene toward its end.** From the 8th reply in a Scene, the Narrator's Scene line changes. The Characters now open the way toward the move-on condition and the gates, in-world and in character. Nara might offer to show the user where the herd grazes. The Narrator still never acts for the user. The user's part stays the user's to do.
2. **The Judge reads the condition for its substance.** A condition is met when what it describes has happened, even in other words or in a different order. Part of a condition met earlier still counts. Being strict about "fully happened" stays. Being strict about the exact wording goes.
3. **A passed-by Scene moves on.** From the 20th reply in a Scene, the Judge may also say the story has passed the Scene by: it went somewhere else so clearly that the condition can't happen soon. The Scene then moves on to the next Scene in order, even though its condition and gates weren't met. Its event says where the story went.

The user has no Move on button and never sees the reply counts.

## User Stories

1. As a player, I want a Scene to end by itself, so that the story keeps moving through its plan.
2. As a player, I never want to be able to skip a Scene, so that I don't miss the story by accident.
3. As a player, I want the Characters to give me openings toward a Scene's goal when it has gone on a while, so that the Scene's moment still happens.
4. As a player, I want those openings to come from the Characters in character, so that they feel like the story and not a nudge from the app.
5. As a player, I never want the Narrator to do my part for me, so that my choices stay mine.
6. As a player, I want a Scene to count as done when its moment happened in other words, so that I don't need to hit the author's phrasing.
7. As a player, I want a condition met in pieces over many replies to count, so that tasting the milk early still counts when I ask about the cows later.
8. As a player, I want a Scene the story has clearly left behind to move on after a long while, so that the story is never stuck forever.
9. As a player, I want a Scene to move on only to the next Scene in order, so that no later part of the plan is jumped over.
10. As a player, I want the event of a passed-by Scene to say where the story went instead, so that I understand what happened, and never to claim what did or didn't happen.
11. As a player, I want a short Scene to keep its old patience, so that early Scenes still get room to breathe.
12. As a player, I want an edit or a Regenerate to roll back a passed-by move, like any other Scene move, so that the story stays consistent.
13. As a player using a Branch, I want the reply count to follow the Branch's own story, so that each line of the story moves on its own.
14. As an author, I want my Scenes, conditions and gates unchanged in the Story editor, so that nothing new to fill in appears.
15. As an author, I want a Scene with Bond gates to be drawn toward its gates too, so that the feelings get their chance to grow.
16. As an author, I want a Scene whose gates never hold to still move on once the story has passed it by, so that a gate can't hold the story forever.
17. As the owner, I want the Judge's passed-by call logged with its reason, so that I can check it isn't too eager.

## Implementation Decisions

- **Replies in the Scene:**
  - The number of AI Messages since the Chat's current Scene began. That is after the Message of the latest Scene advance, or after the Opening when there is none. The Opening never counts.
  - It's a pure function of the Chat's Messages and its Scene advances, so it follows rollback, Branch and Reset with no new storage.
  - For the Narrator, it counts the replies before the one being written. For the Judge, it counts up to and including the reply being judged.
  - Free play has no count.
- **Thresholds**, as app constants:
  - **Lingering** starts once 8 replies are in the Scene before the reply being written.
  - **Passed by** is allowed once 20 replies are in the Scene, counting the one being judged.
- **The Narrator's Scene line** (`sceneLayer`):
  - **Under the lingering threshold:** unchanged ("Let that happen naturally… Don't hurry toward it…").
  - **Lingering:** it says the Scene has gone on a while. The Characters, in character, should now open the way toward the condition. They can bring up its subject, offer a reason or a chance, or move the scene toward where it can happen, each reply a little, without abandoning what is happening now.
    - The Narrator must never write the user's part of it.
    - When the Scene has gates, the line also asks for moments that let those feelings grow.
    - A gates-only Scene gets only the gates part.
  - It never mentions numbers.
- **The Judge's Scene rule:**
  - Met means what the condition describes has happened in substance by the end of the latest exchange, in any words. A part met in an earlier exchange still counts, and the Bonds and the story so far are in view.
  - These rules stay: "getting closer, about to, agreeing to later doesn't count", "when the condition names who must act, only that one counts", and "when in doubt, false".
  - The rule "A Scene is meant to last many exchanges" goes.
  - (Added 2026-11-14) The Current Scene section also shows the Scene's situation, as "What this Scene is about: …", when it has one. When the Scene also has a written condition, it adds that the condition is read as part of what the Scene is about: something that only fits its words, about another matter, does not meet it. Seen in dev Chat 2: "The user catches a real clue" in "Three Laps, No Cows", which is the hunt for the herd, was met by Tavri's hint about where to find river-stones for a gift. A Scene with no situation gets the section as before.
- **Passed by:**
  - From the passed-by threshold on, and only then, the Judge prompt's Current Scene section adds the passed-by rule.
  - (Added 2026-11-14) With the rule come two more lines:
    - A private interlude (a love scene, a night together, a meal, a bath, a rest) is not the story going somewhere else: the story comes back from it.
    - Where passing by goes. On a Scene with a next Scene, this shows the next Scene's name and situation, and says to set `passed_by` only when that Scene can begin from where the story is now, not when it needs a place, a season or an event the story has not reached. On the last Scene, it says passing by goes on in free play.
    - Seen in live Chat 2 on 2026-11-13/14: Breaking Camp, What the Keeper Would Lose and Toll at the River Bridge were passed by one after another, during the wedding night and the morning after. Each next Scene needed a road the story never took, so the Chat landed in the winter tithe barn while the story stayed at the summer market.
  - The output gains `"passed_by": false` and `"went_to": null` next to `move_on`.
  - `passed_by: true` means the story has clearly gone somewhere the condition can't happen soon, and nothing in the latest exchanges is heading back toward it. Then `went_to` must say, in one short sentence, where the story went instead, and nothing about what has or hasn't happened. (Changed 2026-11-12, see Further Notes; it was "the reason must say where the story went".)
  - `apply-judgement`:
    - a `passed_by` under the threshold, or in free play, is rejected and logged;
    - `move_on` wins when both are true;
    - a valid passed-by moves to the next Scene in order, ignoring the condition and the gates. At the last Scene, it goes to free play, as `move_on` does.
  - The Scene advance's event is "The story moved past {Scene name}: {went_to}". With `went_to` missing or blank it is just "The story moved past {Scene name}." It never falls back to the reason. It's a normal Scene advance in the ledger, so it's rolled back, branched and reset like any other. A `move_on` event is unchanged: it is the reason.
  - The passed-by decision and its full reason are logged at `log` level.
- **No new storage, API or UI.** The Scene strip and the Dashboard already show the current Scene and Scene advance events.

## Testing Decisions

- **Pure tests** (prior art: `bond-gates.spec.ts`, `bond-levels.spec.ts`):
  - the reply count with no advance, after an advance, and in free play, with the Opening never counted;
  - the Narrator's Scene line under and at the lingering threshold;
  - the lingering line with a condition, with gates, and gates-only;
  - the lingering line never contains a digit;
  - the Judge prompt has the passed-by rule only at or past the passed-by threshold;
  - the Judge output parser reads `passed_by` and `went_to`;
  - a passed-by event is "The story moved past {Scene}: {went_to}", or ends at the Scene name when `went_to` is missing or blank, and never holds the reason.
- **API tests** (prior art: the Scene tests in `judge.spec.ts`, `bond-gates-api.spec.ts`), with a scripted Judge:
  - `passed_by` at 19 replies is rejected and the Scene stays;
  - at 20 the Scene moves to the next one, ignoring an unmet condition and an unheld gate, and the event reads "The story moved past {Scene}: {went_to}", not the reason;
  - after an advance the count starts again;
  - at the last Scene it goes to free play;
  - editing the reply rolls the move back;
  - a Branch keeps the count of its own story;
  - the turn prompt shows the lingering line at 8 replies and the calm line at 7;
  - the fixture of Judge prompt text is updated only where the spec changes it.
- **No e2e is needed:** nothing in the UI changes. The existing Scene strip and dashboard specs must stay green.
- **No paid model calls.** Whether the Narrator really opens the way is checked by playing, not by tests.

## Out of Scope

- A Move on or Skip button, or any way for the user to move a Scene by hand.
- Per-Story or per-Scene thresholds, or thresholds in Settings.
- Jumping over several Scenes, choosing which Scene comes next, or branching Scenes.
- Showing reply counts, a progress bar or "lingering" anywhere in the UI.
- Rewriting authors' conditions, or a Story editor hint about conditions that only the user can meet.

## Further Notes

- The dev Chat 2 has 43 replies in its first Scene. Once this ships, its next turn lingers and passed-by is allowed straight away. If the Judge finds the story passed, the next reply can move it on.
- The thresholds are guesses tuned for Chats of a few hundred replies. They are constants, so they're easy to change after playing.
- **First live play, and a replay check (2026-11-12).**
  - Live: Chat 2 played two turns on this code (Messages 682 and 684, at 44 replies). Neither Judge passed Scene 1, though by 684 the story had moved on to Petch revealing his title and courting Nara.
  - Replay: the live Judge was re-run on those Messages with nothing written, for about $0.008 in all. The prompt held the passed-by rule and the Story so far both times.
  - Results:

    | Wording | 684 (story moved on) | 682 (walking to hear the truth) | Control: Chat 1 Message 591, building toward its condition, rule added by hand |
    |---|---|---|---|
    | Current rule | passed 3 of 3 | 1 of 2 | correct: 0 of 2 passed |
    | "about something other than the condition, even if it could still happen later" | 2 of 2 | 0 of 2 | not run |
    | "should now end; true unless the latest exchange brings the condition closer" | 2 of 2 | 0 of 2 | wrong: 2 of 2 passed |

  - Verdict: the current wording is kept. Neither stronger wording did better on 682, and the bluntest one passed a Scene that was still building. The live misses are call-to-call variance: the Judge sends no temperature, so the provider's default applies.
  - Each later turn gets another chance. The Judge temperature below came out of this check.
- **Judge temperature (2026-11-12).** The Judge now always sends temperature 0.3, required of the host. It never uses the user's Sampling. Every other background kind stays on host defaults. This replaces, for the Judge alone, models-and-samplers story 18 ("the Judge … keep[s] its defaults").
  - Tested by replaying 13 real Messages at the host default, 0.3 and 0, for about $0.022. Nothing was written. Historical Messages were judged against the ledger and Scene as they stood before them.
  - **Bonds:** at 0.3 the same change came back call after call. At the default, one Message gave none, then four. Another gave six, then one.
  - **Scenes:**
    - A clear passed-by case (684) passed 3 of 3 at 0.3 and at 0. At the default it moved 2 of 3, once by a wrong move_on: the cows were never asked about.
    - The control Scene, still building toward its condition, was never passed at any temperature.
    - In history, Chat 2 would have passed Scene 1 from about reply 33 at every temperature.
  - **Why not 0:** at 0 a live move_on (Chat 1 Message 543) was missed both times; at 0.3 and the default it was met 1 of 2.
  - **Arcs:** too rare in the sample to compare.
  - A host that stops taking the value fails the call as a plain outage. It never tells the user to reset Sampling: the value isn't theirs.
- **A passed-by event says only where the story went (2026-11-12).**
  - Seen in play: Chat 2 left Scene 1 by itself at Message 697 (Scene advance 22), and moving on was right. But its event read "The story moved past First Taste: The user has not yet tasted the milk or asked where the tribe keeps its cows. The conversation has moved to …". The first claim is false: the milk was tasted in the very first exchange.
  - Cause: the event reused the Judge's whole `reason`, and the reason restates which parts of the condition have or haven't happened. That restatement is unreliable. Here the Story so far had just been re-summarised from 4,352 to 1,846 characters, and the summary dropped the tasting.
  - Decision: the Judge's `scene` output gains `went_to`, one short sentence saying where the story went instead, asked for only when `passed_by` is true. The event is "The story moved past {Scene}: {went_to}", or "The story moved past {Scene}." when `went_to` is missing or blank. It never falls back to the reason. The log line keeps the full reason for debugging.
  - Out of scope here: the Story so far summariser dropping key facts such as the tasting. That is a separate issue, and the summariser is unchanged.

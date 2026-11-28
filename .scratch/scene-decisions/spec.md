Status: ready-for-agent (the user confirmed the real-Chat reading and said "build it", 2026-11-28)

## Result (2026-11-28, `test/live/scene-decision.live.ts`, 12 cases × 5 samples, NanoGPT, $0)

- **The Judge as it is (DeepSeek V4 Flash): 60/60.** It gave the same answer in every sample of every case.
- **Jev 1.14.**
  - At a 0.7 threshold it scored 60/60, but only just: "wrong person" sat at 0.54–0.63.
  - At 0.8 it scored 55/60, losing "asked, declined", which sat at 0.73–0.78.
- **Pplx-decider v1.2.**
  - At 0.8 it scored 60/60, but "joke" sat at 0.74.
  - It gives the same probability on every call.
- **`liquid/d1` and `kev-9b`:** 503 on every call.

### The fair round (asked by the user: did the first round favour the Judge?)

- **Question shapes were tuned on the 12 cases above, and the picks were fixed before the blind cases ran:**
  - Jev 1.14 asks one plain `noul` question, with a 0.7 threshold.
  - Pplx-decider v1.2 asks a four-way `choice` (happened, partly, not really, not yet), with a 0.55 threshold on `happened`.
- **20 blind cases.** A fresh agent that never saw the Judge prompt wrote 20 hard cases with their answers into `test/live/scene-decision-cases.json`:
  - 10 met and 10 not;
  - long chats of 6–7 earlier exchanges;
  - the condition done off-screen, by letter or by gesture;
  - a dream, a rehearsal, an interruption, a "what if" or sarcasm;
  - the wrong challenger, or the right act toward the wrong person;
  - one half of a two-part condition, or one vote short;
  - Thai.
- **Results:**
  - The Judge scored 100/100 and gave the same answer every time.
  - Jev (plain) scored 100/100. Its closest calls were a letter at 0.73 and a dream at 0.33.
  - Pplx (choice) scored 100/100, with no "no" case above 0.06 and no "yes" case below 0.97.
  - Jev (choice) scored 100/100 at any threshold from 0.5 to 0.8.
- **What the blind round shows.** The Judge agreed with every blind answer, so the first round's answers did not favour it. These cases cannot separate the three arms: all are right, and all are steady.

### Real Chats (the user's OK to send live Chat text to Jev and Pplx through NanoGPT with ZDR, 2026-11-28)

- **The cases.** Live Chats 1, 3 and 4 were copied into `.data/scene-decisions/`: every judged AI Message in a Scene with a condition, 902 in all. The Judge's own past moves serve as its answers.
- **The arms:**
  - Jev (plain) at 0.7 and Pplx (choice) at 0.55;
  - one sample each;
  - the latest exchange plus the 2 before it.
- **Caveats:**
  - Story 1's conditions are from the backup taken before today's edit.
  - Story 5's conditions are the current ones, and some may have been reworded after the Judge's move (Hunted's "a cottage does not count" reads like a later fix).
  - Two of the Judge's moves were passed-by moves, which are not the condition being met.
- **Agreement.** Both models agree with the Judge on about 870 of the 902 exchanges.
- **The 22 where both models disagree with the Judge the same way, as I read them (labels for the user to confirm):**
  - **The Judge moved too early or wrongly; the models said no:**
    - chat1 #365: Mirelle revealed who he is, but the condition needs the user to tell it;
    - #421 and chat3 #1246: Tavri only decided or invited, she did not tell yet;
    - #543: not all the elders agreed, and the letter is unsealed;
    - chat3 #1198: the user only joked;
    - chat4 #1961: the move came at a cottage;
    - borderline: #395, #1192, #2019, #2407.
  - **The Judge was late; the models saw the condition met 1–3 turns earlier:**
    - #52 and #54: Morra's respect;
    - #332, #334 and #335: the cuffs bound;
    - #522, #524 and #526: the fire story began;
    - chat3 #1709: the Judge moved only at #1852;
    - chat4 #2479 and #2481: Rin decided.
  - **The models were wrong:**
    - chat1 #48: the tasting happened before the 2-exchange window;
    - chat4 #1957: the cottage at the forest's edge.
  - **Passed-by moves, where the models are rightly no:** chat3 #1110 and chat4 #2508.

On real Chats the decision models look better than the Judge: fewer false moves and fewer late ones. Their two misses come from a short context window, so they need more of the Scene's story.

### Before that

Neither decision model is more accurate than the Judge, and the Judge was already steady on these cases. By the rule below, `move_on` stays with the Judge. The idea comes back only when a case turns up where the Judge swings or is wrong, for example from a real Chat. Real Chat text going to TypeSafe or Perplexity, even through NanoGPT with ZDR, needs the user's OK first.

# Scene move-on by a decision model

## Problem

The Judge answers about twelve things in one JSON reply every turn. Its answers swing from call to call, and parts of the reply have been dropped before (Chat 2 gave no details in 30 judgements in a row). Whether the Scene moves on is the decision with the most effect on the story, and it comes from one sampled `move_on` boolean.

## Solution

A decision model answers whether the current Scene's move-on condition has fully happened. It gives a probability, and the Scene moves on above a fixed threshold. The Judge stops answering `move_on` whenever the decision model can be asked. Decision models only pick between given answers and write no text. This is the first Judge field to move; each later field moves only after it wins its own eval.

## Build (decided after the real-Chat round)

- **The models.** Pplx-decider v1.2 is asked first, with the four-way `choice` question. A Scene's condition is met when `happened` is at least 0.55. If that call fails, Jev 1.14 is asked the plain `noul` question, met at 0.7. If both fail, the decision fails.
- **What the decision model reads.** The same as the Judge:
  - the Scene's name, situation and condition;
  - the story so far;
  - the Judge's recent messages (`JUDGE_CONTEXT_MESSAGES`);
  - the latest exchange.

  The real-Chat round gave the models only 2 exchanges, and both of their misses came from that.
- **The Judge prompt is unchanged.** Its system message stays cached, and it still answers `passed_by` and `went_to`. Its `move_on` is overridden while a decision model answers:
  - when the decision model says met, the Scene moves on, and the event text is the condition;
  - when it says not met, the Judge's `move_on` is set to false.

  Taking `move_on` out of the prompt would save little: the Scene section and `reason` stay for `passed_by`.
- **No decision is asked for** in free play, in a gates-only Scene, or on an Epilogue.
- **The gateway.** It gains `decide({ kind: 'scene_decision', state, servedFor })`:
  - it answers `{ met, probability, model }`;
  - it answers `null` when no host in the text chain serves decision models (only NanoGPT does);
  - it throws when every decision model fails.

  The usage record names the model (`pplx-decider-v1.2` or `jev-1.14`) on host `nanogpt` at $0, with its input tokens.
- **The outcomes in the Judge:**
  - `null` leaves the Judge's own `move_on`;
  - a throw makes `move_on` false this turn and logs a line;
  - an answer replaces `move_on`.
- **The fake gateway** answers `null` unless a decision is scripted, so the Judge tests keep the Judge deciding.

## Facts (2026-11-28, NanoGPT, made-up text)

- NanoGPT serves decision models at `POST /api/v1/decisions`.
  - The body holds `model`, `state` (text or JSON), `questions` (named; each one `choice`, `noul` or `score`), and `provider`.
  - A `noul` question answers `{ "noul": p }`, the probability that it is true.
  - Only input tokens count, against the Weekly allowance, at $0 per call.
- Included in the subscription and taking `provider: { zdr: true }`:
  - `typesafe/jev-1.14`: 64K context, answered in 0.5 s;
  - `typesafe/jev-1.13`;
  - `perplexity/pplx-decider-v1.2`: 27B, 262K context, answered in 0.5 s.
- `liquid/d1` and `jaredpalmer/kev-9b` answered 503, so their ZDR is unknown.
- Refused ZDR: `eu-jev/eu-jeff-*`, `subq/*`, `kev-4b` and `vllm-sr/*`.
- Not included in the subscription: Bison, Groundhog, Mercury, Clef and Luna decisions.

## Decisions

- **Which question.** Only `move_on` moves. `passed_by` and `went_to` stay with the Judge, because `went_to` is written text.
- **Shape.** One `noul` question asks whether the move-on condition has fully happened, in substance, by the end of the latest exchange. The state is:
  - the Scene's name, situation and move-on condition;
  - the recent exchanges;
  - the latest user message and reply.
- **Threshold.** A fixed constant in code, starting at 0.8 and tuned by the eval. Stories have no setting for it.
- **The Scene-change event text** is the Scene's move-on condition, since that is what just happened. It replaces the Judge's `reason`.
- **When the decision model fails** (an error, a busy NanoGPT, or a used-up allowance), the Scene does not move this turn. The next turn asks again.
- **When NanoGPT can't be used** (it is not in `TEXT_HOSTS`, or the caller may not use it, such as a future Member), the Judge prompt keeps `move_on` and the Judge decides, as today.
- **Gates.** Bond gates are checked in code as today. A gates-only Scene never asks the decision model.
- **No new term.** For the user it is still the Judge moving the Scene on; which model answers is an implementation detail.

## The eval (before any app code)

- About a dozen synthetic move-on cases, each with a known answer, in the bookshop setting used by the other evals. They include:
  - the condition met in other words;
  - the condition promised but not done;
  - the condition done by the wrong person;
  - the condition refused;
  - the condition only imagined;
  - half of a two-part condition;
  - a user line in Thai.
- **Three arms:**
  - the Judge as it is (DeepSeek V4 Flash on NanoGPT, its real prompt and parser, reading `move_on`);
  - Jev 1.14;
  - Pplx-decider v1.2.
- `liquid/d1` and `kev-9b` join when they answer and take ZDR.
- Each case runs five times on every arm. The report gives each arm's accuracy and each decision model's probabilities, so the threshold can be chosen.
- A decision model replaces the Judge's `move_on` only when it is at least as accurate and steadier.

## Out of scope

- Moving any other Judge field.
- Decision models off NanoGPT, such as Jev on OpenRouter.
- A threshold set per Story.

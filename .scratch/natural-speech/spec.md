# Spec: Natural speech

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the turn prompt, the reply parser, the history a turn reads)

Built 2026-11-16, from the user's report on their live Chat 2 ("วิธีการพูดของตัวละครไม่เหมือนคนเลย มันแปลกมาก": the way the Characters talk is nothing like people, it's very strange).

## Problem Statement

The Characters talk like a script, not like people. In the user's Chat 2 (553 Messages, DeepSeek V4 Pro), the latest replies showed three habits:

- Stage directions inside nearly every speech line: `Nara: *her voice cracking between indignation and disbelief* That is not—`. The rules forbid it and the final instruction repeats it ("even where earlier turns had them"), yet every reply did it.
- Speeches built from the tics of written dialogue: lists of three ("I can hear you breathing. I can hear you thinking. I can hear every single blade of grass…"), "not X, it's Y" turns ("No. My revenge is worse."), chains of rhetorical questions ("Do you think…? Do you think…?"), a punchline in every line, and feelings named outright in full sentences.
- Every bystander chiming in with a quip every turn, like a sitcom audience.

## Solution

- **The history reads clean.** Earlier replies reach a turn's prompt with each speech line's spoken words only: `*asterisk asides*` and (parenthesised directions) are taken out, and a line left with no words is dropped. What is kept and shown is untouched. The habit was being taught by the history: hundreds of replies doing it outweighed any rule. An earlier guard (`withoutStageDirections`) already cleaned the history, but only of the `*(…)*` form the asides had when it was written; Chat 2's asides are the plain `*…*` form, and every one went through.
- **Sharper rules for talk.** The Dialogue rules say how people talk (mostly short, plain sentences; they react before they explain, understate, change the subject, leave things unsaid, rarely name their own feelings, and don't make speeches), name the tics to avoid (lists of three, sentences opening the same way, "not X, it's Y" turns, strings of rhetorical questions, a punchline in every line), and say that bystanders don't remark on every moment and nobody chimes in just to be funny. The final instruction ends: "Keep the speech plain and natural, the way people actually talk."

## Implementation Decisions

- The cleaning applies to every history a turn or Suggested replies read, not to the transcript, Read aloud, the Judge or Memory extraction, which read what was written.
- The rules change is in the system message's Dialogue layer, so the cached prefix is rebuilt once.

## Testing Decisions

- API (`apps/api/test/natural-speech.spec.ts`): the cleaning as pure logic; through HTTP, a reply with an aside is shown as written while the next turn reads it clean, with the new rules in its prompt. The tests that pin the final instruction follow its new last sentence.

## Out of Scope

- Rewriting what is already stored, or moving an aside into narration on screen.
- A per-Story setting for how stylised the dialogue may be.

## Further Notes

- **Seen with the real model on 2026-11-16** (DeepSeek V4 Pro, as live; dev, on a copy of Chat 2's Messages 513–550, with the same message the user sent at 551). Chat 2's own reply to it had stage directions in two of its three speech lines, and the copied stretch had them in 17 of 111. With the fix, three replies (that message twice, then a new one) had none in any of their seven speech lines. Fewer bystanders spoke (one or two a reply, none chiming in for a joke), and the lines read more like talk ("You wouldn't." / "Tavri. Breathe."). Some lines still ran long and quippy (one of 46 words with a threat about a grandmother's wedding night): better, not cured. One run each, so a feel, not a measure.
- **Judged on the user's own play, the same day** (Chat 2, five replies after the deploy). No stage directions in any of 15 speech lines, and only the Character the scene was about spoke. But every reply still ran sentences that open the same way ("I had a whole speech ready. I had stages. I had a sequence."; "You're going to watch. You're going to wait."): the history is full of them, as it was of asides, and they can't be cleaned out of it. The final instruction, read last, now says it with an example: "Say each thing once: no run of sentences that open with the same words, as in ..., and no lists of three."
- **The rule read last did not stop it** (checked the same day on a copy of Chat 2's newest stretch). DeepSeek V4 Pro still wrote "I loved you when… I loved you when… I loved you when…" and "You don't get to… You don't get to…", and GLM-5.3 "you don't touch, you don't talk, you don't do the forehead thing". The stage directions stay gone; this habit is not reached by instructions, and the history keeps teaching it. Left open then; see below.
- **Shown, not only named; measured side by side** (2026-11-16; the user: "ฉันอยากให้มันเหมือนคุยกับมนุษย์มากที่สุด", as close to talking with a person as it can be, or people won't play). A meter counts runs of sentences in a speech line that open with the same words, and clauses in one sentence that do ("always reaching, always tugging, always breaking"); it got 8 of 8 hand-picked examples right, plain talk ("Tavri. Breathe.") included. Chat 2's own last 21 replies had 23. On a copy of Chat 2's newest stretch, two turns each on DeepSeek V4 Pro ($0.168 in all):
  - the code as it was: 4 in 188 spoken words;
  - the Dialogue rules with four written-then-spoken examples ("I had a whole speech ready. I had stages. I had a sequence." against "I had a whole speech ready. Stages and everything. You were going to beg."): 1 in 107, and the lines read like talk ("None of that. No squeezing, no rushing. Hands open.");
  - those, with the history cleaned of the habit as it was cleaned of asides: 3 in 160, no better;
  - those, with a repetition penalty of 1.1: 0 counted, but the habit stayed in forms the meter misses ("I suppose… I suppose") and the words went odd ("bend iron hinges with that crow bar of yours").
  The examples are kept; the history cleaning and the penalty are not. Two turns each: a direction, not a measure. The habit is fewer, not gone.

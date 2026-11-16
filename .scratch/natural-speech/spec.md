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

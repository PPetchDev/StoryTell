# Plain talk first, habits second

Status: ready-for-human
Builds on: [Line repair](line-repair.md), [Spec: Cache and voices](../cache-and-voices/spec.md) (the closing reminder of how each Character talks), [Spec: Prompt eval run](../prompt-evals/spec.md)

Written 2026-11-23, from live Chat 1 (Story 5, 101 replies of GLM-5.3) as the user had played it.

## What the Chat showed

Measured over the 101 replies:

- **No phrase repeated** across the last 40 replies, and speech in quotation marks stopped half-way through the Chat (110 lines in the first half, 6 in the second, all of them a quotation inside speech). The earlier fixes hold.
- **Replies run long.** The Story asks for 150 to 350 words; the mean was 349, with 34 replies over 350 and 8 over 400. The model writes to the top of the range.
- **Catchphrases as tics.** "For the record" and "I want it noted" in 15% of replies, from two Characters. The closing reminder told the model to "keep each one sounding like this in every line", and it took the voice's marks as something every line needs.
- **The vague "something"** ("weighing something", "something lower") in 53% of replies, 14 of the last 20. A comparison ("like a…") in 51%. The repeated-phrase finder cannot see either: it looks for runs of four words.
- New turns of phrase were settling in over the last 20 replies ("low and…" five times, "by a fraction" four), not yet repeated enough to be named by the finder.

## The user's rule

Of everything a Character says, about seven lines in ten are plain, natural talk and about three in ten carry their habits of speech.

A model does not count lines, so the number is there to set the proportion, with two rules it can check itself against: never the same habit in two lines running, nor in two replies running.

## Does it work against Personality?

It could, as first worded. The first draft counted "a favourite kind of joke" among the habits. Tamsin's card makes her "playful, mischievous" with a Voice that is "quick, teasing" and "nicknames everyone"; read against that draft, her teasing itself would be a habit to ration to three lines in ten, and she would go flat in the other seven.

So the rule is drawn narrower, and says so:

- **It is about set phrases only:** a catchphrase, a pet word, a running bit, a stock phrase. Things that are the same words each time.
- **Personality is in every line**, the plain ones too. A plain line is what *this* person would say, not what anyone would: a teasing Character teases in plain words.
- **What a card gives as constant is rhythm, not a habit:** a stammer, a drawl, formal speech, nicknames for everyone, a verbal ending. It stays in every line.

The `habit` eval scene checks both sides: the catchphrase in at most one line, and the lines still sounding like the Character (graded on her speech lines alone).

## What changed in the turn prompt

- **Dialogue rules** (the standing system message; the prompt cache restarts once): "Plain talk first, habits second", with the seven-and-three proportion and the two rules. And "Name things": no "something" standing in for what the narration won't name, and at most one comparison a reply.
- **The closing reminder** of how each Character talks: their rhythm and word choice are in every line; their catchphrases and running bits are not, and show in about three lines in ten, never twice running. A halting or formal voice is rhythm, so it stays in every line; "for the record" is a catchphrase, so it does not.
- **Reply length:** the range's top is named as "a ceiling, not a target", with most replies near the middle.

## How it is measured

Two eval scenes, and one tightened:

- `habit`: a Character whose card and whose last three replies carry a catchphrase in every line. Passes when the catchphrase is in at most one of her lines.
- `plain`: a quiet moment that invites vagueness. Passes with at most one "something" and at most one comparison.
- `length`: the scene now also requires the prompt to hold the ceiling sentence.

## Not done

- No finder for single overused words or constructions across replies (the "something" kind). The rule is words in the prompt only; if the eval shows it does not hold, the finder is the next step.
- Not measured against a real model yet: the eval run spends credit and waits for the user's word.

## First run against GLM-5.3 (2026-11-23)

Five scenes (habit, plain, length, voice, drift), five samples each: $0.030 in 40 calls.

- **habit:** after a history with the catchphrase in every one of her lines, it was in 7 of 19 lines across the five replies: 37%, against the three in ten asked for. Never in two lines running. The check ("at most one line a reply") passed 3 of 5; the two that failed had it in 2 of 4 and 2 of 5 lines. The check is stricter than the rule and was left as written.
- **Still herself:** "sounds like Mira" passed 5 of 5 in habit, voice and drift, graded on her speech lines alone. Fewer catchphrases did not flatten her.
- **length:** 211 to 282 words in the length scene, and no reply of the run over 287, where live Chat 1 averaged 349.
- **plain:** no comparison in any of the five replies; "something" 0, 2, 1, 1, 1 times.
- Not shown by this run: how it holds over a long Chat with four Characters, where the tics grew. The scenes are short and have one Character.

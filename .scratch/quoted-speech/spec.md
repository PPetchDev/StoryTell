# Spec: Speech written as prose

Status: ready-for-agent
Builds on: [Natural speech](../natural-speech/spec.md), [Visual novel view](../chat-looks/spec.md), [Reading in the Visual novel view](../novel-reading/spec.md)

Asked 2026-11-20, about Chat 1 of The Moonfox of Selvaria on live: "การพูดของตัวละครมันแปลกนะ ทำไมมันมีคำอธิบายท่าทางมาด้วยล่ะในบทพูดอ่ะ" (the Characters' speech is odd: why does it have descriptions of gestures inside it?). Then: "แก้เลยเมย์ แต่จริงๆ ถ้าการพูดแบบนี้เอาไว้ใช้ใน mode novel ก็ดีนะ" (fix it; but this way of talking would be nice in the novel mode).

## Problem Statement

GLM-5.3 wrote a Character's turn the way a novel writes dialogue, on one `@Name:` line: `"Going, going." She leans on the fence post. "Sleep well, Rin."`. That was 49 of the Chat's 110 speech lines, from its first reply. The parser takes the whole line as speech, so:
- the action shows inside the speech bubble;
- Read aloud reads it in the Character's voice;
- the history the next turn reads keeps the habit, so the model goes on doing it. The Natural speech cleaning only takes out `*asides*` and `(directions)`.

Other Chats had few such lines: GLM 7 of 1,169 and Pro 12 of 1,290. This Story's Opening is all prose, with its speech in quotes inside the narration.

## Solution

- **The parser splits a speech line written as prose.** A speech line that opens with a quotation mark (`"` or `“`) is split at its quotes:
  - the quoted words are speech lines of the same Character, with the quotes taken off;
  - the text between them is narration.
  - A line that only quotes someone mid-sentence (`She told me, "Wear them."`) does not open with a quote, so it stays as written.
  - Every piece between the quotes must read as narration about someone: it opens with `She`, `He`, `They`, `Her`, `His`, `Their`, `It`, `Its`, `A`, `An`, `The`, `Another` or a word of the speaker's name. Otherwise the whole line stays as written. On live a Character also opens by echoing your words and goes on talking (`"Can't give you both." Listen to you…`), or puts punctuation after a quote (`"IT'S HUGE"! He said…`).
  - Replayed over every speech line on live (2026-11-20): 46 lines of Chat 1 of The Moonfox of Selvaria split, and none of the 3,103 lines of the other Chats.
- **The history reads stored lines split.** Replies stored before this reach the prompt split the same way, so they no longer teach the habit. What is stored and shown for them is unchanged.
- **The rules say it.** The Dialogue rules and the closing instruction (turn and Epilogue) say:
  - speech has no quotation marks;
  - no narration goes inside it, not even between two of its sentences.
- **The Visual novel view reads it as a novel.** A Character's lines with a short narration beat between them are one step: `“Going, going.” *She leans on the fence post.* “Sleep well, Rin.”`, with the beat in italics.
  - A beat is one paragraph of at most 240 characters.
  - The thread still shows the lines and the beat apart, and Read aloud still reads them in their own voices.

## Implementation Decisions

- **Splitting.** The split runs inside the reply parser, so it covers every way a reply is parsed: the turn, its streaming, an edited AI Message, the Opening and Reach-outs.
  - `“` always opens a quote and `”` always closes one; a straight `"` does whichever is due.
  - An unclosed quote, from a line still streaming or a model's slip, is speech to its end.
  - Each piece stands on its own:
    - a trailing `,` `;` or `:` becomes `.`;
    - narration starts with a capital;
    - narration with no letter in it (a dash between two quotes) is dropped.
  - Narration that ends up next to narration merges, as the parser already merges it.
- **The joined step.** The Visual novel view's speech step carries `partIndexes` when it shows several parts. Read aloud finds that step from any of them.

## Testing Decisions

- API (vitest): pure tests of the split, the parser and the history; one turn through the fake gateway, which stores a prose line as speech and narration and checks that the rules are in the prompt (`test/quoted-speech.spec.ts`). The tests that quote the rules were updated.
- Web: the pure steps test (`e2e/novel-steps.spec.ts`) joins a beat between one Character's lines, leaves a long beat and other speakers apart, and finds the joined step for Read aloud.

## Out of Scope

- Rewriting the parts stored on live before this. Chat 1 of The Moonfox of Selvaria keeps its 49 mixed lines until the user says to split them.
- Changing the Book (a chapter per Scene), which already reads as prose.

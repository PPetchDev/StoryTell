# Spec: Story quality (Established facts and Repeated phrases)

Status: ready-for-human
Builds on: [Spec: Place, Weather and Outfits](../info-box/spec.md) (the detail records Facts join), [Spec: Character minds](../character-minds/spec.md) (Goals, the last kind added the same way), [Spec: Prompt cache](../prompt-cache/spec.md) (what goes in the standing system message and what in the closing user message), [Line repair](../natural-speech/line-repair.md) (repetition found in code)

Built 2026-11-18, from live Chat 2 as played on 2026-11-17.

## Problem Statement

1. **Facts drift.** Within one day of play Nara said she had sold at the stall for "nine summers", "twenty summers" and "six summers". She is "twenty-six", and "three days married" sat beside "four nights". The story so far, the Memories and the history each hold some of these, and the model picks a different one each time. Nothing says which one is true.
2. **The same beats, reply after reply.** Consecutive replies reuse the same phrases: "I had a whole speech ready" in three replies in a row, "her tail wraps around my wrist" in nearly every reply. The Rules already say "Don't repeat the same details turn after turn", but a rule about repetition in general does not tell the model *which* words it keeps reusing.

## Solution

- **Established facts.** A Chat keeps a short list of its canon facts: numbers, ages, how long something has lasted or how long ago it was, dates, names, and who is related or married to whom ("Nara's age: twenty-six"; "Nara's years at the stall: nine summers"). The Judge records them as the story states them, and changes one only when the story itself changes it. The Narrator reads the list every turn, told that it wins over anything earlier that disagrees.
- **Slips.** When a reply states a listed fact differently and nothing in the story changed it, the Judge keeps the fact and records a slip. The next turn reads, with the facts, what the last reply got wrong, so the model does not echo it.
- **Repeated phrases.** Before each turn, code finds the phrases of four or more words that appear in two or more of the last four AI replies, leaving out names and phrases made only of common words. When there are any, one short line before the final instruction names them and says not to use them again in this reply.

## Implementation Decisions

### Established facts

- **Why canon facts recorded by the Judge, not a Memory-consolidation step.** The conflicting numbers are not only in Memories: they are in the Story so far and in the history the model reads word for word, which no consolidation of Memories can fix. What fixes them is one place that says which is true and is read after all of them. The Judge already reads every exchange with the Story so far and the recent story in view, already keeps per-reply records the ledger rolls back, and costs nothing extra to ask (one more field in a call it already makes). A consolidation step would be a new model call, would run only now and then, and would leave the history contradicting it.
- **A fact is a detail record** (`detail_change`, kind `fact`), like a Goal: `value` is `"topic: fact"`, the newest record of a topic wins, an empty fact drops the topic. So Regenerate, Edit and choosing another Reply version take a fact back with the reply that set it, Reset clears them and a Branch copies them, with no code of their own. A **slip** is a detail record too (kind `slip`, `"topic: what was said"`), recorded against the reply that slipped; the turn reads only the slips of the newest AI Message before it, so a slip is read once, by the next turn, and goes with its reply. One migration adds both kinds to the check.
- **Topics are matched loosely** (case, punctuation and a leading "the" aside), so the Judge can change a fact by naming its topic as listed.
- **The Judge's section** goes in its user message, after the exchange (like the details section), so its system message never changes: the facts as they stand, then the rule, asking for `"facts": [{"topic", "fact"}]` and `"slips": [{"topic", "said"}]` at the top level of its JSON.
  - Record a lasting, checkable fact the latest exchange states that is not listed yet, or that the story itself changes (time moves on, someone openly corrects it, the user's own words state it otherwise).
  - Only what a later reply could get wrong: never feelings, plans, events, or what someone is doing or wearing now.
  - When a fact is not listed yet but the Story so far or the recent story stated it differently before, record what was said first and give a slip: a Chat already under way (live Chat 2) is seeded with the earliest telling, not the latest.
  - At most four new or changed facts a turn; at most 40 facts in a Chat (a new topic past that is dropped, a changed one is still taken). A topic is up to 60 characters, a fact up to 120.
  - A slip needs a listed topic, or one the same answer first records (a fact seeded from an earlier telling, which the reply then told differently), a "said" that differs from the fact, and no change to a listed topic in the same answer.
- **Where the Narrator reads them: the closing user message, in its trailing blocks, after the Author's note and before "Where things stand"**, under `# Established facts`. Not the standing system message, although facts change rarely, for two reasons:
  - *Cost.* A change to the standing system message makes the next turn uncached: about 10k tokens at $1.30 per million instead of $0.10, about $0.012. In the closing message the list is never cached, but it is small: 40 facts at about 15 tokens is 600 tokens, about $0.0008 a turn at its largest, and a Chat's list starts empty. Facts are set most often early in a Chat and after each new thing learned, so even one change in fifteen turns costs more up top than every turn down here.
  - *Weight.* The facts must win over the Story so far, the Memory layer and the history, which all come before the closing message. Read after them, last but for the reminder and the instruction, they do. That is where the Rules sentence about sexual moments had to move for the same reason (prompt-cache spec).
  - The block keeps one place and one heading from turn to turn; its words change only when a fact does.
- **The Story so far trigger reserves the block's room**, as it does for the Author's note.
- **No UI in this change.** The user cannot see or correct a fact yet; a wrong fact can be undone only by Regenerate or Edit of the reply that set it. See Further Notes.

### Repeated phrases

- **Found in code, pure** (`speech/repeated-phrases.ts`), from the last four AI Messages the turn's history holds (the Opening counts; on a Regenerate the reply being replaced is not in the history, so it does not count).
- **Words**: each reply is split at sentence ends, dashes, colons, semicolons and line breaks, with `@Name:` prefixes and `*(stage directions)*` removed, so a phrase never runs from one sentence into the next. Words are compared in lower case without punctuation (apostrophes kept).
- **A repeated four-word run** appears in two or more of the replies and holds at least two words that are neither common words (articles, pronouns, prepositions, auxiliaries and a few everyday verbs such as "look", "say", "know") nor a Character's or the worn identity's name. "Nara looks at Petch" or "I don't know what" is never flagged; "her tail wraps around" is.
- **A phrase is at least five words** (two repeated runs in a row). Run over dev Chat 2's 84 replies, four-word phrases put a line on 58 of 82 turns, mostly places a story rightly names again ("at her tent flap", "on the flat stone", "side of the fire"). With five, 34 of 82, and what it named were beats: "The tail around my wrist", "presses her forehead briefly to", "the sun clears the grass", "camp feeds you until you beg for mercy". A few more everyday words count as common ("time", "moment", "side", "somewhere", …).
- **Phrases**: neighbouring repeated runs in one reply join into one phrase, taken in the newest reply's own words, common-word runs at its edges included once one of its runs carries a beat ("I had a whole speech ready", not "had a whole speech ready"). A phrase that shares a four-word run with one already found (the same beat in an older reply's words) is left out. At most four, those in the most replies first, then the longest; each at most ten words.
- **The line** sits right before the final instruction (after the Cue), only when something repeats: `Already used in recent replies, so not again in this one: "I had a whole speech ready"; "her tail wraps around my wrist". Find a fresh way, or leave it out.` About 40 tokens; the Story so far trigger reserves 80.
- **An Epilogue** reads it too: it is written by the same model from the same history.

## Testing Decisions

- API, pure (`test/story-quality.spec.ts`):
  - the detector: finds the Chat 2 phrases, joins neighbouring runs, ignores names and common-word runs, needs two replies, reads only the last four, caps the list;
  - facts: the current list from records (newest wins, an empty fact drops it, slips of one Message only), reading the Judge's answer, applying it (new, changed, unchanged, loose topic match, caps, slips that are kept and dropped), the Judge's section, and the Narrator's block and line in a built prompt.
- API, HTTP with the fake gateway:
  - the Judge is shown the facts and its answer is kept: the next turn's closing message has the block, and the slip of the last reply; Regenerate takes the fact back;
  - a phrase in two earlier replies is named in the next turn's trailing block; with none, there is no line.

## Out of Scope

- Showing or editing the facts in the app (the info box or a Facts sheet).
- Repairing a reply that contradicts a fact after it is written (the reply is shown as streamed).
- Feeding the facts to the Memory extraction, the Story so far writer or the Diary.

## Further Notes

- **The Facts rule on a real model (2026-11-18, the free `nvidia/nemotron-3-ultra-550b-a55b:free` on OpenRouter, $0; live's Judge is DeepSeek V4 Flash, so this shows the rule reads, not how V4 Flash answers it).** Three Chat 2-like exchanges through `buildJudgePrompt` with the new section:
  - Facts listed ("nine summers"), the reply said "Twenty summers … and my mother Ilse before me": a slip on the years and a new fact "Nara's mother: Ilse". Both taken.
  - Nothing listed, the Story so far said "nine summers", the reply "Six summers, give or take": it recorded "nine summers" and slipped on "six summers". The code then dropped that slip, because the topic was not listed before the turn; a slip on a topic first recorded in the same answer is now taken.
  - A dance with nothing factual in it: no facts, no slips.

- **Follow-up worth doing:** a Facts list in the Chat's info box, where the user can correct or delete a fact. Until then a wrong first fact in an old Chat (seeded from history) stays until the story changes it.
- **Time-relative facts** ("married three days") need the Judge to move them on as days pass; the rule asks for it, but a fact anchored to an event ("married the night of the summer market") is steadier, and the rule prefers that wording where the story allows.

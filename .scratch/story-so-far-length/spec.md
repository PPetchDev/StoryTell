# Spec: The Story so far writer overruns its length

Status: ready-for-human
Builds on: [Spec: Story so far](../story-so-far/spec.md) (how and when it is written, the length cap, the output guard), [Spec: Prompt cache](../prompt-cache/spec.md) (the standing part, which the Story so far is in), [Spec: Long-term memory eval](../long-term-memory-eval/spec.md) (Layer 4, which found it)

Written 2026-11-25. **No way to mend it is chosen here.** This sets out what was measured, the ways open, and what each would do to the prompt cache and the cost, for the user to choose. Nothing in the app is changed.

## Problem Statement

The Story so far is the app's record of everything the turn prompt no longer sends word for word. Its writer is asked for at most about 500 words and is stopped at 2,000 tokens. An answer stopped there is thrown away, because its last events are missing, and asked for once more. If the second answer is stopped too, the update fails and waits for the next turn.

On a long Chat this happens often enough to matter, and the writer's input grows with every Message of the Chat, with no limit.

## What was measured

### On live (read-only: the API log, and the usage records)

The log on the VM starts on 2026-11-13: twelve days, not the thirty an earlier note said.

| In twelve days | Count |
|---|---|
| Updates started | 67 |
| Stored after the first answer | 51 |
| First answer cut off at the cap, asked again | 15 |
| ...of those, the second answer stored | 10 |
| ...of those, the second answer cut off too: **the update failed** | **5** |
| First answer refused for another reason (it went on with the story), then stored | 1 |

- So an earlier figure of "20 times" was 20 answers cut off, in 15 updates. **Five updates failed, about one in thirteen.** Four of the five were in the longest Chat.
- A failed update leaves the old Story so far in place and runs again after the next turn. Whether each of the five then succeeded was not traced.
- By Chat, cut-off answers: the longest (864 Messages) had 12 and all but one of the failures; the other two had 2 and 1.

From the usage records, every Story so far call since 2026-11-05:

| Measure | Value |
|---|---|
| Calls | 134 |
| Input, average | 72,481 tokens |
| Input, largest | 149,576 tokens |
| Written, average | 795 tokens, about 600 words against the 500 asked for |
| Calls that wrote the full 2,000 tokens | 20 (15%) |
| ...among calls with more than 60,000 tokens of input | 16 of 75 (21%) |
| ...among calls with less | 4 of 59 (7%) |
| Cost of all 134 | $0.82, about $0.006 a call |
| Share of everything spent in that time ($37.69) | about 2% |

- **The input is every covered Message, sent again each time.** At 864 Messages that is about 150,000 tokens for one update. It grows by the size of each turn, forever.
- The host's cache helps little: 0% to 29% of those tokens were read from it, by Chat.
- The longer the input, the likelier the cut-off: three times as likely past 60,000 tokens.

### In the eval (a synthetic story, thirty Chapters)

- Nine of fifteen accounts were cut off, and from Chapter 24 on, all of them. Those that finished ran 695 to 1,469 words.
- Adding weather and small talk between the events, as much again as the events, changed nothing. The writer copies each event out in order and does not choose between them.
- In the six that finished, all four major events were there.
- The eval's story is denser than a played Chat (eight events a Chapter that each could matter), so its rate is higher than live's. The direction is the same.

### Why it overruns

The writer's instruction holds two rules that cannot both be kept on a long story: "Keep every detail that could matter later: names, promises, secrets revealed or kept, gifts, injuries, places, plans" and "At most 500 words". It is given no way to choose, and it keeps the details.

## One measured problem, and one finding still to check

1. **Measured: the answer is too long.** One update in thirteen fails on live, and the rest average a fifth over the length asked.
2. **A finding, checked further down ("The two unknowns, checked"): the input grows with the Chat.** Every covered Message is sent again each time, 150,000 tokens today in the longest Chat. What is not known:
   - the background model's limit on input, which was not looked up. Past it the update would fail every time, but how near that is cannot be said;
   - whether anything in the app or the host already guards against it;
   - what the five failed updates did to the turns after them: whether the next turn's update succeeded, and how stale the Story so far got meanwhile.

   Until those are checked, this is a reason to look, not a reason to choose a mend. It is kept apart from the first on purpose.

A mend for the first alone leaves the second untouched. Some of the ways below would bear on both.

## The ways open

None is chosen. "Cache" is the turn prompt's cache: the Story so far sits in the standing part, so every rewrite makes the next turn a cold one, whatever is done here. What differs is how often it is rewritten and how long it is.

| Way | What changes | Mends the length | Mends the input | Turn prompt cache | Cost | What it risks |
|---|---|---|---|---|---|---|
| **A. A higher cap** (2,000 to 3,000 or 4,000 tokens) | One number | Fewer cut-offs; the account grows | No | The standing part is longer, and paid for on every turn (at the cached price when warm). The room kept for the account's growth rises with the cap, so the recent Messages lose that much. | A little more a turn; nothing on the update | The account keeps growing with the story. It moves the wall, it does not take it down. |
| **B. The writer told how to choose** | The instruction: what to keep first when it cannot keep all, and that 500 words is the limit that wins | Yes, if the model follows it | No | None | None | Details a player wanted are dropped. This is the trade the first spec's third user story was written against. |
| **C. A second try that asks for less** | Today the second try is the same request. It would say the first ran long and ask for a shorter account. | Fewer failures; first tries unchanged | No | None | None | Small. A second answer shorter than the first is still an answer. |
| **D. Written from the last account and the new Messages** | The input: the earlier Story so far plus only what it does not yet cover | Not by itself | Yes: a few thousand tokens, whatever the Chat's length | None | About $0.006 a call falls to well under a tenth of that | **Details fade over rewrites.** The first spec chose "from scratch" to stop exactly this. The user's corrections would need care. |
| **E. Written in layers** | A summary a Chapter (the app already keeps Chapter summaries, for the Recap), and the Story so far written from those and the Messages since | Easier: less to squeeze at once | Yes | None | Falls as in D, plus a summary a Chapter | Two steps of loss in place of one. Chapters are the user's to open and close, and a Chat with none has no layers. |
| **F. Keep the cut-off answer, trimmed to its last whole sentence** | The guard | Hides it | No | None | None | The account's newest events are what is cut. Not advised; listed for completeness. |

They are not exclusive. C can go with any. A is a stopgap that buys time for B, D or E.

## What would decide it

- **For the length (A, B, C):** Layer 4 of the memory eval measures the cut-off rate and which of four major events survive, for about a cent a run. It has to be given Messages written as played prose first; today's are denser than play, so its rates are too high to set a target by.
- **For the input (D, E):** the same layer, played as a chain: the account written, then written again from itself and the next Chapters, five times over. That is the test the eval's first draft wrongly assumed the app already needed. It would show what fades.
- **A target is not set yet.** One failed update in thirteen is the baseline. What rate is acceptable is the user's to say.
- **The background model's input limit** should be looked up before choosing, as it sets how soon the second problem bites.

## User Stories

1. As a player in a long Chat, I want the Story so far to be rewritten when it is due, so that the AI is not working from an account several turns old.
2. As a player, I want a Chat of any length to keep getting a Story so far, so that the longest Chats are not the ones that lose it.
3. As a player, I want the major events of the early story kept as the story grows, so that length does not cost me the beginning.
4. As a player, I want my own corrections to the Story so far kept, whatever way it is written.
5. As the app's developer, I want a failed update to say why in a way I can count, so that the rate can be watched.
6. As the app's developer, I want the mend measured before and after on the same scenes, so that it is known to help.

## Testing Decisions

- The mend, whichever it is, is tested at the seam the Story so far already has: the manager, with the fake gateway scripted to answer long, then short.
- Its effect on a real model is measured by Layer 4, before and after, on the user's go-ahead to spend.

## Out of Scope

- Choosing among the ways.
- The other findings of the memory eval (the Memory budget, what a Character knows, the extraction and the narration).
- Any change to when the Story so far is due.

## Further Notes

- The cost is not the reason to act: all 134 calls cost $0.82. The reasons are the failed updates and the input that has no limit.
- The first spec's choice to write from scratch was sound at the size it was written for. The longest Chat is now 864 Messages.

## The two unknowns, checked (2026-11-25, read-only, nothing spent)

- **The background model's input limit:** OpenRouter lists DeepSeek V4 Flash on DeepInfra at 1,048,576 tokens. The longest Chat's update sends about 150,000, a seventh of it. At that Chat's rate of about 170 tokens a Message the limit is near 6,000 Messages. **So the growing input is not a wall in sight.** It is a cost and a wait that grow with the Chat, and it makes a cut-off likelier (three times as likely past 60,000 tokens).
- **What followed each failed update:** all five were followed by an update that succeeded, and none failed twice running. Four recovered within two to five minutes, on the next turn. The fifth recovered six hours and forty minutes later, which was simply the next turn the user played.
- So each failure cost **one turn played on a Story so far one update old.** On that turn the recent Messages that no longer fit are left out of the prompt with no account of them yet: the gap the Story so far exists to close, open for one turn.

## A proposal, for the user to accept, change or refuse

**Read with the figures above, this is a small fault, not an urgent one:** five one-turn delays in twelve days of play, each mended by the app itself on the next turn. It does not ask for a new design.

1. **Do C: a second try that asks for less.** Today the second try sends the same request and was cut off again one time in three (5 of 15). Telling it the first answer ran long and asking for a shorter account is a few lines in one place, changes nothing about the prompt cache or the cost, and bears directly on the one thing measured: the failed update.
2. **Then measure, and only then think of B.** Rewording the writer's rules (what to keep first, and that the length wins) could cut the first-try cut-offs too, but it trades away detail, and nothing yet says how much. Layer 4 can say, once it has Messages written as played prose.
3. **Leave A, D, E and F.** A raises the cost of every turn to mend a thing that mends itself in one. D and E would bring back the fading the first spec was written against, to solve an input limit that is forty times the Chat's present size away. F hides the newest events.
4. **Count it.** The log already says each cut-off and each failure. A line on the Usage page, or a number in the play-signals report, would show whether the rate rises as Chats grow, which is the one thing that would change this advice.

What would change it: a Chat whose updates fail twice running, or a first-try cut-off rate that climbs well past today's one in four on long Chats.

## Built: a second try that asks for less (2026-11-25, on the user's word)

Status of this part: built and committed; **not deployed, and not yet measured against a real model.**

- **What changed in the app, and nothing else:** when the writer's answer is cut off at its cap, the second try ends "Your last account ran too long and was cut off before it reached the end. Write the account again, shorter: at most 350 words, and carry it through to the last of the Messages." in place of "Write the account now."
- The first try is byte for byte what it was. So are the rules, the Messages, the cap and the number of tries. A second try after any other refusal (the writer going on with the story) still asks in the same words as the first.
- The log line now ends "Asking once more, for a shorter account." so the two kinds of second try can be counted apart.
- Ways A, B, D, E and F are untouched.
- **Tests:** two in the Story so far's own tests through the manager with the fake gateway (the shorter ask after a cut-off; the same ask after another refusal), written first and seen to fail. The whole API suite passes (2,335).
- **The eval's Layer 4 now tries again as the app does,** so the change can be measured: its scorecard says how many first answers were cut off, how many shorter second tries were stored or cut off again, how long those accounts are, and which of the four major events each kept.

### Not yet known

- **Whether the second try now succeeds more often.** The baseline on live is 10 stored of 15. Only a real run or live play can say.
- **Whether a shorter account drops what matters.** Layer 4 counts the four major events in each account from a second try. Its story is denser than play, so it is the harder case.
- Both can be measured by Layer 4 for about a cent, on the user's go-ahead. Live will then show it in the log once deployed.

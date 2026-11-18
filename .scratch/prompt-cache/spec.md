# Prompt cache

Built 2026-11-17. The user, looking at OpenRouter: "มันไม่ค่อยติด cachhit เลยเนอะ" (it hardly hits the cache).

## What was wrong

The host (DeepInfra, through OpenRouter) caches a prompt automatically, but only its opening: from the first token up to the first one that differs from an earlier prompt. On DeepSeek V4 Pro a cached input token costs $0.10 per million, against $1.30 for an uncached one.

Live's last week of turns on DeepSeek V4 Pro works out to about 28% of input tokens read from cache: 200 turns, 11.7k prompt tokens on average, $0.0119 a turn.

The turn was sent as:
1. one system message with every layer (Rules … Cast, then Scene, Feelings, Arcs, Memory, Inner life, Story so far);
2. the history;
3. the user's message;
4. a trailing system message (Lore … Where things stand … the final instruction).

## What was measured (2026-11-17, OpenRouter, DeepInfra, `usage.prompt_tokens_details.cached_tokens`)

- **A plain growing chat is cached.** With a system message, the history and the user's message last, the next turn (the same messages, plus a reply and a new user line) read 93% from cache.
- **Any system message after the first stops it.** With exactly the same chat plus a trailing system message that changes each turn, every turn read 0%. A long first system message was still cached in some shapes (97% when nothing but a short tail followed it), but none of the history after it ever was. This fits the trailing system message being merged into the first one, which then changes every turn, though the cause is not confirmed.
- **The same text inside the last user message keeps the cache:** 92% and 84% on the next two turns.
- **Moving the moment layers after the history as a system message of their own did not help.** A replay of four of Chat 2's turns on dev, on V4 Pro, read about 24% from cache, about what live already gets.
- A per-chat `prompt_cache_key` or `session_id` made no difference.

## Decision

- **The layers are split in two:**
  - **Standing:** Rules, Setting, The user plays, Style, Cast, Story so far. They change only when the Story is edited, a Persona is swapped, or the Story so far is rewritten (every several turns). They are the one system message, first.
  - **Moment:** Current Scene, Feelings, Arcs, Memory, Inner life.
- **The turn is three things in order:**
  1. the standing system message;
  2. the history;
  3. one closing user message holding, in this order:
     - the user's words (or the Continue or Epilogue instruction);
     - a line marking what follows as the Narrator's notes, not part of the user's message;
     - the moment layers;
     - what the trailing system message held (Lore, Documents, Author's note, Where things stand, Thoughts, Sudden event, Roll, Nudge, Cue, the final instruction).

  There is no other system message. Each turn's prompt therefore opens with the last one's, up to the end of that one's history.
- **Suggested replies and Write for me send the same opening:** the standing system message, then the same history the turn sends (the Narrator's past lines without stage directions, as the turn has always sent them). Their closing user message is the moment layers, then their own blocks and instruction. A suggestions call right after a turn reads the cache that turn left.
- **The history window is counted as before.** Both parts of the layers are counted as one text, plus the notes line, so the same Messages are trimmed.
- **The history is not trimmed in fixed steps.** The Story so far already keeps the uncovered history inside the budget, and moves its start only every several turns.
- **What the model reads is not the same as before.** The final instruction and "Where things stand" now come last, after the user's words. They used to sit in a system message that the host may have been moving to the top. The replies are read on the real model before this ships.

## Testing

- API, pure (`test/prompt-cache.spec.ts`):
  - the prompt is one standing system message, the history and one closing user message;
  - the next turn opens with this one's, through its history, while the Scene and Feelings change;
  - a Continue keeps the opening;
  - Suggested replies and Write for me open the same way as the turn.
- Tests that read a moment layer or the trailing blocks find them in the closing message (`test/harness/prompt-layers.ts`: `layersOf`, `closingParts`, `trailingOf`).
- With the real model: four of Chat 2's turns replayed on dev on V4 Pro, with the cached share per turn and the replies read against live's.

## Measured after the change (2026-11-17, dev, V4 Pro on DeepInfra, Chat 2's Messages 523-562, then the user's real #563-#569)

| Call | Prompt tokens | Cached | Cost |
|---|---|---|---|
| Turn 1 | 10,230 | 0% | $0.0140 |
| Turn 2 | 10,562 | 0% | $0.0143 |
| Suggested replies | 10,443 | 78% | $0.0040 |
| Turn 3 | 10,644 | 79% | $0.0042 |
| Turn 4 | 11,111 | 78% | $0.0045 |

- **Steady state:** once the cache was warm, each turn cost about a third of an uncached one. That is about $0.0043 against live's $0.0119 average.
- **Turn 2 missed, although it opened with turn 1's prompt.** The cause is not known. It may be that a new opening has to be seen once before it is kept, or that DeepInfra routed the request elsewhere. Expect a cold turn after the Story so far is rewritten, and after a long pause.
- **The replies read as well as live's.** They stayed in character and kept what the user did. They wrote nothing for the user. The notes did not leak, and no "Where things stand" was echoed. They were a little calmer than live's.

## Sexual scenes (2026-11-17, the same replay over Chat 2's #575-#584)

- **The new order first cut away.** The user wrote that Petch takes Nara's nipple in his mouth (#582). Live's reply wrote that act; the new order's reply skipped it for a kiss and a speech. Undressing (#577) was also told more softly than on live.
- **Why, most likely:** the Rules line on sexual moments ("write it out explicitly and in sensory detail; never summarise it, skip ahead or cut away") sits at the very top of the prompt. With the final instruction now really last, the model weighs it less.
- **The fix:** that sentence also ends the turn's final instruction.
- **Replayed again:** #582 was written out ("her back arches, pressing her breast deeper into my lips"), undressing was as plain as on live, and it stayed in character. The turns read 76-96% from cache. Turn 1 was cached too, from the run a few minutes before.

## Better than live (the user: "ทำให้มันดีกว่าที่เป็นอยู่ใน live ด้วยสิเมย์", make it better than live)

- **What was worse on live:** about half of each intimate reply was speech (#576 51%, #580 50%, #583 51%). Nara gave whole paragraphs mid-act, for example the story of signing Mirelle's letter while Petch's mouth was on her. People say little in such moments.
- **What "better" means here (เมย์'s call):**
  - the body carries the moment: touch, skin, breath, sound, and how each Character answers what the user does;
  - a Character says only a few words at a time, broken off by what they feel.
- **The sentence that ends the final instruction is now:** "When a moment turns sexual, stay in it and write it out explicitly: touch, skin, breath and sound, and how each Character's body answers what {user} does, at the pace of the scene; never summarise it, skip ahead or cut away. In such moments a Character says only a few words at a time, broken off by what they feel; the body carries the moment, not speeches about it."

| Replay of #575-#582 | Speech share per turn |
|---|---|
| Live | 51% · 12% · 50% · 51% |
| Rule sentence only | 42% · 46% · 51% · 49% |
| "people say little: short, broken lines" | 54% · 34% · 46% · 40% |
| Final wording | 22% · 45% · 44% · 37% |

- **Read by eye, with the final wording:**
  - #575 turned physical, in short broken lines ("All of them. Every single—").
  - #582 follows what the user did, with breath and body, and lines cut off mid-way ("And now you're—").
  - The tender, non-sexual turns (#577, #579) still talk, which fits them.
- **Spend:** the four explicit replays cost about $0.10 in all.

## The reply that said the user's message back (2026-11-17)

On live, one reply (Chat 2 #633) opened with the user's whole message as its first paragraph. That may have come from the user's words now sharing a message with the Narrator's notes. An opening narration paragraph that is the user's message, read loosely (asterisks, quotes, spacing and case aside), is now dropped before the reply is kept. A reply that only starts the same way is left alone.

## Settled Memories (2026-11-18)

### What was still uncached

Live, warm turns read only 35-50% from cache. Everything after the history is uncached, and the closing message is about 6.5-7k tokens, most of it the Memory layer (up to its 4k cap). The Memory search picks that layer again by meaning every turn, so it can't simply move up: anything in the standing part that changes breaks the cache for the whole history behind it.

On dev's Chat 2 (47 turns with a recorded choice), the search picks about 88 Memories a turn, and about 75-80% of them were picked the turn before. A Memory picked in at least 6 of 8 turns is picked again on 60-80% of the next 8 turns.

### Decision

- **The standing part gains a "Lasting memory" layer**, after Cast and before Story so far. It holds the locked Memories and the **Settled Memories**.
- **Settled Memories** are the Memories the search picked in at least 6 of the newest 8 turns that were written before the Story so far was last written (its `story_so_far_updated_at`). Most often picked first, then the newest, up to 2,000 tokens (half the Memory budget). Never a locked one, which is in the layer anyway.
- **Why tie them to the Story so far:** the Story so far is rewritten every several turns and that already breaks the cache. The turns before it don't change, so the Settled Memories stay the same until it is written again. Between rewrites they change only when one of them is edited or deleted, or when a turn inside the window is regenerated.
- **They are sent whatever the search finds**, archived ones too, right after the locked ones in the choice, inside the same 4k budget. The search then fills the rest, by meaning and then the newest about the people present, as before. What it adds goes in the Memory layer of the closing message, as before.
- **A Memory relevant to the latest exchange still reaches the turn.** The search still runs every turn, and what gives way to the Settled Memories is the tail of its own pick. In the replay, the top 61 Memories by meaning reached every turn, and 89% of each turn's own pick did.
- **Each turn records what its search picked on its own** (`memoriesUsed.pickedIds`), beside what it sent (`memoryIds`, which the Memory drawer's "In play" shows). The next Settled Memories are read off `pickedIds`, so a Settled Memory never keeps itself settled. Turns recorded before this have no `pickedIds`; their `memoryIds` were exactly the search's pick and are read instead. A Branch copies `pickedIds` with its ids moved.
- **The turn, Suggested replies and Write for me** use the same Settled Memories, so they still share one cached opening. Snapshots don't: they aren't cached.
- **Considered and not done:**
  - *Keep last turn's choice unless one is clearly more relevant:* the choice would still sit after the history, where nothing is cached, so it saves nothing.
  - *Sending the Settled Memories on top of the 4k:* every Memory the search picked would still reach the turn, but the Story so far would have to reserve 2k more, and the history would lose about 2k tokens.

### Measured without spending credit

Dev's Chat 2 (Story 1), its 47 consecutive turns with a stored search query (positions 72-166), replayed through `buildTurnPrompt`:
- the Memories rebuilt as they stood before each turn from `memory_change`;
- each turn's search run again on its stored query vector;
- the Story so far written again whenever `storySoFarCoverage` says so (about every 8-10 turns), its text changed each time.

Scene, Feelings, Arcs, Lore and the rest are left out, the same before and after. So the shares below are higher than live's, but the tokens saved are what live would save. The replay script is in the session notes (`prompt-cache-replay/`), not in the repo.

| Over 46 warm turns | Before | After |
|---|---|---|
| Prompt that opens the same as the turn before | 58% of characters | 70% |
| Uncached tokens per turn (estimated) | ~4,960 | ~3,610 |
| Standing part changed | only after a Story so far rewrite (4) | only after a Story so far rewrite (5: they fall a little differently) |
| The search's own pick sent | 100% | 89% (top 61 by meaning always) |

That is about 1,350 fewer uncached tokens a turn, about 27% fewer. On DeepSeek V4 Pro ($1.30 against $0.10 per million), about $0.0016 a turn.

Other caps tried, on the same replay:

| Cap | Shared | Uncached | Own pick sent |
|---|---|---|---|
| 1,500 | 67% | ~3,960 | 93% |
| **2,000** | **70%** | **~3,610** | **89%** |
| 2,500 | 73% | ~3,280 | 85% |
| 3,000 | 74% | ~3,080 | 81% |

Changing the threshold (5, 6 or 7 of 8, or 4 of 6) made almost no difference.

### Seeing the cache

- The gateway reads `usage.prompt_tokens_details.cached_tokens` from every text call, whole or streamed, on OpenRouter and Venice. It is 0 when the details come without a count, and null when the host sent no details.
- It is kept on the usage record (`cached_tokens`, nullable).
- The Usage API gives each pool a `cache`: this month's prompt tokens and cached tokens, over the calls that reported their cache. It is null while none did, and always for the image pool.
- The Usage page shows it under the text pool, as "Read from cache: 62% of prompt tokens · 744K of 1.2M".
- A stopped stream's bill, looked up afterwards, has no cache count.

### Not verified

- No real model call was made. The live cache share after this ships is for the Usage page to show.
- Venice showed no cache at all on 2026-11-17. A steadier opening may not change that; the Usage page will tell.

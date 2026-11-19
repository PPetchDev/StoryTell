# Cache and voices

Asked 2026-11-19, after the user had played for a while: "ลองดูพวกเรื่อง cach กับ เรื่องสำนวนการพูดของตัวละครหน่อยสิ" (look at the caching and at how the Characters talk). After the findings, they said: "แก้ทั้งสองเรื่อง" (fix both).

## What live showed (Chat 2, 2026-11-19, 41 turns on DeepSeek V4 Pro)

### Cache

- **Warm turns read 43-55% from cache, not the ~78% that `.scratch/prompt-cache/spec.md` measured on dev.**
  - A warm turn costs about $0.0093. A cold one costs $0.016-0.021.
  - What stays uncached is the closing message, about 6,000 tokens a turn. The standing part and the history are cached.
- **The Story so far was rewritten every 3-5 turns, not every 8-10.** The live log shows the coverage stepping 729, 743, 753, 762, 778, 788, 800, 810, 816.
  - Every rewrite covered all but the newest two Messages. So after a rewrite the Narrator read only one exchange word for word.
  - Every rewrite broke the cache, and the next one or two turns ran cold.
- **Why:** the history's room is what's left of the 16,000-token budget after the standing part, the reserves and the trailing blocks.
  - Lasting memory, Established facts, Items, Secrets and the Lore reserve came after the 16,000 was set. Together they left about 2,000-3,000 tokens for history.
  - That room was still shrinking as the facts list grew. At the trigger, the uncovered history was 2,800 tokens, then 2,100, 2,500, 2,300, 1,600, 1,800, and last 1,100.
  - The update aims to leave the room minus 4,000 tokens minus the account's growth. That came to below zero, so it covered everything it was allowed to.
- **The writer ran into its 2,000-token cap and was asked again,** 4 times in 24 hours. Each retry costs a second call. Fewer rewrites mean fewer of these too.
- **Memory extraction sent about 41,000 tokens a turn and read 0-14% of them from cache,** about $0.0033 a turn.
  - Its prompt opened with the Cast, then "Characters present in this exchange", then every Memory.
  - The present list changes from turn to turn, so the long Memory list after it was never cached.

### How the Characters talk (positions 700-817)

- Nara, Dulcie and Morra sound like their cards.
- **Tavri lost her voice.** Her card says she is "soft and halting… the only one who stammers".
  - In 740-779, 22 of her 61 lines halted, apologised or trailed off. In 780-817 only 2 of 21 did.
  - She took on Nara's dry, clipped register instead ("They were quiet, but they were words."), and the narration even said "She doesn't stammer".
- **Gestures came back reply after reply:**
  - the tail around the wrist in 21 of the 59 replies;
  - "amber eyes" 18 times;
  - ears swivelling forward and tails sweeping again and again.
- The repeated-phrase check only finds runs of five identical words. "Her tail tightens on my wrist" and "her tail is coiling slow around my wrist" share no such run, so it never named them.
- **Nara's trade images spread to everyone.**
  - "buyer" turned up 16 times in narration.
  - Tavri was described "like she's correcting inventory" and "like she's reporting stock numbers".

## Decision

### Cache

- **The turn's token budget goes from 16,000 to 22,000.**
  - The history's room comes back to about 8,500 tokens.
  - A Story so far update now leaves about 3,000 tokens of the newest Messages (about four exchanges) word for word.
  - The next update comes about 4,500 tokens later, about every 12-13 turns.
  - The trigger, the 4,000 headroom and the margin are unchanged. Suggested replies and Write for me read the same budget, so they keep opening like the turn.
- **Why 22,000, not just enough to stop the rewrites:**
  - The history is in the cached opening, so a longer one costs little on a warm turn: about 3,700 more cached tokens, about $0.0004.
  - It also keeps a few exchanges in front of the Narrator after every rewrite. With only one exchange in view, the Narrator loses how each Character has been talking.
  - A cold turn costs more, about $0.005, but there are about a third as many of them.
  - Estimated net: about $0.0015-0.002 cheaper a turn, before the extraction change.
- **Memory extraction is laid out so its long part comes first:**
  1. Cast;
  2. Current Memories;
  3. Active Beliefs;
  4. then the present Characters and the latest exchange.

  The Memory list changes only where the last extraction touched it, and new Memories are added at the end, so most of it reads from cache on the next turn.

### How the Characters talk

- **"Where things stand" names how each Character in the latest exchange talks:**
  - their card's Voice, as written;
  - then one line: each Character's comparisons and turns of phrase come from their own life, so don't lend one Character's trade or images to another, or to the narration about them.

  It is read last, beside the final instruction, so the most recent replies no longer outweigh the card that sits at the top. Characters sitting out are left out, as they already are from "In the latest exchange".
- **Repeated gestures are found by their words, not their exact wording.**
  - A pair of words is counted when they share a sentence of narration in three or more of the last six AI replies. Speech lines are left out.
  - At least one of the two must be a body part, such as tail, wrist, ears, eyes, hand, lips, horn, cheek or breath.
  - Neither may be a common word, a name, or a word that only says how often or how far ("once", "gone", "almost").
  - Plural and verb endings are dropped before comparing, so "ears" meets "ear" and "tightened" meets "tightens".
  - Pairs that share a word are one gesture: "ears swivel forward" is named once, by its commonest pair.
  - Up to three are named in one line next to the repeated phrases, most often first, in the newest reply's words. For example: `Gestures already in several recent replies, so not in this one: tail and wrist; amber and eyes. Show the feeling another way, or leave it out.`
  - "Voice" was tried as a body part and dropped: run over live, it paired with whatever a Character said ("steady", "counting").
  - **Why a body part:** run on positions 700-817, every pair it found without that rule that wasn't a gesture was the story's own running material ("four jugs a day", the tent flap, Dulcie's saucer), which a story should be free to come back to. The gestures are what the cards never asked for.
  - The repeated-phrase check stays as it is. The reserve for the two lines goes from 80 to 160 tokens.

## Testing

- **API, pure:**
  - `storySoFarCoverage` with the live-like sizes: an update leaves several exchanges uncovered, and the next one is due only after several more turns.
  - The extraction prompt lists the Memories and Beliefs before the present Characters and the latest exchange. Two turns that differ only in who is present and what was said open the same, up to the latest exchange.
  - The repeated gestures:
    - the tail-and-wrist replies from live are named;
    - the saucer, tent flap and "four jugs a day" are not;
    - nothing is named under three replies;
    - names and common words never count.
  - "Where things stand" carries the Voice of each present Character, never of one sitting out, plus the borrowed-images line.
- **Afterwards on live:** the Story so far log should step by about a dozen Messages at a time, and warm turns and extraction should read more from cache.

## Measured before shipping (no credit spent)

- **Story so far cadence**, in `storySoFarCoverage` at live-like sizes (a standing part sized so 16k leaves the history about live's room, exchanges of about 350 tokens), over 90 turns:

  | Budget | An update every | Left word for word after one |
  |---|---|---|
  | 16,000 | 4 turns | 2 Messages (one exchange), as on live |
  | 22,000 | 14 turns | 18 Messages (nine exchanges) |

  Live's room was a little tighter than this stand-in and still shrinking, so expect fewer exchanges kept than nine, but at least four.
- **Repeated gestures**, run over live Chat 2's replies 700-817, one window at a time:
  - Named most often: tail and wrist (12 replies in a row, 767-789), amber and eyes, ears and forward, ankle and tail, flicks and tail.
  - Not named: the saucer, the tent flap, "four jugs a day", the crooked jugs.
  - Odd ones that came through: "throat and ties" once; "grass and tail" while they sat in the grass.

## Replayed on the real model (2026-11-19, $0.099)

**Setup:**
- Live's database was copied into a scratch Postgres on the PC.
- The new build ran against it on port 4501, with dev's OpenRouter key, push subscriptions removed and Reach-outs off.
- Four Continue turns were played in the tent scene (Nara, Tavri, Petch), right after live's position 817.

**Spend:** the four turns cost $0.051. Three Diary entries cost $0.022. Extraction, the Judge and Thoughts made up the rest.

**What it showed:**
- **Turn cache:** 0%, 0%, 44%, 44%, the same as live. The closing message is unchanged, so this was expected.
  - The Story so far wasn't due in four turns. The new cadence can't show in a run this short.
- **Extraction cache:** 0 of 4 calls read from cache, although each one opened with the last one's Memory list.
  - On live, under the old order, 6 of 59 did, when the present Characters were the same.
  - Why the new order didn't hit is not known: it may be the dev key, or the short gaps.
  - The order change is harmless, but its saving is unproven.
- **Tavri still doesn't halt:** 0 of 7 lines. The voice line was in the prompt, but nine exchanges of the clipped Tavri in the history outweigh one line of description. The narration again said "Tavri's voice doesn't shake".
- **The tail on the wrist** stayed for three turns ("stays wound around", "hasn't moved from", "still anchored to"), then slid away in the fourth.
  - It is held from turn to turn, not done again. The gesture line can't ask for a held pose to end.
  - "Her tail tightens a fraction" came twice.
- **Borrowed images:** none. Trade words appeared only about Nara herself ("buyer's lilt", "seller's lean") or in Tavri's words about Nara's selling.
- **Four Continues with nothing new from Petch made Nara go in circles:**
  - "I had a whole speech" twice;
  - "That's the problem" twice;
  - "good horn thing" three times.

  That says more about four Continues in a row than about the change.

## The card's Example lines in the reminder (2026-11-19, replayed again, $0.093)

**Change:** each Voice in the reminder is now followed by the card's Example lines, quoted: `- Tavri: Soft and halting… As in: "It's, um. It's a family recipe…" …`.

**Setup:**
- The same fresh copy of live as before.
- This time, four lines from Petch that ask Tavri to talk:
  1. what she thinks the better thing is;
  2. a hand held out to her;
  3. that she can say no;
  4. what she noticed at the stall.

**What it showed:**
- **Tavri breaks off again: 6 of her 12 lines,** against 0 of 7 with the Voice alone and 2 of 21 on live (780-817). For example:
  - "The better thing is— I think it's making him wait."
  - "With my hands. Or my— anything."
  - "I thought— the first day I thought you were lost."

  No "um" and no apologies yet. The narration still notes that she's steadier than before, which fits her Arc.
- **Stall images around Tavri** ("checking the last row of jugs", "testing the press on a wax seal"): these are her own life, not borrowed. Her card has her working the stall ("I notice everything at the stall. It's sort of my job"). Calling "buyer" and "stock" Nara's images alone overstated it.
- **The tail on the wrist** is still held through the scene ("stays looped around my wrist"). As before, it is a pose kept, not a gesture repeated.
- **Two slips of place:** her tail "lies still in the grass", and Nara "leans back against the tree root", though they are inside the tent. It is not known whether live would do the same. Nothing in this change touches the Scene or the place.
- **Cache:** turns 0%, 0%, 42%, 44%. Extraction again 0 of 4.

## The slips of place and the held tail (2026-11-19)

The user asked for both to be fixed before shipping: "แก้ให้หายก่อนเลย quality หลุดนะแบบนี้" (fix them first; quality slipping like this is what customers complain about).

### Why the Characters were back on the grass

- **Live's Place was stale.** Chat 2's last Place record is from position 734: "under the tree by the eastern row of jugs".
  - The story went into the tent at 805-811 ("Inside the tent, the lamp has burned down…").
  - "Where things stand" still said `Place: under the tree by the eastern row of jugs.` every turn. So the reply put the tail "in the grass" and Nara "against the tree root".
  - The Stage drew that place too (the log shows it asked for "under the tree… (night)").
- **The Judge stopped reporting details.** It ran on all 30 replies from 759 to 817 and never once gave `details`: no Place, Weather, Outfit or Goal.
  - Its output wasn't cut short (about 200-270 tokens against its cap).
  - `details` was asked for only in the user message, never in the reply shape. DeepSeek V4 Flash mostly leaves such a field out, as `.scratch/story-quality/spec.md` found for the facts.
  - Its rule also said to leave `details` out when nothing changed, so leaving it out was always allowed.

### Decision

- **The Judge's reply shape names `details` whenever the details section is sent**, which is every judgement on live: `"details":{"place":"same","weather":null,"outfits":[],"goals":[]}`.
  - The system message is still the same from call to call. It changes once, on deploy.
- **The Place is asked for every time.** The answer is "same" while the story is still there, or the new place in a few words.
  - Going inside or out, into another room or to another spot, counts as a move.
  - "same" (also "unchanged" or "no change") is read as no move, so a restated Place never makes a new record or a new Stage picture.
  - Weather, Outfits and Goals still come only when the exchange changed them.
- **Repeated gestures cover held poses too.** The line now reads `Gestures and poses already in several recent replies, so don't mention them in this one, not even as still held: tail and wrist. …`.
  - "Not in this one" had stopped the tail tightening again, but not "her tail stays looped around my wrist" in every reply.
- **On live**, the first judgement after the deploy should move Chat 2's Place into the tent. Nothing is written to live's data by hand.

### Replayed (2026-11-19, $0.0997)

The same copy of live and the same four lines from Petch as the replay before.

- **The Judge now answers the Place, but it answered wrong.** Twice it gave "under the tree by the eastern row of jugs" (logged as "still … not a change"). The Place never moved into the tent.
- **The replies were back on the grass from the first turn:** "the tuft brushing the grass", "slack in the grass… against a clover bloom", "the firelight".
  - The first reply is written before any new judgement, under the stale Place. After that, the Judge read "grass" in the exchange and kept the tree.
  - The stale Place and the replies fed each other.
- **The held tail is gone.** Nara's tail on the wrist came once ("Not tightening—just there"), then not again in the last two replies. Before this change it was held through the whole scene.
- **Tavri halts in 7 of her 11 lines:** "I— you're asking me?", "You— you always figure things out", "Is this— am I supposed to—", "About— about anything."

### Then: the replies win over a lagging Place

- **"Where things stand" says, after the Place and Weather:** "Where the newest replies show the story has since moved somewhere else or the weather has turned, follow the replies, not these."
  - The history right before the first reply said "Inside the tent… seated on the felt". The reminder alone overrode it.
- **The Judge writes `where` before `place`:** a few of the story's own words about where everyone is at the end of the exchange. It is told the Place above may be out of date. The reply shape is now `"details":{"where":"...","place":"same",…}`.
  - Writing the reason first is what the Scene rule already does for `move_on`.
  - This adds 40 tokens to the Judge's cap (`DETAILS_EXTRA_TOKENS` goes from 180 to 220). `where` is not stored.

### QC until it passed (2026-11-19)

The user said: "เอาให้ QC ผ่าน" (get QC to pass). Each round used the same copy of live and the same four lines from Petch.

| Round | Change | Place | Tail on the wrist | Tavri breaks off | Spend |
|---|---|---|---|---|---|
| 1 | The two fixes above | Fixed at the second judgement. The reply before it still had "still in the grass" | Once, held | Few. Her narration calls her "steadier" | $0.1535 |
| 2 | The Place shown with its age | Fixed at the first judgement. The first reply, written before it, had "against the grass" | Named, then written anyway ("one amused squeeze on my wrist") | 2 of 11 lines | $0.1764 + $0.0875 |
| 3 | An old Place left out of the Narrator's reminder; a firmer gesture line; growing never changes how they talk | Right in every reply: "lamplight", "the felt". Fixed at the first judgement | Once, at 819, before the line named it; then never | Most lines, "um" back: "I think. Um.", "Not— not like the vigil wait", "I thought— I thought maybe" | $0.0643 |

Round 2 has two spends: two replays ran on the same build.

The last round passes. What it took, on top of the two fixes above:

- **The Judge sees the Place's age once it is 20 Messages old or more:** `Place: under the tree by the eastern row of jugs (last noted 85 messages ago)`.
  - It is counted from the Message the newest Place record was made on.
  - With the age, the Judge moved the Place into the tent at its first judgement. Without it, it kept answering "same".
- **The Narrator isn't told an old Place or Weather at all.** It reads where things are from the replies it has word for word.
  - A Place marked as old, beside the "follow the replies" sentence, still let the first reply put the tail "against the grass".
  - A fresh Place is told as before.
  - A long stay in one place drops the Place from the reminder after 20 Messages. That is safe, because the replies in view are set there.
  - The "same" answers aren't recorded, so the age keeps counting while the story stays put.
- **The gesture line names the words, not just the gesture:** `Gestures and poses already in several recent replies: tail and wrist. Leave them out of this reply entirely: don't write those words together, not even to say a pose is kept. …`
- **The voices block ends:** "As they change and grow in the story, what they say changes, not how they talk: keep each one sounding like this in every line."
  - Tavri's Arc and Now note ("Has spoken her truth… refusing to hide") had the narration calling her steadier, and her halting went with it.

**Left as is:** a few phrases came back within the last round ("the lamplight catches the pale tufts", "her tail uncurls from her ankle and settles on the felt beside her"). The repeated-phrase check names runs like these from the next turn on.

**Spend for this QC:** $0.48 across the four replays. The whole of today's replays came to $0.77.

## Then: why turns cost more after the deploy (2026-11-19, evening)

Asked: "ทำไมรอบหลังๆ cost มันแพงขึ้น?" (why have the last rounds cost more?). Then: "แก้ทั้งสองเรื่องเลย ส่วนเรื่อง flash เปลี่ยน provider เอา" (fix both; for Flash, change provider).

- **Busy Flash went to Pro.** When DeepInfra's Flash stayed busy through every retry, a background call went to DeepSeek V4 Pro, 13-20 times the price. On live that day 21 such calls (Judge, Memory extraction, Story so far, Character thoughts) cost $0.54 where Flash would have cost about $0.03; one Message's background came to $0.29.
  - **Now:** the same model, Flash, on DeepInfra's priority endpoint (`deepinfra/fp8/priority`, 1.5 times the standard price). OpenRouter takes the endpoint's tag in `provider.only`; tried with one tiny call, billed at the priority price. If that is busy too, the call fails and the background retry tries again about 20 seconds later.
  - **Why not another provider:** of the hosts serving Flash on OpenRouter, only DeepInfra's terms are checked for adult fiction (docs/research/text-llm-for-adult-roleplay.md). Mancer's terms forbid content that "is obscene, lewd, or offensive", the same reason GMICloud was dropped; Baidu, StreamLake, Wafer, AtlasCloud, SiliconFlow and Parasail are unchecked. The UsageRecord names the endpoint, so a busy spell shows on the Usage page.
- **The turn's cache.** After the deploy, 7 of 11 live turns read nothing from cache (before: 17 of 55), and the warm ones read about 5,600 tokens.
  - Three Continue turns were replayed with every request written to a file. Each turn's prompt matched the one before word for word up to its closing message (about 7,700-8,000 tokens): the standing part and the history hold still, as meant. The replay's three turns read nothing from cache anyway, while DeepInfra was busy (its Flash calls went to Pro in the same minutes). So the misses are the host's, not the prompt's.
  - What every turn pays uncached is the closing message, about 7,400 tokens: Memory 2,900, Lore 1,000, Arcs 640, Feelings 630, "How each of them talks" 600, Scene 500. The voices block is the deploy's addition (about $0.0008 a turn on Pro); it stays, as QC needed it.
  - No change to the prompt. Replay cost: $0.157 (the replay build still had the Pro fallback, and DeepInfra was busy).

## Then: a busy turn waits, then GLM-5.3 (2026-11-20)

On live a turn failed: "deepseek/deepseek-v4-pro is temporarily rate-limited upstream" (DeepInfra, a 429 through the three retries, about 7 seconds). V4 Pro on DeepInfra's priority endpoint was offered and turned down as too dear ("ถ้า pro piority มันแพงไปนะเมย์"); the user chose: wait longer at no extra cost, then another model ("ทำตามแผนนี้เลย แล้ว ship").

- A play call (a turn, Suggested replies, Write for me, a Diary entry…) whose model stays busy through the retries waits 8 seconds and asks once more, on the same model, at no extra cost.
- Still busy, V4 Pro's call goes once to **GLM-5.3** on DeepInfra, with GLM-5.3's own Sampling: cheaper ($0.5625 / $2.50 per million against $1.30 / $2.60), on the host whose terms are checked. The AI Message records GLM-5.3, so the Drift notice shows it; the next turn is V4 Pro again.
- GLM-5.3 as the play model has no fallback: busy after the wait, its call fails as before. Busy GLM-5.3 after V4 Pro fails too.
- Only on OpenRouter (pinned DeepInfra), never on Venice or the free host; a stream that has begun or was stopped never moves.

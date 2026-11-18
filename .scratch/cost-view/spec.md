# Cost view

Built 2026-11-18. The user often runs out of credit and can't see where it goes: the Usage page sums the month by pool and by kind, but not what one reply cost, which model or host the money went to, or what a Snapshot will cost before it is drawn.

## What was there

- Every model call writes a `usage_record`: `kind`, `pool`, `model`, `host`, `prompt_tokens`, `completion_tokens`, `cached_tokens`, `cost_usd`, `story_id`, `chat_id`. It had **no link to a Message**.
- The Usage page showed each pool's month: spent, calls, cached share of prompt tokens, credit left, and spend by kind.
- The Snapshot sheet's Draw button carried no price (`.scratch/snapshot-prompt-review/spec.md`, Out of Scope), and the Usage page had no spend per model (`.scratch/models-and-samplers/spec.md`, Out of Scope). This feature brings both in.

## Decisions

### A usage record names the Message it served

- `usage_record.message_id`: a plain reference like `chat_id`, not a foreign key, so the record outlives the Message and the month still counts it. Null on the records from before, and on every call that served no reply.
- `ServedFor` gains `messageId`. The gateway writes it on the record, as it writes `storyId` and `chatId`.
- **What a reply's cost holds** is the calls the reply caused by itself:
  - **made while it was written:** the turn, the per-turn search (`context_search`), the Thoughts (`character_thought`) and line repair (`speech_repair`, `speech_repair_fallback`);
  - **made after it, about it:** the Judge (`judge`), Memory keeping (`memory_extraction`) and the Memories it embeds (`memory_embedding`), the Story so far rewrite it set off (`story_summary`), and the Diary entries the Characters wrote by themselves at it (`diary_entry`).
- **Not in it**, because the user asked for them, not the reply: Suggested replies, Write for me, Thai reading, Read aloud, Snapshots, Dictation, a Diary entry the user asked for. They stay in the month's totals.
- **Calls made before the Message exists.** The turn's calls run before the AI Message is stored, so they can't name it. The turn notes the newest usage record id when it starts. Once the Message is stored, the turn's kinds recorded for that Chat since then, with no Message yet, are given its id. The Chat's turn lock means no other turn of that Chat records those kinds meanwhile.
- **A failed or stopped turn** stores no Message, so its calls name none. They count in the month, not on a reply.
- **Regenerate** writes a new Reply version into the same Message, so the Message's cost is every take together. The breakdown counts the turns, so "3 turns" says it was written three times.
- **An edited AI Message, a chosen Reply version, a Retry of the Judge or Memory keeping:** the background calls they run again name the same Message and add to its cost.
- **The Story so far** is written after a reply's Judge and Memory keeping. It names the Chat's newest AI Message when it runs.
- **A Branch** copies Messages under new ids. Their costs stay with the originals, since the Branch paid for nothing.

### Cost of a reply, in the Chat

- Settings, under **This device**: a **Show cost per reply** switch, off by default. Kept on this device only, like the Text size.
- With it on, each AI Message a model wrote shows one quiet line under its text, beside Thoughts: `$0.0123`. The Opening and a reply with no recorded cost show nothing.
- A tap opens the breakdown: one row per kind, its amount and calls, and for text calls the cached share of their prompt tokens. Closed again by another tap.
- Shown to four decimals under a dollar (`$0.0123`, `$0.0042`), since most replies cost a cent or two; two from a dollar up.
- The costs come from `GET /stories/:storyId/chats/:chatId/costs`, read only while the switch is on. The Chat reads it again when its Messages change and when the newest reply's background calls finish.
- A Member sees their own replies' costs: the Chat is theirs.

### Usage page

- Each pool's card adds **By model** and **By host**: this month's spend and calls for each, and for text the cached share of its prompt tokens. Most spent first.
- The image pool's By model is the Snapshot spend per model. Reference images and Expressions drawn with the same models count in too.
- **Owner only.** A Member can't see the Models (`.scratch/accounts/spec.md`), so for a Member both lists are empty and the tables don't show.

### Snapshot price

- A written Snapshot prompt carries `priceUsd`: what drawing it will cost at list price, from the Settings Snapshot model and size and how many in-frame Characters send a Reference image. It is worked out the same way the real gateway records the drawn image: the text-only sibling with no Reference image, the size actually drawn, and Venice's price for each input image past the first.
- The Draw button reads **Draw Snapshot · $0.04**.

## User stories

1. As the user, I turn on Show cost per reply in Settings, open a Chat, and see under each reply what it cost.
2. As the user, I tap a reply's cost and see how much was the turn, the Judge, Memory keeping, the Thoughts and so on.
3. As the user, I regenerate a reply and its cost grows by the new take.
4. As the user, I leave the switch off and see no costs anywhere in the Chat.
5. As the Owner, I open Usage and see which models and which hosts the month's money went to, and how much of each model's prompts was read from cache.
6. As the user, I read a Snapshot prompt and see on Draw what it will cost before I pay for it.

## Testing

- **API** (`apps/api/test/cost-view.spec.ts`):
  - a turn's records (the turn, the search, the Thoughts, line repair) name the new AI Message;
  - the Judge, Memory keeping and the auto Diary entries name the reply too;
  - a Regenerate adds the new take to the same Message;
  - Suggested replies name no Message, and a stopped turn's calls stay unclaimed;
  - the costs endpoint sums per Message and per kind, and refuses another Account's Chat;
  - the Usage API's By model and By host, with the cached share, for the Owner, empty for a Member;
  - a Snapshot prompt's price: the edit model with a Reference image, the text-only sibling without, 2K when set, and the extra input image price.
- **e2e** (390px, `apps/web/e2e/cost-view.spec.ts`):
  - the switch is off by default and no cost shows; turned on, a reply shows its cost and the breakdown opens on a tap;
  - the Usage page shows By model and By host;
  - the Draw button carries the price.
  - The cost line and the Usage tables are checked at 360px and 320px too.

## Out of scope

- A cost per Chat or per Story.
- Costs of user-asked calls on their Message (Thai reading, Read aloud).
- Live prices from the providers for the Snapshot price: it is the list price the records already use.
- A month picker on the Usage page.

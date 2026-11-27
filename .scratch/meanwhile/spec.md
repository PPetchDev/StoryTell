# Spec: Meanwhile (Characters live their own lives)

Status: ready-for-agent
Builds on: [Spec: Character minds](../character-minds/spec.md) (Goals as detail records, Thoughts, "Where things stand"), [Spec: Diary](../diary/spec.md) (entries written by themselves after a reply's Judge, the shape this run copies), [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the change ledger, Memory and Known by, rollback, Branch, Reset)

Asked 2026-11-26. The user: "ตัวละครยังไม่ทำอะไรเองตอนที่อยู่นอกฉาก" (Characters don't do anything on their own while they're out of the scene). Character minds listed it as out of scope; this spec takes it in. Settled with the user in two rounds the same day, every recommendation taken.

## Problem Statement

A Character who leaves the moment stops. They have a Goal, but nothing moves it while they are away: when they come back an hour of story later, they are exactly where they were, wanting the same thing, having done nothing. The world only moves where the user is looking.

## Solution

Every few replies, and whenever a Scene moves on, the Characters who are not in the moment each take one small step on their own toward what they are after, first setting an aim if they had none: a **Meanwhile** (CONTEXT.md). It is a short line of plain fact ("Tavri paid off his debt to the harbour master; he is at the quay now"), and it is now part of the story: a Memory only that Character knows, and the Narrator knows it and brings it in when they are back. The step may reach, change or give up their Goal.

The user sees a Meanwhile only by asking: a quiet "Meanwhile" button under the reply it came after, and a "Lately" list on the Character's profile. Taking that reply back takes the Meanwhile back.

"Characters live their own lives" in the Chat menu, on by default.

## Words

- **Meanwhile** (CONTEXT.md, added 2026-11-26). The UI says "Meanwhile" on the button and "Lately" on the profile. _Avoid_ "off-scene action": in CONTEXT.md a **Scene** is a stage of the plot, not the moment.
- **In the moment**: as Thoughts use it, the Characters who speak in the latest exchange. Not a CONTEXT.md term; this spec does not change it.

## User Stories

1. As a player, I want Characters who are away from the moment to keep pursuing what they want, so that the world feels alive when I'm not looking at them.
2. As a player, I want what they did to really count, so that when they come back the story knows it and they act from it.
3. As a player, I want it to be a surprise by default, so that I find out through the story, but I want to be able to peek.
4. As a player, I want taking back a reply to take back what happened meanwhile, so that rewinding stays clean.
5. As a player, I want them never to act on my Role or on the Characters in front of me, so that the moment stays mine.
6. As a player, I want to turn it off per Chat, so that a Chat can stay still if I want.
7. As a player, I want it to cost very little and never make a reply slower.

## Implementation Decisions

### When a Meanwhile run happens

- **After a reply's Judge and Memory extraction**, in the background, exactly where the Diary's own entries run (`writeDiariesAfter` / `autoDiaries` in `chat.service.ts`), as its own chained run per Chat. Only at the Chat's newest AI Message a model wrote; one overtaken by the next turn or taken back is skipped (read again before writing, as the Diary does). Never rejects; a failure is logged and the next due reply tries again.
- **Due** when either holds:
  - the Scene moved on at this reply (a Scene advance or Move on recorded at it), or
  - for some candidate, `MEANWHILE_EVERY_REPLIES` = **6** written replies have passed since their last Meanwhile (or since the Chat began, if they have none).
  Replies written during Watch count like any reply. Continue, Regenerate and Reach-outs count as written replies when a model wrote them, as for the Diary.
- **None** on the Epilogue, at an Ending reached, with text credit used up, or when the switch is off.

### Who acts

Pure function `meanwhileActors` (`apps/api/src/manager/chat/meanwhile/meanwhile.ts`), shaped like `autoDiaryWriters`:

- A Character of the cast who
  - has a current **Goal**, or has spoken in the Chat at least once (the story has met them); one with no Goal sets their first aim in the same call (changed 2026-11-27 after the real-model check: the Judge gives Goals only to Characters in the latest exchange, so those away had none),
  - is **not sitting out**,
  - is **not in the moment**: did not speak in any of the latest `MEANWHILE_AWAY_REPLIES` = **3** written replies (so one quiet reply is not "away"),
  - is due (above).
- At most `MEANWHILE_MAX_AT_ONCE` = **3**, those furthest behind first, then cast order. With nobody, no call.

### What a Meanwhile may do (the prompt's rules)

- One small, concrete step toward their own Goal, at a place that fits where they were and the Setting, done **alone or with people who are not Characters of the Story** (a shopkeeper, a guard).
- **Never**: anything done to or with the Role or any Character of the Story; meeting another Character of the Story (that is "Characters talking to each other", another feature); killing, harming badly or removing anyone; reaching or forcing an Ending or a Scene's move-on; revealing their own Secret; a sexual act. **Everyone in the story is an adult.**
- One or two sentences, past tense, plain fact, under about 40 words, ending with where they are now.
- It may report that the Goal is **reached**, **given up**, or replaced by a **new** one.

### The call

- **One background-model call per run**, call kind **`meanwhile`** (DeepSeek V4 Flash, the Judge's model), through the Model Gateway like every text call; at most 300 tokens out. Spend shows on the Usage page as "Characters living their own lives". It is not a turn call kind (not in `TURN_CALL_KINDS`).
- **The prompt** (`buildMeanwhilePrompt`): the Setting, the latest Scene, Time of day and Place, the Story so far, and the latest Messages (as much as about 1,500 tokens holds, newest kept); then one block per actor with only what that Character knows: Personality, Voice, Background, Now note, Goal, their Bonds, their newest Diary inner-life line, their latest Thought, and the Memories they are in Known by (about 600 tokens each, newest kept). Secrets and Arc directions are not given (a Meanwhile can be read by tapping, as a Thought). Each block is told that this Character does not know what is in the other blocks.
- **Trade-off, chosen with the user**: one call for all actors is cheaper than one each, at the risk that one actor's step leans on another's block. The rule above and the "not meeting another Character" rule hold that down; the real-model check looks for it.
- **The answer** (`readMeanwhile`): JSON `{"meanwhile":[{"character":"Name","did":"...","goal":null|""|"new aim"}]}`. `goal`: null keeps it, `""` reached or given up, a string replaces it. An entry for a Character not among the actors, an empty or over-long `did` (cut at 400 characters), or one naming the Role's name is dropped. Unreadable: the run failed (logged), nothing is stored.

### What it writes, all at the reply it came after

In one ledger write against that AI Message (so `rollbackFrom` takes it all back with the reply, `clear` takes it on Reset, and a Branch copies it as it copies the ledger):

- **A Memory**, text `did` as given, **Known by** only that Character, through `recordMemories` (a `memory_change` add at the Message). It is an ordinary Memory: the user can see, edit and delete it, and it reaches the Narrator, Thoughts, Diaries and Reach-outs as any Memory does, only for that Character.
- **The Goal change**, if any, as a `goal` detail record (`DetailKind.Goal`) at the Message, as the Judge writes one.
- **The Meanwhile row** in a new table **`meanwhile`**: `id`, `chat_id` (cascade), `message_id` (cascade), `character_id`, `text`, `memory_id` (nullable, set null on delete), `created_at`. It is what the button and the profile show; it keeps the words as written even if the user later edits the Memory. `rollbackFrom` deletes rows at the taken-back Messages, `clear` deletes all, a Branch copies them with the Messages they are at (a new step in `COPY_STEPS`, `model/branch/branch.service.ts`, after `copyMemories`, remapping `message_id` and `memory_id`).

### The Narrator

- In the turn's trailing **"Where things stand"** (so the cached system message never changes): "Meanwhile, away from the moment:" with each Character's newest Meanwhile from the latest `MEANWHILE_IN_PLAY_REPLIES` = **20** replies, for Characters not in the latest exchange. Told: it has happened; only that Character knows it unless the story has shown it; let it shape how they come back, where they come from and what they say, without retelling it.
- Once a Character is back in the moment, their Meanwhile reaches the Narrator only as their Memory, like any other.
- This touches `prompt.ts`: `npm run vm:deploy` stops on it, so the deploy needs the real-model measurement below or an open `--unmeasured`.

### The switch

- `chat.characters_live` boolean, **default true**, a Chat's own like `character_thoughts`: in the Chat's settings `GET`/`PATCH`, copied by a Branch, kept by Reset. Off: no new Meanwhile; the ones already written stay part of the story.
- Chat menu: "Characters live their own lives", a switch beside "Characters think for themselves".

### The web

- **Under a reply** that has Meanwhiles, a quiet "Meanwhile" button (as "Thoughts"); a tap opens each: the Character's name and the line. The Chat's Messages carry them (`meanwhile: [{ characterId, text }]`).
- **Character profile**: "Lately", that Character's Meanwhiles in this Chat, newest first, at most 5.
- **Usage page**: `meanwhile` reads "Characters living their own lives".

## Testing Decisions

- API, pure logic: `meanwhileActors` (Goal needed, sitting out, away 3 replies, due by count and by Scene move, at most 3, furthest behind first, none on Epilogue or Ending); `buildMeanwhilePrompt` (each block only its own Memories, no Secrets or Arc directions, the rules); `readMeanwhile` (goal null / "" / new, unknown names, the Role, unreadable).
- API through HTTP with the fake gateway: after the 6th reply a Meanwhile is written (Memory known by one Character, the row, the Goal change); the next turn's prompt reads it in "Where things stand"; taking the reply back removes the Memory, the row and the Goal change; Reset clears; a Branch copies; the switch off writes none; a failed call stores nothing and the turn is unaffected; Usage shows the kind.
- Browser (e2e): the "Meanwhile" button under a reply and its sheet, "Lately" on a profile, the Chat menu switch. Phone rows checked at 390, 360 and 320.

## Real-model check, before deploy (needs the user's OK for spend)

On a copy of the user's live Chat in git-ignored `.data/`: play about 12 replies with a Character away, read each Meanwhile for: stays inside the rules (no cast meetings, nothing done to Rin), only uses that Character's own knowledge, moves the Goal plausibly, and whether the Narrator brings it in when they return. Expected well under $0.10 (one reply's cost each plus a few Meanwhile calls).

## Out of Scope

- Characters meeting each other while away (another session's feature: Characters talking to each other).
- Meanwhiles by wall-clock time while the user is away, or a Push alert for one.
- A Reach-out that tells of a Meanwhile on its own (it can, through the Character's Memory).
- Bond changes from a Meanwhile.
- Meanwhiles in the Visual novel view, the Transcript or the Book.
- The user editing a Meanwhile row (they can edit its Memory).

## Further Notes

- **Built 2026-11-27, test-first** (`apps/api/test/meanwhile.spec.ts`, `apps/web/e2e/meanwhile.spec.ts`), with the fake gateway only. Not yet seen with a real model, not committed, not deployed.
- **Decided while building**:
  - The Narrator is told a Meanwhile only while its Character has not spoken since it was written (not just "not in the latest exchange"): back in the moment, they have it only as their Memory, so the block does not come back the reply after they leave again.
  - The Meanwhile's Memory is not embedded at once: the next reply's Memory extraction embeds every Memory without a vector, this one included.
  - The run is not in the Monthly cap's never-refused list, as the Diary's own entries are not: over the cap, it is refused and logged, and play goes on.
  - The story the actors read is the latest 12 Messages, fitted to about 1,500 tokens, newest kept.
- **Seen with the real models on 2026-11-27** (a private copy of live in git-ignored `.data/meanwhile-check/`, a Branch of Chat 2 with Thoughts off; DeepSeek V4 Pro for the reply, V4 Flash for the Meanwhile; four replies, $0.114 in all, $0.06 of it a Place picture the copied dressed stage drew, which this check did not need):
  - **On the live Chats as they stand, no Meanwhile would ever be written.** Every Character with a Goal was in the moment; the ones away (Dulcie 27 replies, Morra 33, Mirelle 103, Edran 341) had none, since the Judge gives Goals only to Characters in the latest exchange. For the check, Dulcie and Morra were given a Goal by hand on the copy.
  - With Goals, the first reply wrote both in one call ($0.0004): Dulcie traded a jug of milk for rope with a valley trader, for her stall; Morra walked alone to the mill pond to check the reeds for tonight's camp. Each kept to the rules: alone or with someone outside the cast, nothing done to the Role, in keeping with who they are. Their Goals stayed (`null`), rightly.
  - **The Narrator used it.** With Morra nudged back three replies later, she came to the tent flap with the pond, the reeds and the mill clearing from her Meanwhile, without retelling it.
  - **Fixed the same day**: both lines opened with "She…", so the Memory did not say who. The prompt now asks for the name first, and a line that opens with a pronoun gets the name in its place.
- `prompt.ts` gained one trailing block (`meanwhileBlock`) and one optional input; with none, the prompt is byte-for-byte as before (tested). `vm:deploy` will still stop on it until measured.

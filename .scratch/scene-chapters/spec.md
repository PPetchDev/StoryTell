# Spec: Move on, and Chapters

Status: ready-for-agent
Builds on: [Scenes that keep moving](../scene-flow/spec.md) (Scene advances, passed_by, went_to), [Story so far](../story-so-far/spec.md) (a background summary call), [Diary](../diary/spec.md) (records tied to a Message), [Prompt cache](../prompt-cache/spec.md) (standing and moment layers).
Built 2026-11-18. Terms: `CONTEXT.md` — Scene, Chapter, Move on, Story so far.

Reverses two out-of-scope lines: scene-flow's "A Move on or Skip button … choosing which Scene comes next" and story-so-far's "Summaries per Scene".

## Problem Statement

A Scene only ever moves on when the Judge says so: its condition met, its gates holding, or, after 20 replies, the story having passed it by. That keeps the plan honest, but the user is the one playing. When they know a Scene is done (the moment happened in a way the Judge reads strictly, or they simply want the next part), they can only wait. And when the plan's next Scene doesn't fit where they took the story, they can't pick the one that does.

Nothing tells the user what happened in a Scene once it ends, either. The Story so far is one account of the oldest Messages, written only once the Chat no longer fits, and it never says where one part of the story ended and the next began. In a Chat of hundreds of replies, there is no way to look back over the story part by part.

## Solution

**Move on.** The Chapters sheet (from the Scene strip, or the Chat menu) has a Move on control under the Scene the Chat is on. It ends that Scene now and goes to the next one in order, or to the Scene the user picks, or into free play. The move is a Scene advance like the Judge's, recorded against the Chat's newest AI Message, so taking that Message back (Again, another Reply version, an edit) takes the move back too. The next reply is told the user chose to move on, so it carries the story into the new Scene.

**Chapters.** Every Scene advance ends a Chapter: the part of the Chat played in one Scene. Right after it ends, a cheap background call writes a short summary of it. The Chapters sheet lists them in order, each with its Scene's name and summary, which the user can read and edit, and then the Chapter under way.

## User Stories

1. As a player, I want to end the current Scene myself, so that the story moves on when I know the moment is done.
2. As a player, I want Move on to go to the next Scene in order by default, so that the plan is kept unless I choose otherwise.
3. As a player, I want to choose which Scene comes next, so that the story can go to the part that fits where I took it.
4. As a player on the last Scene, I want Move on to go into free play, so that I can leave the plan behind.
5. As a player in free play, I want to pick a Scene to go into, so that I can pick up a part of the plan again.
6. As a player, I want the next reply to carry the story into the Scene I chose, so that the move shows in the story and not only in the strip.
7. As a player, I want Move on to take back with the reply it was made at, so that Again, another Reply version and an edit leave the Scene as it was before that reply.
8. As a player, I want Move on refused while a reply is being written or its feelings and Scene are still being saved, so that the Judge and I never move the Scene at the same moment.
9. As a player, I want to see on the Dashboard that I moved the story on, so that I can tell my moves from the Judge's.
10. As a player, I want a short summary of each Scene once it ends, so that I can look back over the story part by part.
11. As a player, I want the Chapters in order with their Scene names, so that the list reads like a table of contents.
12. As a player, I want to edit a Chapter's summary, so that I can fix what it got wrong.
13. As a player, I want my edit kept, so that the AI never writes over it.
14. As a player, I want a Chapter to go when the Scene advance that ended it is taken back, so that no Chapter tells of a story that was undone.
15. As a player, I want a Branch to keep the Chapters up to its Message, so that the new Chat shares the past it came from.
16. As a player, I want a failed summary to show and to be tried again when I ask, so that a hiccup never costs me a Chapter, and never spends credit over and over.
17. As a player, I want my older Chats' past Scenes summarised too, a few at a time, so that the list fills in without a burst of calls.
18. As the owner, I want the Chapters never to change the cached part of the turn prompt, so that play costs what it did.
19. As a player on a 360px phone, I want the sheet and Move on to fit and be easy to tap, so that I can use them where I play.

## Implementation Decisions

### Move on

- **Who moves.** A Scene advance gains `moved_by`: `judge` (every existing row, and the Judge's from now on) or `user`.
- **Where it is recorded.** Against the Chat's newest AI Message (the Opening counts), as a Diary entry is. Taking that Message back rolls it back in `rollbackFrom`, with no new code. Branch copies it, Reset clears it.
  - A Judge advance and a user one may share a Message (the Judge moved the Scene on at that reply, then the user moved it again). The rollback undoes them newest first, so the Chat lands back where it was before both.
- **Where it may go.** Any Scene of the Story other than the current one, or free play (`toSceneId: null`) while the Chat is on a Scene. From free play, any Scene. Anything else is refused (400). A Story with no Scenes has no Move on.
  - Going to an earlier Scene is allowed: the user is the one playing.
- **Default.** The control preselects the next Scene in order, or free play from the last Scene, or the first Scene from free play.
- **When it is refused.**
  - While a turn is being written (409, as a send is).
  - While the newest reply's Judge or Memory call is pending (waited for first, as an edit is; then 409 "still saving").
  - While either failed (409, with Retry, as a send is): a Judge retried after a move would judge the reply against the new Scene.
  - It takes the turn lock while it writes, so a send meanwhile is refused.
- **The event.** "You moved the story on." The Dashboard already shows from and to.
- **After the move.** The Chapter it ends starts being written in the background. No other model call runs.
- **The next reply.** While the Chat is on a Scene the user moved to and no reply has been written in it yet, the Narrator's Scene line adds: "{identity} has chosen to move the story on to this Scene. Let this reply bring the story there: bridge any time or distance it needs in a line or two of narration, then begin the Scene. Never write what {identity} says or does."
  - It is part of the Scene layer, which is a moment layer, in the closing user message. The cached opening is unchanged.
  - A move into free play adds nothing: "No Scene" already says the story unfolds freely.
- **The Judge is not changed.** Its system message stays identical call to call. The replies in the Scene count from the user's move as from any advance, so the Lingering and Passed-by thresholds start again.
- **Diary.** A user's move is not a reply, so the Characters don't write Diary entries for it. The next reply's Judge decides those as before.
- **API.** `POST /api/stories/:storyId/chats/:chatId/scene` with `{ toSceneId: number | null }` answers with the Chat. The Chapters' own endpoints are below.

### Chapters

- **Domain term.** A **Chapter** is the part of one Chat played in one Scene: from where the Scene began (the Opening, or the Message of the advance before) through the Message of the Scene advance that ended it. A Scene is the author's plan; a Chapter is what happened in one Chat while it was on that Scene. The Chapter under way has no summary.
- **Storage.** On the Scene advance itself, which already is the end of a Chapter. New columns, in one migration:
  - `chapter_summary` (text, null until written);
  - `chapter_by` (`ai` or `user`);
  - `chapter_failed` (text, null unless the last try failed);
  - `chapter_updated_at`.

  Because the Chapter lives on its advance, a rollback deletes it with the advance, a Branch copies it with the advance, and Reset clears it. No generation counter is needed: a summary that lands after its advance was rolled back updates nothing.
- **When it is written.**
  - After every reply's Judge settles, and right after a user's move.
  - One run per Chat at a time. A run asked for while one runs runs once after it.
  - A run writes the Chapters never tried yet (no summary, no failure), newest first, at most `CHAPTERS_PER_RUN` (2). A new Chapter is written straight away; an older Chat's past Chapters fill in two per turn.
  - A failed Chapter is not retried by itself. The sheet shows "Couldn't write this one." and a Try again button, which writes that one Chapter (`POST …/chapters/:id/write`). So a Chapter that always fails never costs credit over and over.
  - A Chapter with no Messages (two advances at one Message) is never written. It shows "Nothing happened in this Scene."
- **How it is written.** One background text call, kind `chapter_summary`, on the background model (V4 Flash, reasoning off, not JSON, host defaults), capped at 400 tokens.
  - Input: the Chapter's Messages, rendered as the Story so far renders them (`[Speaker]` then the text), the Scene's name, the worn identity and the cast's names, and the previous Chapter's summary as context only.
  - Rules: 40 to 80 words, two to four sentences of plain prose, third person and past tense, the worn identity by name and never a guessed gender, every character an adult, only what the Messages show, no retelling of the previous Chapter, and no claim about what the Scene was meant to bring about.
  - The Scene's situation and condition are not sent. The passed-by event showed that restating a Scene's goal makes the model claim it did or didn't happen.
  - The output guard is the Story so far's: an answer that used the whole cap, opens with a speaker tag of the Messages, or is empty is asked for once more, then the try fails with the reason. A leading "Chapter summary:" or "Summary:" label is dropped.
  - Length is not capped on input, as with the Story so far. A long Scene (40 replies) is about 20k tokens, about $0.003 on V4 Flash.
- **Monthly cap.** `chapter_summary` is not one of the never-refused background kinds. A Member at their cap gets a failed Chapter they can try again later.
- **The user's edit.** `PUT …/chapters/:id` with `{ text }` saves it with `chapter_by: user`. Empty text is refused. The AI never writes over it: its update only lands while the row is still `ai` with no summary.
- **The Story so far does not draw on the Chapters.** Decided:
  - It is written from the original Messages every time so nothing fades over rewrites (story-so-far, "How it is written (from scratch)"). Chapters are summaries of summaries' worth of detail: building on them brings back the loss that design avoids.
  - Adding input to that writer made it worse before (story-so-far, "Scene goals: tried and dropped").
  - The user's corrections already reach it through its own edit.
  - A Chapter marks where Scenes changed, which the account doesn't need: it tells events in order.
- **No prompt reads the Chapters.** Not the turn, the Judge, Suggested replies or Write for me. They are for the user to read. So nothing about them can change the cached standing part of the turn prompt (prompt-cache, "Decision"), and they add no tokens to any turn.
- **API.**
  - `GET /api/stories/:storyId/chats/:chatId/chapters` returns `{ current, chapters }`:
    - `current`: the Chapter under way: its number and its Scene (`{ id, name }` or null in free play).
    - `chapters`: oldest first, each with `id` (the advance's), `number`, `sceneName` (the Scene it ended), `toSceneName`, `movedBy`, `event`, `messageId`, `endedAt`, `summary`, `writtenBy`, `status` (`written`, `writing`, `failed` or `empty`), `failedReason`.
  - `PUT /api/stories/:storyId/chats/:chatId/chapters/:chapterId` with `{ text }` answers with the list.
  - `POST /api/stories/:storyId/chats/:chatId/chapters/:chapterId/write` tries a failed one again and answers with the list; refused (409) for one that isn't failed.
- **Web.** One **Chapters** sheet:
  - Opened from a book button on the Scene strip, beside ✕, and from the Chat menu's "Chapters" row (so it works with the strip hidden). Only for a Story with Scenes.
  - The Chapters, oldest first: "Chapter N · Scene name", the summary or its state, "Edited by you" when the user wrote it, "You moved on" when they did, and Edit. Editing is a textarea with Save and Cancel, as the Story so far's.
  - Last, the Chapter under way: "Chapter N · Scene name (now)" or "Free play (now)", with "Move on to" and a select of the Scenes and free play, then "Move on". The button is disabled while a turn or write is in flight. A refusal shows in the sheet.
  - On a move the Chat on screen updates (the strip shows the new Scene) and the sheet reads the list again. While a Chapter is being written, the open sheet reads it again every few seconds.
  - Everything fits at 360 and 320px wide; tap targets are 44px.
- **Usage.** The Usage page lists `chapter_summary` as "Chapter summaries".

## Testing Decisions

- **Pure** (`test/chapters-pure.spec.ts`):
  - the Messages each Chapter covers, the first from the Opening, a later one from after the previous advance, and an empty one;
  - which Chapters a run writes: never-tried ones, newest first, at most two;
  - the prompt: the Messages, the identity rule, the previous summary as context, no situation or condition;
  - parsing and the guard;
  - the Scene line's "chosen to move the story on" sentence, only at zero replies in a Scene the user moved to.
- **API** (`test/scene-chapters.spec.ts`, fake gateway, scripted Judge):
  - Move on goes to the next Scene, to a chosen one, and into free play, and from free play into a Scene; a bad target is refused;
  - it is recorded as `moved_by: user` against the newest AI Message; the Dashboard shows its event;
  - it is refused during a pending Judge that does not settle, and after a failed Judge;
  - Again (Regenerate) and an edit of that reply take it back; a reply after the move does not;
  - the next turn's prompt has the chosen-Scene sentence in the closing message and the same standing system message as the turn before;
  - a Judge move_on writes a Chapter of the right Messages; a user move does too;
  - two Chapters per run at most, newest first;
  - a failed write shows `failed` and is not tried again after the next turn; Try again writes it;
  - the user's edit is kept and a late AI write does not replace it;
  - rollback takes the Chapter with its advance; a Branch keeps those up to its Message; Reset clears them.
- **e2e** (`e2e/scene-chapters.spec.ts`, phone size with touch, then measured at 360 and 320): open the sheet from the strip, Move on to the next Scene and see the strip change, a written Chapter's summary shows, edit it, pick another Scene, a failed one and Try again, and the sheet from the menu with the strip hidden.

## Out of Scope

- The Narrator or the Judge reading Chapters.
- A Chapter title other than its Scene's name, or Chapters in the Transcript.
- Regenerating a written Chapter's summary (Edit covers fixing one).
- Diary entries for a user's move.
- Per-Story settings to hide Move on.

## Further Notes

- Not tried with a real model: the summary's quality is for playing to show. A paid check worth running later: write the Chapters of live Chat 2's ~25 past Scenes once (V4 Flash, about 25 calls of 5-20k tokens, about $0.04 in all) and read them against the Messages.
- Live Chat 2 has many past Scene advances. Once this ships, its Chapters fill in two per turn, newest first.

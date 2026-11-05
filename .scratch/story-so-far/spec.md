# Spec: Story so far

Status: done

## Problem Statement

A long Chat outgrows the turn prompt's budget of about 16k tokens. Once it does, the oldest Messages are left out of the prompt with nothing in their place, so the AI forgets how the story began. A promise made early on, a name, or an event from the first night all drop away. Memory keeps facts, but not the run of events. Chat 1 of Story 1 is at 62 Messages and about 14k tokens, so it is close to that edge.

## Solution

Each Chat gets a **Story so far**: a prose account, in order, of everything that happened in the Messages the prompt can no longer hold. It is sent in every turn's prompt, after Memory and before the recent Messages. The Messages it covers then stop being sent word for word. It is written by a background call before any Message falls out, so nothing is ever left with neither its words nor its summary in the prompt. Each time it is written again from all the covered Messages, not by rewriting the last summary, so details don't fade over many rewrites. The user can read it and correct it in the Memory drawer, and their corrections win over what the AI writes next.

## User Stories

1. As a player in a long Chat, I want the AI to remember how the story started, so that early promises, names and events still shape what happens.
2. As a player, I want nothing to drop out of the AI's view without a summary in its place, so that there is never a gap in what it knows.
3. As a player, I want each Story so far written from the original Messages every time, so that details don't fade after many updates.
4. As a player in a short Chat, I want no summary until one is needed, so that I pay nothing extra while the whole Chat still fits.
5. As a player, I want to read the Story so far in the Memory drawer, so that I can see what the AI holds of the early story.
6. As a player, I want to edit the Story so far, so that I can fix something it got wrong or add something it missed.
7. As a player who edited it, I want later updates to keep my corrections, so that my fix isn't thrown away on the next rewrite.
8. As a player, I want a failed update never to block sending, so that a hiccup in the background never stops play.
9. As a player, I want a failed update tried again on the next turn on its own, so that I don't have to press anything.
10. As a player who edits or regenerates an early Message, I want a Story so far that covers that Message thrown out and rebuilt when needed, so that it never tells of events that no longer happened.
11. As a player who resets a Chat, I want its Story so far cleared, so that a fresh start has no old summary.
12. As a player, I want the Story so far to name my character by name and not guess their gender, so that it reads right for whoever I play.
13. As a player, I want the Story so far to tell events, not repeat the Memory list, so that the prompt doesn't carry the same thing twice.
14. As a player, I want Suggested replies to read the Story so far too, so that suggestions fit the whole story.
15. As a player, I want to see how much of the Chat the Story so far covers, so that I know which Messages it stands in for.

## Implementation Decisions

- **Domain term.** "Story so far" (glossary): a per-Chat prose account of the events in the Messages the turn prompt no longer sends word for word. It is not a Memory: Memories are facts, and the Story so far is the run of events. A Chat has at most one.
- **Storage.** New columns on the Chat:
  - the text;
  - the position of the last Message it covers (null while there is none);
  - who wrote the current text (`ai` or `user`);
  - when it was written;
  - the reason the last update failed, if it did.

  These are added in one migration. They are Chat state outside the ledger, like the worn Persona.
- **Covered Messages.** The Story so far covers the Messages from the first one through its position. The turn prompt sends it as a layer and leaves those Messages out of the history. The recent Messages that follow are trimmed to the budget as before.
- **Prompt layer.** A new system layer, "Story so far", placed after Memory, inside the one system message. It holds the text and a line saying it covers everything before the Messages that follow. The turn prompt and the Suggested replies prompt both get it, because they share the system layers. With no Story so far, the prompt is exactly as before.
- **When it is written (no gap).** After every turn, the background work checks the room left for the recent Messages: the budget minus the system layers (including any current Story so far), the user's message and the final instruction. When the Messages after the covered ones would take more than that room minus 1k tokens of margin, an update runs. It moves the covered position forward until what is left fits in that room minus 4k tokens. That leaves headroom for several turns before the next update, and no Message is ever left out uncovered unless updates keep failing. A Chat that still fits never makes the call.
- **How it is written (from scratch).** One background text call, kind `story_summary`, on the background model (V4 Flash on DeepInfra, reasoning off, not JSON). Its input is every Message from the first through the new covered position, as the turn history renders them, plus the worn identity and the cast's names. If the current text was written by the user, that text goes in too, with the instruction that its corrections win where it and the Messages differ. The instruction asks for:
  - at most about 500 words;
  - the events in order, third person, the worn identity by name;
  - no guessed gender for the worn identity unless the Role or Persona states one;
  - no repeating the Memory list;
  - no new events.
- **Failure.** A failed or unreadable update keeps the old text and position, records the reason, and never blocks a send. The next turn's check runs it again. Until then, the trimming that already exists leaves out the oldest uncovered Messages.
- **Edits, Regenerate, Reset.** Any rewind from a position at or before the covered position clears the Story so far. That covers an edited User or AI Message and a Regenerate. The next check writes it again from the remaining Messages when needed. A Reset clears it too. A user-written Story so far cleared this way is lost, because the events it told were rewound away.
- **Concurrency.** At most one update per Chat runs at a time. A turn never waits for one. An update that finishes after a rewind cleared the Story so far, or after the user saved their own text, is dropped, so it never overwrites either.
- **API.**
  - `GET /api/stories/:storyId/chats/:chatId/story-so-far` returns:
    - the text, or null when there is none;
    - `coveredMessages`, the number of Messages it covers;
    - `writtenBy`;
    - `updatedAt`;
    - `failedReason`, or null.
  - `PUT` with `{ text }` saves the user's text and sets `writtenBy` to `user`. It is refused while there is no Story so far yet, because there is nothing it would cover. Empty text is refused.
- **Web.** In the Memory drawer, a "Story so far" card above the List/Graph switch:
  - With no Story so far, it reads "Not needed yet: the whole Chat still fits."
  - Otherwise it shows the text, "Covers the first N Messages", and who wrote it, with an Edit button that saves through the PUT.
  - A failed last update shows one quiet line that it will try again on the next turn.

## Testing Decisions

- Tests check behaviour at the existing seams only: HTTP through the API with the fake Model Gateway (`apps/api/test/*.spec.ts`), pure prompt functions, and Playwright e2e at 390px with touch. Prior art: `snapshots.spec.ts` and `suggested-replies.spec.ts` for background calls and prompts, and `memory.spec.ts` and `memory-graph.spec.ts` for the drawer.
- **Prompt (pure).**
  - With a Story so far, the layer appears after Memory and the covered Messages are left out.
  - Without one, the prompt is unchanged.
  - Suggested replies get the layer too.
- **Trigger (API, small token budget in tests).**
  - A Chat that fits makes no `story_summary` call.
  - Past the threshold, one call runs. Its input holds every Message through the new position, and the next turn's prompt carries the summary and leaves those Messages out.
  - A second update sends all covered Messages again, not the old summary alone.
- **User edit.** The PUT stores `writtenBy: user`. The next update's input carries that text with the "corrections win" instruction.
- **Failure.** A failed call leaves the old text and records the reason, a send is not blocked, and the next turn retries.
- **Rewind.** Editing a covered Message, Regenerate after the covered position is reached by a rewind, and Reset each clear it. An update that lands after a clear is dropped.
- **e2e.** The drawer shows "Not needed yet" on a short Chat. Seeded with a Story so far, it shows the text and the count, and editing saves.

## Out of Scope

- Searching the full history (vector retrieval), and choosing which Memories to send by relevance.
- Version history of the Story so far, or an undo of an AI update.
- Pausing automatic updates.
- Summaries per Scene, or a hierarchy of summaries.

## Further Notes

- The user chose a full rewrite every time (no compounding loss) over an incremental rewrite, accepting a cost that grows with the Chat. On V4 Flash that is about $0.01 per update for a very long Chat. If a Chat ever gets too big for one call, an incremental fallback can be added then.
- This supersedes the MVP spec's out-of-scope line for a "Story so far" summary layer.

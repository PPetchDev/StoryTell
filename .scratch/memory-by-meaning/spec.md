# Spec: Memory found by meaning, and Beliefs

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (Memory, memory extraction), [Documents](../documents/spec.md) (embeddings and the per-turn search), [Story so far](../story-so-far/), [Bond axes](../bond-axes/spec.md)
Decided in the grilling of 2026-11-11 (Bond, Arc and Memory upgrade, ideas 1 and 4). Terms: `CONTEXT.md` — Memory, **Belief**, **Starting Beliefs**, Story so far, Document.

## Problem Statement

A Chat can keep only so many Memories. Past about 2,000 tokens or 60 Memories, the extraction is told to merge and archive them, and the turn leaves out the oldest ones it can't fit. In a long story, details the user cared about get blurred into summaries or dropped, and a promise made thirty turns ago is gone when it finally matters. Every turn sends the same Memories however unrelated they are to what is happening now.

Separately, every Memory is a fact. When a Character is lied to, guesses wrong or misremembers, there is nowhere to record it, so the Narrator either forgets the deception or lets the Character know the truth too early. The user's own Story leans on secrets: the tribe doesn't know Petch is a Marquis.

## Solution

A Chat keeps every Memory it makes: no more merging or archiving to stay under a cap. Each Memory is embedded, as a Document passage is. On every turn the Narrator gets up to about 4,000 tokens of Memories, in this order:
1. the ones the user locked;
2. the ones closest in meaning to the moment;
3. the newest ones about the people present.

The moment is found with the same query, and the same single embedding, as the Documents search. Suggested replies, Write for me and Snapshots choose the same way. If the locked ones alone fill most of the room, the Memory drawer says so.

A **Belief** is something one Character holds to be true, which may be false. The memory extraction records one when a Character is lied to or gets something wrong, and gives it up when the story shows them the truth. The Narrator is told what each Character present believes. The user sees Beliefs in the Memory drawer, marked as belief, and sees which Memory each one contradicts. An author can set **Starting Beliefs** that every new Chat begins with.

## User Stories

1. As a player in a long Chat, I want every Memory kept, so that nothing I cared about is merged away.
2. As a player, I want the Memories that matter to this moment to reach the Narrator, so that a promise from long ago comes back when it's relevant.
3. As a player, I want the Memories I locked always sent, so that what I pinned is never forgotten.
4. As a player, I want the newest Memories about the people present sent too, so that the recent past is always there.
5. As a player, I want about twice the Memory room the Narrator has today, so that Characters remember more detail.
6. As a player, I want a note in the Memory drawer when my locked Memories fill most of the room, so that I know to unlock some.
7. As a player, I want the Memory search to cost almost nothing, so that it adds nothing I notice to a turn.
8. As a player, I want Memory and Documents found with one search, so that a turn doesn't pay for two.
9. As a player, I want a Memory I add or edit to be found by meaning right away, so that my changes count from the next turn.
10. As a player with existing Chats, I want their Memories embedded once in the background, so that they join in without my doing anything.
11. As a player, I want a turn to go ahead if the Memory search fails, using the newest Memories instead, so that play is never blocked by it.
12. As a player, I want Suggested replies, Write for me and Snapshots to choose Memories the same way, so that they agree with the turn.
13. As a player, I want the Memory drawer to show which Memories the last turn used, so that I can see what the Narrator had in mind.
14. As a player, I want a Character who was lied to to keep believing the lie, so that the deception plays out.
15. As a player, I want the Narrator told what each Character present believes, so that they act on it.
16. As a player, I want a Character never handed the truth that contradicts their Belief until they learn it, so that the secret holds.
17. As a player, I want a Belief given up when the story reveals the truth, so that the reveal changes how they act.
18. As a player, I want to see Beliefs in the Memory drawer marked "Nara believes…", so that I know who believes what.
19. As a player, I want a Belief that contradicts a Memory to say so, so that I can see the gap between belief and truth.
20. As a player, I want given-up Beliefs shown apart, with when they were given up, so that I can follow the reveal.
21. As a player, I want to add, edit and delete Beliefs myself, so that I can set up or fix a deception.
22. As an author, I want to set Starting Beliefs, so that a Chat begins with the secrets in place.
23. As an author, I want Starting Beliefs in the Story editor next to Starting Bonds, so that a Character's opening state is in one place.
24. As an author, I want Duplicate to copy Starting Beliefs, so that a copy keeps its secrets.
25. As a player, I want a Branch to carry the Beliefs as they were at that Message, so that the Branch keeps its secrets.
26. As a player, I want Reset to restore the Starting Beliefs, so that a fresh start keeps the secrets.
27. As a player, I want editing or regenerating a reply to undo the Beliefs it made or gave up, so that they always match the story.
28. As a player, I want Beliefs to count inside the same Memory room, so that a turn doesn't grow without limit.
29. As the owner, I want Memory embedding and search logged in the text pool under their own kinds, so that I can see what they cost.
30. As a player, I want Story so far to start no earlier than today because Memory grew, so that the room for history is planned for.

## Implementation Decisions

### Keeping every Memory

- **The cap is gone.** The extraction prompt no longer counts Memories or tokens, and no longer demands merges or archives. Merge and archive stay available as operations the model may choose when Memories truly repeat, and locked ones still accept only known-by changes.
- **Archived Memories:** those that already exist stay archived. They are not sent, as today, but they are embedded and can be found by meaning once more. A found archived Memory goes into the turn like any other.

### Embedding Memories

- **Storage:** Memory gains `embedding` (`real[]`, unit length, nullable) and `embedding_model`, as Document passages store theirs. No pgvector: similarity stays an in-memory dot product, as for passages. A Chat holds hundreds of Memories, not thousands of passages.
- **When:**
  - After each extraction is recorded, the Memories it added or whose text it changed are embedded together in one `embedTexts` call, of the new kind `memory_embedding`, in the text pool.
  - A Memory the user adds or edits is embedded the same way when it is saved.
  - A failed embedding leaves the vector null and never fails the extraction or the save.
- **Backfill:** a background job at API start embeds, in batches, every Memory with no vector or with another model's vector. It runs once and costs well under a cent across all Chats. It also re-tries the ones that failed.
- **A Memory whose text changes** loses its vector until it is embedded again.

### Choosing Memories for a turn

- **The query:**
  - It is the Documents query: the user's text and the 4 newest Messages, the same text limit.
  - It is embedded once per turn. The vector is then used for both Documents and Memory.
  - The search runs when the Story has passages, or the Chat has Memories with vectors, or both.
  - Its kind is the new `context_search`, labelled "Memory and Document search". The old `document_search` records keep their label.
- **The choice is a pure function.** It takes:
  - the Chat's Memories, with their known-by, locked flag and vector;
  - the active Beliefs;
  - the people present and the worn identity;
  - the query vector, or none;
  - the budget.

  It answers the Memories and Beliefs to send, and why each was chosen: locked, close in meaning, recent, or believed.
- **The order of filling the budget (4,000 tokens):**
  1. Every locked Memory, oldest first. They are never left out, even past the budget.
  2. The active Beliefs of the Characters present, oldest first.
  3. Memories by closeness to the query, closest first, above a similarity floor (0.35, tuned with the Documents floor in mind).
  4. The newest Memories about the people present or the worn identity, newest first.
  5. Nothing else.

  The Memories chosen are then written in their story order, oldest first, as the layer is today. When there is no query vector (the search failed, or nothing is embedded yet), step 3 is skipped and step 4 fills the room.
- **Every reader uses it:** the turn, Suggested replies, Write for me and the Snapshot prompt all call the same choice with the same query. A Snapshot used to get every Memory, so now it gets the chosen ones.
- **The budget is reserved:** the turn budget and the Story so far trigger reserve 4,000 tokens for Memory instead of about 2,000, so Story so far may begin a little sooner in a Chat that is already long. A Chat with few Memories uses less and leaves the rest to the history, as today.
- **"Used last turn":** the Chat response marks the Memories and Beliefs the last turn sent. The Memory drawer can show "In play" on them, as Lore and Documents in play do.
- **The locked warning:** when the locked Memories alone take more than half the budget, the Memory drawer says "Your locked Memories take most of the room, so fewer others reach the story. Unlock some you no longer need."

### Beliefs

- **Storage:** a new `belief` table:
  - `chat_id`;
  - `character_id` (CASCADE);
  - `text` (with `{user}`, as Memories);
  - `contradicts_memory_id` (nullable, SET NULL);
  - `written_by` (ai or user);
  - `message_id` (the Message that made it, nullable for a seed);
  - `given_up_message_id` (nullable);
  - `created_at`.

  A Belief is active until it has a `given_up_message_id`.
- **The ledger:** a new `belief_change` (`add`, `update`, `give_up`, `delete`, with the before and after state and the Message), like `memory_change`. Rolling back past a Message undoes its Belief changes, as for Memories.
- **Starting Beliefs:** a new `starting_belief` table (`story_id`, `character_id`, `text`). Seeding a Chat (create and Reset) writes one Belief per Starting Belief, as Starting Bonds seed Bonds.
- **The extraction makes and gives up Beliefs.** The memory prompt gains:
  - a rule: "When a Character is told something false, or wrongly concludes something, record it as their Belief. When the story shows them the truth, give the Belief up."
  - two operations: `believe { character, text, contradicts? }` (`contradicts` is an existing Memory's number) and `give_up { belief, because }`.
  - the active Beliefs, numbered, beside the Memories.

  Apply drops a Belief about an unknown or sitting-out Character, a duplicate of an active Belief, and a give-up of a Belief that isn't active. No extra model call.
- **Told to the Narrator:**
  - Each active Belief of a present Character is a line in the Memory layer: "Nara believes: {user} is a wandering herder."
  - The truth it contradicts stays a Memory with its known-by. A Character who doesn't know it isn't listed as knowing it, so the existing rule already keeps it from them, and nothing new is needed.
  - The Memory layer's instruction gains: "A Character acts on what they believe, even when it is wrong."
- **In the Memory drawer:**
  - a "Beliefs" section under the Memories, grouped by Character: "Nara believes …", with "Doesn't match: <the Memory>" when it contradicts one;
  - given-up Beliefs folded below, with "Gave this up: <the Message's line>";
  - the user can add (pick a Character, write the text, optionally pick the Memory it contradicts), edit and delete;
  - the Memory graph doesn't draw Beliefs.
- **API:**
  - `GET` comes with the Chat;
  - `POST/PATCH/DELETE /api/stories/:storyId/chats/:chatId/beliefs[/:beliefId]`;
  - `PUT /api/stories/:storyId/starting-beliefs`, the whole list, answers the Story.
  - Validation errors as for Memories; a missing Belief is a new `BeliefNotFoundError` in the Chats domain.
- **Copying:**
  - Branch copies Beliefs and their changes with remapped ids, then rolls back past the Message. This extends Branch's copy, with a test.
  - Reset clears them and re-seeds the Starting Beliefs.
  - Duplicate copies Starting Beliefs.
  - Character cards don't carry them.

## Testing Decisions

- Test external behaviour at the existing seams:
  - the new pure choice function;
  - the pure memory prompt and apply;
  - the HTTP API through the fake gateway, whose embeddings are deterministic from the words;
  - e2e at 390px.
- **Pure tests** (prior art: `memory-layer-cap.spec.ts`, `document-search.spec.ts`):
  - the choice fills in order: locked, Beliefs of those present, closest above the floor, newest about those present;
  - locked go past the budget;
  - no query vector falls back to newest;
  - an archived Memory can be found;
  - the output is in story order with each reason;
  - the prompt no longer demands merges at any count;
  - `believe` and `give_up` parse and apply, with the drops listed above.
- **API tests** (prior art: `memory.spec.ts`, `documents-in-turns.spec.ts`, `branch.spec.ts`, `story-duplicate.spec.ts`):
  - an extraction's new Memories are embedded in one `memory_embedding` call;
  - a turn makes one `context_search` call and its prompt carries the Memory closest to the query, over an older unrelated one, under a 4k budget;
  - a Story with Documents and Memories still makes one search call;
  - a failed search still writes the turn, with the newest Memories;
  - the locked warning appears past half the budget;
  - a scripted `believe` shows in the Chat, reaches the Narrator as "X believes: …", and `give_up` takes it out;
  - Regenerate undoes a Belief the replaced reply made;
  - Starting Beliefs seed a new Chat and Reset;
  - Branch carries Beliefs;
  - Duplicate copies Starting Beliefs;
  - the backfill embeds Memories with no vector;
  - Snapshot, Suggested replies and Write for me use the chosen Memories.
- **e2e** (prior art: `memory.spec.ts`, `memory-graph.spec.ts`, `story-editor.spec.ts`):
  - the drawer shows "In play" on used Memories;
  - a Beliefs section reads "Nara believes …" with "Doesn't match";
  - adding a Belief from the drawer;
  - the locked warning;
  - Starting Beliefs in the Story editor.

## Out of Scope

- A per-Chat or Settings choice of Memory budget (a later spec if 4k proves wrong).
- Beliefs about other Characters' Beliefs, or Beliefs held by the user.
- Beliefs drawn in the Memory graph.
- pgvector or any vector index.
- Embedding Lore entries. They stay keyword triggers.

## Further Notes

- Build after [Bond axes](../bond-axes/spec.md). They touch different tables; both touch the Memory drawer and the prompts.
- Cost: an extraction's embedding is a few cents per thousand turns. The per-turn search is the one Documents already makes, now made whenever there is something to search.
- Open question: should the similarity floor for Memories differ from the Documents floor? Memories are short and Thai-English mixed. Recommended: start at 0.35, and log the scores of the chosen ones in development, to tune it.

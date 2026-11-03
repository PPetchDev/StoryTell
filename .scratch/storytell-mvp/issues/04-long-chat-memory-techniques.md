# How long roleplay Chats keep their memory

Type: research
Status: resolved
Blocked by: none
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What techniques do roleplay and long-conversation apps use to keep long chats coherent within a context window — rolling summaries, extracted fact lists, lorebooks/world info, retrieval — and which of them suit a user-visible, user-editable Memory list per Chat? Include token-budget trade-offs and how tools like SillyTavern implement them.

## Answer

Findings: branch `research/long-chat-memory-techniques`, file `docs/research/long-chat-memory-techniques.md` (commit 459918c).

- All studied tools layer the prompt the same way: a small always-sent block, lore inserted only when relevant, a summary of the past, then recent messages verbatim. Mid-prompt facts are used least reliably, so a bigger window doesn't remove the need.
- Rolling summaries are cheap but lossy and can invent details (SillyTavern default: ~200 words every 10 messages; MemGPT paper: 32–39% recall with recursive summaries vs 67–93% with searchable full history).
- An extracted fact list (mem0 / Letta style: one item per fact, add/update/delete merging, capped always-in-prompt block) maps most directly onto a user-editable Memory list. mem0 on LOCOMO: ~1.8k vs ~26k tokens per question, accuracy 66.9% vs 72.9%.
- Lorebooks fit Story/Character definitions better than Memory; vector search is hard for the user to curate, unpredictable, and breaks prompt caching.
- Prompt caching drives cost: put unchanging Story content first, Memory next, fast-changing layers last; drop old messages in batches.
- Open for Memory design: who writes Memories (user, model, or model + user confirmation); always-sent vs selected per turn; keeping Bond state out of visible Memories; what happens to a Memory when its source message is edited.
- No official docs found for Zeta's or Character.AI's memory; Storychat used as the closest stand-in.

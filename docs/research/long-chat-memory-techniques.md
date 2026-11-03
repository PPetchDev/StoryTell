# How long roleplay Chats keep their memory

Research for ticket `.scratch/storytell-mvp/issues/04-long-chat-memory-techniques.md`.
Researched 2026-11-03. Terms follow `CONTEXT.md`: a **Memory** is a fact a Chat carries forward, visible to and editable by the user, and it belongs to one Chat.

This document makes no decision. It describes the options and their trade-offs for a later ticket.

## Summary

- Every tool studied builds the prompt from a few layers. There is a **fixed block that is always sent** (KoboldAI "Memory", Letta memory blocks, SillyTavern constant World Info). There is **conditionally inserted lore** (World Info, triggered by keywords or embeddings). There is a **compressed past** (rolling summary). Last comes the **recent verbatim window**. The tools differ mainly in who writes each layer and when it is refreshed.
- **Rolling summaries** are cheap and simple (SillyTavern's default refreshes a 200-word summary every 10 messages). They are lossy, and they can hallucinate. In the MemGPT evaluation, a recursive-summary baseline recalled old details far worse than a system that could search the full history.
- **Extracted fact lists** pull discrete facts out of new turns with an LLM and merge them into a store using add, update and delete decisions. Examples are mem0, and Letta/MemGPT self-edited core memory. Of all the techniques, this one maps most directly onto a user-visible, user-editable list of Memories.
- **Lorebooks / World Info** are author-written entries keyed by trigger words. They save tokens and are deterministic, but they are authored, not learned from the Chat. They fit Story and Character definitions better than Memory. SillyTavern does have a per-chat variant ("Chat Lore").
- **Vector retrieval** over past messages finds forgotten scenes without anyone curating them. The results are opaque, nondeterministic, and not something a user edits. SillyTavern also notes that it conflicts with prompt caching.
- Token budget matters in two ways: how much fits, and **what changes between turns**. Provider prompt caches only discount an unchanged prefix. Any layer that changes often, if placed early in the prompt, makes the whole remaining prompt cost full price.

## How the context is assembled (common frame)

Context layouts look alike across tools, and position matters to the model:

- KoboldAI puts **Memory** at the very top ("the first thing that the AI sees every time you click Send"). **World Info** comes after Memory, before the story text. The **Author's Note** is inserted "only a few lines above the new text", so it has the strongest effect on the current scene. ([KoboldAI wiki: Memory, Author's Note and World Info](https://github.com/KoboldAI/KoboldAI-Client/wiki/Memory,-Author's-Note-and-World-Info))
- SillyTavern's Author's Note can sit after the Scenario or in-chat at a chosen depth. "Notes closer to the bottom of the prompt have more influence on the next response." A chat-specific note applies only to the current chat. ([SillyTavern: Author's Note](https://docs.sillytavern.app/usage/core-concepts/authors-note/))
- SillyTavern lists the prompt elements roughly in this order: main instructions, character definitions, persona, World Info, Data Bank, summaries, previous messages, user message, final instructions. ([SillyTavern: Prompts](https://docs.sillytavern.app/usage/prompts/))
- Position effects are real. Models do best when relevant information is at the start or end of the input, and worse when it is in the middle, "even for explicitly long-context models". ([Liu et al., *Lost in the Middle*, TACL 2023](https://arxiv.org/abs/2307.03172))
- Anthropic describes "context rot": recall falls as the token count grows. The decline is gradual, not a cliff, so context is a finite "attention budget". ([Anthropic, *Effective context engineering for AI agents*, 2025-09-29](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) Anthropic's prompting guide adds that queries placed after long material "can improve response quality by up to 30 percent". ([Claude prompting best practices: long context](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices))

Implication: a bigger context window does not remove the need for memory techniques. Facts buried mid-prompt in a long verbatim history are used less reliably than facts in a short, well-placed block.

## Technique 1: Rolling (recursive) summary

### How it works

At intervals, an LLM rewrites a running summary of the Chat so far. The summary is injected into the prompt, and older verbatim messages fall out of the window.

**SillyTavern Summarize extension** ([docs](https://docs.sillytavern.app/extensions/summarize/), [source `public/scripts/extensions/memory/index.js`](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/memory/index.js)):

- **Default prompt.** The prompt opens "Ignore previous instructions. Summarize the most important facts and events in the story so far." If a summary already exists, the model is told to expand it with new facts, within a `{{words}}` limit. (source)
- **Defaults.** `promptWords` 200, `promptInterval` 10 messages, word trigger `promptForceWords` 0 (off). The summary is injected in-chat at `depth` 2 as a system-role prompt, using the template `[Summary: {{summary}}]`. (source)
- **Triggers.** An update fires every X messages or every X words, whichever is reached first. The docs say a word-based interval "may be more accurate because message lengths vary". A "magic wand" button estimates intervals from the context size. The docs warn that intervals need re-tuning after a model change, or summaries may run too often or never. (docs)
- **Builders.** *Raw* sends only the summary prompt and the history. It is cleaner, but less cache-friendly. *Classic* appends the summary instruction to the normal prompt. It reuses processed prompts better, at the cost of more context. The summary buffer is bounded by "context size - summarization prompt - previous summary - response length". (docs)
- **Storage and rollback.** The summary is stored on a chat message (`mes.extra.memory`). Deleting messages reloads the latest remaining summary. Editing or regenerating the last message deletes its attached summary. "Restore Previous" rolls back one step. (source; docs)
- **User control.** The current summary is viewable and editable. "Pause" freezes automatic updates, so the user can keep a hand-written summary. (docs)

**MemGPT** uses the same idea internally. The first entry of its FIFO message queue is "a recursive summary of evicted messages". When the prompt reaches a flush threshold (e.g. 100% of the window), it evicts a batch of messages (e.g. 50%) and folds them into a new summary. Evicted messages stay searchable in recall storage. ([Packer et al., *MemGPT*, arXiv:2310.08560v2](https://arxiv.org/html/2310.08560v2))

**Compaction** in agent tools works the same way. When a conversation nears the limit, it is summarized and restarted from the summary. Anthropic advises to "start by maximizing recall" in the compaction prompt and then trim. It warns that overly aggressive compaction loses subtle details that matter later. ([Anthropic, context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

### Cost

- **Generation.** One extra LLM call per interval, with input roughly equal to the old summary plus the messages since the last update. SillyTavern can also send a separate response-length override. ([docs](https://docs.sillytavern.app/extensions/summarize/))
- **Context.** A fixed-size block per turn. The default is about 200 words, so roughly 250–300 tokens. (The word-to-token ratio is a rule of thumb, not a sourced figure.)

### Failure modes

- **Loss and invention.** Summaries "may lose some important details or contain hallucinations", so users should check them. ([docs](https://docs.sillytavern.app/extensions/summarize/))
- **Compounding loss.** Each rewrite re-summarizes the previous summary, so details drop out over many cycles. MemGPT's multi-session evaluation measures this. Baselines given "a lossy recursive summary" of prior sessions scored 32–39% on deep memory retrieval. MemGPT, with searchable full history, scored 67–93%, depending on the model. ([MemGPT v2, Table on DMR](https://arxiv.org/html/2310.08560v2))
- **Cache cost.** A summary block that changes busts the provider's prompt cache from that point onward (see "Token-budget trade-offs").
- **Edits to the past.** Editing earlier messages makes the summary stale. SillyTavern handles this only for deletes and last-message edits. (source)
- **Undiagnosable output.** A single prose blob mixes facts, events and tone. When it is wrong, a user cannot easily see which part is wrong.

## Technique 2: Extracted fact list (structured / self-editing memory)

### How it works

After each turn, or batch of turns, an LLM extracts discrete facts and merges them into a store. Each fact is a separate, addressable item.

**mem0**:

- **Paper design.** An extraction prompt receives the new message pair, a conversation summary, and the last *m* = 10 messages, and produces candidate facts. For each candidate, the top *s* = 10 similar existing memories are retrieved by embedding. An LLM tool-call then picks **ADD**, **UPDATE** (complementary information), **DELETE** (contradiction) or **NOOP**. ([Chhikara et al., *Mem0*, arXiv:2504.19413](https://arxiv.org/html/2504.19413v1))
- **Current product.** The current docs describe the add pipeline as additive, "New memories are added without overwriting or deleting existing memories". Both Managed and OSS are listed as ADD-only. With `infer=False`, the payload is stored verbatim, and "duplicates can land". Memories are scoped by `user_id`, `agent_id`, `app_id` and `run_id`. ([mem0 docs: Add](https://docs.mem0.ai/core-concepts/memory-operations/add))
- **Manual edits.** Explicit APIs exist for edits by ID: `update(memory_id, text, metadata…)` and `batch_update` (up to 1000), `delete(memory_id)`, and `delete_all(user_id)`. ([mem0 docs: Update](https://docs.mem0.ai/core-concepts/memory-operations/update), [Delete](https://docs.mem0.ai/core-concepts/memory-operations/delete))

**MemGPT / Letta**:

- **Working context.** MemGPT's "working context" is a fixed-size read/write block that holds "key facts and preferences about the user and persona". It is writable only through function calls the model makes itself. When the prompt passes a warning threshold (e.g. 70% of context), the system inserts a "memory pressure" message so the model saves important content before eviction. ([MemGPT v2](https://arxiv.org/html/2310.08560v2))
- **Memory blocks.** Letta's successor concept is **memory blocks**, labeled sections "always in context" and prepended to the prompt. Each has a `label`, a `description` (which the agent relies on when deciding what to write), a `value`, a character `limit` and `read_only`. Developers can read and overwrite blocks through the API. Setting `value` replaces the whole block. ([Letta: Memory blocks](https://docs.letta.com/guides/agents/memory-blocks))
- **Edit tools.** The agent edits blocks with `memory_insert` (append, concurrency-safe), `memory_replace` (targeted edit that fails if the target changed) and `memory_rethink` (full rewrite, last writer wins). ([Letta: Shared memory](https://docs.letta.com/guides/core-concepts/memory/shared-memory/)) That page also says blocks are now "legacy" in favor of shared memory repositories.
- **Size guidance.** Letta suggests blocks of under about 50k characters each, and under 20 blocks per agent. Less critical facts go to out-of-context archival memory, which is searched by tool. ([Letta: Context hierarchy](https://docs.letta.com/guides/agents/context-hierarchy/))
- **Persistence.** All messages persist in a database even after eviction or compaction. ([Letta: Context engineering](https://docs.letta.com/guides/agents/context-engineering))

**Consumer roleplay apps** use the same pattern. Storychat (a Zeta-like consumer app) has "Auto Summary", which saves "the important bits in real time" to the user's memory notes. Plan caps run from 1,000 to 10,000 characters. "Pinned Memory" stays in view because it "never gets bumped off the desk". ([Storychat guide: Longer Memory](https://docs.channel.io/storychatdocs/en/articles/Longer-Memory-1cef9e69)) I found no official Zeta or Character.AI documentation for their memory features. Third-party claims about Character.AI's pinned-message limits are not cited here.

### Cost

- **Extraction.** One extraction call per turn or batch. mem0's paper design adds an embedding search and a second LLM decision per candidate fact. ([Mem0 paper](https://arxiv.org/html/2504.19413v1))
- **Benchmark.** On the LOCOMO benchmark, Mem0 used 1,764 tokens per query, against about 26k for full-context. Its p95 latency was 1.44 s, against 17.1 s. Accuracy (LLM-judge) was 66.9%, against 72.9% for full-context. So the large savings cost some accuracy. The best plain RAG configuration scored 61.0%. ([Mem0 paper, Table 2](https://arxiv.org/html/2504.19413v1))

### Failure modes

- **Duplicates and contradictions** when merge logic is weak or absent. See the mem0 ADD-only and `infer=False` warnings. ([mem0 docs: Add](https://docs.mem0.ai/core-concepts/memory-operations/add))
- **Silent overwrites** when the model and the user (or two writers) edit the same block. Letta documents "last-writer-wins" for full rewrites. ([Letta: Shared memory](https://docs.letta.com/guides/core-concepts/memory/shared-memory/))
- **Noise or omissions.** Extraction keeps only what it judges important. Facts about tone, ongoing scene state or subtle promises may never become items. (This is an inference from the design, not a measured result.)
- **Unbounded growth.** Without a cap, an always-in-context list grows. That is why Letta caps blocks by size and moves overflow to archival memory. ([Letta: Context hierarchy](https://docs.letta.com/guides/agents/context-hierarchy/))

## Technique 3: Lorebook / World Info

### How it works

Hand-written entries, each with trigger keys, are inserted only when a key appears in recent text.

**SillyTavern World Info** ([docs](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)):

- **Matching.** Keys can be plaintext or regex. They are matched against the last *Scan Depth* messages. Only the entry's Content is sent, never its title or keys, so entries must be self-contained.
- **Constant entries** are always inserted, and they go in first when the budget is applied.
- **Key logic.** Secondary keys allow AND ANY, AND ALL, NOT ANY and NOT ALL logic. *Insertion Order* and *Position* control placement; a higher order sits closer to the end and has more influence.
- **Budget.** The budget is set as a context % or a fixed token cap. Once it is used up, "no more entries activate, even if their keys are present". Overflow drops entries silently unless "Alert on overflow" is on.
- **Recursion.** Entries can trigger other entries. This is bounded by Max Recursion Steps. *Min Activations* can scan further back until enough entries fire.
- **Stateful behavior.** *Probability*, *inclusion groups*, and *timed effects* (Sticky, Cooldown, Delay, counted in messages) make entries stateful. Timed effects apply only in the chat where they triggered.
- **Vector activation.** Activation can also be by embedding similarity via Vector Storage. The docs warn that results "are hard to predict. Use keywords when determinism matters."
- **Scopes.** *Character Lore* is bound to the character card. *Persona Lore* follows the persona. **Chat Lore** applies only to one chat and is inserted first.

**KoboldAI World Info** works the same way: keyword-inserted, "encyclopedia"-style entries placed after Memory and before the story text. It suggests about 50 tokens for minor entries, 100 for significant characters, and "no more than 150 for major keystones". ([KoboldAI wiki](https://github.com/KoboldAI/KoboldAI-Client/wiki/Memory,-Author's-Note-and-World-Info))

### Cost

- **Zero LLM calls.** Keyword matching is local.
- **Variable context use.** It ranges from nothing up to the configured budget.

### Failure modes

- **Silent drops.** Budget overflow silently drops entries. ([ST docs](https://docs.sillytavern.app/usage/core-concepts/worldinfo/))
- **Missed triggers.** An entry is missed when the scene refers to something indirectly, e.g. "she" instead of the name. Case and whole-word settings can also cause misses. (ST docs)
- **No guarantee of use.** World Info "does not guarantee its appearance in the generated output". (ST docs)
- **Authored, not learned.** Nothing in the mechanism learns from the Chat. Entries are written by an author, or by a user doing upkeep.

## Technique 4: Retrieval over past messages (vector search / RAG)

### How it works

Past messages are embedded. Each turn, the recent messages form a query, and the most similar past chunks are reinserted into the prompt.

**SillyTavern Vector Storage, chat vectorization** ([docs](https://docs.sillytavern.app/extensions/chat-vectorization/)):

- **Indexing.** Each message is embedded in the background. Large messages are chunked (default 400 characters).
- **Retrieval defaults.** The query is the last 2 messages, the score threshold is 25%, the top 3 matches are inserted, and the latest 5 messages are retained and never shuffled.
- **Insertion.** Matches go after the main prompt by default, or in-chat at depth 2. They are framed as "past events", with the most relevant last.
- **Experimental summaries.** An option summarizes messages before embedding to improve matching. Retrieval still returns the original message.
- **Warnings.** It "doesn't guarantee a better chat experience or better memory". It conflicts with prompt caching, because the changing prefix "usually causes cache misses".

**Other implementations.** MemGPT's *recall storage* keeps every message and is searched by the model on demand (`conversation_search`). *Archival storage* holds arbitrary text the model chooses to insert. ([MemGPT v2](https://arxiv.org/html/2310.08560v2)) Anthropic contrasts **pre-loading** embedding results before inference with **just-in-time** retrieval through tools. Just-in-time is more precise, but slower and dependent on good tools. ([Anthropic, context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents))

### Cost

- **Indexing.** One embedding call per message or chunk, plus storage. Embeddings are usually much cheaper than generation, but that is not quantified here.
- **Context.** Top-k chunks per turn. In the Mem0 paper, the best RAG configuration was k=2 chunks of 256 tokens. It scored 61.0%, below Mem0 (66.9%) and full context (72.9%). ([Mem0 paper, Table 2](https://arxiv.org/html/2504.19413v1))

### Failure modes

- **Out-of-order snippets.** Retrieved scenes are verbatim fragments without their surroundings or timeline.
- **Unpredictable results.** They depend on the embedding model. ([ST WI docs](https://docs.sillytavern.app/usage/core-concepts/worldinfo/))
- **Cache misses.** The prefix changes every turn. ([ST vector docs](https://docs.sillytavern.app/extensions/chat-vectorization/))
- **Not user-editable.** Users can only edit the underlying messages.

## Fitting a user-editable, per-Chat Memory list

The domain asks for Memories that are **facts**, **per Chat**, and **visible and editable by the user**. The glossary rules out "lorebook entry" as a synonym. Here is how each technique maps onto that.

| Technique | Natural fit as the Memory list? | Notes |
|---|---|---|
| Extracted fact list | **Direct.** Each Memory is one item. | Model proposes; user sees and edits. mem0-style ADD/UPDATE/DELETE gives merge semantics. Letta-style "always in context" block gives determinism. Needs a cap and a rule for user-vs-model edit conflicts. |
| Rolling summary | **Partial.** It is editable (ST lets users edit and pause it), but it is one prose blob, not discrete facts. | Could sit beside the Memory list as a separate "story so far" layer, which may be visible or hidden. Holds events and tone better than a fact list. |
| Lorebook / Chat Lore | **Mechanism, not concept.** | Keyword gating could keep a large Memory list affordable by inserting only relevant Memories. It costs determinism, and it can silently drop. The authored-lore role fits Story, Setting and Character definitions better. |
| Vector retrieval | **Poor as the list**, possible as a backstop. | Not a list a user curates. It could retrieve old *messages* or select *Memories* once the list outgrows its budget, at the cost of cache misses and less predictability. |

Considerations for the decision ticket. These are inferences from the sources above, not recommendations.

1. **Who writes Memories.** Options are user-only (like KoboldAI Memory or ST's manual Chat Lore), model-proposed with automatic apply (mem0 or Letta self-editing), or model-proposed and user-confirmed. Letta's last-writer-wins warning shows the conflict risk when both the user and the model edit the same text. Storing Memories as separate items (mem0's per-ID `update`/`delete`) narrows that risk to a single item.
2. **Always-in-context vs selected.** A small capped list that is always sent is deterministic and cache-friendly. That is the Letta and KoboldAI approach, and the "Pinned Memory" idea in Storychat. Selection by keyword or vector scales further, but a user may see a Memory in the list that the model was not shown this turn.
3. **Facts vs events.** The glossary defines Memory as *facts*. Plot progress ("they fled the city") may still need a home: a rolling summary, Memories phrased as facts, or both.
4. **Relation to Bond and Arc.** Bonds are "shown only through how the Character behaves". Memories are visible. If an extraction pass also captures feelings, it could expose Bond state as Memory items. The ticket that designs extraction should keep these apart. Per `map.md`, an Arc is intended change, while summary or Memory loss that alters a Character is drift.
5. **Edits to earlier messages and Chat reset.** ST deletes or rolls back a summary when its source messages are deleted or edited. ([ST source](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/memory/index.js)) A Memory extracted from a message the user later edits faces the same question. It links to the open item in `map.md` about editing earlier messages. A Chat reset presumably clears that Chat's Memories, since Memory is per Chat.
6. **Provenance.** Recording which message a Memory came from helps rollback (point 5) and lets the user check a doubtful Memory. This idea comes from ST attaching summaries to a message, not from a documented feature of the fact-list tools.

## Token-budget trade-offs

### Layer sizes seen in the sources

| Layer | Typical size in sources |
|---|---|
| KoboldAI Memory | about 200 tokens, "one tenth of the 2048 token budget" ([wiki](https://github.com/KoboldAI/KoboldAI-Client/wiki/Memory,-Author's-Note-and-World-Info)) |
| Author's Note | under 50 tokens (same source) |
| World Info entry | 50–150 tokens; total capped by a context % or token budget ([wiki](https://github.com/KoboldAI/KoboldAI-Client/wiki/Memory,-Author's-Note-and-World-Info); [ST](https://docs.sillytavern.app/usage/core-concepts/worldinfo/)) |
| ST rolling summary | 200 words by default, refreshed every 10 messages ([source](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/memory/index.js)) |
| ST vector retrieval | top 3 chunks of about 400 characters ([docs](https://docs.sillytavern.app/extensions/chat-vectorization/)) |
| Mem0 retrieved memories | about 1.8k tokens per query, vs about 26k for full context ([paper](https://arxiv.org/html/2504.19413v1)) |
| Letta memory block | under about 50k characters each, under 20 blocks ([docs](https://docs.letta.com/guides/agents/context-hierarchy/)) |
| Storychat auto-summary | 1,000–10,000 characters by plan; pinned 1K–5K ([guide](https://docs.channel.io/storychatdocs/en/articles/Longer-Memory-1cef9e69)) |

### Size vs quality

- **Full verbatim history is the most accurate.** In LOCOMO it scored 72.9%, against 66.9% for Mem0. It is also the most expensive and slowest, at 26k tokens and a 17 s p95. ([Mem0 paper](https://arxiv.org/html/2504.19413v1))
- **Long contexts are still used imperfectly.** Recall degrades gradually with length, and mid-context material is used worst. ([Liu et al.](https://arxiv.org/abs/2307.03172); [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)) A short Memory block near the start of the prompt, or near the end like an Author's Note, is likely used more reliably than the same fact 20k tokens back.

### Prompt caching changes the arithmetic

A roleplay Chat resends almost the whole prompt every turn, so cache behavior often dominates cost.

- **OpenAI.** Caching needs the "entire rendered prefix to match", with a minimum of 1,024 tokens on GPT-5.6+. Reads cost 0.1× the input price on GPT-5.6+, and writes cost 1.25× (30-minute TTL). The docs advise "Put stable developer instructions and shared reference material first". They also say to append messages rather than rewrite earlier turns, since "summarization or truncation can reset reuse". ([OpenAI: Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching))
- **DeepSeek.** Caching is on by default and best-effort. A request hits only if it "fully matches a cache prefix unit". In a multi-round chat, `A+B` then `A+B+C` hits, but `A+C` misses. ([DeepSeek: Context caching](https://api-docs.deepseek.com/guides/kv_cache))
- **SillyTavern** names the conflict directly: vector retrieval and prompt caching usually exclude each other. ([ST vector docs](https://docs.sillytavern.app/extensions/chat-vectorization/))

Inferences for layout (from the prefix rules above, not measured):

- **Stable layers first.** Story, Setting, Characters and Role change rarely, so they belong first.
- **Memory list position.** An always-sent Memory list changes only when a Memory is added or edited. Placed after the stable layers, an edit invalidates only what follows it.
- **Rolling summary position.** A summary that refreshes every N messages invalidates everything after its position on each refresh. Placed before the history, it costs one full-price turn per refresh. Placed in-chat near the end (ST's default depth 2), it keeps the history prefix cacheable.
- **Trimming the oldest messages.** Dropping the oldest messages one at a time changes the prefix every turn. Dropping them in larger batches, as MemGPT evicts about 50% at a time, keeps the prefix stable between evictions.
- **Per-turn retrieval.** Vector results or keyword-triggered lore inserted early make each turn a likely cache miss.

### Extra calls

- **Rolling summary.** One extra generation call every N messages.
- **Fact extraction.** One call per turn or batch, plus embedding and merge calls in mem0's design.
- **Vector retrieval.** An embedding call per message plus a search per turn.
- **Lorebooks.** Nothing beyond local matching.

At a $10–30/month budget (`map.md`), the per-turn prompt size and cache hit rate probably matter more than these extra calls. That needs checking against the chosen provider's prices, which is a later ticket.

## Sources

- SillyTavern docs: [Summarize](https://docs.sillytavern.app/extensions/summarize/), [World Info](https://docs.sillytavern.app/usage/core-concepts/worldinfo/), [Chat vectorization](https://docs.sillytavern.app/extensions/chat-vectorization/), [Author's Note](https://docs.sillytavern.app/usage/core-concepts/authors-note/), [Prompts](https://docs.sillytavern.app/usage/prompts/)
- SillyTavern source: [`public/scripts/extensions/memory/index.js`](https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/extensions/memory/index.js) (release branch)
- KoboldAI wiki: [Memory, Author's Note and World Info](https://github.com/KoboldAI/KoboldAI-Client/wiki/Memory,-Author's-Note-and-World-Info)
- Packer et al., [MemGPT: Towards LLMs as Operating Systems](https://arxiv.org/abs/2310.08560) (v2 full text: [HTML](https://arxiv.org/html/2310.08560v2))
- Letta docs: [Memory blocks](https://docs.letta.com/guides/agents/memory-blocks), [Context hierarchy](https://docs.letta.com/guides/agents/context-hierarchy/), [Shared memory](https://docs.letta.com/guides/core-concepts/memory/shared-memory/), [Context engineering](https://docs.letta.com/guides/agents/context-engineering)
- Chhikara et al., [Mem0: Building Production-Ready AI Agents with Scalable Long-Term Memory](https://arxiv.org/abs/2504.19413) ([HTML](https://arxiv.org/html/2504.19413v1))
- mem0 docs: [Add](https://docs.mem0.ai/core-concepts/memory-operations/add), [Update](https://docs.mem0.ai/core-concepts/memory-operations/update), [Delete](https://docs.mem0.ai/core-concepts/memory-operations/delete)
- Liu et al., [Lost in the Middle: How Language Models Use Long Contexts](https://arxiv.org/abs/2307.03172)
- Anthropic, [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents); [Claude prompting best practices](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/claude-prompting-best-practices). Cited for general long-context guidance only; Claude is not a candidate text model per `map.md`.
- [OpenAI: Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching); [DeepSeek: Context caching](https://api-docs.deepseek.com/guides/kv_cache)
- Storychat user guide: [Longer Memory](https://docs.channel.io/storychatdocs/en/articles/Longer-Memory-1cef9e69)

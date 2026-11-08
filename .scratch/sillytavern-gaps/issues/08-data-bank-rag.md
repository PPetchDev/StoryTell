# Attaching files and web pages for the AI to look things up

Type: grilling
Status: resolved
Blocked by: none

## Question

Should the user attach documents or web pages (a wiki page on a setting, a novel's chapter) that the AI searches during play?

## SillyTavern

Data Bank: files, web pages, YouTube transcripts, Fandom pages at global, character or chat level; chunked, embedded, and the closest chunks retrieved into the prompt. Also vectorised chat memory.

## Storytell today (checked 2026-11-08)

- Lore: keyword-triggered entries, capped at ~1,500 tokens (`apps/api/src/manager/chat/lore/lore-select.ts`); the Lore spec put "selecting Lore by an extra model call or by vector search" out of scope. Memory is a capped list sent every turn; Story so far covers long Chats.
- No embeddings, no vector index, no embedding provider in the Model Gateway.
- The Story assistant and drafting already write Lore entries.

## Options

- **A. Lore from a document** — paste text or a URL into the Story assistant, which drafts Lore entries from it; play still uses Lore as today. No vectors.
- **B. Real vector retrieval** — pgvector, an embedding provider, chunking, a retrieval layer in the turn prompt.
- **C. Later.**
- **D. Never.**

## Recommendation

C, aiming at A. Stories are small and hand-curated; Lore + Memory + Story so far already cover what retrieval would, without a new provider. B only if Lore keeps missing things in practice.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: option B in a small form — **Documents** on a Story: pasted text, an uploaded .txt/.md file or a fetched web page, split into passages and embedded once; each turn the passages closest to the latest exchange reach the Narrator in the trailing system message under a token cap, like Lore. Embedding provider from `docs/research/models-samplers-embeddings.md`; vectors stored in Postgres as plain arrays (no pgvector extension: the live Postgres is an installed Windows service, ADR 0001).

Spec and tickets: [.scratch/documents/](../../documents/spec.md).

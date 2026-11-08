# 09 — Check retrieval on real Thai and English Documents (spends credit)

**Status:** ready-for-human

Part of: [Spec: Documents](../spec.md)

**What to build:** Nothing new to build: the user tries Documents on the real gateway and decides whether `bge-m3` and the 0.45 similarity floor are good enough, for Thai especially. The research could not confirm Thai quality.

Embedding is cheap: a full-size Document is about $0.0005 to add, and a search about $0.000005. A session of a dozen turns costs well under one cent. It is still a spend, so the user starts it.

Steps (an agent may prepare a Story and read the results with the user, but the user adds the Documents and plays):
1. Make a test Story with one English and one Thai Document, each a few thousand words of real reference text (a wiki page of a setting, the user's own notes). Add them on the live app, or on dev with the real gateway.
2. Play about 6 turns per language. Some name the Document's subject outright, some only describe it, and some are about something unrelated.
3. After each turn, note what "Documents in play" lists and whether it was right, and read the turn's top similarity scores from the debug line ticket 04 writes to the API log.
4. Open the Usage page and check that "Document adding" and "Document search" show, with "<$0.01" for amounts under a cent.

**Blocked by:** [04 — Documents reach the Narrator](04-documents-reach-the-narrator.md), [05 — Documents in play in the Memory drawer](05-documents-in-play.md)

- [ ] `## Comments` records the first real embedding call: tokens, the cost OpenRouter reported (or that it reported none), and the dimensions.
- [ ] `## Comments` records, per language: hits, misses and wrong passages, and the scores of right versus unrelated passages, from the debug log.
- [ ] The Usage page shows both kinds and "<$0.01".
- [ ] A verdict on the floor: keep 0.45, or the value to set instead. Changing it is a one-constant follow-up ticket.
- [ ] A verdict on the model: keep `bge-m3`, or switch to `qwen/qwen3-embedding-8b` on DeepInfra (a follow-up ticket: change the table entry, re-add Documents).
- [ ] No played text or Document text is pasted into the repository, only short descriptions.

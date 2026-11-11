# 01 — Every Memory is embedded

**Status:** ready-for-agent

**What to build:** Memories gain a vector, as Document passages have. Follow the spec's "Embedding Memories":
- the migration: `embedding` (`real[]`, unit length, nullable) and `embedding_model`;
- the new `memory_embedding` embedding kind, in the text pool, with the API's `CallKind`, the Usage DTO and the web's label;
- after each extraction is recorded, its added or reworded Memories are embedded in one call;
- a Memory the user adds or edits is embedded on save;
- a reworded Memory loses its vector until it is embedded again;
- a failed embedding leaves the vector null and never fails the extraction or the save;
- a background backfill at API start embeds, in batches, Memories with no vector or with another model's.

Nothing chooses Memories by meaning yet.

**Blocked by:** None — can start immediately.

**Part of:** [Spec: Memory by meaning](../spec.md)

- [ ] API tests through the fake gateway:
  - one `memory_embedding` call for an extraction's new Memories;
  - a user-added Memory is embedded;
  - a rewording re-embeds it;
  - a scripted embedding failure leaves the extraction recorded and the vector null;
  - the backfill embeds Memories with no vector and leaves current ones alone.
- [ ] Typecheck and the whole suites stay green.

# 01 — Embeddings in the Model Gateway

**Status:** ready-for-agent

Part of: [Spec: Documents](../spec.md)

**What to build:** Per the spec's "The Model Gateway learns embeddings": the gateway can turn texts into vectors with `bge-m3` on DeepInfra through OpenRouter, pinned without fallbacks.
- The new call-kind type `EmbeddingCallKind = 'document_embedding' | 'document_search'` is part of `CallKind`, not of `TextCallKind`, and both kinds are in the text pool.
- Each call is logged as a text-pool UsageRecord under its kind.
- The fake gateway answers embeddings deterministically from the words of each input, so later tests can rely on what is retrieved.
- The Usage DTO's kind list and the web's call-kind labels gain "Document adding" and "Document search", and the web's amount formatting shows a non-zero amount under a cent as "<$0.01".

No feature calls it yet, so nothing shows on the Usage page until ticket 02 adds Documents on the real gateway. This slice is verified by contract tests and an API test that reads the Usage API after scripted embedding calls; the Usage page itself is checked by hand in ticket 09.

**Blocked by:** None — can start immediately

- [ ] `embedTexts({ kind, inputs, servedFor })` on the gateway interface, real and fake; `completeText` does not accept an embedding kind (typecheck).
- [ ] `bge-m3` is in the model table: OpenRouter id `baai/bge-m3`, host `deepinfra`, 1,024 dimensions, list price $0.01 per million tokens (re-read from the endpoints API, with the date).
- [ ] Contract tests with a synthetic recorded fixture:
  - [ ] the body: model, inputs, `encoding_format: 'float'`, `provider: { only: ['deepinfra'], allow_fallbacks: false }`;
  - [ ] vectors back in input order;
  - [ ] one UsageRecord with the reported cost, or list price × prompt tokens when none is reported, and the Usage API counts it under its kind in the text pool;
  - [ ] errors mapped as for chat, including a 402 as out of text credit.
- [ ] The fake gateway:
  - [ ] gives unit vectors under `fake/embedding-model`, the same for the same text;
  - [ ] scores higher for texts sharing words, Thai included;
  - [ ] records the calls with their kind and `servedFor`;
  - [ ] can be scripted to fail for a kind, with an outage, a refusal or out of text credit, from tests and through the `/api/testing/fake-gateway` controls.
- [ ] The web's call-kind label map covers both kinds (the typecheck enforces it), and the amount formatter returns "<$0.01" for a non-zero amount under one cent and "$0.00" for zero.
- [ ] The existing suites stay green. No paid API is called.

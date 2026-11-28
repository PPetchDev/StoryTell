Status: ready-for-agent

# Embeddings on the VM, as a backup

## Problem

Embeddings (the context search each turn and new Memories) go only to bge-m3 on DeepInfra through OpenRouter. Text now runs on NanoGPT's subscription, so OpenRouter is kept mostly for embeddings. If OpenRouter has no credit or is down, the turn's search finds nothing and new Memories wait unembedded.

## Solution

The app runs bge-m3 itself, on the computer it runs on, but only as a backup. Every embedding call still goes to DeepInfra first. When no host in the chain can answer it (out of credit, busy, down, or no host that embeds), the call is answered by the app's own bge-m3. That costs nothing and is recorded with host `local`.

## Facts (measured 2026-11-28 on the live VM: Neoverse-N1, 2 cores, 11 GB RAM)

- **Same vectors.** bge-m3 fp32 ONNX (Xenova/bge-m3), CLS pooling and L2-normalised, gave vectors with cosine 1.00000 (min over 30) to the stored DeepInfra vectors of 30 live Memories. Stored vectors keep working and nothing is re-embedded.
- **The q8 model is not used.** It gave cosine 0.981–0.986, which would mean re-embedding everything. It was also still 4.6 s a search.
- **Speed.** Loading takes 48 s, once. A Memory (about 170 tokens) takes 0.4 s. A turn's context search (about 970 tokens) takes 10.5 s and uses both cores. That is acceptable only while DeepInfra can't answer.
- **Memory.** About 2.3 GB resident once loaded. The model is loaded on first use, never at start-up.
- **Cost now.** On live, embeddings cost $0.016 in the last 30 days (846 context searches and 673 Memory embeddings). Moving them off DeepInfra entirely was rejected: it saves nothing and makes each turn 10 s slower.

## Decisions

- **Model files.**
  - The files are `model.onnx`, `model.onnx_data` and `tokenizer.json` from Xenova/bge-m3. They go in one folder: `EMBED_MODEL_DIR`, by default `models/bge-m3` beside the image folder, like the cut-out model.
  - The files are not secret, and missing files are fine: the backup is then simply not there, and the call fails as it does today.
- **Tokenizer.** It is `@huggingface/tokenizers` (pure JS, no dependencies) reading `tokenizer.json`. The model runs on onnxruntime-node, which is already a dependency. Inputs longer than 8,192 tokens are cut to 8,192, as DeepInfra's context is.
- **One input at a time,** queued like the cut-out, so two searches never run the model at once.
- **When the backup answers.** It answers when the chain of hosts that embed throws `OutOfCreditError`, `ProviderBusyError` or `ProviderOutageError`, or when there is no host that embeds. A malformed request (`RangeError`) still throws. A warning is logged with the reason.
- **Usage record.** The record carries kind as asked, model `bge-m3`, host `local`, the token count from the tokenizer, and cost $0.
- **Nothing in the UI.** The Usage page already lists records by host.

## Testing

- Gateway contract tests use a fake own embedder: it answers when DeepInfra is out of credit, busy or down, or when no host embeds; it is not called when DeepInfra answers; a missing backup throws as before; the record has host `local` and $0.
- The OwnEmbedder unit is tested with a fake session: CLS pooling and normalisation, truncation at 8,192, one call at a time, and `available()` following the files.
- A check on the VM with made-up text: the app's code against transformers.js, the pipeline that matched DeepInfra.

## Out of scope

- Moving embeddings off DeepInfra for good.
- The q8 model.
- Re-embedding.
- A GPU.

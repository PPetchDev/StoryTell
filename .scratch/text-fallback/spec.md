# Text fallback chain

Built 2026-11-17, the day OpenRouter's credit ran out ($30.01 used of $30) and live moved to Venice by hand (`TEXT_HOST=venice`, .scratch/venice-text/spec.md). The user wants this to happen on its own: OpenRouter, then Venice, then a free model when Venice runs out too.

## The chain

- **`TEXT_HOSTS`**: a comma-separated, ordered list of `openrouter`, `venice` and `free`, for example `TEXT_HOSTS=openrouter,venice,free`. Every text call (turns, the Judge, Memory extraction, Thoughts, diaries, Line repair, suggestions...) and every embedding call goes through it.
- **Unset**: the one host `TEXT_HOST` names. That is `openrouter` by default, or `venice`, as before the chain. So nothing changes until `TEXT_HOSTS` is set, and live's `TEXT_HOST=venice` drop-in keeps working when this deploys.
- **Precedence:** `TEXT_HOSTS` wins over `TEXT_HOST` when both are set.
- **Refused at start-up:** an unknown host, a host named twice, or an empty list.

## Moving on

- **When a host moves on:** a call that a host refuses as out of credit (`OutOfCreditError`: a 402, or "insufficient credits/balance/funds") goes **once** to the next host, with the same messages and request.
- **Other errors don't move on:** an outage, a busy host or a refusal for content fails the call as before. The busy background model still falls back to `BACKGROUND_FALLBACK_MODEL` on the same host first.
- **The log:** a WARN line names the host skipped, its error, and where the call went:
  `turn: skipped openrouter, out of credit (OpenRouter: Insufficient credits...); sending it to venice, and passing openrouter over for 10 min.`
- **A streamed turn** moves on only while nothing has streamed (and it wasn't stopped). Once text has reached the user, a refusal mid-stream is the answer, so a reply is never stitched from two models.
- **The UsageRecord** names the host that answered:
  - `deepinfra` for OpenRouter (as before);
  - `venice`;
  - `openrouter-free` for the free model, with the model `nemotron-3-ultra-free` and $0.
- **The `model` a call returns** stays the configured model (the play model, or V4 Flash for background calls) even when the free model answered. An AI Message stores it, so it stays one of the app's models. The UsageRecord is where the free model is named.

## Remembering a host that is out

- **For how long:** a host that answered out of credit is passed over for 10 minutes (`OUT_OF_CREDIT_SKIP_MS`), so each call doesn't pay a failed round trip first.
- **In memory only:** the memory is per process. A restart forgets it, and the first call after the restart pays one failed round trip.
- **Shared by text and embeddings:** both spend the same balance on a host.
- **The last host is always tried,** remembered or not:
  - a chain of one behaves exactly as before the chain (OpenRouter alone is asked again on every call);
  - when every host is out, the call still gets the last host's own refusal.
- **Clearing it:** a host that answers is forgotten as out. After the 10 minutes, the next call tries it again.

## The free host

- **The model:** `free` is OpenRouter with `nvidia/nemotron-3-ultra-550b-a55b:free` for every text kind, play and background.
  - It still answers on an account whose balance is below zero.
  - Same `OPENROUTER_API_KEY`.
- **The body:**
  - no `provider` (pinning DeepInfra would find no endpoint);
  - `reasoning: { enabled: false }`;
  - `usage: { include: true }`;
  - `max_tokens`;
  - `stop` and `response_format` when asked (OpenRouter passes them on where it can);
  - only the samplers it lists, `temperature` and `top_p`. `min_p` and `repetition_penalty` are left out.
- **Cost:** $0, whatever comes back.
- **Balance:** unknown, which never blocks a call.
- **No embeddings:** see below.

### Tried before adding it

A throwaway probe on 2026-11-17 sent one real turn prompt and one Judge prompt to the free model only. It cost $0, and no OpenRouter or Venice credit was spent.

- **The turn prompt:** `buildTurnPrompt` with a full input, 10.5k characters (2,550 tokens):
  - two Characters with every field;
  - a long Role description;
  - three Bonds, two Arcs, five Memories (one locked);
  - Story so far, five history Messages, a Scene and Time of day.
- **The turn's answer:**
  - 3.4 s, served by Nvidia, 0 reasoning tokens, 122 completion tokens, `finish_reason: stop`;
  - a natural, in-voice Mira reply in the app's `@Name:` format, which answered the user's question about the pipe and met the Scene's move-on condition.
  - It was shorter than a Medium reply asks for (about 100 words, not 150–350).
- **The Judge** (`buildJudgePrompt`, the first fixture input): 6.3 s, valid JSON in the expected shape, with a sensible `move_on: false`.
- **OpenRouter's listing** for the model:
  - $0 prompt and completion, a 1M context;
  - parameters `include_reasoning, max_tokens, reasoning, reasoning_effort, seed, temperature, tool_choice, tools, top_p`.
  - `stop` is not listed, but the reply parser already cuts a line written as the user.

## Embeddings

- **No free host:** there is no free bge-m3 to embed with, so embeddings go through the chain without the free host. A turn's search still moves from OpenRouter to Venice.
- **Out everywhere, with the free host still in the chain:** the gateway throws `NoEmbeddingCreditError`. It is an outage (502.001.001), not out of credit.
  - **Why it had to change:** `DocumentSearchManagerService.embedQuery` deliberately fails the turn on `OutOfCreditError`, because the search and the turn used to share one balance. Checked, not assumed: with that error, the free model would never have been reached.
  - **Now:** the outage takes the soft path. The turn plays with the newest Memories and no Documents, recorded `failed`, with the usual warning.
  - **The Memory backfill** stops at `NoEmbeddingCreditError` as it stops at out of credit, rather than sending one failing request per batch.
- **Without a free host in the chain:** embeddings out of credit fail as before.
- **Only `free` in the chain:** embeddings fail with `NoEmbeddingCreditError` (no host has an embedding model).

## The up-front credit checks

- **Who checks:** a send, a Continue, suggestions and friends (`ChatManagerService.textCreditOut`), and a Document's Add (`DocumentManagerService`). Each refuses up front when `remainingCredit().text.remainingUsd <= 0`.
- **None changed:** the gateway's text pool walks the chain instead.
  - It reads the first host that can still serve a call, and returns it with `host`.
  - A host remembered out of credit, or whose balance reads used up, gives way to the next. A remembered host's balance isn't read at all.
  - The last host's reading stands whatever it reads.
  - So the pool reads out only when every host is out, and the free model's unknown balance never refuses.
- **Balances by host:**
  - OpenRouter: `/credits`.
  - Venice: the Venice balance images use. It needs `VENICE_ADMIN_KEY`; without one it is unknown.
  - The free host: unknown.
- **The cache:** credit is still cached for 30 s, and the cache is dropped when a host is remembered out.

## Usage page

- **The API:** `PoolUsage` gains `host`: the text chain's serving host, null for the image pool. A Member sees it too; it is not a balance.
- **The heading:** the Text card reads `Text (OpenRouter)`, `Text (Venice)` or `Text (free model on OpenRouter)`. Before, it always said OpenRouter, which was wrong under `TEXT_HOST=venice`. With no `host` (the fake gateway in e2e), it still says OpenRouter.
- **On the free model:** "Remaining credit" reads "Unknown. Text is on a free model while the paid hosts are out of credit."
- **Spend:** the month's text spend still sums every host's records.

## Turning it on (live)

Set `TEXT_HOSTS=openrouter,venice,free` in the API's environment and restart `storytell-api`. Live's current drop-in sets `TEXT_HOST=venice`; it can stay, since `TEXT_HOSTS` wins, or be replaced by a drop-in with `TEXT_HOSTS`. While OpenRouter is below zero, the first call after each restart, and one call every 10 minutes, pays a failed round trip to OpenRouter (a 402, no charge).

## Testing

- **Contract** (`test/text-fallback.spec.ts`), with a scripted fetch through the real gateway:
  - a 402 on OpenRouter → Venice answers, with the same messages, recorded as Venice, with the WARN line;
  - both out → the free model answers: its body, $0, recorded as `openrouter-free`;
  - a play turn on the free model sends only `temperature`/`top_p` and the stop strings;
  - a remembered host is passed over, then tried again after 10 minutes;
  - a chain of one still asks OpenRouter on every call;
  - the last host's refusal is the answer;
  - a stream refused before any text moves to Venice;
  - a stream refused mid-stream is not retried elsewhere;
  - embeddings move to Venice and never to the free host;
  - embeddings out everywhere → `NoEmbeddingCreditError` with a free host, `OutOfCreditError` without one;
  - the text pool reads Venice while OpenRouter is below zero (so the up-front checks pass), unknown on the free model, out only when the last host is, and skips reading a remembered host.
- **Config** (`test/config.spec.ts`): the default, `TEXT_HOST=venice`, `TEXT_HOSTS` order and precedence, and the refusals.
- **The turn** (`test/documents-in-turns.spec.ts`): a `NoEmbeddingCreditError` at the turn's search plays the turn without Documents and records `failed`.

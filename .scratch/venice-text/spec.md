# Text on Venice

Built 2026-11-17. The user: "ปรับไปใช้ model ฟรีก่อนนะ หรือ ใช้ model จาก venice ก่อนก็ได้ ตอนนี้ credit ของ openrouter หมดน่ะ" (switch to a free model for now, or to Venice's; OpenRouter's credit has run out).

## What was found

- **OpenRouter:** $30.01 used of $30. The text pool reads below zero, so every turn is refused as out of credit before it is sent.
- **OpenRouter's free models:** none is DeepSeek, GLM or anything tuned for roleplay. The 14 listed are small or coding models, Gemma 4 and Nemotron.
- **Venice:**
  - It serves the same models: `deepseek-v4-pro` ($1.65/$3.30 per million tokens), `deepseek-v4-flash` ($0.138/$0.275), `z-ai-glm-5-3`.
  - It has `text-embedding-bge-m3`, the same embedding model, so stored vectors still match.
  - The account had $2.10.
  - It speaks the OpenAI chat shape. A streamed answer's last chunk carries usage and `cost.usd`.
  - `venice_parameters: { include_venice_system_prompt: false, disable_thinking: true }` keeps Venice's own system prompt out and thinking off. Checked with a real call: reasoning tokens 0.

## Decision

- **`TEXT_HOST=venice`** in the API's environment sends every text and embedding call to Venice, with the same models under Venice's ids. Unset, or `openrouter`, it is as before. On the VM it is a systemd drop-in for `storytell-api`, so `/etc/storytell/api.env` stays untouched. Removing the drop-in and restarting switches back once OpenRouter has credit.
- **The client:** `VeniceTextClient` is the OpenRouter client with Venice's base URL, key (`VENICE_API_KEY`), model ids and body. The OpenRouter client gained small hooks for this (body, stream extras, embedding body, cost reading); its own requests are unchanged.
- **Usage records** name `venice` as the host.
- **Text credit** is read from the Venice balance, the same one images use. Without a Venice Admin key it is unknown, which never blocks a turn.
- **Cost:** what Venice reports in `cost.usd`; when it reports none, the list price of the tokens. A stopped stream on Venice has no bill to look up, so it is not recorded.
- **No prompt cache seen on Venice:** a 5.7k-token turn cost $0.0099. A turn in Chat 2 (about 12k tokens) is about $0.02, so $2.10 lasts about 100 turns with their background calls.

## Testing

- **Contract** (`test/venice-text.spec.ts`), with a scripted fetch through the real gateway:
  - the turn's body: Venice's id, no Venice system prompt, thinking off, stop strings;
  - background calls on Flash, at list price when no cost comes back;
  - a stream, with usage asked for and the cost read from its last chunk;
  - bge-m3 embeddings;
  - a 402 read as out of credit.
- **Real:** one turn on dev with `TEXT_HOST=venice`. The reply, Thoughts, Line repair, Judge and Memory all ran on Venice, recorded as `venice`.

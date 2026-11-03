# PROTOTYPE — How one AI turn behaves (ticket 07)

Throwaway. Answers [ticket 07](../../.scratch/storytell-mvp/issues/07-one-ai-turn-prototype.md); not production code.

Run from the repo root (Node 22+, no install):

```bash
node prototypes/one-ai-turn/server.mjs
```

then open http://localhost:5177.

The key comes from the `OPENROUTER_API_KEY` env var or `prototypes/one-ai-turn/.env` (gitignored).
It stays on the local server and is never sent to the page.

Every request pins its host (`provider.only`, `allow_fallbacks: false`) with reasoning off:
GLM-5.3 → DeepInfra, DeepSeek V4 Pro → GMICloud, Bond/Arc judge (V4 Flash) → DeepInfra.

- `turn.mjs` — the pure logic: prompt building for both turn shapes, reply parsing, the
  "acted for the user" backstop, the judge prompt and the Bond/Arc reducer.
- `server.mjs` — serves the page and proxies OpenRouter; logs every turn, judgement and
  verdict chip to `runs/<date>.jsonl` (gitignored — it holds the played text).
- `story.json` — the sample Story (edit freely).
- `battery.mjs` — plays the same 10 scripted lines through every model × turn shape (server must be running);
  `report.mjs` renders the newest battery side by side at http://localhost:5177/report;
  `rejudge.mjs` replays the battery transcripts through the current judge prompt.

Verdict and findings: see the `## Answer` of ticket 07.

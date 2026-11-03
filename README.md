# Storytell AI

A single-user, private web app for roleplaying with AI-played Characters inside Stories you
write. It runs on the home Windows PC and is reachable only over a private Tailscale tailnet,
so it has no login. Vocabulary: [CONTEXT.md](CONTEXT.md). What to build:
[the MVP spec](.scratch/storytell-mvp/spec.md).

## Layout

```
apps/api    NestJS API (TypeORM + PostgreSQL), port 4001 in dev
apps/web    Next.js PWA, port 3001 in dev; proxies /api/* to the API
scripts/    dev.mjs, the one-command dev environment
docs/       error-codes.md and agent docs
```

The browser only talks to the Next.js server, which proxies `/api/*` to the API. That keeps one
origin and one port for Tailscale serve to publish.

## Dev setup

Needs Node.js 24.11 or later. Nothing else: PostgreSQL comes as an npm package
(`embedded-postgres`), for dev and for the tests.

```bash
npm install
```

```bash
npm run dev
```

`npm run dev` starts the dev PostgreSQL, applies migrations, then runs the API and the
frontend in watch mode. Open <http://localhost:3001>. A fresh install shows "Stories" with no
Stories. Ctrl+C stops all three.

Dev data lives in `.data/dev/` (git-ignored): the database cluster in `postgres/` and the image
folder in `images/`. Delete the folder to start from scratch.

To change ports or add provider keys, copy [.env.example](.env.example) to `.env`.

### Dev and live are kept apart

Dev and live are two instances of the same code with different configuration. Each has its own
database, image folder and ports, so experiments can't touch real Chats:

| | Dev | Live |
|---|---|---|
| Frontend | 3001 | 3000 |
| API | 4001 | 4000 |
| Database | `.data/dev/postgres`, port 54321 | its own PostgreSQL database |
| Image folder | `.data/dev/images` | its own folder |
| Migrations | on every `npm run dev` | only in the deploy step |

The live instance, its autostart and Tailscale serve are set up in ticket 32.

### Configuration

The API reads its environment only through `apps/api/src/config/app-config.ts`:

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | yes | API port |
| `DATABASE_URL` | yes | PostgreSQL connection URL |
| `IMAGE_DIR` | yes | Image folder. The database stores image paths relative to it. |
| `MODEL_GATEWAY` | no | `real` (default) or `fake`. `fake` is for tests only. |
| `OPENROUTER_API_KEY` | for `real` | OpenRouter key: every text call, and the text credit balance |
| `VENICE_API_KEY` (or `VENICE_INFERENCE_KEY`) | for `real` | Venice inference key: Snapshots and Reference images |
| `VENICE_ADMIN_KEY` | no | Venice Admin key, only to read the image credit balance. Without it the Usage view shows image spend but no remaining credit. |
| `ENV_FILE` | no | Load the variables above from this file at startup |

The frontend reads `API_ORIGIN` (where to proxy `/api`, needed at both `next build` and
`next start`) and `INSTANCE_LABEL` (added to the app name, so an installed dev PWA reads
"Storytell AI (dev)").

### Model Gateway

`apps/api/src/service/model-gateway/` is the only code that talks to a model provider
(spec: "Model Gateway"). Callers pass a call kind, never a model; the gateway picks the model
from the kind and Settings, and writes one `usage_record` row per answered call.

| Kind | Model | Host | Request settings |
|---|---|---|---|
| turn, story_draft, field_rewrite, story_assistant | play model from Settings: GLM-5.3 (default) or DeepSeek V4 Pro | DeepInfra / GMICloud via OpenRouter | `provider.only` + `allow_fallbacks: false`; GLM `reasoning: {effort: "minimal"}` with stop strings; V4 Pro `reasoning: {enabled: false}`, stop strings never sent |
| judge, memory_extraction, snapshot_prompt | DeepSeek V4 Flash | DeepInfra via OpenRouter | `reasoning: {enabled: false}`, `response_format: json_object` when asked |
| snapshot_image | Snapshot model from Settings: `seedream-v4-edit` (default, $0.05) or `qwen-edit-uncensored` ($0.04) | Venice `POST /image/multi-edit` | up to 3 reference images, `aspect_ratio: "2:3"`, `safe_mode: false` |
| reference_image | `qwen-image-3` ($0.04) | Venice `POST /image/generate` | `aspect_ratio: "2:3"`, `safe_mode: false` |

- The gateway never switches model or host. A 429 or 503 is retried up to 3 times on the same
  host with backoff (`Retry-After` honoured); anything else fails with a typed error.
- Error mapping: OpenRouter 402 or "would exceed your available credits" → out of text credit;
  moderation flags and `content_filter` → refusal; Venice 402 → out of image credit; Venice 422,
  `x-venice-is-blurred` or `x-venice-is-content-violation` → refusal.
- Venice reports no per-image cost, so image records carry the list price. Image prompt
  limits are read from Venice's `GET /models` (1500 characters for `qwen-edit-uncensored`) and a
  longer prompt is cut to fit.
- Remaining credit: OpenRouter from `GET /credits` (falling back to `GET /key`), Venice from
  `GET /billing/balance` only when `VENICE_ADMIN_KEY` is set.
- The contract tests in `apps/api/test/gateway/` run the real gateway against recorded,
  synthetic responses in `apps/api/test/fixtures/`.

### Settings and usage

`GET/PUT /api/settings` holds the one Settings row: play model, Snapshot model, and per pool
the low-credit threshold (percent, default 20) and the credit cap it is a percent of (default
$22 text, $8 image, the spec's split of the $30 cap). `GET /api/usage` returns this month's
spend per pool from the usage records, the remaining credit read from the providers, and
whether each pool is low. The frontend shows a banner on every page while a pool is low, and
a Drift warning on the Settings page when the play model is changed.

### Story drafting

`POST /api/stories/draft` with `{ idea }` makes one `story_draft` call to the play model in
JSON mode and saves the answer as a whole Story, playable when the model filled every required
field. `apps/api/src/manager/story-drafting/draft-schema.ts` checks the shape first (1–6
Characters, Style values in their sets, StartingBonds by Character name, at most one per
direction); a draft that fails answers `502.005.002` and leaves nothing behind, unreadable
output `502.005.001`. `POST /api/stories/:id/rewrite` with `{ target, id?, field }` makes one
`field_rewrite` call with the whole Story as context and changes that one text field. The
prompt text is in `prompts.ts` beside the schema. In the app, "New Story" opens a panel with
the idea (or "Start blank"), and every text field of the editor has a Rewrite button.

### Migrations

Migrations live in `apps/api/src/migration/` and are listed by hand in
`apps/api/src/migration/index.ts`. To generate one from entity changes, with the dev database
running:

```bash
npm run migration:generate -w apps/api -- src/migration/AddSomething
```

Then add the new class to `index.ts`. `npm run migrate -w apps/api` applies the pending
migrations of the last build (`npm run build -w apps/api`) to whatever `DATABASE_URL` points at.

## Tests

There are two test seams (spec: Testing Decisions). Both fake only the **Model Gateway**.

### API tests (Vitest)

```bash
npm run test:api
```

Each run starts a throwaway PostgreSQL server and migrates a template database once. Every test
file then boots the real NestJS app against its own fresh copy of that database and an empty
temporary image folder. Nothing touches the dev database.

Write a test like this:

```ts
import { startTestApp, TestApp } from './harness/test-app.js';

let t: TestApp;
beforeAll(async () => (t = await startTestApp()));
afterAll(() => t.close());

it('...', async () => {
    t.gateway.scriptText('turn', 'The door creaks open.');   // script the fake
    const response = await t.http.post('/api/...').send({}); // drive the HTTP API
    expect(t.gateway.textCalls('turn')).toHaveLength(1);    // inspect what it was sent
});
```

The fake (`apps/api/src/service/model-gateway/fake-model-gateway.ts`) replays replies per call
kind, in order, and can reject with any typed gateway error (outage, refusal, out of credit,
unparseable). A call with nothing scripted fails the test. `t.imageDir` is the app's image
folder, for tests that put files in it or check what was written.

### Browser tests (Playwright)

```bash
npm run test:e2e
```

The first time only, install the browser:

```bash
npx playwright install chromium
```

Global setup builds the API, starts a throwaway PostgreSQL, migrates it, and runs the built
API on port 4101 with the fake gateway. Playwright starts Next.js on port 3101, proxying to it.
Tests run one at a time because some stop and restart the shared API
(`apps/web/e2e/harness/api-server.ts`). The report is written to `apps/web/playwright-report/`.

Browser tests can script and inspect the fake through test-only routes, mounted only when
`MODEL_GATEWAY=fake`:

| Route | Body |
|---|---|
| `POST /api/testing/fake-gateway/text` | `{ kind, replies: [ "text" \| { text, model } \| { error: "outage" \| "refusal" \| "out_of_credit" \| "unparseable", pool? } ] }` |
| `POST /api/testing/fake-gateway/image` | `{ kind, replies: [ { imageBase64?, mimeType? } \| { error, pool? } ] }` |
| `PUT /api/testing/fake-gateway/credit` | `{ text?: { remainingUsd, limitUsd }, image?: { ... } }` |
| `GET /api/testing/fake-gateway/calls` | Returns the calls received and any replies not yet used |
| `DELETE /api/testing/fake-gateway` | Resets the fake |

Keep this suite small: behaviour detail belongs in the API tests.

## The PWA

- The manifest is `apps/web/app/manifest.ts`. The icons are rendered from
  `apps/web/public/icons/icon.svg` by `node apps/web/scripts/make-icons.mjs`.
- The app is online-only. Nothing is cached for offline use and nothing is queued.
- When an API call can't reach the API, the app swaps the page for the "can't connect" screen.
  Its Retry checks the API and reloads the page.
- When the app itself can't be loaded (the PC is off), the service worker (`public/sw.js`)
  serves `public/offline.html`, the same screen as a static page. That page is the only thing
  the worker caches.
- Installing needs HTTPS, which Tailscale serve provides on the tailnet. `localhost` also
  counts, so `npm run test:e2e` checks installability with Chrome's own checks.

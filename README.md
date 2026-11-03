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
| `OPENROUTER_API_KEY`, `RUNWARE_API_KEY` | no | Provider keys, used from ticket 20 on |
| `ENV_FILE` | no | Load the variables above from this file at startup |

The frontend reads `API_ORIGIN` (where to proxy `/api`, needed at both `next build` and
`next start`) and `INSTANCE_LABEL` (added to the app name, so an installed dev PWA reads
"Storytell AI (dev)").

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

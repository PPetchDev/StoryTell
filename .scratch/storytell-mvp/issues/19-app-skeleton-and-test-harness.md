# App skeleton, PWA shell and test harness

Type: task
Status: resolved
Blocked by: none
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

The thinnest end-to-end path through every layer, plus the test harness every later ticket uses.

- A Next.js frontend and a NestJS API in one repo, with PostgreSQL and migrations. Configuration comes from env: database URL, image folder, port and provider keys. Dev and live use separate databases and ports.
- An image folder set by config. The API serves files from it by path relative to the folder.
- **PWA shell:**
  - manifest and icons, installable over HTTPS
  - an empty "Stories" home screen loaded from the API
  - one "can't connect" screen with the checklist (internet, PC on, Tailscale connected) and Retry, shown whenever the API can't be reached
  - no offline caching of data and no queued requests
- **Model Gateway interface and scripted fake.** This ticket defines the interface: text completion, image generation and remaining credit, plus the typed errors (outage, refusal, out of credit, unparseable). It also adds a fake that tests can script and inspect. The real gateway comes in ticket 20.
- **Test harness:**
  - API tests boot the real NestJS app against a disposable PostgreSQL test database and a temporary image folder, with the fake gateway.
  - Playwright runs the Next.js app against that API.
  - One example test at each seam.
- A README covering dev setup and how to run each test suite.

## Acceptance criteria

- [ ] One command starts dev (frontend, API, database) and the home screen lists zero Stories.
- [ ] One command runs the API tests against a fresh test database. One command runs Playwright.
- [ ] Stopping the API makes the frontend show the "can't connect" screen, and Retry recovers once the API is back (covered by a Playwright test).
- [ ] The app passes PWA installability checks when served over HTTPS.
- [ ] No user, account or session tables exist.

## User stories covered

133, 135, 136, 138 (dev/live separation by config).

## Comments

**Built (agent, 2026-11-03).** Everything is on branch `claude/exciting-perlman-0dd026`. `Status:` is left for the user to close.

- **Repo:** npm workspaces with `apps/api` (NestJS 12, TypeORM 1, PostgreSQL 18) and `apps/web` (Next.js 16). The browser only talks to Next.js, which proxies `/api/*` to the API, so Tailscale serve fronts one port. The README covers dev setup, config and both test suites.
- **PostgreSQL** comes from the `embedded-postgres` npm package, for both dev and the tests. The PC had no PostgreSQL or Docker, and this needs no install. `npm run dev` keeps a persistent dev cluster in `.data/dev/` (port 54321), migrates it, then runs the API (4001) and frontend (3001) in watch mode. Live (ticket 32) can use an installed PostgreSQL through `DATABASE_URL`.
- **Config** is env-only, through `apps/api/src/config/app-config.ts`: `PORT`, `DATABASE_URL`, `IMAGE_DIR`, `MODEL_GATEWAY`, `OPENROUTER_API_KEY`, `RUNWARE_API_KEY`, plus optional `ENV_FILE`. The frontend reads `API_ORIGIN` and `INSTANCE_LABEL` (an installed dev PWA is named "Storytell AI (dev)").
- **Schema:** one migration creates a minimal `story` table (id, title, timestamps) so the home screen reads real rows. Ticket 21 extends it. There are no user, account or session tables, and an API test checks that.
- **Images:** `GET /api/images/<relative path>` serves files from `IMAGE_DIR`. It refuses absolute paths and paths that leave the folder (`400.002.002`) and answers `404.002.001` for missing files.
- **PWA:** the manifest is `app/manifest.ts`, with icons rendered from `public/icons/icon.svg`. The home screen lists Stories from the API. Any API call that can't reach the API swaps the page for the one "can't connect" screen; its Retry checks `/api/health` and remounts the page. The service worker caches only `offline.html`, the same screen as a static page, for when the app itself can't load (PC off). It caches no data and queues nothing.
- **Model Gateway:** `apps/api/src/service/model-gateway/model-gateway.ts` defines `completeText`, `generateImage` and `remainingCredit`. Callers pass a call kind, never a model; the gateway picks the model. Typed errors live in `src/errors/model-gateway.errors.ts` (outage, refusal, out of credit per pool, unparseable), with codes listed in `docs/error-codes.md`. `FakeModelGateway` replays replies per call kind, records the calls it got, and fails loudly on an unscripted call. Until ticket 20, `MODEL_GATEWAY=real` binds a placeholder that throws an outage error.
- **Test harness:**
  - `npm run test:api` (Vitest) starts one throwaway PostgreSQL and migrates a template database. Each test file gets a fresh copy, an empty temp image folder and the fake (`test/harness/test-app.ts`).
  - `npm run test:e2e` (Playwright) builds and runs the real API with the fake on a throwaway database. It drives Next.js against it, and tests can stop and restart the API.
  - Test-only routes under `/api/testing/fake-gateway` let browser tests script and inspect the fake. They are mounted only when `MODEL_GATEWAY=fake`.

**Verified:**
- `npm run test:api`: 12 passed. Covers the empty Stories list, image serving and path refusal, no auth tables, and the fake's contract.
- `npm run test:e2e`: 4 passed:
  - the home screen shows zero Stories
  - stopping the API shows the can't-connect screen, and Retry recovers after a restart
  - the service worker shows the same screen when offline
  - Chrome's `Page.getInstallabilityErrors` reports none (localhost counts as a secure context, so the HTTPS rules apply)
- `npm run dev` brought up all three processes, and the home screen showed "No Stories yet."
- Typecheck is clean for both apps.

**Not verified:** installing over the real tailnet HTTPS address. That needs ticket 32.

**Notes for later tickets:**
- PostgreSQL 18 runs with `io_method=sync` in dev and tests, because its io_worker processes outlived shutdown on Windows.
- If `npm run dev` is killed without Ctrl+C, the next run stops the leftover dev PostgreSQL first.
- New migrations must be added to `apps/api/src/migration/index.ts`, and new entities to `apps/api/src/store/db/entities.ts`.

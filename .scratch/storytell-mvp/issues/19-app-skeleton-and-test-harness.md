# App skeleton, PWA shell and test harness

Type: task
Status: ready-for-agent
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

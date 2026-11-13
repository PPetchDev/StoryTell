# Storytell AI

A single-user, private web app for roleplaying with AI-played Characters inside Stories you
write. It runs on the home Windows PC and is reachable only over a private Tailscale tailnet,
so it has no login. Vocabulary: [CONTEXT.md](CONTEXT.md). What to build:
[the MVP spec](.scratch/storytell-mvp/spec.md).

## Layout

```
apps/api    NestJS API (TypeORM + PostgreSQL), port 4001 in dev
apps/web    Next.js PWA, port 3001 in dev; proxies /api/* to the API
scripts/    dev.mjs (the one-command dev environment); live.mjs, live-run.mjs and
            live-task.ps1 (the live instance)
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
folder in `images/`. Delete the folder to start from scratch. The cluster is created UTF-8 whatever
the machine's locale; one made before that (WIN1252 on Windows) is refused by migrations, so
recreate it and copy the data over.

To change ports or add provider keys, copy [.env.example](.env.example) to `.env`.

### Dev and live are kept apart

Dev and live are two instances of the same code with different configuration. Each has its own
database, image folder and ports, so experiments can't touch real Chats:

| | Dev | Live |
|---|---|---|
| Frontend | 3001 | 3000 |
| API | 4001 | 4000 |
| Database | `.data/dev/postgres`, port 54321 | its own PostgreSQL service, port 5432 |
| Image folder | `.data/dev/images` | `LIVE_HOME/images` |
| Code | this checkout, rebuilt on every start | a release built into `LIVE_HOME/app` |
| Migrations | on every `npm run dev` | only in the deploy step |

The live instance, its autostart and Tailscale serve are in [Running live](#running-live).

### Configuration

The API reads its environment only through `apps/api/src/config/app-config.ts`:

| Variable | Required | Meaning |
|---|---|---|
| `PORT` | yes | API port |
| `DATABASE_URL` | yes | PostgreSQL connection URL |
| `IMAGE_DIR` | yes | Image folder. The database stores image paths relative to it. |
| `SPEECH_DIR` | no | Read aloud's audio and voice samples. Default: a folder named `speech` beside the image folder. It must not be inside the image folder: backups copy that folder, and audio is never backed up (it is made again on the next reading). |
| `MODEL_GATEWAY` | no | `real` (default) or `fake`. `fake` is for tests only. |
| `OPENROUTER_API_KEY` | for `real` | OpenRouter key: every text call, and the text credit balance |
| `VENICE_API_KEY` (or `VENICE_INFERENCE_KEY`) | for `real` | Venice inference key: Snapshots, Reference images, Expressions, Dictation and Read aloud |
| `VENICE_ADMIN_KEY` | no | Venice Admin key, only to read the image credit balance. Without it the Usage view shows image spend but no remaining credit. |
| `LOGIN_PASSWORD` | for a public address | The owner's sign-in password, at least 12 characters (`.scratch/sign-in/spec.md`). Set: every route needs a sign-in, once per device for 90 days. Unset: sign-in is off. Any instance reachable from the internet, through a tunnel or a host like Vercel too, must set it. Changing it signs every device out. |
| `HOST` | no | Address the API listens on. Default `127.0.0.1`. Anything but loopback without `LOGIN_PASSWORD` or `SUPABASE_URL` refuses to start. |
| `SUPABASE_URL` | for Members | The Supabase project, e.g. `https://abcd.supabase.co` (`.scratch/accounts/spec.md`, `docs/adr/0005-…`). Set: People on the list sign in with Google or email; their Stories are their own and they play within a Monthly cap. Needs `SESSION_SECRET`. |
| `SUPABASE_ANON_KEY` | with `SUPABASE_URL` | The project's anon (publishable) key. Public by design: the API hands it to the web app's sign-in screen. |
| `SESSION_SECRET` | with `SUPABASE_URL` | Keys every session cookie, at least 32 random characters. Unset, sessions are keyed from `LOGIN_PASSWORD` as before. Changing it signs every device out. |
| `OWNER_EMAIL` | no | The Owner Account's email, so the Owner can sign in with Google or email too. Without it the Owner signs in with `LOGIN_PASSWORD` only. |
| `SUPABASE_EMAILS_CONFIRMED` | no | `true` once you checked "Confirm email" is on in Supabase (its default), so an email + password user gets a session only after confirming the address. Then such a sign-in may claim a listed email; otherwise only Google, which checked the address, may. Never set it with "Confirm email" off. |
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
| turn, story_draft, field_rewrite, story_assistant, suggested_replies | play model from Settings: GLM-5.3 (default) or DeepSeek V4 Pro | DeepInfra via OpenRouter | `provider.only` + `allow_fallbacks: false`, with stop strings; GLM `reasoning: {effort: "minimal"}`; V4 Pro `reasoning: {enabled: false}` |
| judge, memory_extraction, snapshot_prompt | DeepSeek V4 Flash | DeepInfra via OpenRouter | `reasoning: {enabled: false}`, `response_format: json_object` when asked |
| snapshot_image | Snapshot model from Settings: `seedream-v4-edit` (default, $0.05), `seedream-v5-pro-edit` ($0.06, +$0.00345 per reference image past the first) or `qwen-edit-uncensored` ($0.04) | Venice `POST /image/multi-edit` | up to 3 reference images, `aspect_ratio: "2:3"`, `safe_mode: false` |
| reference_image | `qwen-image-3` ($0.04 at 1K or 2K) | Venice `POST /image/generate` | `aspect_ratio: "2:3"`, `resolution: "2K"`, `safe_mode: false` |
| dictation | `whisper-large-v3` ($0.0001 per audio second, list price; Venice pool) | Venice `POST /audio/transcriptions` | multipart `file`, `model: openai/whisper-large-v3`, `language` (`th` or `en`), `response_format: json` |

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

### Story assistant

`POST /api/stories/:id/assistant` with `{ instruction, confirmRemovals? }` makes one stateless
`story_assistant` call (the whole Story plus the instruction, in JSON mode) and applies the
answered change set straight to the Story through the authoring rules: field sets, added
Characters, Scenes and StartingBonds, removals. `apps/api/src/manager/story-assistant/
change-set-schema.ts` validates the whole set first (unknown names, bad fields, Style values,
the 6-Character limit, Bond rules), so an unusable answer saves nothing (`502.005.005` or
`502.005.006`). A set that removes a Character or Scene is answered as `pending`, unapplied,
unless the request confirmed removals; the client confirms through
`POST /api/stories/:id/assistant/apply` with the same `changes` and `confirmRemovals: true`,
without another model call. The answer carries each applied change with its old value, which
is all the Undo in the editor's Assistant panel needs: nothing about the conversation or the
Undos is persisted, and the panel opens empty every time.

### Migrations

Migrations live in `apps/api/src/migration/` and are listed by hand in
`apps/api/src/migration/index.ts`. To generate one from entity changes, with the dev database
running:

```bash
npm run migration:generate -w apps/api -- src/migration/AddSomething
```

Then add the new class to `index.ts`. `npm run migrate -w apps/api` applies the pending
migrations of the last build (`npm run build -w apps/api`) to whatever `DATABASE_URL` points at.

## Running live

The live instance is the one you play on: a production build of a commit of this repository,
with its own PostgreSQL database, ports and image folder, started by Windows at boot and
published on the tailnet by Tailscale serve. Nothing in dev touches it: `npm run dev` only ever
migrates its own `.data/dev` database, and the deploy refuses a `.env.live` that points at dev's
database, ports or folders.

```
LIVE_HOME/            C:\StorytellLive by default; keep it outside this checkout
  releases/<commit>-<time>/   built releases: git worktrees of deployed commits
  current             names the release that runs
  previous            names the one before it, kept for live:rollback
  live-run.mjs        the supervisor the startup task runs (copied by each deploy)
  backup.mjs          the daily backup job (copied by each deploy)
  backup/             status.json (what the app's banner reads), last-run, staging
  live.env            a copy of .env.live, made by each deploy
  images/             Reference images and Snapshots (LIVE_IMAGE_DIR moves it)
  speech/             Read aloud audio and voice samples, beside images/; never backed up
  logs/               live.log (the supervisor), api.log, web.log, backup.log
```

### One-time setup (your steps)

1. **PostgreSQL.** Install PostgreSQL 18 from the EDB installer (postgresql.org/download/windows).
   It runs as a Windows service that starts with Windows (`Get-Service postgresql*` shows it as
   Automatic). Then, in `psql -U postgres`, create the live database and its owner:

   ```sql
   CREATE ROLE storytell LOGIN PASSWORD '<a new password>';
   CREATE DATABASE storytell_live OWNER storytell ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C' LC_CTYPE 'C';
   ```

   The encoding matters: on Windows the installer's own databases follow the machine's locale,
   which is usually WIN1252, and that refuses Thai and emoji. `\l storytell_live` in `psql` should
   show `UTF8`. Migrations, and so `npm run live:deploy`, refuse a database that isn't UTF-8.

   The installer also brings `pg_dump` and `psql`, which the backup and restore steps use.
2. **`.env.live`.** Copy the "Live instance" block of `.env.example` into `.env.live` in this
   checkout (git-ignored), uncomment it, and fill in `DATABASE_URL` with that password and the
   provider keys. Keep `LIVE_HOME` outside this checkout.
3. **First deploy:** `npm run live:deploy`. Then open http://127.0.0.1:3000 on the PC.
4. **Startup task.** From an elevated PowerShell in this checkout:

   ```powershell
   powershell -ExecutionPolicy Bypass -File scripts\live-task.ps1
   ```

   It registers "Storytell Live", which runs `LIVE_HOME\live-run.mjs` as your account (S4U: no
   stored password) at startup and every 5 minutes after: a supervisor that died comes back, and
   a running one makes the new copy exit at once. The supervisor itself restarts the API or the
   frontend if either dies. The script prints the task's time limit back: `PT0S` means none.
   Remove the task with `-Unregister`.
5. **Tailscale.** Install Tailscale on the PC and the phone, in one tailnet. In the admin console
   enable MagicDNS and HTTPS certificates. Give the PC a neutral machine name first: certificate
   names are published in public certificate-transparency logs. On the PC turn on
   Preferences → **Run unattended** (or `tailscale set --unattended=true`), so the tailnet is up
   before anyone logs on, and consider disabling key expiry for the PC. Then publish the app:

   ```powershell
   tailscale serve --bg 3000
   tailscale serve status
   ```

   With `--bg` the setting persists across reboots. Never use `tailscale funnel` without
   `LOGIN_PASSWORD` in `.env.live`: Funnel puts the app on the public internet, and without the
   password every route answers anyone. The API can't tell, since Funnel reaches it on loopback.
   `tailscale serve reset` removes the setting.
6. **Install the PWA** from `https://<machine>.<tailnet>.ts.net` on the phone (Chrome → Add to
   Home screen) and on the desktop (Chrome or Edge → Install).
7. **Check autostart:** reboot, don't log on, and open the PWA on the phone: it should list your
   Stories. If it doesn't, `npm run live:status` and `LIVE_HOME\logs\live.log` say which part
   didn't start.

### Deploying a change

```bash
npm run live:deploy
```

It deploys `master` (or `npm run live:deploy -- <ref>`). Uncommitted changes are never deployed:
commit first. The steps:

1. Build the commit as a new release in `LIVE_HOME/releases` (`npm ci` and both builds) while
   live keeps serving. If the build fails, the half-built release is removed and live was never
   touched.
2. Stop live (a few seconds of downtime start here) and run the pending migrations against the
   live database with the new build.
3. Point `LIVE_HOME/current` at the new release, start it, and wait until `/api/health` answers
   through the frontend's proxy. Releases older than the one before are removed.

If a migration fails, the running release is started again. Each migration runs in its own
transaction, so migrations before the failing one stay applied. If the new release starts but
misbehaves, `npm run live:rollback` switches back to the one before. Rollback never undoes
migrations, so it only helps while the older code still works with the newer schema.

`npm run live:status`, `npm run live:stop` and `npm run live:start` do what they say. With the
startup task registered, stop and start go through Task Scheduler.

### Daily backup

Live backs itself up: the supervisor runs `LIVE_HOME\backup.mjs` when it starts and every hour,
and the job makes at most one backup a day (a `LIVE_HOME\backup\last-run` stamp), so the hourly
runs only retry a day whose database dump failed. `npm run live:backup` makes one now.

A backup is one folder, `storytell-YYYYMMDD-HHMMSS`, holding `storytell.dump` (`pg_dump`, custom
format), `images\` (the whole image folder, relative paths intact) and `manifest.json`. It goes to:

- **the second disk**, `BACKUP_DISK_DIR` (e.g. `D:/StorytellBackups`), and
- **Google Drive, encrypted on the PC first**, through an rclone crypt remote, `BACKUP_REMOTE`.

Each keeps the newest `BACKUP_KEEP` backups (default 14). If one target fails the other still
completes, the failure goes to `LIVE_HOME\logs\backup.log`, and the Usage and Settings pages show
a banner until a later run succeeds. A failed backup never blocks play.

Setting up the Drive copy (your steps, once):

1. Install rclone: `winget install Rclone.Rclone`.
2. `rclone config` → new remote `gdrive`, type `drive`, scope `drive.file` (rclone can only see
   what it created), and sign in in the browser.
3. `rclone config` → new remote `storytell-backup`, type `crypt`, remote `gdrive:Storytell`,
   filename encryption `standard`, directory name encryption `true`, and a long passphrase plus
   a salt (password2). **Save both in your password manager**: without them the Drive copy can't
   be read, by anyone, you included. rclone keeps them obscured in its config in your profile.
4. Check: `rclone mkdir storytell-backup:` then `rclone lsf gdrive:Storytell` shows only
   scrambled names.
5. In `.env.live` set `BACKUP_DISK_DIR`, `BACKUP_REMOTE=storytell-backup:` and, unless the EDB
   installer put PostgreSQL in `C:\Program Files\PostgreSQL\<version>`, `PG_BIN` (the folder
   holding `pg_dump.exe`). Deploy once so `LIVE_HOME` gets the new settings, then run
   `npm run live:backup` and look for the backup in both places.

Restoring is in ticket 34's steps.

### Where your text and images go

Each text model is pinned to one host through OpenRouter (`provider.only`, no fallbacks), so only
the hosts below ever see a request. What their own policy pages said on 2026-11-04:

| Host | What | Prompts and outputs | Training |
|---|---|---|---|
| [OpenRouter](https://openrouter.ai/docs/guides/privacy/data-collection) | routes every text call | Not stored unless you opt in to logging (off by default). Metadata such as token counts is kept, no period stated. | Only if you opt in. With training opted out in account settings, it won't route to providers that train. |
| [DeepInfra](https://docs.deepinfra.com/account/data-privacy) | GLM-5.3 and DeepSeek V4 Pro (play), DeepSeek V4 Flash (background calls) | Not stored on disk; outputs deleted once returned. Only metadata (request ID, cost) is logged. | No. |
| [GMICloud](https://www.gmicloud.ai/en/legal/console-terms-of-service) | No longer used: DeepSeek V4 Pro moved to DeepInfra on 2026-11-05, as GMICloud's terms ban "obscene" material and it ignored `stop`. Before that: | Unclear. Its terms say inputs aren't stored without opting in to prompt logging, but OpenRouter flags it as retaining prompts, with no period. | No general-purpose training. |
| [Venice](https://docs.venice.ai/overview/privacy) | Snapshots and Reference images | Venice says it doesn't store prompt or response content; it keeps metadata (key ID, IP, timestamps). But `seedream-v4-edit`, `seedream-v4` and `qwen-image-3` are Venice "anonymized" models, not "private" ones: the upstream image provider still sees the prompt and reference images, under terms Venice doesn't state. | Not mentioned. |

Worth doing in your accounts: in OpenRouter → Settings → Privacy, keep prompt logging off and
opt out of providers that train. Stricter options exist (OpenRouter's "ZDR only" setting, Venice
models marked "private"), but check first that the pinned hosts and the image models qualify:
with fallbacks off, a request to a host that doesn't qualify fails instead of rerouting.

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

Global setup builds the API into its own folder, `apps/api/dist-e2e`, starts a throwaway
PostgreSQL, migrates it, and runs the built API on port 4101 with the fake gateway. Playwright
starts Next.js on port 3101 (built in `.next-e2e`), proxying to it. Neither touches `dist` or
`.next`, so the browser tests can run while `npm run dev` is up.
Tests run one at a time because some stop and restart the shared API
(`apps/web/e2e/harness/api-server.ts`). The report is written to `apps/web/playwright-report/`.
To run two suites at once (two worktrees, say), give the second one its own ports:
`E2E_WEB_PORT=3151 E2E_API_PORT=4151 npm run test:e2e`.

Browser tests can script and inspect the fake through test-only routes, mounted only when
`MODEL_GATEWAY=fake`:

| Route | Body |
|---|---|
| `POST /api/testing/fake-gateway/text` | `{ kind, replies: [ "text" \| { text, model } \| { error: "outage" \| "refusal" \| "out_of_credit" \| "unparseable", pool? } ] }` |
| `POST /api/testing/fake-gateway/image` | `{ kind, replies: [ { imageBase64?, mimeType? } \| { error, pool? } ] }` |
| `POST /api/testing/fake-gateway/transcription` | `{ replies: [ "text" \| { text?, delayMs? } \| { error, pool? } ] }` (Dictation; the calls list shows a recording as `{ mimeType, size }`) |
| `POST /api/testing/fake-gateway/speech` | `{ kind: "read_aloud" \| "voice_preview", replies: [ { audioBase64?, characters?, delayMs? } \| { error, pool? } ] }` (Read aloud and voice samples; an unscripted call fails, and the calls list shows each request's kind, voice and text) |
| `PUT /api/testing/fake-gateway/credit` | `{ text?: { remainingUsd, limitUsd }, image?: { ... } }` |
| `GET /api/testing/fake-gateway/calls` | Returns the calls received and any replies not yet used |
| `DELETE /api/testing/fake-gateway` | Resets the fake |

Keep this suite small: behaviour detail belongs in the API tests.

## The PWA

- The manifest is `apps/web/app/manifest.ts`. The icons are rendered from the artwork
  `apps/web/icon-art/storytell-icon.png` by `node apps/web/scripts/make-icons.mjs`.
- The app is online-only. Nothing is cached for offline use and nothing is queued, except an autosaved
  edit that was on its way when the API went away: the open tab holds it and Retry sends it first.
- When an API call can't reach the API, the app swaps the page for the "can't connect" screen.
  Its Retry checks the API and reloads the page.
- When the app itself can't be loaded (the PC is off), the service worker (`public/sw.js`)
  serves `public/offline.html`, the same screen as a static page. That page is the only thing
  the worker caches.
- Installing needs HTTPS, which Tailscale serve provides on the tailnet. `localhost` also
  counts, so `npm run test:e2e` checks installability with Chrome's own checks.

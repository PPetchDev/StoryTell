# Run the live instance on the home PC

Type: task
Status: ready-for-human
Blocked by: 17, 19
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to do

The agent can write the build and deploy scripts and the README section. Installing services and changing system settings is the user's job.

- **Live instance.** A live build of the frontend and API with its own database, port and image folder, separate from dev. It is updated only by build, migrate, then restart, through one deploy script.
- **Autostart.** PostgreSQL, the live app and Tailscale start automatically with Windows, as services or startup tasks.
- **Tailscale serve.** The live app is published on the tailnet over HTTPS at the PC's `*.ts.net` name. Never use Funnel or a public tunnel.
- **Install the PWA** on the Windows desktop and the Android phone from that URL.

## Acceptance criteria

- [ ] After a reboot, with nothing launched by hand, the phone opens the PWA and lists Stories.
- [ ] A dev migration doesn't touch the live database.
- [ ] The README documents the deploy steps and the host retention notes from ticket 17.

## User stories covered

132–134, 137, 138.

## Comments

**Agent part built (main session, 2026-11-04).** On master. `Status:` stays `ready-for-human`: installing PostgreSQL and Tailscale, registering the startup task and the reboot check are yours (README "Running live", steps 1–7).

- **Scripts:** `scripts/live.mjs` (`npm run live:deploy [-- <ref>]`, `live:rollback`, `live:start`, `live:stop`, `live:status`), `scripts/live-run.mjs` (the supervisor), `scripts/live-task.ps1` (registers the "Storytell Live" task: at startup and every 5 minutes, S4U as your account, no time limit, one instance). Settings in `.env.live` (git-ignored; block in `.env.example`).
- **Layout:** `LIVE_HOME` (default `C:\StorytellLive`) holds `releases/<commit>-<time>/` (git worktrees, built in place), `current` and `previous` (release names), `live-run.mjs` and `live.env` (copied by each deploy), `images/`, `logs/`. Live PostgreSQL is a separate EDB install as a Windows service (it also brings `pg_dump` for ticket 33); embedded-postgres stays dev/test only (its binaries are for testing and it ships no `pg_dump`).
- **Deploy:** build the commit as a new release while live serves (a failed build removes it, live untouched) → stop live → migrate the live database with the new build (a failed migration restarts the running release) → point `current` at it → start → wait for `/api/health` through the frontend's proxy → remove releases older than the previous one. `live:rollback` swaps `current` and `previous` (the database is not rolled back).
- **Apart from dev:** the deploy refuses a `DATABASE_URL` on dev's PostgreSQL port or named `storytell_dev`, live ports equal to dev's, and a `LIVE_HOME` or image folder inside this checkout (case-insensitive) or images inside `releases/`. `npm run dev` only migrates its own `.data/dev` cluster. The supervisor forces `MODEL_GATEWAY=real` (the fake gateway has test-only routes), binds `next start` to 127.0.0.1, and lets `live.env` win over inherited environment variables.
- **README:** "Running live" (layout, one-time setup, deploying, rollback, migration caveat) and "Where your text and images go" (retention and training for OpenRouter, DeepInfra, GMICloud and Venice from their policy pages, 2026-11-04). Spec: `seedream-v4` row for Snapshots with no Reference image in frame.

**Verified on this PC** (a scratch `LIVE_HOME` in the session scratchpad, ports 3000/4000, with an embedded PostgreSQL on 55432 standing in for the EDB service, which isn't installed):
- Five deploys in all, across two layouts. With the final layout: three deploys in a row, each up; after the third only the current and previous releases were left, with two worktrees registered; each release's npm workspace junctions point into that release.
- A Story created through `http://127.0.0.1:3000/api/stories` survived every deploy and the rollback. The manifest name is "Storytell AI" (no dev label). The home page is 200.
- Ports 3000 and 4000 answer on 127.0.0.1 and refuse on the LAN address (192.168.1.104).
- Downtime during a deploy: the app answered throughout the ~55 s build, then one 2-second health sample failed during the stop/migrate/start.
- Killing the API: the supervisor logged the exit and had it answering again in about 6 s.
- `live:stop`, `live:start`, a second `live:start` ("already running"), and a second supervisor started by hand (exits at once). `live:rollback` switched back and came up.
- A stale pid file naming another program (the stand-in PostgreSQL's node process): `status` said not running, `stop` left that process alive, `start` then came up.
- Refusals: a `DATABASE_URL` on port 54321; a `LIVE_IMAGE_DIR` under `.data/dev` written in lower case; a `LIVE_IMAGE_DIR` inside `releases/`.
- An attacker review found 9 defects in the first version, all fixed in the second (commit "Build live releases in place…"). The worst: npm's workspace junctions hold absolute paths, so moving built folders left `git worktree remove` unable to delete them and the fourth deploy failed with live stopped.

**Not verified:**
- The startup task was not registered (system change; your step 4), so autostart, the 5-minute re-run, S4U reaching loopback, and `Stop-/Start-ScheduledTask` from the deploy are untested. The README's step 7 (reboot, don't log on, open the PWA) is the check.
- Against the real EDB PostgreSQL service and Tailscale (neither installed). `tailscale serve --bg 3000` is inferred from Tailscale's documented syntax; `tailscale serve status` confirms it.
- The failed-migration path (restart of the running release) was not exercised.

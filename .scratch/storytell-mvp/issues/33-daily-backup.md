# Daily backup to a second disk and encrypted Google Drive

Type: task
Status: ready-for-agent
Blocked by: 32
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Backup job.** Runs on PC start, at most once a day, tracked by a last-run stamp. It takes a database dump of the live instance plus a copy of the image folder, and writes them to two targets set by config:
  - a folder on the second disk
  - a Google Drive remote, encrypted client-side before upload, for example with an encrypting sync tool. The passphrase lives outside the repo, in the user's password manager.
- **Retention.** Keep the last N backups per target (config, default 14).
- **Logging.** Failures are logged and shown as a banner in the app's usage/settings area. They never block play.
- **Human steps**, documented in the README: configure the Drive remote and its encryption, and register the job to run at startup.

## Acceptance criteria

- [ ] Running the job twice on one day makes one backup.
- [ ] Against the dev instance, a backup contains a restorable dump and the full image folder, with relative paths intact.
- [ ] The Drive copy is ciphertext. File names and contents aren't readable without the passphrase.
- [ ] A failed target shows the banner, and the other target still completes.

## User stories covered

139.

## Comments

**Built (main session, 2026-11-04).** On master (commits "Daily backup to a second disk…" and "Harden the backup job…"). `Status:` is left for you; the Drive setup (README "Daily backup", steps 1–5) and a first run on the real live instance are yours.

- **Job:** `scripts/backup.mjs`, copied to `LIVE_HOME/backup.mjs` by each deploy and rollback. The live supervisor runs it when it starts and every hour; `npm run live:backup` runs it now (`--force`). A `LIVE_HOME/backup/last-run` stamp (local date) keeps it to one backup a day, written only when at least one target got the backup, so the hourly runs retry a day whose dump or both targets failed. This is a superset of "on PC start": a PC that stays on for days still gets a daily backup.
- **Backup:** one folder `storytell-YYYYMMDD-HHMMSS` with `storytell.dump` (`pg_dump --format=custom --no-owner`, password via `PGPASSWORD`, never on the command line), `images/` (the whole image folder, relative paths intact) and `manifest.json` (release, pg_dump version, sizes; no password).
- **Targets:** `BACKUP_DISK_DIR` (copied to `<name>.partial`, renamed into place) and `BACKUP_REMOTE` (`rclone copy` to `<name>.partial`, `moveto <name>`). The remote must be a `crypt` remote (checked with `rclone listremotes --long`), so only ciphertext leaves the PC. Each target keeps the newest `BACKUP_KEEP` (default 14), removes leftover `.partial` copies, and prunes Drive without the trash. Each target is tried on its own.
- **Status and banner:** the job writes `LIVE_HOME/backup/status.json`; the supervisor gives the API `BACKUP_STATUS_FILE`; `GET /api/backup` reports it (`failed` when a target failed, the file is unreadable, or the last run is more than three days old); `components/backup-banner.tsx` shows it on the Usage and Settings pages. Nothing in play is blocked. Details go to `LIVE_HOME/logs/backup.log`.
- **Guards:** bad settings stop the run with the reason in the banner: no `DATABASE_URL`, `BACKUP_KEEP` not a whole number ≥ 1, a remote without a colon (rclone would treat it as a local folder), and a disk folder inside `LIVE_HOME` or the image folder. The deploy refuses that disk folder too. A lock (touched every minute, taken over after 15 idle minutes, removed only by its owner) keeps runs from overlapping; a skipped manual run exits 2 and says so.

**Verified on this PC** with portable PostgreSQL 18.6 binaries (`pg_dump`, `pg_restore`, `psql`; the user approved the download) and rclone v1.75.2 in the session scratchpad, a stand-in live database on port 55432 (embedded PostgreSQL 18.6) migrated by the built API, a Story, a Character and a Reference image written through the API with the fake gateway, a disk folder, and a crypt remote over a local folder standing in for Google Drive:
- **Two runs on one day make one backup.** The second exits at once; one folder on disk, one on the remote.
- **The Drive copy is ciphertext:** every file and folder name under the crypt remote is scrambled (none contains "storytell", "images", "dump", "manifest" or "png"), and no file contains the pg_dump magic `PGDMP`, the PNG signature or the Story's title.
- **Both copies restore:** `pg_restore` into fresh databases from the disk copy and from a copy fetched back through the crypt remote gives the same counts as live (2 Stories, 2 Characters, the Reference image path intact), and the image trees of live, disk and Drive copies have identical SHA-256 sums at the same relative paths.
- **Retention:** five backups with `BACKUP_KEEP=3` leave the newest three on each target.
- **A failed target:** with `BACKUP_REMOTE=nosuch:`, the disk still saved, the drive failed with rclone's reason, exit 1, and the built API's `GET /api/backup` returned `failed: true` with both targets.
- **An unreachable database:** both targets failed with pg_dump's reason, no stamp, nothing left in staging, no lock left.
- **After the review fixes:** leftover `.partial` copies on both sides were removed; a plain (non-crypt) remote failed with nothing uploaded, while the disk saved; a remote without a colon and `BACKUP_KEEP=-1` each stopped the run with the reason (no local folder created, no backup deleted); both targets failing left the stamp unchanged; a fresh lock made a manual run exit 2.
- `npm run typecheck` clean; `npm run test:api` 254 passed (6 new in `test/backup-status.spec.ts`); the browser suite 19 passed from a worktree outside the repo (2 new in `e2e/backup-banner.spec.ts`: a failed Drive target shows on Usage and Settings and not on the Stories page; no banner before the first run or after a clean one).
- An attacker review found 9 defects in the first version; all are fixed except one, noted below.

**Not verified / notes:**
- Against real Google Drive (needs your rclone sign-in) and the real EDB PostgreSQL service; the supervisor-triggered run at startup (the startup task isn't registered yet).
- The dump is taken before the image folder is copied. A Snapshot or Reference image *deleted* in between (its row goes first, then its file) leaves a restored row pointing at a missing image; one *created* in between only leaves an extra file. Rare, and the image would show as missing, nothing worse. Not fixed.
- Each backup is a full copy of the image folder, so Drive upload time and quota grow with the Gallery; `BACKUP_KEEP` bounds the quota.

# Write the restore steps and try them once

Type: task
Status: ready-for-human
Blocked by: 33
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to do

- Write step-by-step restore instructions in the README, from a fresh Windows install to a working live app: install prerequisites, fetch and decrypt the latest backup, restore the database dump, copy back the image folder, configure the env, deploy, and set up Tailscale.
- Try them once. Restore onto a spare machine, a VM, or a separate restore database and folder on the same PC. Confirm that a known Chat, its Memory drawer, its dashboard and a Gallery Snapshot all come back.

## Acceptance criteria

- [ ] The README has the restore steps.
- [ ] One drill is recorded under `## Comments`: the date, where it was restored, what was checked, and any fixes made to the steps.

## User stories covered

140.

## Comments

**2026-11-15: a drill on the Oracle VM, which now runs live in place of the PC.**

- The README has restore steps for the VM ("Live on the Oracle VM" → "Restoring"). The steps this ticket asked for (a fresh Windows install, Tailscale) describe the PC live instance that the VM replaced; they are not written.
- Restored `/var/backups/storytell/storytell-20261115-025404` (the first backup the VM's hourly job made) into a scratch database `storytell_restore_drill` on the VM's own PostgreSQL, twice: once plainly, once with the README's exact `pg_restore --no-owner --role=storytell` line.
- Checked: `pg_restore` exited 0 in about a second; 36 tables and 13,493 rows, every table's row count equal to `storytell_live`; the newest migration the same (`Accounts1764160000000`); all 36 tables owned by `storytell` and readable as that role; the 83 image files in the backup have the same SHA-256 as the live ones. The scratch database was dropped.
- Not checked: opening a restored Chat, its Memory drawer, its Dashboard and a Gallery Snapshot in the app, which this ticket asks for. That needs the app pointed at the restored database. Not checked either: a restore onto another machine, and an off-site copy, which does not exist yet (`BACKUP_REMOTE` is unset on the VM).
- Fix made to the steps: listing `/var/backups/storytell` needs `sudo`, the `ubuntu` user cannot read it.
- Later the same day, with the off-site copy set up (rclone crypt remote `storytell-backup:` over Google Drive): backup `storytell-20261115-030644` reached Drive; all 85 files have the sizes of the local copy (`rclone check --size-only`), the dump fetched back from Drive has the same SHA-256 as the local one and restored into the scratch database with the same row counts as live (story 1, chat 2, message 953, memory 936, snapshot 50). A per-file hash check (`rclone cryptcheck`) could not finish: Google answered `RATE_LIMIT_EXCEEDED` on rclone's shared client ID. The images on Drive were checked by size only.
- Also 2026-11-15, a second off-site copy: the Synology NAS at home pulls the backups from the VM once a day (`scripts/vm/nas-pull.sh` as a DSM scheduled task; the VM account `storytell-pull` may only read `/var/backups/storytell`). Its first real pull copied both backups; all 170 files on the NAS have the SHA-256 of the VM's. Before that, a rehearsal on the VM showed the key cannot open a shell, read outside the folder, write, or read the API's settings. The first NAS run stopped on the host-key check, because DSM's ssh asks for the VM's ECDSA key and the script pinned only the ED25519 one; the fingerprint it reported was the VM's real ECDSA key, and the script now pins both.

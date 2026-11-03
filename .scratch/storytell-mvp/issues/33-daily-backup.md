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

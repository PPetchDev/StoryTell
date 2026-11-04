# Backups are daily full copies, and the off-site copy is encrypted on the PC by an rclone crypt remote

Each backup is a self-contained folder (a `pg_dump` custom-format dump, the whole image folder and a manifest) copied to a second-disk folder and, through an rclone `crypt` remote, to Google Drive. Full copies keep restore to "copy one folder back, `pg_restore`, copy the images", with no backup tool's repository format to rebuild first; at one user's scale that beats the space saving of incremental tools such as restic or Borg. The crypt remote encrypts file names and contents before anything leaves the PC, the job refuses any remote that isn't a crypt remote, and the passphrase and salt live only in rclone's config and the user's password manager.

## Considered Options

- **restic or Borg:** deduplicated, incremental and encrypted, but a second tool to install and learn for restores, and a repository format between the user and their files.
- **Zipping and encrypting before upload (7-Zip AES):** one archive per day, but names are visible unless headers are encrypted, and a restore needs the whole archive downloaded.

## Consequences

- Losing the crypt passphrase or salt makes every Drive copy unreadable, for the user too.
- Upload time and Drive quota grow with the Gallery, since every backup copies every image. `BACKUP_KEEP` bounds the quota; pruned folders skip the Drive trash.
- The dump is taken before the images are copied, so an image deleted between the two can be missing from a restore. Rare, and it shows only as that one missing image.

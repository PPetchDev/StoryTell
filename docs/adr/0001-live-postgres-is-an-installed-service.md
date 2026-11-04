# Live PostgreSQL is an installed Windows service; embedded PostgreSQL is for dev and tests only

Dev and the test suites start PostgreSQL from the `embedded-postgres` npm package, so it looks natural for live to do the same. Live instead uses PostgreSQL from the EDB installer, running as a Windows service that starts with the PC. The embedded binaries are published for testing, every version of the package is a beta, Node stops them with a forced kill on Windows (so each restart of the API would mean crash recovery), and they ship no `pg_dump`, which the daily backup needs. The installed service shuts down cleanly with Windows, outlives any app restart, and brings `pg_dump`, `pg_restore` and `psql`.

## Consequences

- The live database lives in the EDB data folder, not under `LIVE_HOME`; the backup job is how its data leaves the PC.
- Moving live to embedded PostgreSQL later would mean a dump and restore, and a backup tool from elsewhere.

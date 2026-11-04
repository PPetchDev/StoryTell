# Live releases are built in place and switched by a pointer, never moved

Each deploy builds the chosen commit as a git worktree in `LIVE_HOME/releases/<commit>-<time>` while the running release keeps serving, and switches by rewriting the `LIVE_HOME/current` file; the supervisor and the startup task always run `LIVE_HOME/live-run.mjs`, which reads that pointer. The first version built in a staging folder and moved it into place, but npm's workspace links are Windows junctions with absolute targets: a moved release kept links into the staging folder, `git worktree remove` then couldn't delete it, and the fourth deploy failed with live stopped. Building where the release will run keeps every link correct, makes `live:rollback` a pointer swap, and leaves the startup task's path fixed across deploys.

## Consequences

- Only the current and previous releases are kept; older ones are deleted, so nothing that must survive (images, backups) may live under `releases/`. The deploy refuses settings that would put it there.
- A rollback switches code only. Migrations are never undone, so it helps only while the older code still works with the newer schema.

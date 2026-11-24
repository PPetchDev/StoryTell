# A deploy command that warns on an unmeasured prompt change

Type: task
Status: done
Blocked by: none
Needs: no model
Spec: [Reply repair](../spec.md), "2. The deploy command"

## What to build

One command on the PC that deploys a ref to the Oracle VM: it archives the commit, uploads it with the VM's deploy script, runs that script, and reports the commit live runs and the public health answer. Today these are typed by hand (README, "Live on the Oracle VM"). The steps on the VM do not change.

Before it uploads, it reads the commit live runs and lists the files changed up to the ref. If any is a prompt builder, it looks for an eval report of that exact commit with a clean tree. With none, it stops and says which files changed and that no eval run measured them. A flag goes ahead anyway.

It takes what it touches as arguments (the git reader, the remote runner, the folder of eval reports), so its tests reach no VM.

## Acceptance criteria

- [ ] It refuses a working tree with uncommitted changes to tracked files.
- [ ] It refuses a commit the remote does not have.
- [ ] With a prompt builder changed and no eval report of that commit, it stops before uploading and names the files.
- [ ] With the go-ahead flag it deploys all the same, and says it went ahead unmeasured.
- [ ] With a report of that commit (clean tree), or with no prompt builder changed, it does not warn.
- [ ] A report of the same commit with uncommitted changes does not count.
- [ ] It never starts an eval run and never asks a question on the terminal.
- [ ] It ends by printing the commit live runs and the health answer; a deploy script that failed ends the command with its error.
- [ ] The list of prompt builders is one list in the command, with a line saying to add a new prompt builder to it.
- [ ] README's "Live on the Oracle VM" names the command.
- [ ] Tests drive it with a scripted git and a scripted remote.

## Notes

- The VM's address, user and key are in the user's own notes and SSH config, not in the repository: read them from settings the command is given, and commit no address or key.
- The Windows `live:*` scripts are for a PC live instance and stay as they are.

## Comments

Built 2026-11-24: `npm run vm:deploy`. Eighteen tests with a scripted git and a scripted VM, written red first; reviewed on two axes, and the review's findings fixed, each with a test that failed first.

- **The ref defaults to the checked-out commit,** not the default branch's head as the spec said: the tree must be clean, so the two are the same commit, and "what I am looking at" is the less surprising thing to deploy.
- **Found in review and mended:** a prompt builder moved and changed was not seen (renames are now listed under both names); "the remote has it" was read from what the checkout last heard (it fetches first); a ref other than the one checked out was uploaded with the working tree's deploy script (it now takes the commit's own); a tag deployed its own hash; a commit live runs that git here does not know ended in a stack trace the flag could not pass.
- **A dropped connection is not a failed deploy.** `deploy.sh` runs detached so the deploy survives a drop; the command now says so, and says not to deploy again until it has ended. Run again, it only reports.
- **On Windows it uses the OpenSSH that Windows ships,** when there: the `scp` Git Bash puts first on PATH may read `C:\…` as a host named C (found by reading, in review; not reproduced).
- **Settings** are in `.env.vm` (git-ignored); `.env.example` has the block.
- **Tried for real:** the refusal of a dirty tree. See below for the rest.
- **Not tested:** the half that talks to git, ssh and the eval reports' folder for real; only the decisions are. The first real deploy with it is its test.
- **Known and left:** any eval report of the commit counts as "measured", even one scene at one sample. The spec asks for "a run of that exact commit", and a stricter rule needs to know what a full run is.

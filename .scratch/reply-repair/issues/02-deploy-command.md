# A deploy command that warns on an unmeasured prompt change

Type: task
Status: ready-for-agent
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

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Task observer

```text
(task-observer activation block — template of v3.12.0)
Before the first tool call of any session, the first turn after a
compaction included, and before writing or proposing a plan, invoke the
task-observer skill AND run its Session Start Protocol: loading alone
activates nothing, and a harness note not to re-execute earlier skills does
not cover this protocol. The first call is one batch: an `ls` of the
workspace path below, the skill load and its per-skill lookup. A host that
requires its plan call first puts it in that batch, the protocol as its
first item, revised after the scan. Every turn with a tool call counts,
however simple it looks. Report a step you did not run in one line before
the answer when the user can act on it; every skipped step is recorded in
session-starts.log, which the user can read. If the skill does not resolve,
tell the user in your first reply, never only in a log, naming the probe
(the skill listing, or the directory on disk); re-check the listing on
every later turn with a tool call and run the protocol the first time it
resolves. On disk but unlisted, or refused ("Unknown skill"): read its
SKILL.md directly and run the protocol; that is the activation, said once.

After each task, list this session's observation records and append, in the
same turn, a one-line summary of that listing to checkpoints.log (ids and
titles, or "none logged" plus one line per user correction and per
incident, each with why it is not an observation), never from memory. The
reply names what was logged, or says nothing was logged, in one line;
details are in checkpoints.log. It catches a skill that never ran.

The task-observer workspace for this project is:
  C:/Users/titiw/task-observer
Every path the skill uses derives from that root, never from the working
directory. A subagent dispatched by a session that runs this protocol does
not run it and does not write to the log; it reports its findings to its
caller.
```

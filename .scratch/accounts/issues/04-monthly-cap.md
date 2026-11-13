# A Member's Monthly cap

Type: task
Status: done
Blocked by: 02, 03
Part of: [Spec: Accounts](../spec.md)

## What to build

Per the spec's "Monthly cap": before a paid call made as a Member, compare spend since the first of the month (UTC) with their cap; refuse with a typed error when reached. Background calls of a turn already sent are not refused. Usage shows a Member their own spend and cap.

## Acceptance criteria

- [x] At the cap: send and Snapshot refused with the code; background calls of the last turn still run.
- [x] The Owner is never capped; spend counts from the month's start.
- [x] A Member's Usage shows only their spend and cap.

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

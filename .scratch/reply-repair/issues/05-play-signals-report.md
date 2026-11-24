# A play-signals report: what the user's Regenerates say

Type: task
Status: ready-for-agent
Blocked by: none
Needs: no model
Spec: [Reply repair](../spec.md), "5. The play-signals report"

## What to build

A command that reads a database, changes nothing, and prints a table: by play model and by week, how many AI Messages were written, how many had a reply replaced by Regenerate, and, for replaced Reply versions beside kept ones, the share that fail each code check a single reply can be given.

The checks: no speech line; a line written as the user; a line by an unknown speaker; a stage direction inside a speech line; overused words a thousand; a phrase shared with the three replies before it.

The reply checks it needs move into the app's source, beside the reply parser, so the command runs from a built release on the VM; the eval run imports them from there.

## Acceptance criteria

- [ ] Run against a database, it prints, by play model and week: AI Messages, those with a replaced Reply version, and the rate of each check for replaced and for kept replies.
- [ ] It prints counts and rates only: no reply's words, no Story or Chat title, no account's name.
- [ ] It writes nothing to the database (a test checks the tables are unchanged).
- [ ] It totals every account unless one is named.
- [ ] A week or a model with too few replies to say anything is marked as such, not given a rate.
- [ ] The eval run still passes with the checks imported from the app's source; no check is defined twice.
- [ ] It settles, first, whether an edit of an AI Message leaves a trace. With one, edited replies are counted beside regenerated ones; without, the report's own output says edits are not counted.
- [ ] README says how to run it on the VM.
- [ ] Tests seed a test database through the API and read the command's lines.

## Notes

- Replaced Reply versions are kept, up to five a Message, with their model and time.
- The slop lists are data files beside the eval today; the report needs them in the release too. Keep their notice with them.
- Run on live, it reads the user's own Chats in place. Nothing leaves the VM.

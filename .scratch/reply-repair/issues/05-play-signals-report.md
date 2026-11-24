# A play-signals report: what the user's Regenerates say

Type: task
Status: done
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

## Comments

Built 2026-11-24: `node dist/play-signals.js` (`npm run signals` in `apps/api`). Nine tests against a test database seeded through the API, written red first; reviewed on two axes and the findings fixed. Not yet run on live: it needs a deploy.

- **The spec's premise was wrong, and it hollows this ticket out.** "Replaced Reply versions are kept, up to five a Message" is true only of a Chat's newest AI Message. The app drops every replaced reply of a Chat when the next Message is sent. So on live the report can see, at most, one Message a Chat with its replaced replies: far too few for a rate, and never the ones the user rejected and then played on from. The report says so in its own output. It was the user's best evidence of a bad reply, and the app throws it away.
- **What gives the signal back, built the same day on the user's word:** one small record written when a reply is replaced by Regenerate (`replaced_reply`): its Message, its model, the time, and the fault counts this report works out, with none of its words (a test holds the table to that). The report reads those rows and no longer reads the Reply versions, so a Regenerate counts whether or not its Message is still the Chat's newest. It counts from 2026-11-24: a Regenerate before that left nothing. A replaced Epilogue or Reach-out is not recorded. If the Message is later rewound away, its replaced replies' records go with it.
- **An edit of an AI Message leaves no trace** (it rewrites the parts in place), so edits are not counted; the report says so.
- **Not counted, and said in the output:** a line written as the user (the reply parser cuts it before a reply is stored).
- **Counted though it should not be, and said in the output:** a Branch's copied Messages, again; a line by a Character deleted since, as an unknown speaker's; a reply the user edited, as the model's.
- **Left out:** Epilogues (their shape is not a turn's) and Reach-outs.
- **A replaced reply is counted under the model that wrote it, in its Message's week:** a version carries its Message's time, not its own.
- **Shared with the eval, defined once:** the overused-word count and its lists (now a source module, `slop-lists.ts`, with the notice beside it), the stage-direction pattern, and "holds this phrase". The eval's other checks stay with the eval.
- **Not as the ticket said:** `--min` was added (a rate from `n` replies up); the SQL sits in the report's own module and is handed its database as a function, where the app's other SQL sits in model services.
- **Not tested:** the entry point itself (its read-only transaction and its flags), more than one account, more than one week or model, and that Epilogues are left out.

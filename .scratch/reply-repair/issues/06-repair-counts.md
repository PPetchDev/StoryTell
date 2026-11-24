# Repair counts on the Usage page

Type: task
Status: done
Blocked by: 01
Needs: no model
Spec: [Reply repair](../spec.md), "6. Repair counts"

## What to build

One record for each repair the app makes or refuses, and a small table on the Usage page: for the period shown, each kind's repairs made and refused, by play model. So the user can see the app mending replies, and the developer can see which model needs which repair and which repair never fires.

- A repair record: its kind (speech lines, a line, a pressing note read), whether it was made, the play model, the Chat and the AI Message. One new table, one migration.
- Line repair still records its model call as a usage record; the repair record is the count, not the cost.

## Acceptance criteria

- [ ] A speech-line repair made writes one record; a reply it looked at and left alone for doubt writes one as refused; a reply it had no reason to look at writes none.
- [ ] A Line repair kept writes one as made; one refused by its guards writes one as refused.
- [ ] A pressing note read by a turn writes one, when ticket 04 is in; the kind exists from this ticket on.
- [ ] The Usage answer gives, for its period, the counts by kind, made and refused, by play model.
- [ ] The Usage page shows them in a table that reads at 360 pixels wide; with no repair in the period it says so in a line.
- [ ] Deleting a Chat removes its repair records; the migration can be reverted.
- [ ] Tests go through the HTTP API with the scripted model gateway; the page has an e2e check.

## Notes

- The user's phone is 360 pixels wide; e2e runs at 390. Measure the table's rows at 360 and 320 too.
- Nothing about a repair is shown in the Chat itself.

## Comments

Built 2026-11-24, with the replaced-reply record of ticket 05 in the same migration. Six API tests through the HTTP API and six e2e checks of the page, written red first; reviewed on two axes and the findings fixed.

- **A repair record outlives its Message.** Found in review: with the Message as a cascading foreign key, a rewind (an edit of the user's Message, a Regenerate further up) lowered the month's count. The Message is now set to NULL when it goes; the Chat still takes its records with it.
- **A count never costs a turn.** Found in review: an insert that failed would have lost a paid reply or left the turn half done. Both records are written after the reply is stored, and a failure is logged and let go.
- **A Member sees the counts by kind alone,** with no play model named, as with spend by model: which models there are is the Owner's to see.
- **"Refused" is every repair weighed and not made:** a guard said no, nothing could be placed, or a Line repair failed or came late. They are not told apart.
- **A Regenerate counts again.** The replaced reply's repairs stay counted beside the new reply's, and a pressing note read again by the Regenerate is counted again: each was done.
- **The page:** a "Replies mended" card under the pools: what, mended, left. It reads at 360 and 320 pixels with nothing off the side (the table's box and the page's width are checked, not each row).
- **Not tested:** the migration's way back; a record from an earlier month being left out; a Member's own counts apart from another's; the turn going on when a count cannot be written.

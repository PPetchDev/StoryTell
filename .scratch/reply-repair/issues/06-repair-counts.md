# Repair counts on the Usage page

Type: task
Status: ready-for-agent
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

# Snapshots and the Gallery

Type: task
Status: ready-for-agent
Blocked by: 25, 28, 30
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Camera button** in the Chat, acting on the latest AI Message, with an optional one-line hint. Each press makes one Snapshot; there are no automatic ones.
- **Image prompt.** A V4 Flash call writes the prompt from the latest Messages, Appearance, Setting, Memory, Image style and the hint. It picks at most 3 Characters in frame, using the hint's names if it gives any. The prompt is always first-person from the user's point of view, never draws the user beyond glimpses such as hands, and depicts only fictional adult Characters.
- **Image call.** The image model makes one fixed 2:3 image, with the in-frame Characters' Reference images as references. A Character without one is drawn from text alone.
- **While it generates.** A transient job shows as a placeholder under the Message, and play continues. On success a Snapshot record is stored:
  - image path
  - prompt used
  - hint
  - image model and cost
  - Characters drawn (reference plus stamped name)
  - Chat link and Message link
  - created at

  On failure nothing is stored and the user gets an error with Retry, never a silent provider switch.
- **In the timeline.** Snapshots show inline under their Message, and a tap opens full screen, where the stored prompt is viewable. Retakes add more Snapshots to the same Message.
- **Gallery** per Story:
  - newest first, filterable by Chat
  - grid, full screen, delete (removes the record and its file), and download one image
  - items without a Message link are marked "from an earlier version of this Chat"; linked items jump to their Message
- **Links on edit, reset and delete.** Edit and reset clear the Message link of Snapshots of the edited or discarded Messages. Deleting a Chat clears both links. Removing a Character keeps the stamped name and clears that Character's link. Deleting a Story deletes its Gallery files.
- **Isolation.** Snapshots are never sent to the text model and never write ledger records.
- **Credit and usage.** Out of image credit disables only the camera. Both calls write UsageRecords: the prompt call in the text pool, the image in the image pool.

## Acceptance criteria

- [ ] API tests with the fake gateway:
  - a success stores the record and file with at most 3 Characters
  - the hint's names override the prompt writer's choice
  - a failure stores nothing
  - retakes attach to the same Message
  - edit, reset, Chat delete and Character removal clear the right links and keep the Gallery item
  - Snapshot delete removes the file
  - Story delete removes all files
  - the turn prompt never contains Snapshot data
  - out of image credit blocks only Snapshots
- [ ] Playwright: take a Snapshot, see the placeholder and then the image, reset the Chat, and find the Snapshot in the Gallery marked as from an earlier version.

## User stories covered

109–124, 131.

# Bond, Arc and Scene judge, the change ledger, and the dashboard

Type: task
Status: ready-for-agent
Blocked by: 25
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Seeding.** At Chat start and on reset, StartingBonds seed BondChanges that have no causing Message, and each Character's Arc directions are copied into ChatArcDirections.
- **Judge call.** One V4 Flash call in JSON mode after every turn. Its input, output shape and rules are in the spec, taken from the prototype after its re-judge fix: gradual Bonds, at most one change per Bond per turn, rare and event-cited Arcs, no restating Arc steps, strict Scene move-on. The AI Message records the judge's status: pending, done or failed.
- **Applying a judgement:**
  - Drop changes with unknown names and self-Bonds.
  - Drop a Bond "change" whose label equals the current label.
  - Advance at most one Scene per turn.
  - Record every applied BondChange, ArcStep and SceneAdvance with its event, its before and after values, and its causing AI Message.
- **Change ledger.** A module that records changes against a Message and rolls back from a Message, undoing newest first and returning counts by kind. Edit (ticket 25) now rolls back every change from discarded Messages, and, for an edited AI Message, its own changes, then re-runs the judge. The user sees a short rollback notice.
- **Reset** clears Bond history, Arc steps, Scene advances and ChatArcDirections, then re-seeds them.
- **Prompt layers.** Feelings carries every Bond, with "each Character knows only its own feelings". Arcs carries "Arc so far" plus the Arc directions. The current Scene comes from the latest SceneAdvance.
- **Send gate.** The next send waits while the previous AI Message's background call is pending, up to a short timeout, then tells the user it's still saving. A failed call blocks the send with Retry.
- **Read-only dashboard** opened from the Chat:
  - each Character's current Bonds (label and description, expandable to full history with events)
  - its Arc steps with events
  - the current Scene and the event that advanced it
  - background status per recent AI Message, with Retry
  - a link from every item to its causing Message

  Nothing on the dashboard is editable, and no Bond or Arc ever shows on the Chat screen.
- The judge writes a UsageRecord.

## Acceptance criteria

- [ ] API tests with scripted judge output:
  - each filter (unknown name, self-Bond, same label, a second Scene advance)
  - rollback on User and AI Message edits, newest first, with correct counts
  - reset re-seeds StartingBonds and Arc directions from the current Story
  - the send gate waits on pending and blocks on failed; Retry re-runs only the failed call
  - the prompt carries the Feelings and Arcs layers
  - a Scene advance changes the next prompt's Scene
- [ ] Playwright: a scripted Bond change shows on the dashboard with its event. Editing the causing Message removes it, with a rollback notice.

## User stories covered

22–24 (in play), 27, 62–63, 68, 73–75, 77, 95–108.

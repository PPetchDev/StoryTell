# Bottom nav, Home picture cards and richer lists

Type: task
Status: ready-for-agent
Blocked by: none
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (the Home screen).

## What to build

- **Bottom nav:**
  - A fixed bottom bar (Stories, Personas, Usage, Settings, each an icon plus a label) replaces the top text nav at every width.
  - It respects the safe-area inset, and pages get bottom padding so nothing hides behind it.
  - It isn't rendered on the Chat screen route.
- **Story list API** gains, per Story:
  - last played at
  - the newest-played Chat's id and its current Scene name
  - the newest Snapshot's image path
  - the hook: the Setting's first sentence, about 120 characters
- **Chat list API** gains, per Chat: the current Scene name or free play, and a plain-text excerpt (about 100 characters) of the latest Message.
- **Home:**
  - A "Continue where you left off" row opens the newest-played Chat.
  - Stories show as a 2-column grid of cards: cover, title, hook, last played, and a Draft badge when not playable.
  - A card with no cover gets a stable gradient derived from the Story id.
  - Tapping a card opens a sheet with Continue (when the Story has a Chat), New Chat and Edit Story. A Draft's sheet shows how many fields are missing instead of the play buttons.
  - New Story stays in the header.
- **Chat list page:** each Chat shows its latest line and Scene.

## Acceptance criteria

- [ ] API tests for the new list fields, including a Story with no Chats, one with no Snapshots, and the excerpt of an AI Message made of narration and speech.
- [ ] Playwright at 390px: Home's Continue row opens the newest Chat. The Chat screen has no bottom nav, and the other four pages do.
- [ ] The existing home and navigation e2e specs are updated.
- [ ] The full suites pass.

## User stories covered

43, 46–54.

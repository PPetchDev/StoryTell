# Suggested replies (⚡)

Type: task
Status: ready-for-agent
Blocked by: 05
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: branch `prototype/friendly-ui`, route `/prototype/friendly-ui` (Chat variant D: ⚡).

## What to build

Per the spec's "Suggested replies" section.

- **API:**
  - A suggestions endpoint on a Chat. It returns exactly three items, each with a kind (`action`, `speech` or `move`) and text. Nothing is stored in the Chat.
  - One play-model call under a new text call kind, recorded in usage in the text pool. Its prompt has the turn's layers and history, plus an instruction to write as the worn identity, in the Story's point of view and tense.
  - The output is parsed as strict JSON. Unparseable output is a typed error.
  - It is refused while a turn is in flight or with text credit out. It does not wait for background calls.
  - The fake gateway and its test control route accept the new kind. Any database enum of call kinds gets its migration.
- **Client:**
  - ⚡ on the composer's left asks, shows a loading state, then three cards above the composer.
  - Tapping a card replaces the composer text; nothing sends.
  - Tapping ⚡ again, or sending, closes the cards.
  - An error shows "Couldn't suggest replies, try again".

## Acceptance criteria

- [ ] API tests:
  - three items, one of each kind
  - nothing stored
  - usage recorded under the new kind, in the text pool
  - the prompt names the worn identity, and after a Persona swap it names the Persona
  - unparseable output gives the typed error
  - refused while a turn is in flight, and with text credit out
- [ ] Playwright: tap ⚡, pick the second card, edit its text, send, and see the edited line in the thread.
- [ ] The Usage page lists the new call kind's spend in plain words.
- [ ] The full suites pass.

## User stories covered

30–35.

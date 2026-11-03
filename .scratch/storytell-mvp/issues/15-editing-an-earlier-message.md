# What editing an earlier message does

Type: grilling
Status: resolved
Blocked by: none
Part of: [Map: Storytell AI MVP](../map.md)

## Question

When the user edits an earlier message in a Chat, what happens to the messages after it?

## Answer

- Editing message N — whether the user's or the AI's — discards every message after N, and the AI generates a fresh reply continuing from N, as if rewinding time.
- Consequence: any Memory, Bond and Arc changes that came from the discarded messages must be rolled back too. This is a requirement on Memory design and the Data model.

## Comments

- 2026-11-03 ([Data model](11-data-model.md)): clarified for an edited AI Message. Editing an AI Message does not make the AI write another reply; the Chat waits for the user. Editing a user Message still gets a fresh AI reply. In both cases, the changes the edited Message itself caused are rolled back and the background calls run again on the new text.

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

# Draft a Story from an idea, and rewrite a field

Type: task
Status: ready-for-agent
Blocked by: 20, 21
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to build

- **Draft from idea.** On "New Story", the user types an idea of any length. One play-model call (GLM-5.3) returns a structured Story:
  - every required field: Title, Setting, Opening, Style, Role, and 1–6 Characters
  - optional fields (Scenes, Secrets, StartingBonds, Arc directions) only when the idea implies them

  The backend validates the shape before saving. An invalid result shows an error with Retry.
- **Rewrite this field.** A button on every field regenerates just that field, with the whole Story as context.
- Both calls write UsageRecords against the Story.

## Acceptance criteria

- [ ] API tests with the fake gateway:
  - a valid draft is saved and is playable
  - optional fields absent from the draft stay empty
  - an invalid draft (0 or 7 Characters, a bad Style value, unparseable output) is not saved and returns a typed error
  - a field rewrite changes only that field
  - a gateway outage returns an error with Retry, never a silent model switch
- [ ] Playwright: idea → draft → playable Story on screen.

## User stories covered

1, 2, 3, 5.

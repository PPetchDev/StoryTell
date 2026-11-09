# 04 — Replace rules on AI Messages as shown, and in the Transcript

**Status:** done

**What to build:** The Chat's `onAi` rules change how AI Messages read, stored and streaming alike, while the stored text, every prompt, Thai reading and Edit stay as they were; the downloaded Transcript reads as the screen does. Per the spec's "Where the AI-side rules run": a context from the Chat screen, the one AI-parts renderer applying rules to narration (before paragraphs) and speech (before `*…*` becomes italics) but never to names, and the API applying the same rules when writing the Transcript. The Visual novel view (rules applied before it splits steps) and Read aloud (speaks the shown text) reuse this renderer's context and apply function; their own specs own that.

**Blocked by:** 03 — Replace rules: store, check and manage

Part of: [Spec: Saved replies and Replace rules](../spec.md)

- [x] A stored AI Message (the Opening included) and a streaming reply show the replaced text; speakers' names are unchanged; a replacement that writes `*…*` into a Character's speech shows italics there (narration, italic throughout, shows the asterisks as typed); a rule can remove a narration paragraph.
- [x] Edit on an AI Message shows the stored text; parking or deleting the rule brings the original back on the next render with no reload of stored data needed beyond the Chat.
- [x] The next turn's prompt, Suggested replies' prompt and the Judge's prompt hold the stored text (API test).
- [x] The Transcript applies `onAi` rules to AI parts, app-wide then Story, and leaves names and User Messages as stored (API test).
- [x] The rules context and the apply function are exported for the Visual novel view and Read aloud to use.
- [x] e2e: a Story rule changes a word in an AI Message and while a reply streams; an app-wide and a Story rule apply in order; Edit shows the original; the downloaded Transcript has the replaced text.
- [x] Typecheck and the existing suites stay green.

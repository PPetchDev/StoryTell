# Friendly UI: decisions so far

Interview notes, kept until the spec is written. Screenshots of the app before the redesign were taken on 2026-11-04 (23 screens, phone 390px and desktop).

## Round 1

- Phone first. Desktop wide layouts (side panels, two-column editor) come later.
- The Chat screen and the Story editor first.
- Keep the dark purple theme. The Chat should read like a novel-reading app.
- The UI stays in English.
- Scope: polish plus fixing flow snags, not new features.

## Round 2 (all recommendations taken)

- **Chat messages, book style:** narration is plain prose with no card; speech shows the Character's name and a coloured bar on its left; the user's own lines are a tinted bubble on the right.
- **Character colours:** each Character gets a colour, picked by the app and stable, used for the name and the speech bar. No avatars: Reference images stay out of play.
- **Message actions:** hidden until the user taps a message; the bar holds Edit and, on the newest AI Message, the Snapshot action.
- **Composer:** one auto-growing row with a send icon; a camera button on the left opens the Snapshot hint field.
- **Chat top bar:** one thin bar with back to the Chat list, the Chat title with the current Scene under it, and a ⋯ menu with Memory, Dashboard, Gallery, the Persona swap and Reset (red, confirmed). The main app nav is hidden on the Chat screen.
- **Story editor:** tabs Story / Style / Role / Characters / Bonds / Scenes, one at a time. The Playable badge and each missing item link to the field.
- **Rewrite:** a small ✨ icon next to each field label instead of a pill.
- **Lists:** Stories show when they were last played and a Continue button into the newest Chat; Chats show their latest line and Scene.

## Round 3 (all recommendations taken)

- **Main nav on phone:** a bottom icon bar (Stories, Personas, Usage, Settings), hidden on the Chat screen.
- **Reading text:** a bundled serif face for story text in the Chat (so it works offline); controls keep the current face. A text size choice S / M / L in Settings.
- **Story assistant on phone:** a half-height bottom sheet. When it changes a field, the editor switches to that field's tab, scrolls it into view and highlights it.
- **Saving:** Memory, Personas and Settings autosave like the Story editor, with the same "Saving… / Saved" status in the same place.
- **Snapshot viewer:** tap opens full screen; swipe left and right through that Chat's Snapshots, swipe down to close. Same in the Chat and the Gallery.
- **Next step:** a throwaway phone-size prototype of the new Chat screen and Story editor (sample data, no API) to look at and click, then the spec and tickets, built one ticket per session.

## Round 4: "as easy as Zeta"

Research on Zeta's UX (Japanese guides, Korean community posts, store listings) found its ease comes mostly from one-tap turn controls on the Chat screen and picture-card discovery. A prototype variant D (branch `prototype/friendly-ui`, 986772f) showed them on our screens.

- **Scope change:** Continue, Regenerate and suggested replies come into scope. The MVP spec listed Regenerate and Continue as Out of Scope ("Editing is the only way to change history"); that line changes. Swipe (keeping and flipping between alternative replies) and Branch stay out.

## Round 4 answers (all recommendations taken)

- **Regenerate ("↺ Again"):** only on the newest AI Message, never on the Opening. The new reply replaces the old one; the old one is not kept. Its Memory, Bond and Scene changes are rolled back exactly like an edit. Its Snapshots stay in the Gallery but leave the Chat.
- **Continue ("▶", the send button while the composer is empty):** the Narrator writes the next part with no User Message. It is saved as an ordinary AI Message, so two AI Messages in a row are fine. It can be repeated and works right after the Opening. The judge and Memory extraction run as on any turn. The rule never to write the worn identity's words or actions still holds. Regenerating a reply made by Continue continues again.
- **Suggested replies ("⚡"):** written only when the user taps ⚡, one model call (about one turn's cost) from the text credit pool. Three options written as the worn identity in the Story's POV, one each of an action, a line of speech and a bold move. Tapping one fills the composer for editing; nothing sends and nothing is saved in history.
- **Snapshot:** lives in the newest reply's action row. Tapping it opens a small sheet with an optional hint, then takes the Snapshot of that moment. The composer loses its 📷.
- **Older messages:** tapping an older Message shows Edit (variant A's pattern); the action row stays on the newest reply.
- **Scene strip:** under the top bar, the current Scene's name and goal (both already on the Dashboard). No mood. Tap to hide; the device remembers.
- **Home cards:** the cover is the Story's newest Snapshot, else a gradient picked from its title; the hook is the Setting's first sentence. `*text*` in the user's lines shows in italics (display only).
- **Variant verdict:** Chat D with A's look; Home picture cards; Story editor D (tabs, a one-line hint on every field, the Opening preview).

## After trying it on the phone (2026-11-05)

The user tried the merged UI on a phone and asked for Zeta's chat look instead of the book style. This replaces round 2's "book style" and round 3's serif face for story text:

- **Chat bubbles:**
  - Each line of speech is a bubble with the speaker's picture on the left and their name above it. The picture is the Character's Reference image, or their initial on their Character colour if they have none.
  - Narration is an italic, muted line marked ≡, outside any bubble, one per paragraph.
  - The user's line is a purple bubble on the right, with the identity's name above it and its initial beside it.
  - `*text*` shows in italics in speech as well as in the user's lines.
- **Font:** story text uses the app's sans face. The bundled serif face is gone. The S / M / L text size still applies.
- **Composer:** a * button beside send. With nothing selected it opens an empty `**` pair at the caret; with text selected it wraps the selection.
- **Kept:** Character colours (now on the name and the initial's circle), the action row, tap-to-Edit, Snapshots under their Message.

## Fixes that need no decision

- The Chat opens at the newest reply, and the composer never covers it.
- Sent and writing feedback: the composer clears on send, the user's line shows at once, a writing indicator shows until the reply lands.
- Destructive actions (delete, Reset) are quieter and confirmed.
- The Opening box fits its text.
- Snapshots are shown uncropped.
- The Dashboard uses plain words, not "judge Done".
- Play is disabled while the Story isn't Playable.
- Low-contrast text is raised to readable contrast.

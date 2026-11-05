# Spec: Friendly UI

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md)
Decisions: [decisions.md](decisions.md) (four interview rounds, 2026-11-04)
Prototype: branch `prototype/friendly-ui` (e9d88f1, 986772f), route `/prototype/friendly-ui`. The winners are Chat variant D on variant A's look, the Home picture cards, and Story editor variant D.

## Problem Statement

The MVP works, but it is tiring to use on a phone, which is where the user plays most:

- The Chat opens short of the newest reply, and the composer covers it.
- The composer takes about a quarter of the screen, and the Chat header another 230px before the story starts.
- After Send, the text stays in the box, so it looks like nothing happened.
- Every Message sits in the same card. Narration, a Character's speech and the user's own lines are hard to tell apart, and an Edit pill sits on every Message.
- Reset and delete look like harmless buttons.
- Snapshots are cropped.
- The Story editor is one form about eight phone screens long, with about 25 Rewrite pills. The Opening box clips its text. The Assistant opens at the top while its changes land out of view. "Still to fill in" items can't be tapped, and Play stays available on a Story that isn't playable.
- The Story and Chat lists show only names, the Dashboard uses developer words such as "judge Done", some text is too faint, and saving works two ways (autosave in the editor, Save buttons elsewhere).
- Every turn takes typing. Apps the user knows, such as Zeta, keep a story going with one tap: continue, write the reply again, or pick a suggested reply.

## Solution

A phone-first redesign of the Chat screen, the Story editor and the app shell, in the same dark purple theme and in English, plus three small play features.

- **The Chat reads like a novel.** Narration is plain serif prose. A Character's speech shows their name and a coloured bar in that Character's own colour. The user's lines are a tinted bubble on the right, with `*text*` in italics. The text size is S, M or L.
- **The Chat gets out of the way.** One thin top bar: back, the Chat title and worn identity, and a ⋯ menu holding Memory, Dashboard, Gallery, the identity swap and Reset (red, confirmed). A thin Scene strip under it shows the current Scene and its goal. The main nav hides. The composer is one auto-growing row.
- **One tap moves the story.** An empty composer's send button becomes ▶ **Continue**: the Narrator writes on without a line from the user. The newest reply carries ↺ **Again** (Regenerate), ✎ Edit and 📷 Snapshot. ⚡ offers three **Suggested replies** that fill the composer.
- **The editor is in tabs.** Story, Style, Role, Characters, Bonds and Scenes, one at a time. A status box lists what's missing, each item linking to its field. Each field has a one-line hint and a small ✨ to rewrite it. The Opening can be previewed as a Chat. The Assistant is a half-height sheet that jumps to each field it changes.
- **The shell helps you find your place.** A bottom icon bar (Stories, Personas, Usage, Settings). Home shows Stories as picture cards with a "Continue where you left off" row. Chat lists show each Chat's latest line and Scene.
- **Everything saves the same way:** automatically, with one "Saving… / Saved" status.

## User Stories

### Reading a Chat

1. As the user, I want the Chat to open at the newest reply, so that I can carry on without scrolling.
2. As the user, I want the composer never to cover the newest reply, so that I can read it while I think of my answer.
3. As the user, I want the Chat to follow a new reply down as it arrives, so that I never have to look for it.
4. As the user, I want narration to read as plain prose with no box around it, so that a Chat feels like reading a novel.
5. As the user, I want each Character's speech to show their name once with a coloured bar, so that I can tell at a glance who is speaking.
6. As the user, I want each Character to keep the same colour in every Chat of a Story, so that I learn to recognise them.
7. As the user, I want Character colours picked for me, so that I have nothing to set up.
8. As the user, I want my own lines in a tinted bubble on the right, so that I can tell my writing from the story's.
9. As the user, I want `*text*` in my lines shown in italics, so that my actions read differently from what I say.
10. As the user, I want story text in a book face, so that long reading is comfortable.
11. As the user, I want to choose a small, medium or large text size, so that I can read on my phone without zooming.
12. As the user, I want my text size remembered on each device, so that my phone and desktop can differ.
13. As the user, I want Snapshots shown whole, never cropped, so that I see the picture that was made.
14. As the user, I want to tap a Snapshot to see it full screen, so that I can look at it properly.
15. As the user, I want to swipe left and right through a Chat's Snapshots, and swipe down to close, so that viewing them feels natural on a phone.
16. As the user, I want the same full-screen viewer in the Gallery, so that both places behave alike.

### Writing and moving the story

17. As the user, I want a one-row composer that grows as I type, so that it takes little room until I need it.
18. As the user, I want the composer to clear and my line to appear at once when I send, so that I know it was sent.
19. As the user, I want a "writing" indicator where the reply will appear, so that I know the story is being written.
20. As the user, I want the send button to become ▶ Continue when the composer is empty, so that I can let the story go on with one tap.
21. As the user, I want Continue never to make the AI speak or act for me, so that my character stays mine.
22. As the user, I want to tap Continue several times in a row, so that I can watch a scene unfold.
23. As the user, I want Continue to work right after the Opening, so that I can let the story start itself.
24. As the user, I want Continue to update Memory, Bonds and the Scene like any turn, so that the story's state stays true.
25. As the user, I want ↺ Again on the newest reply, so that I can get a different reply when I don't like one.
26. As the user, I want Again to undo everything the old reply changed (Memories, Bonds, Arcs, the Scene), so that nothing stale is left behind.
27. As the user, I want Again on a reply made by Continue to continue again, so that it behaves as I expect.
28. As the user, I want Again to be unavailable on the Opening, so that I can't lose the author's start by accident.
29. As the user, I want a Snapshot of a reply I regenerated to stay in the Gallery, so that I never lose a picture.
30. As the user, I want ⚡ to offer three suggested replies, so that I can keep going when I'm stuck.
31. As the user, I want the three suggestions to be different kinds (an action, a line of speech and a bold move), so that they give me a real choice.
32. As the user, I want suggestions written as the Role or Persona I'm wearing, so that they fit my character.
33. As the user, I want a suggestion to fill the composer instead of sending, so that I can change it first.
34. As the user, I want suggestions made only when I ask, so that they don't spend my budget every turn.
35. As the user, I want suggestions never saved in the Chat's history, so that the history holds only what happened.

### Acting on Messages

36. As the user, I want the newest reply to show Again, Edit and Snapshot under it, so that the actions I use most are one tap away.
37. As the user, I want to tap an older Message to show its Edit, so that I can still rewind without buttons cluttering every Message.
38. As the user, I want Snapshot to open a small sheet with an optional hint, so that I can steer the picture when I want to.
39. As the user, I want the actions hidden while a turn is being written, so that I can't start two things at once.

### The Chat's top bar and menu

40. As the user, I want one thin top bar with back, the Chat title and the identity I'm wearing, so that the story gets the screen.
41. As the user, I want Memory, Dashboard, Gallery, the identity swap and Reset in one ⋯ menu, so that they're easy to find and out of the way.
42. As the user, I want Reset shown in red and confirmed first, so that I never reset by accident.
43. As the user, I want the main app nav hidden on the Chat screen, so that nothing pulls me out of the story.
44. As the user, I want a thin strip showing the current Scene and its goal, so that I know where the story is heading.
45. As the user, I want to hide the Scene strip with a tap, remembered on the device, so that I can read without it.

### Finding my place

46. As the user, I want a bottom icon bar for Stories, Personas, Usage and Settings on my phone, so that I can reach them with my thumb.
47. As the user, I want Home to show my Stories as picture cards, so that I can recognise them at a glance.
48. As the user, I want a Story's card cover to be its newest Snapshot, so that the card shows what the Story looks like.
49. As the user, I want a Story with no Snapshot to get its own gradient, so that the grid still looks finished.
50. As the user, I want each card to show the Setting's first sentence and when I last played, so that I remember what it's about.
51. As the user, I want a Draft badge on a Story that isn't playable, so that I know it needs work.
52. As the user, I want a "Continue where you left off" row at the top of Home, so that getting back into my last Chat is one tap.
53. As the user, I want tapping a card to open a sheet with Continue, New Chat and Edit Story, so that I can do the common things without hunting.
54. As the user, I want each Chat in a Story's Chat list to show its latest line and current Scene, so that I can tell my Chats apart.

### The Story editor

55. As the author, I want the editor split into Story, Style, Role, Characters, Bonds and Scenes tabs, so that I can find a section without scrolling eight screens.
56. As the author, I want a dot on any tab that still has a missing field, so that I know where work is left.
57. As the author, I want a status box listing what's still missing, each item linking to its field, so that I can fix it with one tap.
58. As the author, I want Play disabled until the Story is playable, so that I don't hit an error.
59. As the author, I want a missing required field marked as "needed to play", so that I can see it in place.
60. As the author, I want a small ✨ next to each field's label instead of a Rewrite pill, so that the form is calm.
61. As the author, I want a one-line hint under every field, so that I know what each field is for.
62. As the author, I want every text box to grow to fit its text, so that nothing is clipped, the Opening included.
63. As the author, I want to preview the Opening as it will look in a Chat, so that I can judge how a Chat begins.
64. As the author, I want choices such as point of view, tense and reply length as tap-to-pick segments, so that they're quick on a phone.
65. As the author, I want the Assistant as a half-height sheet over the editor, so that I can see the editor while I talk to it.
66. As the author, I want the editor to switch to the tab of each field the Assistant changes, scroll to it and highlight it, so that I see every change land.
67. As the author, I want each Assistant change listed as a link to its field, so that I can go back to it.
68. As the author, I want delete shown quietly at the bottom and confirmed, so that I don't delete a Story by accident.

### Saving and wording

69. As the user, I want Memory, Personas and Settings to save automatically like the editor, so that saving works one way everywhere.
70. As the user, I want one "Saving… / Saved" status in the same place on every page, so that I always know my changes are kept.
71. As the user, I want a failed save to say so and keep my text, so that I never lose what I typed.
72. As the user, I want the Dashboard in plain words, so that I understand it without knowing how the app works.
73. As the user, I want all text readable against the dark theme, so that nothing is too faint.
74. As the user, I want destructive actions quieter than everyday ones and always confirmed, so that the screen guides me to the safe choice.

## Implementation Decisions

### Scope and layout

- **Phone first.** Every surface is designed at 390px wide. On wider screens it stays a centred column, as now. Wider desktop layouts (side panels, a two-column editor) are a later phase.
- **The look:** the existing dark purple tokens, extended by new ones for surfaces, lines and the danger colour. Raised-contrast muted text: every text colour against its background meets WCAG AA (4.5:1 for body text).
- **New styles go into per-component stylesheets** (CSS modules), not the shared global stylesheet. Several tickets run in parallel sessions, and two branches appending to the same global file have twice produced a broken brace on merge.
- **The book face** is bundled with the app at build time (a self-hosted web font), so it also works when the phone is offline. It is used only for story text: narration, speech, the user's lines and the Opening preview. Controls keep the system face.
- **Per-device preferences** (text size, the Scene strip hidden) live in the browser's storage, read safely: a blocked or empty storage falls back to the defaults (M, shown).

### Chat screen

- **Message rendering:**
  - AI Messages render as their ordered parts. Narration parts are paragraphs; speech parts show the stamped speaker name and the text inside a left bar.
  - User Messages render right-aligned in a tinted bubble. `*…*` spans render as italics; the stored text is unchanged.
  - The Opening (model "author") renders like any AI Message but never offers Again.
- **Character colour:** a fixed palette of about 8 colours with readable contrast on the background. A Character's colour is picked from its position among the Story's Characters, so it is stable across every Chat of the Story. A speaker with no Character link (unknown speaker) gets a neutral colour. This is presentation only; nothing is stored.
- **Scrolling:** the thread is its own scroll area between the top bar and the composer, so the composer can't cover it. It jumps to the end on open. It scrolls to the end whenever a Message is added or replaced, or the writing indicator appears or goes (the prototype showed that keying this on the Message count alone misses a reply that replaces the indicator).
- **Send feedback:** on send, the composer clears and the user's line appears in the thread at once (optimistic). The writing indicator shows until the reply lands. On a failed turn the line stays with the existing error line and Retry.
- **Composer:** one auto-growing textarea (up to about 5 lines, then it scrolls) between ⚡ on the left and the send button on the right. Enter sends and Shift+Enter is a new line on a physical keyboard. The send button shows ▶ (Continue) while the box is empty or whitespace, and the send icon once there is text. It is disabled while a turn is in flight or sending is blocked. The composer's camera and hint field go away.
- **Action row:** under the newest AI Message, while no turn is in flight: ↺ Again (not on the Opening), ✎ Edit, 📷 Snapshot. Older Messages show Edit (with the existing rewind confirmation) when tapped, and hide it on a second tap or a tap elsewhere.
- **Snapshot sheet:** 📷 opens a bottom sheet with an optional hint field and a "Take Snapshot" button. That calls the existing Snapshot create on the latest AI Message with the hint. The pending placeholder, the failure with Retry, and out-of-image-credit behave as now.
- **Top bar:** back to the Story's Chat list; the Chat title with "as <identity>" under it; ⋯. The ⋯ menu is a bottom sheet with Memory (opens the existing drawer), Dashboard, Gallery, the identity swap (the existing picker), and Reset (danger style, confirm dialog with the existing wording). Rename moves into the menu as well.
- **Scene strip:** under the top bar, the current Scene's name and its goal, read from the existing Dashboard data, and refreshed after each turn settles. In free play it reads "Free play". Tapping hides it. It returns from the ⋯ menu ("Show Scene strip").
- **The main nav** is not rendered on the Chat screen route.
- **Snapshot viewer:** one shared full-screen viewer for the Chat and the Gallery. The image is shown whole (object-fit: contain) on black. A horizontal swipe, or the arrow keys, moves to the previous or next Snapshot of the same list (the Chat's Snapshots in thread order, or the Gallery's current filter). A downward swipe, Escape or × closes it. In the Gallery it keeps the existing prompt display, delete and download.

### Continue (new)

- **Endpoint:** continue on a Chat. It has the same gate as send: playable, text credit, the turn lock, and waiting for or being blocked by the previous AI Message's background calls.
- **No User Message is stored.** The turn prompt is built as for a send, with the whole history including the last AI Message. The final user-role prompt message is a fixed instruction instead of user text: continue the scene from where it stands, the worn identity does nothing new this turn, and the existing rule against writing the worn identity's words, thoughts or actions still holds. The guard, stop strings and parser run as for any turn.
- **Storage:** the reply is stored as an ordinary AI Message, and both background calls start. `lastPlayedAt` is bumped. Two or more AI Messages in a row are valid history.
- **Failure:** a failed Continue stores nothing. The Chat is as it was, and the user can tap ▶ again. There is no Retry, because there is no User Message to retry from.
- **Allowed** when the newest Message is an AI Message (the Opening included) or a User Message whose turn succeeded. It is refused while a User Message awaits its reply; the existing Retry is the way on.

### Regenerate (new)

- **Endpoint:** regenerate a Chat's newest Message. It is refused when that Message is not an AI Message, when it is the Opening (model "author"), or under the same gate as send.
- **Effect:**
  1. The ledger is rolled back from the Message's position, the same rollback as an edit, so its Memory, Bond, Arc and Scene changes go.
  2. Its Snapshot links are cleared (the Snapshots stay in the Gallery).
  3. The Message is deleted.
  4. A turn runs. If the Message before it is a User Message, it is that Message's turn, as after an edit. If it is an AI Message, it is a Continue turn.
- **Failure:** on a failed turn the old reply is already gone. If the Message before it is a User Message, it awaits its reply with the existing Retry. If not, the Chat simply ends at the previous AI Message, and ▶ is the way on. The response reports the rollback count like an edit does.
- **No versions are kept.** Swipe stays out of scope.

### Suggested replies (new)

- **Endpoint:** suggestions for a Chat. It returns exactly three items, each with a kind (`action`, `speech` or `move`) and text. Nothing is stored in the Chat.
- **The call:** one play-model call under a new text call kind for suggested replies, recorded in usage and spending the text pool like other text calls. Its prompt uses the same layers and history as a turn, plus an instruction to write three short options as the worn identity, in the Story's point of view and tense: one action, one line of speech and one bold move that pushes the story forward. The output is JSON, parsed strictly. Unparseable output is a typed error the client shows as "Couldn't suggest replies, try again".
- **Gate:** refused while a turn is in flight or when text credit is out. It does not wait for background calls, since a slightly stale state is acceptable for a suggestion.
- **Client:** ⚡ asks, shows a short loading state, then three tappable cards above the composer. Tapping one replaces the composer text with it. Tapping ⚡ again or sending closes the cards. Suggestions are not cached across turns.

### Lists and Home

- **Story list response** gains, per Story:
  - `lastPlayedAt` (the newest of its Chats', or null)
  - the newest-played Chat's id and that Chat's current Scene name
  - the newest Snapshot's image path (null when there is none)
  - a hook: the Setting's first sentence, cut to about 120 characters
- **Chat list response** gains, per Chat: the current Scene name (or free play) and the latest Message's text, as a plain-text excerpt of about 100 characters.
- **Home:**
  - The "Continue where you left off" row opens the newest-played Chat.
  - The grid has 2 columns at phone width.
  - A card without a cover gets a gradient derived from a hash of the Story's id, so it is stable.
  - A non-playable Story shows a Draft badge, and its sheet shows how many fields are missing instead of the play buttons.
  - The card sheet offers Continue (when the Story has a Chat), New Chat and Edit Story.
- **Bottom nav:** a fixed bottom bar with the four destinations as icon plus label. It replaces the top text nav at every width except the Chat screen, where it is hidden. It respects the phone's safe-area inset.

### Story editor

- **Tabs:**
  - One tab panel at a time, with a horizontally scrolling tab bar under the header.
  - The selected tab is kept in the URL, so reload and back return to it.
  - A tab shows a dot when any of its fields is in the Story's missing list.
- **Header:** back, the Story title with the save status under it, the Assistant button and Play (disabled unless playable, with a reason on long-press or hover).
- **Status box:** while the Story is not playable, it lists the missing fields from the existing playable-status response. Each item switches to its tab, scrolls the field into view, focuses it and highlights it briefly. This needs each missing item's field to identify its tab and its DOM target. The response's missing items already carry a field key; the client maps keys to tabs.
- **Fields:**
  - The label row carries the ✨ rewrite (the existing per-field rewrite call, with a spinner while it runs and a highlight when the new text lands).
  - Every field has a one-line hint, written in plain words.
  - Text boxes auto-grow to fit their content.
  - Enumerations (POV, tense, reply length) are segmented controls.
- **Opening preview:** a button under the Opening opens a sheet that renders the Opening through the same parser and Message rendering as the Chat, plus Play.
- **Assistant:** a non-modal bottom sheet at about half the screen height, so the editor stays usable above it. When it applies a change set, the editor switches to the first changed field's tab and scrolls it into view above the sheet with the existing highlight. Each applied change in the transcript is a link to its field. Undo is unchanged.
- **Delete Story** moves to the bottom of the Story tab as a quiet danger link with the existing confirmation.

### Saving

- **One shared autosave hook and status component**, already used by the editor, extended to:
  - Memory edits and adds in the drawer
  - Persona name and description
  - Settings
- **Status wording and placement:** the same "Saving… / Saved / Couldn't save: <reason>" in the page header. The Save buttons go.
- **Settings' numeric fields** save once they hold a valid value; an invalid value shows its error and isn't sent.

### Wording

- **The Dashboard:**
  - Background-call statuses read as "Up to date", "Updating…" and "Couldn't update — Retry", instead of "judge Done" or "extraction pending".
  - Section titles say what they show ("How the Characters feel", "How they've changed", "Where the story is").
- **Error and empty states** across the touched screens are reworded in the same plain style.

### Changes to the MVP spec

- Its Out of Scope line "Regenerate, Swipe, Continue and Branch on Messages. Editing is the only way to change history." becomes "Swipe and Branch on Messages. Editing and Regenerate are the only ways to change history." (Regenerate and Continue are specified here.)
- Its "Snapshot flow" step 1 (camera press with an optional hint on the latest AI Message) now happens through the action row's Snapshot sheet.

## Testing Decisions

- **What a good test is:** unchanged from the MVP spec. Drive the system only through its public surface and assert on what the user or the API client observes.
- **Seam 1, the NestJS HTTP API with the scripted fake gateway,** covers the new behaviour:
  - **Continue:**
    - stores one AI Message and no User Message
    - works right after the Opening and after another AI Message
    - the prompt's last message is the continue instruction and the history includes the previous AI Message (asserted on the recorded call)
    - background calls run
    - the guard still cuts a line written as the worn identity
    - refused while a User Message awaits its reply, while a turn is in flight, with text credit out, or on a non-playable Story
    - a failed call stores nothing
  - **Regenerate:**
    - replaces the newest AI Message
    - rolls back its Bond, Arc, Scene and AI-added Memory changes, while user-written Memories stay
    - reruns the User Message's turn, or continues when the previous Message is an AI Message
    - refused on the Opening and on a User Message
    - clears Snapshot links while the Snapshots stay in the Gallery
    - a failed turn leaves the User Message awaiting Retry
    - reports the rollback count
  - **Suggested replies:**
    - returns three items of the three kinds
    - stores nothing
    - records usage under its own call kind in the text pool
    - uses the worn identity in its prompt
    - unparseable output gives the typed error
    - refused while a turn is in flight or with text credit out
  - **Lists:** the Story list's last played, newest Chat, Scene name, cover path and hook (including a Story with no Chats or no Snapshots); the Chat list's latest-line excerpt and Scene name.
  - **Fake gateway:** the fake must be scriptable for the new call kind, and its test control route must accept it.
- **Seam 2, Playwright,** with the existing suite updated to the new UI wherever it relied on the old one (Edit pills on every Message, the composer camera, Save buttons, the top nav). New or changed flows:
  - open a Chat and see the newest reply on screen above the composer
  - send and see the composer clear and the line appear before the reply
  - Continue from an empty composer
  - Again on the newest reply
  - pick a suggested reply, edit it, send it
  - take a Snapshot from the action row with a hint
  - open the viewer and swipe to the next Snapshot
  - Reset through the ⋯ menu's confirmation
  - the editor: a missing item jumps to its field on another tab; the Assistant's change switches tab and highlights the field
  - Home: the Continue row opens the newest Chat
  - Memory, Persona and Settings autosave, with no Save button
  Keep the suite small; behaviour detail stays at Seam 1.
- **Phone width:** the Playwright suite runs the new UI flows at a 390px viewport with touch enabled, and keeps one desktop-width smoke test.
- **By hand, not automated:**
  - the quality of Continue and suggested-reply text against the real model, checked with the existing manual battery: Continue must not act for the user, and the suggestions must be distinct
  - looking at every changed screen on the user's real Android phone
  - contrast measured with a checker on each new colour pair
- **Prior art:**
  - the edit and rollback tests (Regenerate reuses that path)
  - the send and retry tests (Continue)
  - the field-rewrite tests (a one-shot text call with JSON output and usage)
  - the existing Playwright specs for play, edit and reset, snapshots, the story editor and the assistant

## Out of Scope

- Desktop-specific layouts: side panels, a two-column editor, a wide Chat. The phone design stays a centred column on wide screens for now.
- Swipe (keeping and flipping between alternative replies), Branch, and Message version history.
- Streaming replies. (Since brought in by [Spec: Streaming replies](../streaming/spec.md).)
- Character avatars or profile pictures; Reference images stay out of play.
- A light theme, a Thai UI, or user-chosen Character colours.
- Bookmarks, a screenshot mode, and the narrator/character speaker prefixes (`@:`) that Zeta has.
- Discovery features: ranking, tags, search across Stories, sharing.
- Automatic suggested replies after every turn.
- A user-set mood or time-of-day in the Scene strip; it shows only what the data already has.

## Further Notes

- **The prototype is the visual reference.** The throwaway route and its variants live on branch `prototype/friendly-ui` only, and never merge. Fold the look in properly, with tests and the project's patterns, rather than copying prototype code.
- **Cost:** a suggestion request costs about one turn (about $0.002 at the current play model), and only when asked. Continue and Regenerate cost one turn each. Heavy use of Again adds turns. All of it stays in the text pool and under the existing cap and low-credit warning.
- **Risk: Continue acting for the user.** This is the most common complaint about Zeta. The instruction and the existing guard address it, but only the manual battery can show whether the play model obeys. If it doesn't, the instruction is the thing to tune, not the guard.

## Implementation tickets

See [issues/](issues/). Work blockers first. Each ticket ends with its own API or browser tests and updates the existing e2e specs it breaks.

| # | Ticket | Blocked by |
|---|---|---|
| 01 | [Chat reads like a novel](issues/01-chat-reading-layout.md) | none |
| 02 | [One-row composer and the newest reply's action row](issues/02-composer-and-message-actions.md) | 01 |
| 03 | [Thin Chat top bar, ⋯ menu and Scene strip](issues/03-chat-top-bar-and-scene-strip.md) | 01 |
| 04 | [Full-screen Snapshot viewer with swipe](issues/04-snapshot-viewer.md) | 01 |
| 05 | [Continue](issues/05-continue.md) | 02 |
| 06 | [Regenerate](issues/06-regenerate.md) | 05 |
| 07 | [Suggested replies](issues/07-suggested-replies.md) | 05 |
| 08 | [Bottom nav, Home picture cards and richer lists](issues/08-shell-and-home-cards.md) | none |
| 09 | [Story editor in tabs](issues/09-story-editor-tabs.md) | 01 |
| 10 | [Story assistant as a half-height sheet](issues/10-assistant-sheet.md) | 09 |
| 11 | [Autosave for Memory, Personas and Settings](issues/11-autosave-everywhere.md) | 01 |
| 12 | [Plain words on the Dashboard, and readable contrast](issues/12-plain-words-and-contrast.md) | 01 |

**Parallel waves:**

1. 01 and 08 can start at once.
2. After 01: 02, 03, 04, 09, 11 and 12.
3. After 02: 05. After 05: 06 and 07 together. After 09: 10.

Ticket 01 splits the Chat screen into top bar, thread and composer components precisely so that 02 (thread and composer), 03 (top bar) and 05/07 (composer) touch different files. 06 and 07 both add an API endpoint next to the chat routes; merge them one at a time.

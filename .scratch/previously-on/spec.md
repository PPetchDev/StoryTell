# Spec: "Previously on…"

Status: ready-for-agent
Builds on: [Story so far](../story-so-far/spec.md) (the account of the oldest Messages), [Chapters](../scene-chapters/spec.md) (a summary per ended Scene, a background summary call), [Diary](../diary/spec.md) (a writer told only what the user may see), [Growing cards](../growing-cards/spec.md) (Now notes), [Accounts](../accounts/spec.md) (Monthly cap).
Built 2026-11-18. Terms: `CONTEXT.md` — Chat, Message, Story so far, Chapter, Bond, Now note, Recap.

## Problem Statement

The user plays in short sittings on their phone, often a day or more apart. Coming back to a Chat, they land on the newest reply with no sense of where the story stands: who is angry with whom, what was about to happen, what was left hanging. The thread is long, the Story so far is written for the AI and only once a Chat outgrows a turn, and the Chapters tell each past Scene but not the moment the story is in now. Scrolling back to remember costs the first five minutes of every sitting.

## Solution

When the user opens a Chat after a while away (6 hours or more since its newest Message), a short **Recap** card sits above the thread under the heading "Previously on…": three to five dramatic sentences, like a TV recap, of what just happened, how the Characters feel, and what is unresolved. It is written once for that gap, by a cheap background model, and kept: opening the Chat again shows the same one, and dismissing it (✕) puts it away until the next gap. The Chat menu's "Previously on…" row shows it on demand at any time, writing one for where the story stands if there is none yet.

## Decisions

### Glossary

- **Recap**: a short, dramatic account of where one Chat's story stands now, written for the user when they come back to it, from the Story so far, the Chapters, the newest Messages, the Bonds and the Now notes. It is for the user only: no prompt reads it. It covers the Chat up to its newest Message and goes when that Message is taken back. _Avoid_: Summary, Story so far, Chapter, previously.

### Checked: nothing like it exists

- **Story so far** is events of the *oldest* Messages, for the AI, and none while the Chat fits. It is an input here, not a duplicate.
- **Chapters** summarise *ended* Scenes, for reading back. Their newest summaries are an input here.
- **Dashboard** shows Bonds and the Scene as data, not as a story.
- **Diary** is one Character's private view.
So the Recap is a new, short, user-facing read built *on* those, never a second copy of any.

### When it shows

- **The gap**: `RECAP_GAP_HOURS = 6` since the Chat's newest Message's `created_at`. Six hours separates "put the phone down for dinner" from "came back the next day"; a mid-afternoon break doesn't trip it.
- **Something to recap**: at least one Message after the Opening. A Chat with only its Opening has none (`409.004.120` on the write).
- **Due** (`GET …/recap` → `due: true`): the gap holds, there is something to recap, and the Recap for the newest Message is not dismissed (or there is none yet).
- **Once per gap**: the Recap is stored against the newest Message. Opening the Chat again in the same gap shows the stored one, never a new call. Dismiss marks it dismissed; it is not due again until a new Message is written and another gap passes.
- The web, on opening a Chat: reads `GET …/recap`. When due and none is written, it asks `POST …/recap` and the card shows "Writing a recap…" meanwhile. When due and written, it shows it at once.
- The card hides as soon as the Chat's newest Message is no longer the one it was written at (the user sent, Continued, or took back).

### On demand

- The Chat menu row "Previously on…" ("Where the story stands") opens the card. It shows the stored Recap when it is for the newest Message (dismissed or not), and otherwise writes one, with or without a gap.
- No "write again" button: once the story moves on by a Message, the next ask writes a fresh one.

### Stale Recaps go away

- One Recap per Chat (a unique row, replaced by the next write).
- `message_id` references the Message with `ON DELETE CASCADE`: taking back that Message (an edit before it, a Reset, a Branch's own Chat never has it) deletes the Recap with it, without touching the shared rollback code.
- A Message changed in place (Regenerate, choosing a Reply version, an AI Message edit) keeps its id, so the row also keeps a **fingerprint** (sha256 of the Message's kind and text as the AI reads it). A Recap whose fingerprint no longer matches its Message is deleted when read, and never shown.
- A Branch never copies the Recap; Reset deletes it (its Message goes).

### What it is written from (and never from)

- **From**: the Story's title; the worn identity's name and description; the Story so far (its last `RECAP_STORY_SO_FAR_TOKENS` = 1,500 tokens); the newest three written Chapter summaries with their Scene names; the current Scene's *name*; the Time of day and Place; each Character's Bonds (label and description, no levels) toward the identity and toward each other; each Character's Now note, with `{user}` rendered; and the newest Messages that fit `RECAP_MESSAGE_TOKENS` = 4,000 tokens, rendered as the Chapters render them (`[Speaker]` then the text).
- **Never**: a Character's Secrets, Arc directions or Arc steps, Beliefs, Diary entries or inner-life lines, Memories, the Scene's situation and move-on condition, the Endings, the Author's note. The writer is told only what the user may see, as the Diary and the Character profile are; it never sees a card at all, only names.
- **Rules**: 3 to 5 sentences, 50 to 110 words of plain prose; what just happened, how the Characters feel, and what is unresolved, ending on the open question; dramatic like a TV recap but only what the material shows (no new events, no predictions, no hints at anything hidden); third person, past tense for events and present for how things stand; the identity by name, never a guessed gender; everyone an adult, never "girl", "boy", "child" or "kid"; no heading, no "Previously on" label, no list, no quoted dialogue.
- **The guard** (the Chapters' and the Story so far's): an answer cut off at the cap, empty, or opening with a speaker tag of the Messages is asked for once more, then the write fails. A leading "Previously on…:" or "Recap:" label and wrapping quotes are dropped.

### The call

- One text call, kind `previously_on`, on the background model (V4 Flash via the gateway: not a play-model kind, so host defaults and host skipping as every background call), `maxTokens` 400. About 6-8k tokens in, ~$0.001 on V4 Flash.
- **Monthly cap**: `previously_on` is not a never-refused background kind. A Member at their cap is refused (`402`/`403` as the gateway answers), and the card shows the quiet retry.
- Two asks at once for one Chat share the one call.
- **Never sent to the Narrator**: no prompt reads the Recap, so it adds nothing to any turn and cannot change the cached standing part of the prompt.

### On failure

- The card shows one muted line, "Couldn't write the recap.", with "Try again" and ✕. Never the red error alert, never the can't-connect screen (an unreachable API still reports to the connection banner as everywhere).
- Nothing is stored on failure: the next open in the same gap tries again (one call per open, never a loop).

### API

- `GET /api/stories/:storyId/chats/:chatId/recap` → `{ due, recap }`, `recap` = `{ messageId, text, dismissed, writtenAt }` for the newest Message, or null. No model call.
- `POST /api/stories/:storyId/chats/:chatId/recap` → writes one for the newest Message unless one is stored, then answers as GET. `409.004.120` with nothing to recap.
- `POST /api/stories/:storyId/chats/:chatId/recap/dismiss` → marks the stored one dismissed (no-op with none), answers as GET.
- Testing only (fake gateway): `POST /api/testing/chats/:chatId/age` `{ hours }` moves every Message of the Chat that many hours into the past, so e2e can make a gap.

### Storage

`chat_recap` (migration `1764420000001-ChatRecap`): `id`, `chat_id` (unique, FK cascade), `message_id` (FK cascade), `fingerprint`, `text`, `dismissed_at` (null until dismissed), `created_at`.

### Web

- `RecapCard` above the thread, below the banners, in the event-proposal card's style: "Previously on…" heading, the text (scrolls inside past 40% of the screen height), ✕ "Dismiss the recap" (44px). Hidden while the keyboard is up (short screens).
- States: writing ("Writing a recap of where the story stands…"), written, failed (quiet line + Try again).
- Chat menu row "Previously on…" under "This Chat", beside Chapters.
- Usage page: `previously_on` → "Previously on recaps".
- Fits at 360 and 320px wide.

## Testing Decisions

- **Pure** (`test/recap-pure.spec.ts`): due/not due at the gap edges and with only the Opening; the fingerprint changes with the text; the prompt holds the Bonds, Now notes, Chapters, Story so far and newest Messages, and never a Secret or Arc direction; the budget keeps the newest Messages; parsing and the guard.
- **API** (`test/recap.spec.ts`, fake gateway): not due without a gap; due after one; written once and served from the store on a second ask; dismiss stops it being due; a Secret and an Arc direction never reach the call; the turn after a Recap doesn't carry it; Regenerate and an edit make the stale Recap go; a failed call stores nothing and the next ask writes it; only the Opening refuses; a Member at the cap is refused; usage is recorded under `previously_on`.
- **e2e** (`e2e/previously-on.spec.ts`, phone with touch, measured at 360 and 320): after a gap the card shows the recap and fits; ✕ puts it away and a reload doesn't bring it back; the menu row brings it back; a failed write shows Try again, which writes it; a send hides it. Every Story it makes is deleted.

## Out of Scope

- A recap in the Transcript, or read aloud.
- A per-Chat or per-Story setting for the gap length.
- A recap of a Chat that has never been played (only the Opening).

## Further Notes

- Not tried with a real model. A paid check worth running later: write live Chat 2's Recap once (V4 Flash, one call of ~7k tokens, well under $0.01) and read it against the last 20 Messages and the Dashboard, looking for invented events and for anything hidden (Secrets, Arc direction) leaking through the Messages.

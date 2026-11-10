# Spec: Write for me and Thai reading

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) ("Suggested replies", "Composer"), [Spec: Reply versions](../swipe/spec.md), [Spec: Lore](../lore/spec.md)
Decisions: [Write the user's reply for them](../sillytavern-gaps/issues/12-impersonate.md), [Writing in Thai while the story plays in English](../sillytavern-gaps/issues/07-translation.md)
Research: [SillyTavern feature details](../../docs/research/sillytavern-feature-details.md) (4. Impersonate, 10. Chat translation)
Shares the composer with: [Saved replies and Replace rules](../saved-replies-and-replace-rules/spec.md), [Dictation](../dictation/spec.md), [Speaker controls](../speaker-controls/spec.md) (the Character row)
Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

The user thinks in Thai and plays in English. To answer a Character they either write English slowly, write it half-way and give up, or switch to a translator app and paste back. ⚡ Suggested replies help only when one of three short ideas happens to be what they meant; they ignore anything already typed. And when an AI reply is long or idiomatic, there is no way to check what it said in Thai without leaving the app, so a nuance (a threat, a joke, a promise) is easily missed.

## Solution

Two on-tap helpers, both outside the story:

- **Write for me** (✍️ in the composer): one play-model call writes the user's next Message in English, as the Role or Persona they wear, from whatever is in the composer (Thai, notes, half a line, a full English line to polish) or from nothing. The result replaces the draft for the user to check, edit and send; **Undo** brings the draft back. It never writes for the Characters and nothing is stored.
- **Thai reading** (ไทย under a Message): one background-model call translates that Message, AI or user, into Thai. The reading is stored with the Message, shows under it, hides and shows again with the same button at no cost, and is gone when the Message's text changes or the Message goes. It is never part of the Chat: no prompt, no Transcript, no Memory, no Judge.

To make room for ✍️ (and for the Saved replies tray, the Dictation mic and the Nudge Portraits of the sibling specs), the composer is laid out in four bands, with a **tool row** above the box.

## User Stories

1. As a player who thinks in Thai, I want to type what my Role should do in Thai and turn it into an English reply with one tap, so that I can play in English without writing it myself.
2. As a player, I want Write for me to keep everything my draft says, in its order, so that the reply is mine and not the AI's idea.
3. As a player, I want rough notes ("ask her about the key, sound suspicious") to become a natural line, so that I can direct instead of write.
4. As a player, I want a half-written English line to be finished and polished, so that I can start a thought and let the AI round it off.
5. As a player with an empty composer, I want Write for me to write one whole reply from nothing, so that I can keep the story moving when I have no idea.
6. As a player, I want the reply written as the Role or the Persona I wear now, by name, so that it matches who I play in this Chat.
7. As a player, I want the reply in the Story's point of view and tense, like my earlier Messages, so that it reads like the rest of the Chat.
8. As a player, I want Write for me never to write the Characters' words, actions or reactions, so that the Narrator stays the only voice of the cast.
9. As a player, I want the reply short, a line or a short paragraph, so that it reads like a player's turn and not like a Narrator's reply.
10. As a player, I want a long draft kept whole even when it runs past that length, so that nothing I asked for is cut.
11. As a player, I want the result to replace my draft in the composer and send nothing, so that I always check before it goes into the Chat.
12. As a player, I want an Undo that gives me my draft back exactly, so that a bad result never costs me what I typed.
13. As a player, I want Undo to go away once I edit the result or send it, so that it never throws away my own later changes.
14. As a player, I want to tap ✍️ again on a result to get another take from the same draft, so that I can try again without retyping.
15. As a player, I want to see that the AI is writing, and to cancel the wait with a second tap, so that I'm never stuck.
16. As a player, I want the composer locked while Write for me runs, so that what I type isn't overwritten when the result arrives.
17. As a player, I want a failed Write for me to say so and leave my draft untouched, so that I can just try again.
18. As a player, I want Write for me to know the same Story, cast, Memory, Lore, Documents, Author's note and recent Messages as a turn, and to use my Sampling, so that the reply fits where the story stands.
19. As a player, I want Write for me to cost one play-model call and only when I tap, so that it never spends credit unasked.
20. As a player watching my spend, I want Write for me listed under its own name on the Usage page, so that I can see what it costs.
21. As a player, I want Write for me refused while a reply is being written or text credit is out, as ⚡ is, so that it behaves like its neighbour.
22. As a player, I want ⚡ Suggested replies to stay exactly as they are, so that the quick three are still there.
23. As a player, I want to speak Thai into the composer and then tap ✍️, so that I can play in English without typing at all (with [Dictation](../dictation/spec.md)).
24. As a player who missed a nuance, I want to tap ไทย under an AI Message and read it in Thai, so that I understand exactly what happened.
25. As a player, I want ไทย on my own Messages too, so that I can check what an English line I sent actually says.
26. As a player, I want the Opening to have ไทย too, so that I can read how the story begins in Thai.
27. As a player, I want the Thai reading under the Message, set apart from the story text, so that I can read both and tell them apart.
28. As a player, I want speakers' names kept as written and each line still marked with its speaker, so that I can follow who says what.
29. As a player, I want italics for actions kept, so that the Thai reads with the same shape as the English.
30. As a player, I want the reading translated faithfully, adult content included, without softening or notes, so that it says what the story says.
31. As a player, I want a reading kept once made, so that re-reading it later costs nothing.
32. As a player, I want ไทย to hide and show the reading again with no new call, so that I can switch between the two freely.
33. As a player, I want readings to show when I come back to the Chat, so that what I asked for is still there.
34. As a player, I want a reading to disappear when the Message is edited, so that I never read a translation of words no longer there.
35. As a player comparing Reply versions, I want each version's reading kept, so that I can swipe between versions and still read each in Thai.
36. As a player, I want a reading gone when its Message goes (an earlier edit, Reset, deleting the Chat), so that nothing lingers.
37. As a player, I want Thai readings never sent to the AI and never in the Transcript, so that the story and its record stay in English.
38. As a player, I want a Thai reading made only when I tap, on the cheap background model, and listed on the Usage page, so that I control and see its cost.
39. As a player, I want a failed Thai reading to say so under the Message, so that I can try again.
40. As a player who branches a Chat, I want the copied Messages to keep their Thai readings, so that the Branch reads the same as its parent.
41. As a player on a phone, I want ⚡, ✍️, the Saved replies tray, ✱, the Nudge Portraits and the mic to fit without crowding the box, so that the composer stays easy to use one-handed.

## Implementation Decisions

### Composer tool row (shared with the sibling specs)

- The composer becomes four bands, top to bottom, as [integration](../sillytavern-gaps/integration.md) ("The composer, top to bottom") settles:
  1. **Panel** (at most one at a time): the Suggested reply cards, the Saved replies tray, or a status or error (Write for me's or Dictation's). Opening ⚡ closes the tray and the other way round.
  2. **Character row**: the Portraits for Nudge ([Speaker controls](../speaker-controls/spec.md) fills it), shown only with two or more Characters. Ticket 01 builds the band as an empty slot; it takes no height while empty.
  3. **Tool row**: small round icon buttons, left-aligned, each with an `aria-label` and title: ⚡ Suggest replies · ✍️ Write for me · Saved replies (bookmark icon) · ✱ Write an action. Undo, when offered, sits at the row's right end as a quiet text button "↶ Undo".
  4. **Box row**: the text box, then 🎤 Dictation, then the send slot (Send / ▶ Continue / ■ Stop, unchanged).
- While Dictation records, the box row turns into the recording bar (the [Dictation spec](../dictation/spec.md) owns it).
- The tool row's buttons keep today's disabled rules per button; ✱ keeps its focus-and-selection trick. Same layout on desktop. While a recording or a transcription runs, ⚡ and ✍️ are disabled: that is a rule of each button in its own right, not ✍️ copying ⚡. The recording and transcription states come from [Dictation](../dictation/spec.md), whose mic ticket wires them into both buttons (into ✍️ too if Write for me landed first; if Dictation landed first, ticket 02 here does it for ✍️).
- This ticket order matters: the bands land first ([01](issues/01-composer-tool-row.md)), with ⚡ and ✱ moved into the tool row and no new button, so the existing composer e2e keeps passing (by accessible name) and the other features plug in: the Character row ([Speaker controls 03](../speaker-controls/issues/03-nudge.md)), the tray ([Saved replies 02](../saved-replies-and-replace-rules/issues/02-saved-replies-tray.md)) and the mic ([Dictation 02](../dictation/issues/02-composer-mic.md)) are each blocked by it.

### Write for me

- **Call kind.** New text call kind `write_for_me`, served by the **play model** (added to the play-model kinds), in the text pool, one UsageRecord per call with the Story and Chat it served. Usage page label: "Write for me".
- **Sampling.** `write_for_me` is a sampled kind: the user's Sampling for the play model ([Play models and Sampling](../models-and-samplers/spec.md)) goes with it as with `turn` and `suggested_replies`. If [Sampling per play model](../models-and-samplers/issues/02-sampling-per-play-model.md) has landed, ticket 02 adds `write_for_me` to the sampled kinds with a contract test; otherwise that ticket adds it.
- **Endpoint.** `POST /api/stories/:storyId/chats/:chatId/write-for-me` with `{ draft: string }` (may be empty or whitespace; at most 4,000 characters) answers `{ text: string }`. Nothing is stored and no background call starts.
- **Gate.** Same as Suggested replies: refused with `TurnInProgressError` while the Chat's turn is in flight, and with `OutOfCreditError` (text) when text credit is known to be out, both with no call. It never waits for, or is blocked by, the previous reply's background calls.
- **Prompt** (pure builder beside the Suggested replies one, mirroring it):
  - The turn's system message (`systemPrompt` of the turn's prompt layers: rules, Setting, worn identity, Style, cast, Scene, Bonds, Arcs, Memory, Story so far) — the same cached prefix as the turn.
  - The recent uncovered history within the turn budget, as Suggested replies send it. Every block the last message can carry (below) is reserved in that history budget, as for Suggested replies.
  - Last, one `user` message (not a trailing system one, for the same GLM-5.3 reason Suggested replies give) holding, in this order ([integration](../sillytavern-gaps/integration.md), "The trailing system message of a turn"): **Lore → Documents → Author's note → the instruction**. Each block appears only when it has something; with none, the message is the instruction alone.
    - **Lore**: the entries chosen by the one Lore selection entry point the turn and Suggested replies call ([Lore in play says why](../lore-triggers/issues/01-lore-in-play-says-why.md)), at the point after the newest Message, in the turn's Lore block. Before that ticket lands, today's `exchangeLore` as Suggested replies use it.
    - **Documents**: the passages the newest AI Message recorded (still existing ones only), in the turn's Documents block, with no search call, as Suggested replies reuse them ([Suggested replies and Write for me use the passages](../documents/issues/06-suggested-replies-and-write-for-me-use-the-passages.md)).
    - **Author's note**: the Chat's note in the turn's block and words; [Write for me reads the Author's note](../authors-note/issues/03-write-for-me-reads-the-note.md) adds it (blocked by ticket 02 here; if the note's API ticket landed first, ticket 02 may add it and close that one, as it says).
    - These blocks live in the turn's trailing message, not in `systemPrompt` (which is layers 1–9 only: `apps/api/src/manager/chat/turn/prompt.ts`), so nothing reaches Write for me on its own: each is added here explicitly. Whichever of Lore selection, Documents and the Author's note lands after Write for me adds itself to this prompt, with a test; whichever has landed before, ticket 02 includes.
  - The instruction steps outside the story: the user plays the worn identity (by name) and asks for their next Message, written as that identity, in `povAndTense` of the Story, following on from exactly where the story stands.
    - With a draft: the draft is quoted in a clearly delimited block and described as the user's own rough draft, which may be in Thai or another language, notes, or half a line; keep everything it says the identity does and says, in its order, add no new decisions of weight, and turn it into natural English.
    - Without one: decide what the identity does and says next, in keeping with them and the moment.
    - Both: write only the identity's words and actions, never what a Character says, does or feels; actions in `*asterisks*`, speech in quotes, like the user's earlier Messages; answer with only the Message, no name label and no notes.
  - **Length:** a fixed short range, not the Story's reply length: "one to four sentences, at most about 120 words; when the draft holds more, keep all of it". The Story's reply length sizes the Narrator's turn (up to 600 words), which is the wrong size for a player's line and would talk over the cast. `maxTokens` 600 (room for a long Thai draft rendered in English).
  - Stop string `\n@` (a Character line), sent only where the host supports stop strings, as the gateway already decides.
- **Reading the answer** (pure): trim; drop a wrapping code fence; drop a leading `Name:` or `@Name:` label for the worn identity; cut at the first line that starts with `@` (a Character line) as a guard behind the stop string; trim again. An empty result throws a new `UnreadableWriteForMeError` (`502.004.0NN`, the next free code in the Chats domain; the client shows "Couldn't write it, try again"). Gateway errors pass through as for Suggested replies.
- **Web.**
  - ✍️ in the tool row, `aria-label` "Write for me". Disabled while a turn is written, a write is in flight, sending is blocked, or a recording or a transcription runs (see "Composer tool row" for who wires the last one).
  - A tap sends the composer's text as `draft`. While it waits: the box is read-only, ✍️ is `aria-busy` and pressed, and the panel shows "Writing for you…" (role status). A second tap on ✍️ cancels: the answer is dropped when it arrives (its credit is already spent, as with ⚡).
  - On success the box's text becomes the result and the box is focused with the caret at the end. The composer remembers `{ before, written }`. **Undo shows while the box holds exactly `written`**; a tap puts `before` back (empty included) and hides Undo. Typing, a Suggested reply, a Saved reply, a dictation, a send, or a new Write for me change the box and so end that Undo. ✍️ on a result writes again from the result as its draft (the user can Undo first to rewrite from their own draft).
  - A failure shows the alert in the panel and leaves the draft untouched. An unreachable API reports as ⚡ does.
  - Write for me changes no Chat state, so neither the Chat nor the thread reloads.

### Thai reading

- **Call kind.** New text call kind `thai_reading`, a **background-model** call (V4 Flash, with the gateway's existing busy fallback), in the text pool, one UsageRecord per call with the Story and Chat. Usage page label: "Thai readings".
- **Source text** (pure, one function used for the call and for the fingerprint): always the **stored** text, never the shown text. A User Message is its stored text; an AI Message (the Opening included) is its stored parts in the Transcript's layout — narration paragraphs as they are, each speech part as `Name: text` — joined by blank lines, but with no Replace rules applied (the Transcript applies the Chat's `onAi` rules; this function does not, per [integration](../sillytavern-gaps/integration.md), "Replace rules and what each reader sees"). So the fingerprint depends only on what is stored: adding, editing, parking or removing a Replace rule never drops a reading.
- **Prompt** (background, not the play layers): a short system message — translate interactive fiction for an adult Thai reader into natural, faithful Thai; keep the meaning, tone and explicitness, no softening, no notes, no added text; keep every line's `Name:` label exactly as written and keep these names in their original spelling (the cast's names and the worn identity's name, listed); keep blank lines between paragraphs; keep `*…*` around actions. The user message is the source text. `maxTokens` 4,000 (Thai takes many tokens). The answer is the trimmed text; an empty answer throws a new `UnreadableThaiReadingError` (`502.004.0NN`, next free code).
- **Storage.** New table `thai_reading`: `message_id` (ON DELETE CASCADE), `source_fingerprint` (SHA-256 hex of the source text), `text`, `created_at`; unique on (`message_id`, `source_fingerprint`). One migration.
  - A Message's **current reading** is the row whose fingerprint matches its source text now. Any change to the text — an edit, choosing another Reply version, Regenerate — makes the old row not current with no code on those paths; it simply stops showing.
  - Rows are kept per fingerprint so each Reply version keeps its reading: swiping back to a version shows its reading again with no call. A Message keeps at most 5 rows (the Reply version cap); making a sixth drops the oldest.
  - The Message going (an earlier edit, Reset, deleting the Chat or Story) removes its readings by cascade. Backups carry the table as they carry the rest of the database.
- **Endpoint.** `POST /api/stories/:storyId/chats/:chatId/messages/:messageId/thai-reading` answers `{ messageId, text }`. When the Message already has a current reading it answers that with no call (idempotent, so a double tap costs once). Otherwise it makes one and stores it. It is refused with `OutOfCreditError` (text) when text credit is known out, with no call; `MessageNotFoundError` for a Message not in the Chat. It does not take the turn lock: a reading of a Message whose text changed during the call is stored under the old fingerprint and just never shows.
- **Chat response.** Each Message gains `thaiReading: string | null`, its current reading. The Chat's readings are loaded with its Messages in one query.
- **Never part of the Chat.** No prompt reads `thai_reading` (turn, Judge, Memory extraction, Story so far, Suggested replies, Write for me, Snapshots), and the Transcript does not include it. Lore triggers never see it.
- **Branch.** A [Branch](../branch/spec.md) copies its Messages' readings with them: each copied Message's rows are copied to its new Message id (the ids remapped as Branch remaps Messages), fingerprints unchanged, since the copied Messages have the same stored text. Per [integration](../sillytavern-gaps/integration.md)'s build-order rule, Branch lands first and the Thai reading ticket extends Branch's copy ticket ([Branch 02 — Branch a Chat from a reply](../branch/issues/02-branch-a-chat.md)), with an API test that a Branch carries the readings.
- **Web.**
  - "ไทย" is a Message action, `aria-label` "Thai reading". It sits in the newest AI Message's action row (after the existing actions, in integration's order **▶ Read aloud · ไทย · ⑂ Branch**) and in a tapped Message's tools (**✎ Edit · ▶ · ไทย · ⑂**), for User Messages, older AI Messages and the Opening; at 390 px wide whatever doesn't fit moves into the "⋯" overflow. It is offered wherever Edit is (no turn or write in flight), and also on a tapped Message that already has a reading.
  - With no reading: a tap asks, the button is `aria-busy` (and gently pulses) while waiting, and "Making a Thai reading…" shows under the Message where the reading will go, since ไทย may be in the "⋯" menu, which closes on the tap; the reading then shows. With a reading: the button is `aria-pressed` and toggles the reading hidden and shown, with no call.
  - The reading shows under the Message's story text, above its Snapshots and actions, as a set-apart block (muted surface, a small "ไทย" label), `lang="th"`, line breaks kept, upright text with `*…*` spans in italics, the way User Messages and Characters' speech show them. (The story text's narration is italic throughout and never turns `*…*` into italics: `apps/web/components/chat/message-body.tsx`. The reading block is one block for all parts, so it uses the speech rule everywhere.)
  - Readings returned by the Chat show by default. Hiding is per Message for this visit only (not stored).
  - A failure shows "Couldn't make a Thai reading, try again" under that Message, with a Retry button that asks again; an unreachable API reports as elsewhere.
  - After a reading is made, the web updates that Message's `thaiReading` in place; no Chat reload.

### Glossary

Write for me and Thai reading are already in `CONTEXT.md`. "Composer" and "tool row" are UI words, not domain terms.

## Testing Decisions

- Test external behaviour only: what the fake Model Gateway receives, what the API answers and stores (seen through the API), and what the composer and thread show.
- **Pure tests** (vitest, beside the existing prompt tests):
  - the Write for me prompt: the turn's system message unchanged as its first message; the history; the last message a `user` one naming the worn identity (Role, then a Persona), the Story's point of view and tense, the draft inside its delimiters when given and the from-nothing wording when not, and the blocks in the order Lore → Documents → Author's note → instruction, each only when present (the Documents and Author's note blocks as their features land);
  - reading the answer: a fenced answer, a leading `Ash:` / `@Ash:` label, a Character line cut off, an empty result refused;
  - the Thai reading source text for a User Message, an AI Message with narration and speech, and the Opening; the fingerprint changing with the stored text and not with Replace rules.
- **API tests** through the fake gateway (prior art: `apps/api/test/suggested-replies.spec.ts` for the gate, the prompt and the real-gateway usage record; `apps/api/test/reply-versions.spec.ts` for versions; `apps/api/test/chat-transcript.spec.ts` for the Transcript):
  - Write for me answers the cleaned text, stores nothing and starts no background call; refused with text credit out and during a turn with no call; not blocked by a failed background call; 404 for another Story's Chat; an empty answer is `502.004.0NN`; through the real gateway (recorded fetch) it goes to the play model under `write_for_me` in the text pool, with the play model's Sampling when set (once Sampling exists); with Lore selection and Documents present, its last message carries their blocks in order.
  - Thai reading: made once and returned again with no second call; shown on the Chat as `thaiReading`; editing the Message makes it `null`; choosing another Reply version shows that version's reading or `null`, and choosing back shows the first again with no call; a sixth reading drops the oldest; Reset removes it; the next turn's prompt, Suggested replies' prompt and the Transcript contain no Thai text; adding a Replace rule that changes the Message as shown leaves its reading current; a Branch's copied Messages carry their readings; through the real gateway it goes to the background model under `thai_reading`.
- **e2e** (Playwright, 390px with touch; prior art `apps/web/e2e/suggested-replies.spec.ts`, `composer-and-actions.spec.ts`, `reply-versions.spec.ts`):
  - the tool row: ⚡ and ✱ work as before from it; the bands stack panel → Character row → tool row → box row;
  - Write for me: type Thai, tap ✍️, the box holds the scripted English; Undo gives the Thai back; typing hides Undo; an empty box gets a reply from nothing; a failure leaves the draft; nothing appears in the thread until Send;
  - Thai reading: tap ไทย on the newest reply and on a User Message, the Thai shows; a second tap hides it with no call (fake gateway's pending replies unchanged); after a reload it shows; after an edit of that Message it is gone.

## Out of Scope

- Automatic translation of every Message, either way.
- Readings in any language but Thai, or a Thai Chat (the Chat and the AI stay English).
- Asking again for a reading that already exists (a "re-translate"); editing a reading.
- Streaming Write for me, or several takes at once.
- Write for me writing for a Character, or into the Chat without the user's send.
- A Thai reading of anything but a Message (Memories, Story so far, Lore, the Dashboard).
- A per-device "always show / always hide readings" preference.

## Further Notes

- Write for me's last message is a `user` message, as Suggested replies' is; the turn's per-turn content goes in a trailing system message, but GLM-5.3 on DeepInfra answered a trailing system instruction with nothing for Suggested replies (2026-11-05), so the same shape is used here. The system message stays the turn's cached prefix.
- Open question: should Write for me's length follow the Story's reply length after all? Recommendation: no, keep the fixed short range; revisit only if the user asks for longer player turns.
- A Branch copies Thai readings: settled by [integration](../sillytavern-gaps/integration.md).
- Replace rules (sibling spec) change how AI text is shown, not stored; a Thai reading translates the stored text, which may differ slightly from what is shown. Settled by integration: readings are of the Message, not of its display, so editing a rule never drops one.

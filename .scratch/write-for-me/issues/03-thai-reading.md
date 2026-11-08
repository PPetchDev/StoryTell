# 03 — Thai reading

**Status:** ready-for-agent

**What to build:** "ไทย" under any Message (AI or user, the Opening included) asks the background model (V4 Flash) for a Thai translation of that Message's stored text, stores it, and shows it under the Message; the same button hides and shows it again with no call. A reading belongs to the exact stored text it translated, so editing the Message or choosing another Reply version stops showing it, and choosing that version back shows it again; Replace rules change only what is shown, so they never drop a reading. It is never sent to the AI and never in the Transcript. A Branch carries its copied Messages' readings. New text call kind `thai_reading`, background model, text pool, Usage page label "Thai readings". Per the spec's "Thai reading" decisions: source text, prompt, the `thai_reading` table with its fingerprint and the 5-per-Message cap, the endpoint, `thaiReading` on each Message, the Branch copy, and the web action and block.

**Blocked by:** Branch's copy ticket, [Branch 02 — Branch a Chat from a reply](../../branch/issues/02-branch-a-chat.md) (per [integration](../../sillytavern-gaps/integration.md)'s build-order rule, this ticket extends Branch's copy). It touches the thread's action row, not the composer, so it does not wait for 01.

Part of: [Spec: Write for me and Thai reading](../spec.md)

- [ ] Migration adds `thai_reading` (`message_id` cascade, `source_fingerprint`, `text`, `created_at`, unique per Message and fingerprint).
- [ ] The source text and its fingerprint are built from the stored text (User Message text; AI parts in the Transcript's layout with no Replace rules applied); adding a Replace rule that changes a Message as shown leaves its reading current (API test).
- [ ] `POST .../chats/:chatId/messages/:messageId/thai-reading` answers `{ messageId, text }`; a second ask for the same text answers the stored one with no call; refused with `OutOfCreditError` (text) with no call; `MessageNotFoundError` for a Message of another Chat; an empty answer is `UnreadableThaiReadingError` (next free `502.004.0NN`, listed in `docs/error-codes.md`).
- [ ] Each Message on the Chat response carries `thaiReading` (current reading or `null`); an edit makes it `null`; Reply versions each keep their own; a sixth reading on one Message drops the oldest; Reset and deleting the Chat remove them.
- [ ] Branch's copy carries the readings: each copied Message's rows go to its new Message id, fingerprints unchanged; an API test branches a Chat with readings and finds them on the Branch's Messages, and none for Messages past the branch point.
- [ ] Through the real gateway (recorded fetch) the call goes to the background model under `thai_reading` in the text pool; the prompt keeps `Name:` labels and lists the names to keep as written.
- [ ] No prompt (turn, Judge, Memory extraction, Story so far, Suggested replies, Write for me, Snapshot) and no Transcript contains a reading.
- [ ] Web: "ไทย" ("Thai reading") in the newest AI Message's action row (▶ Read aloud · ไทย · ⑂ Branch, after the existing actions) and in a tapped Message's tools (✎ Edit · ▶ · ไทย · ⑂), moving into the "⋯" overflow at 390px when it doesn't fit; busy while asking; the reading shows under the story text in a set-apart `lang="th"` block with line breaks and `*…*` spans in italics (as User Messages and speech show them); a tap toggles it with no call; readings show after a reload; a failure shows "Couldn't make a Thai reading, try again" under that Message.
- [ ] Pure, API and e2e tests listed in the spec's Testing Decisions pass; the existing suites stay green.

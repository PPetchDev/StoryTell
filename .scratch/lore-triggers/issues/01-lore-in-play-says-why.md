# 01 — Lore in play says why each entry is in

**Status:** done

**What to build:** The prefactor every later ticket stands on, delivered as something the player can see. Lore selection moves to one entry point in the Lore module that chooses for a **point** of a Chat (spec: "The point, and the scan", "Selection at a point") from the Chat's stored Messages, and answers each chosen entry with a reason and each left-out candidate with a reason. The turn, Lore in play, Suggested replies, Write for me and the Snapshot writer all call it; the turn and Suggested replies prompt builders receive the chosen entries instead of choosing them. Write for me does not exist yet: if it lands before this ticket, this ticket moves it onto the entry point with a test; if after, Write for me's own ticket calls the entry point (integration: "Write for me's inputs"). The Snapshot writer keeps its own scan, its hint then the 6 Messages ending with the one it shows, through the entry point's scan-length option. No new entry settings yet, so the only reasons are `always` and `cameUp` (with the trigger and how many Messages back), and the only left-out reason is `noRoom`. `GET .../chats/:chatId/lore` answers the spec's `LoreInPlay` shape (`entries` with `why` and `chance`, plus `leftOut`). The Memory drawer's Lore in play card says why each entry is in, in plain words ("came up: yurt, 2 Messages back", "always"), and shows a "Came up but left out (n)" fold, closed by default, for entries that didn't fit.

**Blocked by:** None — can start immediately.

- [x] Every prompt is byte-for-byte what it was before for the same Story and Chat: the API-level turn, Suggested replies, Snapshot and Story so far tests pass unchanged, and the Snapshot's Lore still comes from its hint and its 6-Message scan.
- [x] The pure prompt tests in the API's Lore tests that hand every entry to the turn and Suggested replies prompt builders and assert which are chosen are rewritten: choosing is asserted through the selection entry point, and the prompt tests hand in chosen entries and assert only the block's place and the unchanged system message (spec: "Testing Decisions").
- [x] The turn's selection runs once per turn; no prompt builder scans for Lore.
- [x] Pure tests: the scan at a point after a user Message (that Message plus the 4 before it) and after an AI Message (the 4 before the point); the Snapshot's scan (its hint, then the 6 Messages ending with its Message); reasons `always` and `cameUp` with the trigger and `messagesAgo`; an entry over the cap is in `leftOut` with `noRoom`.
- [x] API test: Lore in play answers reasons and the left-out list.
- [x] e2e (390px): after a turn that mentions an entry, the Memory drawer says it came up with the keyword; an entry that didn't fit shows under the closed left-out fold once opened.
- [x] The web's Lore in play types mirror the new DTO.

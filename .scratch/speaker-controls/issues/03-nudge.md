# 03 — Nudge a Character from the composer's Character row

**Status:** done

Part of: [Spec: Speaker controls](../spec.md)

**What to build:** In a Story with two or more Characters, the composer shows a Character row; tapping a Character nudges them, and the next turn's Narrator is asked to give them a line. Follow the spec's "Nudge" decisions and the Character row under "Web":

- API: send, Retry, Continue, Regenerate and a User Message edit accept an optional `nudgeCharacterId`. Retry, Continue and Regenerate take an optional JSON body, and without one behave exactly as today. The turn's trailing system message then carries one line, in the one order **Lore → Documents → Author's note → Where things stand → Nudge → the final instruction**: the user would like to hear from that Character this turn, so give them a line or a moment if they could plausibly be there, and never force it. Before anything is stored, an id outside the Story's cast is `CharacterNotFoundError`, and a Character sitting out is the new `NudgeSittingOutError` (409, the next free chat-domain code at implementation time). The nudge is never stored and never reaches the judge, extraction, Suggested replies or Snapshots. The Story so far trigger adds a small fixed allowance for the line.
- Web: the Character row is band 2 of the composer, below the Panel and above the Tool row ([integration](../../sillytavern-gaps/integration.md)). It holds one chip per Character not sitting out (Portrait and name), scrolling sideways when it overflows. A tap nudges that Character (`aria-pressed`), one at a time; a second tap takes it back. The last chip, "Who's here", opens the sheet from [ticket 01](01-sitting-out-in-turns-and-the-sheet.md), and reads "N sitting out" when anyone is. The nudge rides on the next send, ▶ Continue, Retry, ↺ Again or User Message edit; it clears once a turn answers with its reply, stays when a turn fails or is stopped, and clears when that Character is set sitting out or the user leaves the Chat. The row is disabled while a turn or write is in flight.

**Blocked by:** [01 — Set a Character sitting out, and the turns leave them out](01-sitting-out-in-turns-and-the-sheet.md); [write-for-me 01 — Composer tool row](../../write-for-me/issues/01-composer-tool-row.md) (the composer's bands).

- [x] Pure prompt test: the nudge line's place (after "Where things stand", before the final instruction) and wording; no line without a nudge; the system message unchanged.
- [x] API tests (fake gateway): a send, a Continue, a Retry and a Regenerate with a nudge each carry the line; the next turn without one has none; a nudge on someone sitting out is the new 409 and stores no User Message; an unknown id is a 404; the judge's and extraction's calls never hold the line.
- [x] Every turn endpoint without the new field answers and streams exactly as before.
- [x] e2e (390 px, fake gateway): tapping a chip highlights it; ▶ Continue on an empty box sends the nudge and the highlight clears once the reply is in; a second tap before sending takes it back.
- [x] e2e: setting the nudged Character sitting out from "Who's here" removes their chip and the nudge; the last chip reads "1 sitting out".
- [x] A failed turn keeps the highlight, and Retry sends the nudge.
- [x] A one-Character Story shows no Character row; nothing in the composer overflows horizontally at 390 px.
- [x] `docs/error-codes.md` lists the new code; typecheck, the whole API suite and the whole e2e suite pass.

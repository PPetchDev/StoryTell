# Spec: Endings

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the Background judge, the change ledger, Continue, Regenerate), [Spec: Sudden events](../sudden-events/spec.md) (something the author writes, the Judge watches for and the ledger records), [Spec: Cue](../cue/spec.md) (a turn with its own instruction)
Prior art: zeta's Endings (docs/research/zeta-how-a-story-runs.md, section 3: the AI suggests an ending when the story "naturally approaches" one, or the user taps "Finish the Story"; an Ending Card, a paid Epilogue, "Continue After the Epilogue", an Ending Collection).

Built 2026-11-15. The first version had only the author's Endings and "End the story"; the same day the user asked for the AI to suggest endings as zeta does ("ง่ายดี"), which is "An Ending the Judge suggests" below.

## Problem Statement

A Chat never ends. Scenes move the plot along and a Sudden event can be won or lost, but a Story has no way to say "this is how it can come out", and a Chat that has run its course just stops being opened. The author can't write a good end and a bad one; the user can't finish a story, see that they finished it, or find out there was another way it could have gone.

## Solution

Two things, which work apart or together:

- **Endings**, written by the author on a Story: a name, when it is reached in plain language, and optionally what its epilogue should tell. When that has happened in a Chat, the Chat has reached the Ending: it says so, with a sentence on what brought the story there. A Chat reaches one Ending; another Chat, or a Branch from before it, can find another. The Story's Chats page says how many of its Endings have been found.
- **An Ending the AI suggests**, in a Story where the author wrote none: when the story comes to a natural close, the Chat says the story may have reached its end, with a name for the ending and why. The user asks for the epilogue, or says "Not yet" and plays on; after "Not yet" nothing more is suggested in that Chat.
- **The Epilogue**, written by the Narrator when the user asks: the story's closing passage, telling how things settle afterwards. It is asked for from the Ending's banner, or from the Chat menu ("End the story") in any Chat, whether or not the Story has Endings.

Neither closes the Chat. The Epilogue is a Message like any other, and the story can be played on after it.

## User Stories

1. As an author, I want to write the ways my Story can end, so that playing it leads somewhere.
2. As an author, I want to say when an Ending is reached in a sentence, so that it is found where the story gets there and not on a fixed turn.
3. As an author, I want to say what an Ending's epilogue should tell, so that the close is the one I meant.
4. As an author, I want an unfinished Ending to be ignored, never to block play, so that I can draft one without breaking my Story.
5. As a player, I want to be told when the story has reached an Ending, and why, so that I know I got there.
6. As a player, I want the Endings kept from the Narrator, so that the story is not pushed toward one and I find it by how I play.
7. As a player, I want to ask for an epilogue, so that the story closes properly.
8. As a player, I want to end a story myself at any point, with an epilogue, so that a Story without Endings can still be finished.
9. As a player, I want to play on after an Ending and after an Epilogue, so that ending is my choice.
10. As a player, I want Again to write the Epilogue anew, so that I can get a better one.
11. As a player, I want Again, an edit, a Reset and a Branch to treat an Ending like everything else the story changed, so that taking a reply back takes its Ending back.
12. As a player, I want to see which Chat ended how and how many Endings I have found, so that I know there are others to look for.
13. As a player, I want the Epilogue read in Thai, read aloud and drawn like any reply, so that the close is not a lesser Message.
14. As a player using a screen reader, I want to hear an Ending when it is reached, so that the banner is not the only sign.
15. As the owner, I want reaching an Ending to cost no extra model call, so that a Story with Endings costs what it did.
16. As a player of a Story with no Endings written, I want to be told when the story seems to have come to its end, so that I can close it without having planned how.
17. As a player, I want to say "not yet" to a suggested ending and not be asked again, so that a wrong guess costs me one tap.
18. As an author, I want my own Endings to be the only ones in my Story, so that the AI never adds an end I didn't write.

## Implementation Decisions

- **A Story's Endings.** Up to 6, in the author's order, each with a name, a condition and what its Epilogue should tell. One can be reached once it has a condition; it is never "needed to play". Its name, when blank, shows as "An ending". They are added, changed and removed one at a time, like Sudden events, and each write answers with the whole Story. Duplicate copies them.
- **The Judge finds them, in the call it already makes.** While the Chat has reached none and the Story has one that can be reached, the judge's user message has a section after the exchange (and before the Place, weather and outfits section): the Endings, numbered, each with its condition, then the rule and the JSON field `"ending": {"reason", "reached": n}`. It is taken only when the whole condition has clearly happened. The system message never changes, a Story without Endings sends exactly the prompt it sent before, and so does a Chat that has reached one. The token cap rises by 80 while the section is there.
- **Applying.** The number must name a waiting Ending; the reason is put on one line and cut at 240 characters. Anything else changes nothing and is logged, like other judge items.
- **One Ending a Chat.** The reaching is a ledger record against the AI Message whose judgement saw it: the Ending and the reason. The Chat's Ending is read from that record, so there is no column to keep in step. While it has one the Judge is not asked again. Rollback deletes the record of a rewound Message (not counted in the rollback notice), and the Judge is asked again; Reset clears it; a Branch copies it and rolls back past its Message, so a Branch from before the Ending has reached none.
- **An Ending the Judge suggests.** Where the Story has no Ending that can be reached, the Chat allows it, the judged reply is at least the sixth a model wrote in the Chat and is not an Epilogue, the section asks one thing instead: add `"ending": {"reason", "suggest": "<name>"}` only when the latest exchange brings the whole story to a natural close, "most exchanges are not; when in doubt, leave it out". Before the sixth reply the prompt is exactly as it was. The name is put on one line, without quotes or a closing full stop, cut at 60 characters; a suggestion without one is dropped. It is recorded like any reaching, with no Ending behind it and its own name, so rollback, Reset and Branch treat it the same, and its Epilogue names it. It is the Chat's alone: shown on its row in the Chat list, never counted among the Story's Endings found.
- **"Not yet".** `DELETE /stories/:storyId/chats/:chatId/ending` takes a suggested Ending away and turns suggestions off for that Chat (a column on the Chat, on by default, copied by a Branch, turned on again by Reset). It is refused where the Chat has none to dismiss; the author's Ending can't be dismissed. "End the story" still works after it.
- **Removing an Ending** deletes its records everywhere: a Chat that reached it has then reached none, and can reach another. Editing one changes its words in the Chats that reached it.
- **The Narrator is never told the Endings.** Not their names and not their conditions, on any turn: an Ending is found by how the story is played, where a Scene is what steers it. Suggested replies, Write for me and the Diary are not told either.
- **The Epilogue is a turn.** `POST /stories/:storyId/chats/:chatId/epilogue`, gated, streamed and stored like a Continue: it waits for the last reply's background calls, so the Judge's word on that reply is in. In the prompt, an instruction stands where the continue instruction would: the story ends here; the Ending reached, by name, and what the author wants told, or that the user chose to end it; how things settle afterwards, open threads brought to rest, no new conflict or cliffhanger, about 150 to 300 words. The narration may say where the user's character ends up, only as it follows from what they already chose, with no line of speech and no new decision for them. The turn's final instruction is the Epilogue's own, and its Sudden event, Nudge and Cue lines are left out. It is given at least 900 tokens whatever the Story's reply length. The system message is the turn's, unchanged.
- **An Epilogue is an AI Message, marked.** The mark is a column on the Message, so Again writes every Reply version of it as an Epilogue, and a Branch carries it. It is judged and extracted from like any reply, read in Thai, read aloud and drawn the same. An Epilogue is refused right after one ("The story already has its epilogue. Use Again to write it anew, or play on."); after the story has gone on, another can be asked for. It is refused while a User Message waits for its reply, as a Continue is.
- **Ending the story oneself.** With no Ending reached, the same turn writes an Epilogue for an end of the user's choosing. It makes no record: only authored Endings are counted as found. If that Epilogue itself makes an authored Ending's condition happen, the Judge marks it reached, as from any reply.
- **The Chat.** The Chat response carries `ending` (id, name, reason, the Message it was reached with) or null, and each AI Message says whether it is an Epilogue. The Chat list carries each Chat's Ending by name, and `endings`: how many the Story has that can be reached, and the ones found in at least one of its Chats.
- **The screen.**
  - Under the Scene strip, a banner: "Ending reached", its name, the reason, and "Write the epilogue". A suggested one says "The story may have reached its end" and has "Not yet" beside the button. Once an Epilogue is written after it, the banner is one line, "Ending: <name>". Reaching one is said once to a screen reader.
  - An Epilogue shows "Epilogue" above its text, and is named so to a screen reader.
  - The Chat menu has "End the story", which asks first ("You can still play on after it") and then writes the Epilogue. It is off right after an Epilogue.
  - The Story's Chats page says "Endings found: n of m" with their names, when the Story has any, and a Chat that reached one says which.
  - The Story editor's Scenes tab has an "Endings" section after Sudden events, a card each.

## Testing Decisions

- API (`apps/api/test/endings.spec.ts`): the state read from records, the Judge's section and its unchanged prompt without it, loose reading, the apply rules and the Epilogue's wording, as pure logic; then through HTTP with the fake gateway: authoring (defaults, each field, the limit, Duplicate, removal), a Story without Endings, the section until an Ending is reached and its absence after, that no turn is told an Ending, the Chat list's count, Regenerate, an edit, Reset, Branch before and at the Ending, removing a reached Ending, the Epilogue's prompt and Message, its refusal twice in a row and while a Message waits, Regenerate of an Epilogue, the mark on a Branch, playing on, and the user's own ending. For suggestions: no section in the first five replies and an unasked answer dropped, the section and the suggestion at the sixth, the Chat list, a Branch and its Epilogue (which is not itself asked), "Not yet" and its refusal twice, no section after it nor in a Branch made after it, the user's own Epilogue still working, Reset turning them on again, Regenerate taking one back; and that a Story with its own Endings is never asked for a suggestion and its reached Ending can't be dismissed.
- Browser (`apps/web/e2e/endings.spec.ts`, phone size): the banner from reached to written, the Epilogue's label and prompt, playing on, the Chats page; "End the story" with Cancel and with the Epilogue, and Again on it; the editor's card: add, each field, reload, remove; and a suggested Ending waved away with "Not yet" in one Chat and closed with its Epilogue in another. The banner, the Epilogue, the Chats page and the confirm dialog were checked with axe in both themes by hand while building; that check is not in the spec file, since the axe package is not one of the project's dependencies.

## Out of Scope

- The AI suggesting an Ending in a Story that has Endings of its own, and a switch on the Story to turn suggestions off for all its Chats.
- A Chat reaching more than one Ending, and an Ending tied to a Scene, a Bond gate or a Sudden event's outcome.
- Closing a Chat: nothing stops play after an Ending or an Epilogue.
- An Ending card as a picture, and a collection page across Stories.
- Hiding unfound Endings from the author: the person playing is the person who wrote them.
- AI drafts, the Story assistant and Character cards writing or carrying Endings.
- The Ending in the Visual novel view (the Epilogue shows there as any reply does), on the Dashboard, in the wide-screen panel and in the Transcript.

## Further Notes

- Tried only with the fake gateway. Whether the Judge marks an Ending at the right moment, neither early nor never, and how well the play model writes an Epilogue, have not been seen with a real model. That matters most for suggestions: "a natural close" is a judgement, and a Judge too eager with it will show the banner where the story has only paused. "Not yet" is the way out, and the six-reply floor and the wording of the rule are the things to tune.

# Line repair (part of Natural speech)

Built 2026-11-16. The user, after the written-then-spoken examples cut the habit to about a quarter: "มันต้องดีมากกว่านี้สิเมย์" (it has to be much better than this). Every rule and example given to the model while it writes left the habit in place, in some form, on both play models; the history keeps teaching it.

## Decision

A reply is written as before; then, before it is kept, each speech line is checked in code for runs of sentences that open with the same words and for clauses in one sentence that do ("always reaching, always tugging, always breaking"). Only a line that has them is sent back, alone, to the play model, to be said the way that Character would actually say it out loud: the same meaning and facts, each thing said once, in their voice, about as long or shorter, spoken words only.

- The repair is asked to change as little as it can: reshape only the sentences that open the same way and keep the rest word for word; keep who says and does what ("I" stays the speaker, "you" stays the listener); add no names, nicknames or forms of address the line doesn't already use.
- The repair is taken only when it has fewer of the habit than the line it replaces, is not empty, is not much longer (at most a quarter more, plus a few words), still has some "I" and some "you" where the line had two or more of either, and brings in no term the Voice quotes (as in `Calls the user "traveller"`) that the line didn't use. Otherwise, or when the call fails or takes over 10 seconds, the line is kept as written. Nothing else in the reply is touched.
- Why the last two: the first measured run on Chat 2's 18 real lines repaired all 18, but put "traveller" into six lines Nara says to her husband (her Voice says she calls the user that "until they earn a name"), and turned "I had a whole speech ready… I was going to make you beg" into "You had a speech ready… You were supposed to beg".
- Repairs run in parallel, one call per flagged line, on the play model (`speech_repair`, unsampled). Lines are short, so each costs little.
- What is kept is the repaired reply: the screen shows it when the turn ends (a streamed reply's flagged lines change then), Read aloud and the Transcript read it, and the history of later turns holds fewer examples of the habit, so it stops teaching it.
- Every turn that writes a reply repairs it: a send, Continue, Regenerate, an edit's reply and an Epilogue. Suggested replies and Write for me are the user's own words and are never touched.

- What is not the habit, and is left alone: one thing said again for weight ("She's counting. Tavri, she's counting."), and starting over ("I can't—I can't breathe"), which Tavri's Voice asks for. A repair of the first read it as two people and changed who was in trouble; one of the second smoothed the stammer away.
- An opening stage direction ("*still not turning* ") is kept apart: only the spoken words are sent, and the direction stays in front of the repaired line. A line with a direction further in is left as written.
- Every repair leaves one API log line (2026-11-17), since only the repaired text is stored and nobody could tell what a repair changed (a stray "— —" on live could have come from the model or from the repair): `Chat <id>: Line repair kept {...}` with the speaker, the part's place in the reply, the line as written and the line kept; or `Line repair refused (<reason>) {...}` with the model's raw answer and the guard that refused it (empty, wrote another speaker's line, too long, no better, lost all "I", lost all "you", added a quoted Voice term), or timeout or error with the call's message. The texts are JSON-encoded so a newline can't split the line in journalctl, each cut at 600 characters. The Message isn't stored yet when the repair runs, so the line names the Chat only. The summary line ("repaired N of M…") stays.

## Measured (2026-11-16, DeepSeek V4 Pro, Chat 2's 101 real speech lines)

| Run | Lines sent | Repaired | Habit left | Read by eye |
|---|---|---|---|---|
| 1, no guards | 18 | 18 | 0 | "traveller" put into 6 lines to her husband; one line turned around; directions dropped |
| 2, guards | 18 | 15 | 5 | the bad ones refused; one emphasis line misread |
| 3, guards, spoken words only | 20 | 18 | 3 | meaning, who-did-what and directions kept in all 18; 2 refused for adding "traveller", kept as written |

About 2.5 s and $0.0006 a line. Run 3's last detector change (starting over) came after it; it only sends fewer lines.

## Testing

- API: the detector as pure logic on hand-picked lines, plain talk included; the repair's prompt and how its answer is taken or refused; through HTTP, a scripted reply with the habit is kept repaired, one without it makes no call, and a failed or worse repair keeps the line as written.
- With the real model: the detector run over Chat 2's own history, and each flagged line repaired, read by eye for meaning kept and voice kept.

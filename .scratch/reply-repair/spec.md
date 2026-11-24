# Spec: Reply repair, and the checks around it

Status: ready-for-agent
Builds on: [Spec: Prompt eval run](../prompt-evals/spec.md) (the scenes, the played Chat, the grader check, and what its first real runs found), [Line repair](../natural-speech/line-repair.md) (the one repair the app already makes, and its guards), [Spec: Story quality](../story-quality/spec.md) (a slip: something the Judge records for the next turn to read once), [Spec: Streaming replies](../streaming/spec.md), [the research on outside harnesses](../../docs/research/story-quality-eval-harnesses.md)

Agreed with the user on 2026-11-24, by interview. Nothing here is built.

## Problem Statement

The user asked for "our own harness" to make the Chat better, after the research found no outside one worth taking.

Two days of work gave the app a way to **measure** replies (the prompt eval run). Measuring found real faults, and two of them have nothing in the running app to stop them:

1. **A reply with no speech line.** In one real played Chat of six turns, every word a Character said was in quotation marks inside the narration, with no `@Name:` line. In the app such a reply is all Narrator: the Character has no picture, no colour, no Expression and no voice, and says nothing. The first reply set the shape and every later one copied it.
2. **A Character stuck on one demand.** In every Chat played, a Character closed reply after reply pressing the user to ask or say one thing, whatever the user's Message was about. A rule in the turn prompt cut it from about seven replies in ten to three; it did not end it.

Around those two, four things are missing:

- The check that measures the pressing is unsteady: the grader has to count replies and answers both ways on the same Chat.
- Nothing ties a prompt change to a measurement. A deploy is a row of commands typed by hand, and the eval is run only when someone remembers.
- The best evidence of a bad reply is thrown away: the user's own Regenerate. The replaced Reply versions are kept, and nothing reads them.
- Nobody can see how often the app repairs a reply, so nobody knows which play model slips most or which repair never fires.

## Solution

Two things, named apart. "Harness" is only the word used in talk; it is in no code and no document.

- **The prompt eval run** (built): measures, outside the app, when a prompt changes.
- **Reply repair** (new, as a family): what the app does to a reply at play time, after it is written and before it is kept. Line repair is its first member.

A reply found wanting is handled in one of three ways, by the kind of fault. The app never rewrites a whole reply by itself: the reply has already streamed to the screen, and Regenerate is the user's.

1. **Mended in code**, no model asked.
2. **One part sent back** to a model, as Line repair does.
3. **Left as written, and the next turn told**, as Repeated phrases and slips do.

Six pieces, each deployable alone, in this order:

1. **Speech-line repair** (way 1). A reply with no speech line, whose narration quotes someone speaking, has those quoted words moved onto speech lines, where code can tell who spoke.
2. **A deploy command** on the PC, which warns before deploying a prompt change no eval run has measured.
3. **A steady pressing check** in the eval: the grader says of each reply whether it presses; code counts.
4. **Pressing notes** (way 3). The Judge records that a Character pressed the user for something the user did not take up; the next turn reads it once and is told not to ask again.
5. **A play-signals report**: how often replies are replaced by Regenerate, by play model, and what the replaced ones had wrong that the kept ones did not.
6. **Repair counts** on the Usage page.

## User Stories

1. As the user who plays Stories, I want a Character's quoted words in the narration shown as that Character speaking, so that they keep their picture, colour, Expression and voice.
2. As the user, I want that mending done without another model call, so that it costs nothing and adds no wait.
3. As the user, I want the mended reply to be the one that is kept, so that Read aloud, the Transcript and later turns all see the Character speaking.
4. As the user, I want later replies to stop copying the quoted shape, so that one bad reply does not turn a whole Chat into narration.
5. As the user, I want a quote left as narration when nobody can tell who said it, so that words are never put in the wrong Character's mouth.
6. As the user, I want words my own character is quoted as saying never turned into a speech line, so that the app does not speak for me.
7. As the user, I want a Character who is sitting out never given a speech line by the repair, so that sitting out still means silent.
8. As the user, I want a reply that already has speech lines left alone, so that a quoted aside in an ordinary reply ("she'd once said 'never'") is not pulled out of it.
9. As the user, I want a streamed reply to change to its mended form when the turn ends, as it does for Line repair, so that what I see is what was kept.
10. As the user, I want Line repair to read the lines the speech-line repair recovered, so that a recovered line is held to the same standard as a written one.
11. As the user, I want a Character who asked me for something to stop asking once I have talked of something else, so that I steer the scene.
12. As the user, I want that Character to keep wanting it, and to show it in what they do, so that they do not go flat.
13. As the user, I want a Character still free to make advances unasked, so that the Story keeps its nerve.
14. As the user, I want the reminder to last one turn, so that a Character may come back to the matter later in the story.
15. As the user, I want Regenerate, Edit and choosing another Reply version to take a pressing note back with the reply it belongs to, so that the story's record matches what is shown.
16. As the user, I want none of this shown on the Chat screen, so that the story is not interrupted by the machinery.
17. As the user, I want to see on the Usage page how many replies were mended, by kind, so that I know the app is doing something and what.
18. As the user, I want prompt changes measured before they reach live, so that an update does not make my Chats worse.
19. As the user, I want my own Regenerates to count as evidence, so that the app improves on what I actually reject.
20. As the user, I want nothing from my Chats copied into the repository or sent anywhere new, so that my Stories stay mine.
21. As the app's developer, I want one command that deploys a commit to the VM, so that a deploy is not six commands typed from memory.
22. As the developer, I want that command to say when the commits going live change a prompt and no eval run measured that commit, so that an unmeasured prompt change is a choice and not an accident.
23. As the developer, I want to go ahead anyway with a flag, so that an urgent fix is never blocked by a run that needs credit and the user's go-ahead.
24. As the developer, I want the command to refuse uncommitted or unpushed work, so that live always runs a commit that exists on the remote.
25. As the developer, I want the command to end by saying which commit live runs and that health answers, so that I do not have to check by hand.
26. As the developer, I want the pressing check to give the same answer when asked again, so that a change in its score means a change in the replies.
27. As the developer, I want the grader asked one plain question a reply ("does this reply's close press the user for a thing their turn was not about?") and code to do the counting, so that the grader never counts.
28. As the developer, I want the grader check to hold labelled Chats for that check, reply by reply, so that its agreement with a reader is known before its score is believed.
29. As the developer, I want a played Chat scene whose Character has no asking catchphrase on their card, so that the eval separates what the prompt causes from what the card causes.
30. As the developer, I want an eval scene for the Judge's pressing note, so that I know the background model gives one when a Character pressed and none when they did not.
31. As the developer, I want every new check to have an answer it passes and an answer it must fail, so that no check is added that cannot fail.
32. As the developer, I want each repair to leave one log line with the reply before and after, so that a repair on live can be judged later.
33. As the developer, I want a report of how often replies are replaced by Regenerate, by play model and by week, so that I can see whether a deploy moved it.
34. As the developer, I want the report to run the code checks on replaced Reply versions and on the kept ones, so that I can see which faults the user rejects.
35. As the developer, I want the report to print counts and rates only, never a reply's words, so that it can be pasted into a spec.
36. As the developer, I want the report to read the database and change nothing, so that running it on live is safe.
37. As the developer, I want the repair counts split by play model, so that I can see which model needs which repair.
38. As the developer, I want a repair that was considered and refused counted apart from one that was made, so that an over-careful guard shows up.
39. As the developer, I want voice drift and pacing measured for several runs before any repair is built for them, so that nothing is added without evidence that it is needed.

## Implementation Decisions

### Shared rules

- **No whole-reply rewrite by the app.** Every repair is one of the three ways above.
- **A repair is taken only when it is safe**, and a refused repair leaves the reply as written. This is Line repair's rule, kept for every member.
- **Every repair leaves a log line** with the Chat, the kind, and the text before and after; a refused one says why. Only the mended reply is stored.
- **Nothing is shown in the Chat.** `CONTEXT.md` gets no new term: "Reply repair", "speech-line repair" and "pressing note" are developer words until something the user sees needs a name.
- **Order inside a turn:** parse the reply, drop an echoed user Message, speech-line repair, Line repair, store. The Judge then reads the stored reply, as now.

### 1. Speech-line repair

- **When it runs:** only on a reply that has no speech line at all once parsed, and whose narration holds at least one quotation of spoken words. A reply with even one speech line is never touched.
- **Who spoke, decided in code:**
  - one Character is present and not sitting out: every quotation is theirs, unless its sentence names the user's character as the speaker;
  - several are present: a quotation is a Character's only when its own sentence names exactly one of them as the speaker, by whole name or by one word of the name that only one Character has (the reply parser's existing rule for a speech line's name), with a verb of saying or with the name beside the quote;
  - anything else stays narration, as written.
- **What moves:** the quoted words become a speech line of that Character, without the quotation marks. The narration around the quote stays as narration, with the bare speech tag ("she said", "Mira said,") removed when nothing else is left of its clause; a clause that carries an action ("she said, turning the loaf over") keeps the action as narration.
- **Never a line for the user's character or for one sitting out.** A quotation the sentence gives to the user's character stays narration; the existing guard against writing the user is not weakened by it.
- **Not a quotation of speech:** a quoted title, a word in scare quotes, or words quoted as remembered or reported ("she'd once said…", "the sign read…"). The first version takes only quotations that end a sentence of their own or are joined to a verb of saying in the present scene; when in doubt it leaves the reply alone.
- **If nothing can be given to a Character,** the reply is kept as written, and the fault is left to way 3: the turn prompt's closing reminder already tells the next reply how speech is written.
- **A module of its own** beside the reply parser: a pure function from the parsed reply, the cast present and the worn identity's name to the mended parts and a record of what moved. No model, no database.

### 2. The deploy command

- **One command on the PC** deploys a ref (the default branch's head unless named) to the Oracle VM: it archives the commit, uploads it with the VM's deploy script, runs that script, and reports the commit live runs and the public health answer. The steps on the VM do not change.
- **It refuses** a working tree with uncommitted changes to tracked files, and a commit the remote does not have.
- **The warning.** It reads the commit live runs, lists the files changed between that and the ref, and if any is a prompt builder (the turn prompt, the Judge prompt, Memory extraction, Story so far, Line repair's prompt, and any later one: a list kept in the command) it looks under the eval reports for a run of that exact commit with a clean tree. With none, it stops and says which files changed and that no eval run measured them.
- **Going ahead anyway** takes a flag naming the choice. There is no prompt to answer: the command is often run by an agent.
- **It never starts an eval run.** A run spends credit and needs the user's go-ahead.
- The Windows `live:*` scripts for a PC live instance are left as they are.

### 3. A steady pressing check

- **A new kind of graded check on a played Chat: one verdict a reply.** The grader is shown each turn and its reply and answers one yes-or-no question about each reply, in one call, as a list with the words it judged on. Code turns the list into the check's result by a rule the scene gives.
- **The pressing check's question:** does this reply's close press the user's character to ask, say or decide a thing their turn was not about? **Its rule:** fail when three or more replies in a row do, or half the replies or more.
- **It replaces** "does not press the same demand" in the `evening` scene; the whole-Chat graded check stays as a kind, for "keeps the slow burn".
- **The grader check learns it:** a case for a per-reply check holds the Chat's replies and a label a reply. The two real Chats of 2026-11-23 and the four of 2026-11-24 are labelled by reading them, in the labels file outside the repository; written-in cases cover a pass, a plain fail and a fail in changing words.
- **A new played Chat** whose Character's card has no asking line among its example lines, with the same turns as `evening`.

### 4. Pressing notes

- **The Judge gives them, in the call it already makes:** one more field in its answer, sent in every judgement so its system message still never changes from call to call. An entry names a Character and, in a few words, what they pressed the user for. The Judge gives one only when the reply pressed for something the user's Message, just before it, had not been about.
- **A pressing note is a detail record of a new kind,** recorded against the reply that pressed, like a slip. So Regenerate, Edit and choosing another Reply version take it back with its reply, Reset clears it and a Branch copies it, with no code of their own. One migration adds the kind.
- **The next turn reads the notes of the newest AI Message only,** so a note is read once. They go in the closing user message's trailing blocks, with the slips: who asked for what, that the user spoke of something else, and that the Character does not ask again in this reply and lets it show in what they do.
- **At most two notes a reply,** each short (a Character's name and up to 80 characters). A note for a Character who is not in the Story, or for the user's character, is dropped.
- **The Story so far trigger reserves the line's room,** as it does for the repeats lines.
- **The rule added to the turn prompt on 2026-11-24 stays.** The note names the thing; the rule says what to do about it.

### 5. The play-signals report

- **A command that reads a database and prints a table.** It changes nothing.
- **What it counts,** by play model and by week: AI Messages written; those with at least one replaced Reply version; and, for replaced versions beside kept ones, the share that fail each code check a single reply can be given (no speech line, a line written as the user, a line by an unknown speaker, a stage direction inside a speech line, overused words a thousand, a phrase shared with the three replies before it).
- **The reply checks it needs live in the app's source,** beside the reply parser, since they read a parsed reply and the report must run from a built release on the VM. The eval run imports them from there; the checks that only an eval scene uses stay with the eval.
- **Only counts and rates are printed.** No reply's words, no Story or Chat title.
- **Whose data:** every account's, as one total, unless an account is named. On live that is the user and whoever they have let in; the report prints no name.
- **An edit of an AI Message** is counted only if the app keeps a trace of it; whether it does was not found during the interview and is the first thing this piece settles. Without one, the report says so in its own output.

### 6. Repair counts

- **A repair record:** one row for each repair made or refused, with its kind (speech lines, a line, a pressing note read), whether it was made, the play model, the Chat and the AI Message. One new table, one migration. A Line repair still records its model call as a usage record; the repair record is the count, not the cost.
- **The Usage page** gains a small table: for the period shown, each kind's repairs made and refused, by play model.
- A deleted Chat takes its repair records with it.

## Testing Decisions

- **A good test here** goes through an interface a user or the developer really uses, and asserts what comes out: the reply the API returns, the prompt the next call is sent, the lines a command prints. It never asserts on a private function or on how a repair is organised inside.
- **Three seams, two of them existing.**
  1. **The HTTP API with the scripted model gateway** (existing; prior art: the Natural speech turn tests, the Story quality tests, the Usage tests). Pieces 1, 4 and 6 are tested here: script a reply, send a Message, read the Chat, then script the next turn and read the prompt it was sent.
     - Piece 1: a quoted-only reply comes back with the Character's speech lines; one with a speech line is untouched; a quote nobody can be given stays narration; nothing is given to the user's character or to one sitting out; the next turn's history holds the mended reply; a streamed reply ends as the mended one.
     - Piece 4: a judgement with a note puts the line in the next turn's closing message and not in the one after; Regenerate removes it; a note for an unknown name is dropped; the Judge's request carries the new field every time.
     - Piece 6: the Usage answer counts a repair made and one refused, by kind and model.
  2. **The prompt eval run with a scripted `fetch`** (existing; prior art: `eval-run.spec.ts`, `eval-grade.spec.ts`). Piece 3 is tested here, written red first: the per-reply grader call, the rule that turns verdicts into a result, the grader-check cases, the new scene, and the Judge scene for a pressing note.
  3. **A command with its outside world handed in** (new, one shape for two commands). The deploy command and the play-signals report each take what they touch as arguments: for the deploy, the git reader, the remote runner and the folder of eval reports; for the report, a database connection. Prior art for the shape: the smoke run and the eval run, which take their `fetch`. The deploy is tested with a scripted git and a scripted remote: it refuses a dirty tree and an unpushed commit, warns on a prompt change with no report, goes ahead with the flag, does not warn when a report of that commit exists or no prompt file changed. The report is tested against a test database seeded through the API, the way the other database tests are.
- **Speech-line repair's cases come from real replies.** The six replies of the played Chat that had no speech line (in the eval reports outside the repository) are read once to write synthetic replies of the same shapes; no real reply is committed.
- **Nothing in the normal test run reaches a model.** A real run of the eval after pieces 3 and 4 needs the user's go-ahead, as always.

## Out of Scope

- A repair for voice drift, and one for pacing. Both are measured by scenes that exist; a repair is specified only if they fail again over several real runs.
- Anything new for Established facts or Repeated phrases at play time: both have their mechanism.
- Rewriting a whole reply automatically, or a second try the user did not ask for.
- A model asked to say who spoke a quotation. The first version is code only; a quote it cannot place stays narration.
- Sending real Reply versions to the grader. The report runs code checks only, until the grader has been checked against the user's own labels.
- Turning a real reply into a committed eval scene. Scenes stay synthetic.
- An outside eval harness, or a web page for eval results.
- Automatic prompt rewriting.
- Running the eval on a schedule or from the deploy command.
- Anything shown in the Chat about a repair.

## Further Notes

- **The user's part:** label the 45 replies in the label sheet once (about a quarter of an hour). Until then the grader's agreement rests on cases written by the same hand that wrote its instruction.
- **Why piece 3 comes before piece 4:** piece 4 changes the Judge prompt and the turn prompt, and its effect can only be read with a pressing check that answers the same way twice.
- **What the first real plays showed, for whoever builds this:** the pressing is partly the scene's own doing. "Ask me properly, then." is one of the test Character's example lines, and the model reaches for it as her catchphrase. The scene without such a line (piece 3) says how much is left when the card does not invite it.
- **Cost at play time:** pieces 1 and 6 add no model call. Piece 4 adds a field to a call already made, and a line of at most a few dozen tokens to the next turn, outside the cached part of the prompt.
- **Cost of measuring:** since ticket 03 a full eval run is about $0.31 at five samples and at most $0.70, over the $0.50 cap; three samples is the size to use. The per-reply check replaces the whole-Chat one in `evening` and adds no call there; the second evening (`unasked`) adds 22.
- **Each piece is one ticket,** blocked only as the order says: 4 by 3; 6 by 1. Pieces 2 and 5 are blocked by nothing.

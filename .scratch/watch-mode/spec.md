# Spec: Watch mode

Status: ready-for-agent

## Problem Statement

Sometimes the user wants to sit back and let the story play: the Characters talking among themselves, the Narrator moving the scene, while the user's Role stays quietly in the background. Today they can only press ▶ Continue once per reply, and must keep the phone awake and tap again after every reply.

## Solution

**Watch**, in the Chat menu. The user picks how many replies to watch (3, 5 or 10), sees roughly what that will cost, and starts. The API then writes that many Continues one after another, by itself: each an ordinary AI Message, streamed live to the screen while it is open, written to the end even when the phone sleeps, with one Push alert when it is over. A band over the composer shows "Watching · 2 of 5" and **Stop**. Typing a message and sending it stops Watch and sends the message as usual. Watch stops by itself when the story needs the user.

## Words

"Watch" in the UI, a verb the user does ("Watch the story", "Watching · 2 of 5", "Stop watching"). It is a way of playing, made of Continues, not a thing in the story, so it is not a CONTEXT.md term: CONTEXT.md's **Continue** already says what each reply is. The Narrator's instruction calls it the story "playing on by itself".

## User Stories

1. As a player, I want to let the story play on by itself for a few replies, so that I can watch the Characters talk to each other.
2. As a player, I want to choose how long it plays (3, 5 or 10 replies), so that I control how far it goes and what it costs.
3. As a player, I want to see what Watch will roughly cost before it starts, so that I don't run out of credit by surprise.
4. As a player, I want the Narrator never to speak or act for my Role while I watch, so that my Role stays mine.
5. As a player, I want to see each reply as it is written and how far Watch has got, so that it feels like watching a scene.
6. As a player, I want to stop it at any moment, so that I can step back in when something catches my interest.
7. As a player, I want typing and sending a message to stop Watch and send my message, so that I never have to stop it first.
8. As a player, I want Watch to keep going when my phone sleeps, and to be told when it is done, so that I can put the phone down.
9. As a player, I want Watch to stop by itself when the story needs me (an Ending, a Sudden event, a Roll offer) or can't go on (an error, no credit, the Monthly cap), and to be told why, so that nothing is decided without me.
10. As a player, I want each watched reply to be an ordinary reply, so that I can take it back, Regenerate it, and the Judge, Memory and Diary keep up with it as usual.

## Implementation Decisions

### Server-driven

Watch runs on the API, not in the browser. A turn already runs to the end without its request (`.scratch/resume-reply/spec.md`), so the API can write the next one as soon as the last settles, with no client at all. A client-driven Watch would stop whenever the phone slept, which is exactly when the user wants it to go on, and could send no alert when it finished.

The API runs as one process, so a Chat's Watch lives in memory beside the live turns and the turn lock (`apps/api/src/api/chat/watch-runs.ts`). An API restart forgets it, as it forgets a live turn: the replies written so far stay, and nothing more is written.

### One step

Each step is a **Continue** (`ChatManagerService.watchStep`): the same gate (playable, text credit, the Monthly cap, the turn lock, the previous reply's background calls settled), the same turn, an ordinary AI Message stored at its end, the same Judge, Memory extraction, Story so far and auto Diary after it. It is a Regenerate-able, editable, branchable Message like any other.

Two things differ from a Continue the user taps:

- **The Narrator's instruction.** In place of the continue instruction, the watch instruction: the Role stays in the background this turn, present but quiet, doing nothing new; the Characters talk with one another and act on their own aims; the Narrator moves the scene forward; nobody waits on the Role for an answer; nothing the Role says, thinks, feels, decides or does is written; end on a natural beat. The usual guards stay: the stop strings on the Role's name, and the parser cut at a line written as the Role. The standing rule that all Characters are adults stays in every prompt. A Regenerate of a watched reply writes it as a plain Continue (the Message does not remember it was watched); the two instructions differ only in where the reply stops.
- **No reply alert per step.** The one alert comes when Watch ends.

Between steps Watch waits for the reply's Judge and Memory extraction to finish (not the Story so far or the Diary, which play never waits on), then reads the Chat to see whether to go on.

### Stopping

Watch ends, and says why (`ended.reason`):

| reason | when | alert |
|---|---|---|
| `finished` | all the replies asked for are written | yes |
| `stopped` | the user tapped Stop, or did anything else that writes a turn (see below). The step being written is stopped as ■ Stop stops a turn: nothing of it is stored | no |
| `ending` | the reply just written reached an Ending | yes |
| `sudden_event` | a Sudden event is under way after the reply (the Judge began one): its Gauge moves by how the user plays, so the user must play it | yes |
| `event_proposal` | the story proposes a Sudden event of its own: the user starts or declines it | yes |
| `roll_offer` | the Judge offers the user a Roll | yes |
| `failed` | a step failed: the play model's error, a background call that failed twice, a turn already under way | yes |
| `credit` | text credit is out | yes |
| `cap` | the user's Monthly cap is reached | yes |

`failed`, `credit` and `cap` carry the API error's message (`ended.message`), so the screen says it in the usual words.

**Anything else that writes a turn stops Watch first.** A send, Retry, Continue, Epilogue, a Message edit, a Regenerate, choosing a Reply version, Reset and deleting the Chat each stop the Chat's Watch (waiting for its step to unwind) before they run. So a message sent while Watch writes stops Watch and is then sent as usual, even from an old client.

### Starting

Refused, with nothing written, when:
- Watch already runs in this Chat: `409.004.160 WatchRunningError`;
- a Sudden event is under way: `409.004.161 WatchNeedsYouError` ("A Sudden event is under way. Play it yourself, then watch.");
- a User Message awaits its reply (`409.004.013`), the Story isn't playable (`422.004.002`), text credit is out, the Monthly cap is reached, or a turn is being written (`409.004.004`): the same errors a Continue gives.

A pending Roll offer, a proposed Sudden event, or an Ending already reached does not stop a start: watching is the user's answer to them (the offer and the proposal lapse with the next reply, as they do after a Continue). Only new ones that come up while watching stop Watch.

### API

- `POST /stories/:storyId/chats/:chatId/watch` with `{ replies: 1..10 }` → `201` with the Watch. Validation: an integer from 1 to 10 (`400.000.000`). The UI offers 3, 5 and 10.
- `GET /stories/:storyId/chats/:chatId/watch` →
  - JSON: `{ watch: Watch | null, perReplyUsd: number | null }`.
  - With `Accept: text/event-stream`: server-sent events while the Watch runs: `watch` with the Watch now and on each change; `parts` with the reply so far while a step is written (the same shape as a turn's `parts`); the stream ends after the `watch` event that shows it ended. With no Watch, or one that has ended, one `watch` event and the end. A `: ping` comment every 15 s, as on a turn stream. Closing it changes nothing.
- `DELETE /stories/:storyId/chats/:chatId/watch` → `204` once the Watch has stopped and its step has unwound (the Chat read next is settled), and the Watch is forgotten. With none, `204` too.

A **Watch** is `{ id, replies, done, status: 'running' | 'ended', ended: { reason, message } | null, startedAt }`. An ended Watch is kept until the next Watch, a DELETE, or 10 minutes, so a phone that slept through it still learns how it ended.

**`perReplyUsd`**, the cost estimate: what this Chat's replies cost, from the Cost view (`.scratch/cost-view/spec.md`): the mean cost of its last 5 replies that have any recorded cost (the turn and the calls it caused). Null in a Chat with none yet. The sheet shows `about $0.0123 a reply · about $0.06 for 5`, with the Cost view's format. It is read whether or not "Show cost per reply" is on: it is shown before the user spends, which is the point.

Each step is also a live turn (`LiveTurns`), under id `watch-<watchId>-<n>`, so it is stopped by the same path as ■ Stop and could be followed by `GET …/turns/:turnId`.

### Push alert

When Watch ends for any reason but `stopped`, one alert to the Account's devices (`PushAlertsManagerService.watchEnded`): `"Watch done · <Chat title>"` for `finished`, `"Watch stopped: the story needs you · <Chat title>"` for the reasons that need the user, `"Watch stopped · <Chat title>"` for the rest. The same tag, url, TTL and rules as a reply alert (no story text; a visible app shows nothing).

### Account

Watch starts inside the request that started it, so every step runs as that Account (`requestScope`): its usage records, Monthly cap and alerts are that Account's.

### Errors

| Code | Error |
|---|---|
| `409.004.160` | `WatchRunningError`: a Watch start while one runs in the Chat. |
| `409.004.161` | `WatchNeedsYouError`: a Watch start while a Sudden event is under way. |

### Web

- **Chat menu**, under "This Chat", above "End the story": **Watch the story** — "The Characters play on while you watch". Disabled while blocked, while a User Message awaits its reply or a turn is written. It opens the **Watch sheet**: a one-line explanation (your Role stays in the background), three choices **3 · 5 · 10 replies** as a radio group (5 chosen), the cost line, and **Start watching**. An error from the start shows in the sheet.
- **While watching**, a band over the composer's tool row: an eye, **Watching · 2 of 5**, and **Stop**. The reply being written streams into the thread with the writing indicator, as any reply. The composer box stays writable. Send stops Watch (the API answer waits for the step to unwind) and then sends the message as usual. ▶ Continue, Suggest, Write for me, the Cue, the Roll, ↺ Again, edits and the menu's writes wait while Watch runs.
- **When it ends**, the band says why for anything but the user's Stop and Send: "Watched 5 replies.", "Watch stopped: the story reached an Ending.", "…: a Sudden event began.", "…: the story proposes an event.", "…: you're offered a Roll.", "…: <the error's message>". Its ✕ closes it (and DELETEs the ended Watch, so it doesn't come back).
- **Following.** The screen opens the event stream when Watch starts, and on load when a Watch is running or ended. Each `watch` event that says a reply was added re-reads the Chat (its new Message, Bonds, Memory toasts as usual). When the stream breaks (offline, the page hidden and shown again), it opens again, as a turn is resumed. The Chat screen announces "Watching started", each reply as a reply is ("Reply from Nara."), and how it ended.
- Phone widths 360 and 320: the band is one row, the label truncates before Stop does.

## Testing Decisions

- **API** (`apps/api/test/watch-mode.spec.ts`, the real Nest app and database, the fake gateway):
  - Watching 3 writes three AI Messages, each a turn call with the watch instruction (not the continue instruction) and the Role's stop strings; the Judge and Memory ran for each; one turn at a time; the Watch ends `finished` with `done: 3`.
  - The event stream: a `watch` event at once, `parts` while a step is written, `watch` events as `done` grows, the stream ends on the ended Watch.
  - DELETE mid-step: nothing of that step is stored, the replies before it stay, the lock is free, GET then answers `watch: null`.
  - A send while watching stops it and is answered as usual.
  - Stops by itself: an Ending reached (author's Ending), a Roll offer, a Sudden event begun, a failed step (provider outage, `failed` with the message), text credit out (`credit`).
  - Refused: a second start (`409.004.160`), a start while a User Message awaits (`409.004.013`), while a Sudden event is under way (`409.004.161`), replies 0 or 11 (`400.000.000`).
  - `perReplyUsd`: null in a fresh Chat; the mean of the last replies' recorded costs.
  - Alerts: one alert when Watch finishes (none per step), none on a Stop.
  - The prompt: the watch instruction names the Role and forbids writing for it.
- **e2e** (`apps/web/e2e/watch-mode.spec.ts`, 390px, then 360px and 320px): open the menu, Watch the story, see the cost line, choose 3, start; the band counts up and the three replies show; Stop mid-reply leaves the replies before it and no more; sending a message while watching stops it and the message gets its reply; the band and the sheet fit at 360 and 320 with no sideways scroll. Every Story it makes is deleted.

### Real-model check (later, by hand)

On the live play model, in a Story with two or more Characters: Watch 5. Read each reply for (1) any line, thought or action written for the Role, (2) Characters asking the Role a question and waiting, (3) a reply that only describes and never lets the Characters talk. If (1) or (2) shows, tune `watchInstruction` in `apps/api/src/manager/chat/turn/prompt.ts`. Not run here: it spends real credit.

## Out of Scope

- Watching for more than 10 replies, or until something happens.
- A Watch that survives an API restart.
- Speed control or a pause between replies.
- Watch in the Visual novel view's own controls (it shows the replies as any, but starts only from the Chat menu).
- A Cue or Nudge for the watched replies.

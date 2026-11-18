# Spec: A reply survives the phone sleeping

Status: ready-for-agent

## Problem Statement

The user plays on a phone. When the screen turns off, the app goes to the background, or the connection drops while a reply streams, the reply is lost: the API reads the closed request as Stop, aborts the model call and stores nothing. The user comes back to their line with Retry and pays for a second generation. The streaming spec left this out of scope ("Resuming a stream after the phone sleeps or the connection drops. That reply simply fails, with Retry.").

## Solution

A turn no longer depends on its request. The API writes the reply to the end, stores it and starts the background calls, whatever happens to the client. Stop becomes its own request. The client gives each turn an id; when the stream breaks, when the page becomes visible again or when the connection comes back, it asks the API for that turn again and picks it up: the reply so far, then the rest live, or the finished answer. Nothing is generated twice.

## User Stories

1. As a player, I want a reply that was streaming when my phone slept to be there when I wake it, so that I don't lose it or pay for it twice.
2. As a player, I want a reply still being written when I come back to show the text so far and carry on live, so that it feels as if I never left.
3. As a player, when my connection drops mid-reply and comes back, I want the reply picked up again by itself, so that I don't have to tap anything.
4. As a player, I want ■ Stop to still end a reply at once and keep nothing, so that Stop means what it did.
5. As a player, I want a reply that failed while I was away to show its error and Retry when I come back, as if I had watched it fail.
6. As a player, after a resumed reply, I want the composer, ↺ Again, Retry and the action row exactly as after any finished reply.
7. As a player, I never want two replies or two copies of my line after a resume.

## Implementation Decisions

- **The turn is not the request.** A streamed turn's request closing no longer aborts it. The turn writes on, stores its reply and starts the background calls under the turn lock, as a turn with a client does. (Before: `answerTurn` aborted the turn's signal on `close`.) A JSON turn already ran to the end.
- **Turn id.** The client sends `X-Turn-Id` (1–64 letters, digits, `-` or `_`) with every streamed turn. The API makes one up when it is missing. The id names one turn.
- **Live turns.** The API keeps each streamed turn in memory, by id, from the moment its request arrives: the Chat it belongs to, the reply so far (the last `parts`), and once it ends, how it ended (`done` with the body the turn answered, `error` with its error body, or `stopped`). An ended turn is kept 10 minutes, or until the Chat's next streamed turn starts, whichever is first. The API runs as one process, like the turn lock, so memory is enough. A restart forgets them, as it forgets the turn lock.
- **The same id twice.** A turn request whose id is already known does not run a turn. It is answered as a resume of that turn. So a request the client re-sends never starts a second generation.
- **Resume:** `GET /stories/:storyId/chats/:chatId/turns/:turnId` with `Accept: text/event-stream`.
  - A known turn of this Chat answers server-sent events: `parts` at once with the reply so far (when there is any), then each new `parts` as it is written, then `done` with the turn's body, `error` with its error, or `stopped`. An ended turn answers its last `parts` and its end at once.
  - An unknown turn (never arrived, older than 10 minutes, another Chat's, or the API restarted) answers `204`. The client then reads the Chat as stored.
- **Stop:** `POST /stories/:storyId/chats/:chatId/turns/:turnId/stop` aborts the turn exactly as closing the request did before: nothing new is stored, a sent User Message stays awaiting Retry, a Regenerate keeps the reply it had, what the provider billed is recorded in Usage, the lock is let go. It answers `204` once the turn has unwound, so the Chat the client reads next is settled. A Stop for a turn that already ended, or an unknown one, changes nothing and answers `204` too. A Stop that arrives while the turn still waits in its gate stops it there, with nothing stored.
- **Events.** A new event, `stopped` (`{}`), tells any stream still open that the turn was stopped. A streamed answer also sends a `: ping` comment every 15 s, so a client can tell a live stream that is waiting for the model from a dead connection.
- **Client: when to resume.** The turn call (`lib/chat.ts` → `lib/turn-stream.ts`) resumes, by itself, when:
  - the stream breaks before `done`, `error` or `stopped` (a network error, or the body ends);
  - the turn request itself fails to reach the API (it may have arrived; the resume tells);
  - the page becomes visible again after being hidden (the old connection may be dead without saying so);
  - the browser goes `offline` (the attempt is dropped at once) and later `online`;
  - no byte arrives for 40 s on an open stream.
  Before each attempt it waits until the page is visible and the browser is online. It gives up after 5 failed attempts in a row (1 s, 2 s, 4 s… apart) and fails as today: a stream that had begun becomes "The reply was cut off", one that never began becomes "can't reach the API".
- **Client: what a resume shows.** The `parts` it gets replace the reply so far, so the thread shows the text so far and then grows. `done` settles the turn exactly as a turn that never broke: the composer, ↺ Again, Retry, the nudge, the Cue, the announcement and Auto-read all behave as after any reply. `error` shows the error and re-reads the Chat, as a failed turn does. A `204` re-reads the Chat: when the User Message is stored and awaits a reply it shows with Retry; when it is not, its text goes back into the composer.
- **Client: Stop.** ■ Stop drops the stream, sends the Stop request and waits for it, then re-reads the Chat as before. If the Stop cannot reach the API (offline), the reply may still be written; the next read of the Chat shows it.
- **Old clients.** A cached client from before this change stops by closing the request; after this change that no longer stops the reply. It is written and stored. The next load of the app has the new client.
- **The service worker** passes API calls to the network as before; it needs no change.

## Testing Decisions

- External behaviour at the existing seams: API tests through HTTP with the fake gateway, and Playwright with the fake gateway.
- **API tests** (`apps/api/test/resume-reply.spec.ts`, and the Stop tests of `streaming.spec.ts` moved to the Stop request):
  - Closing a streamed turn's request mid-reply: the reply is still stored once, the background calls run, one turn call was made.
  - Resume while the reply is written: `parts` at once with the reply so far, more `parts`, `done` with the same body; the last `parts` equals the stored reply.
  - Resume after the turn ended: `done` at once. After a failed turn: `error`. After a Stop: `stopped`.
  - An unknown id, or another Chat's, answers 204.
  - The same id sent twice runs one turn: the second request is answered as a resume.
  - Stop through its request: nothing stored, User Message awaiting Retry, lock let go; Stop in the gate stores no User Message; Stop on a Regenerate keeps the reply.
- **Playwright** (`apps/web/e2e/resume-reply.spec.ts`, 390 px):
  - Going offline mid-reply, then online after the reply finished: the finished reply shows, once, with ↺ Again, the composer free, one turn call.
  - Going offline mid-reply, then online while it is still written: the text so far shows, then grows to the end.
  - Hidden then visible mid-reply: the turn is picked up again, the finished reply shows once.
  - Stop still leaves the line with Retry and no reply.
- **Manual:** on the phone, send, turn the screen off for 20 s mid-reply, turn it on: the reply is there. Same with flight mode on and off.

## Out of Scope

- Resuming after the API restarts mid-turn. The reply is lost, as it is today.
- Resuming in another tab or device. A resume needs the turn id the client made.
- Push notifications when a reply finishes in the background.

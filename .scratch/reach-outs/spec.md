# Spec: Characters message first (Reach-outs)

Status: ready-for-agent
Builds on: [Reply alerts](../push-alerts/spec.md) (the Web Push that carries it), [Character minds](../character-minds/spec.md) (the Thought a Reach-out reads, and the shape of its call), [Diary](../diary/spec.md) (the inner-life line), [Growing cards](../growing-cards/spec.md) (the Now note), [Bond axes](../bond-axes/spec.md) (who speaks), [Swipe](../swipe/spec.md) (Regenerate and Reply versions), [Accounts](../accounts/spec.md) (the Monthly cap and the Account work runs as)

Built 2026-11-18, from master b4c5282.

## Problem Statement

A Chat only moves when the user opens it and writes. The Characters never seem to have a life of their own between visits: when the user comes back after a day, the story is exactly where they left it, and nobody in it noticed they were gone.

## Solution

A per-Chat choice in the Chat menu, **"Characters message first"**: Off (the default), or after 6, 12 or 24 hours away. When it is on and the user has been away from the Chat that long, one Character in it sends the user a short in-character message of their own: a **Reach-out**. It is grounded in where the story stands (the latest Messages, the Story so far, that Character's newest Diary feeling line, their latest Thought, their Now note and their Bond with the user). It arrives as an ordinary AI Message at the end of the Chat, so the story carries on from it, and as a Web Push alert on every device the Account turned alerts on for, such as "Nara: The stall's closed. I keep thinking about last night." Tapping the alert opens the Chat.

## User Stories

1. As a player, I want a Character to message me when I have been away a while, so that the story feels alive between visits.
2. As a player, I want to turn it on for one Chat and choose how long away is "a while", so that only the Chats I care about do it, as often as I like.
3. As a player, I want it off unless I turn it on, so that nothing is spent or sent that I didn't ask for.
4. As a player, I want at most one message per absence, so that I am never flooded while I'm gone.
5. As a player, I want no message at night, so that my phone stays quiet while I sleep.
6. As a player, I want the Character who feels most for me to be the one who writes, so that it is the message I'd expect.
7. As a player, I want the message to be about where our story is now, in their voice, so that it reads as them and not as an app notification.
8. As a player, I want it in the Chat as a real Message I can answer, Regenerate or take back, so that the story simply carries on from it.
9. As a player, I want the alert to show who wrote and what they said, and to open the Chat on a tap, so that I can answer at once.
10. As a player, I want no message in a Chat whose story has ended, or while a reply is being written, so that it never breaks a moment.
11. As the Owner, I want it to cost very little and count against a Member's Monthly cap, so that a Member who is out of budget isn't messaged on my credit.

## Words

**Reach-out** (CONTEXT.md): a short message one Character sends the user on their own, in a Chat whose "Characters message first" is on, after the user has been away from it for the time chosen. It is an AI Message like any other, so the story carries on from it; at most one is sent per absence. The UI says "messaged you" ("Nara messaged you while you were away"). _Avoid_: Ping, notification, nudge (a Nudge is the user asking a Character to speak).

## Implementation Decisions

### The setting

- **Per Chat**, in a table of its own, `chat_reach_out`: `chat_id` (primary key, `ON DELETE CASCADE`), `after_hours` (6, 12 or 24), `set_at`, and the claim columns below. A row means on; no row means off (the default).
- **Reset keeps it** (it is the Chat's own, like Read replies aloud). **A Branch starts with it off**: a Branch is a new playthrough, and two copies of one story both messaging the user would be noise.
- `GET /api/stories/:storyId/chats/:chatId/reach-out` → `{ afterHours: 6 | 12 | 24 | null }`; `PUT` with the same body sets it (null turns it off), answering the same. Another value is a validation error (`400.000.000`). Unknown Story or Chat: the usual `404.003.001` / `404.004.001`.
- **Turning it on starts the wait from then**: the time away is counted from the latest of the newest Message, the Chat's last play, and the moment the setting was changed. Turning it on in a Chat left three days ago does not message at once.

### When a Reach-out is sent

A Chat gets one when **all** of these hold:

1. Its "Characters message first" is on.
2. **Away long enough**: now is at least `after_hours` after the latest of the Chat's newest Message, its last play (`last_played_at`) and `set_at`.
3. **Not in quiet hours**: 22:00 to 08:00 in the user's time zone, **Asia/Bangkok** (one fixed zone for this Storytell; the API has no per-Account zone yet). A Reach-out that comes due at night goes at the first tick after 08:00.
4. **At most one per absence**: the user has written at least one Message in the Chat, and there is no Reach-out after their newest Message. So none is sent again until the user sends something. Continue, Regenerate or a Reach-out's own Regenerate do not count as sending.
5. **The Chat is waiting for the user**: its newest Message is an AI Message (not a User Message whose reply failed), and no turn is running in it (the same turn lock as a send: a send that starts while a Reach-out is written is refused with `409.004.004`, as for any turn).
6. **The newest reply's background calls are done**: the Judge and Memory extraction are neither pending nor failed (the same check as a send). A Chat whose last call failed waits for the user's Retry.
7. **The story is still going**: the Chat has reached no Ending, and its newest AI Message is not the Epilogue.
8. **It can be paid for**: the Story is playable, text credit is not used up, the Account is active (not disabled or removed), and a Member is under their Monthly cap. A Chat that fails any of these is skipped and tried again on a later tick.
9. **Someone can speak**: at least one Character is not sitting out.

### Never twice: the claim

- **The claim** (`claimed_for`, `claimed_at`, `attempts` on `chat_reach_out`): before the call, one conditional `UPDATE` claims the absence, named by the id of the user's newest Message. It succeeds only when that absence was never claimed, or when its one earlier attempt failed more than an hour ago (`attempts < 2`). So:
  - two ticks, or two API processes, can never both write one;
  - a restart in the middle of a call loses that attempt and never doubles it; the second attempt comes an hour later;
  - a call that fails (outage, refusal, unreadable answer) is tried at most twice per absence, so a stubborn refusal can't spend all night.
- **A stored Reach-out** is the other half: rule 4 sees it, so nothing more is sent for that absence however the claim reads.

### Who speaks

The Characters not sitting out, ranked by how warmly they feel toward the user: the sum of Trust, Affection and Desire on their current Bond toward the user (a Bond without levels counts 0; no Bond ranks below any Bond). On a tie, the one who spoke most recently in the Chat; then cast order. So with no Bonds at all, it is the last Character who spoke.

### What it is

- **One background-model call**, call kind **`reach_out`**, on the background model (DeepSeek V4 Flash, the Judge's model), through the Model Gateway: so it takes the host chain and the host-skipping when a host's balance reads at or below zero, like every text call, and its spend shows on the Usage page as "Characters messaging first". At most 160 tokens out.
- **The prompt** (`apps/api/src/manager/chat/reach-out/reach-out.ts`), shaped like a Thought's: a system message about the story (Setting, the Character's Personality, Voice and Background, their Now note, their Bonds, their newest Diary inner-life line, their latest Thought, the user's worn identity), then the Story so far and the latest Messages (as much as about 2,000 tokens holds, newest kept), and the ask: the user has been away for a while; as the Character, reach out to them on your own: one short sentence of narration saying how your words reach them, as fits the Setting (a knock, a note slipped under the door, a message on their phone), then `@Name:` and one to three sentences, under about 50 words, in your voice, about where things stand between you now. Never speak or act for the user, never decide what they do, never a sexual act. **Everyone in the story is an adult.** Secrets and Arc directions are not given (a Reach-out is read by the user before any reply, like a Thought).
- **Reading the answer** (`readReachOut`): parsed as a reply (`parseReply`, the same cast, sitting-out and user-line guards); only narration and that Character's own lines are kept; at most two narration parts and one speech part. No line of theirs: the attempt failed (logged), nothing is stored.
- **Stored as an AI Message** at the end of the Chat, marked `reach_out = true`, with the model that wrote it. Its usage record is tied to it, so it shows its cost like any reply (`.scratch/cost-view/spec.md`).
- **No Judge and no Memory extraction run on it** (both statuses null, as on the Opening): it is one short line, and the user's answer is what moves the story. The next turn's Judge and extraction read it as the story before the exchange they judge. It changes no Bond, Memory, Scene or detail by itself.
- **The Narrator reads it next turn** as the reply before the user's Message, in the history like any AI Message: its narration sentence says time passed and how the words came, so no extra prompt rule is needed and `prompt.ts` is not touched.
- **Like any AI Message**: the user can Regenerate it (the same Character writes a Reach-out again, kept as a Reply version, with no new push), edit it, read it aloud, take a Snapshot of it, make a Thai reading, or take it back by editing their earlier Message or choosing another Reply version. A Branch from it copies it as a Reach-out. The Chat list's latest line shows it.
- Its response carries `reachOut: true`; the thread shows a small line above it, "<Name> messaged you while you were away".
- `last_played_at` is not touched by a Reach-out: the user didn't play.

### The alert

- When the Reach-out is stored, `PushAlertsManagerService.reachOut` sends to every device of the Story's Account that turned alerts on (`.scratch/push-alerts/spec.md`), unless alerts are off on the server. Body: `"<Name>: <their line>"`, cut to 120 characters, `url` the Chat, `tag` `chat-<id>`. The service worker shows nothing while a window of the app is visible, and a tap opens the Chat, as for a reply.
- **Unlike a reply alert, it carries a line of the story** on the lock screen. That is the point of it, and the user turns it on per Chat; the spec of Reply alerts keeps its "no story text" rule for its own alerts.

### The scheduler

- **`ReachOutSchedulerService`** inside the API process (one process on live): a `setInterval` every **`REACH_OUT_TICK_MS`** (default 300,000, five minutes; `0` turns the scheduler off). Tests and e2e drive ticks themselves (below), and the test app leaves it off.
- **A tick**: one SQL query finds the Chats whose setting is on, whose Account is active and whose time away is up (rule 2), oldest first, at most 20. Each runs in turn, **as the Story's Account** (`requestScope.run`), through `ChatManagerService.reachOut`, which checks every rule above inside the turn lock and claims before calling. A failure is logged and never stops the tick. A tick never overlaps the previous one.
- **Survives restarts**: nothing it needs is in memory. The setting, the claim and the stored Reach-out are all in the database, so a restart only delays the next tick.
- **Testing route** (fake model gateway only, like the gateway's): `POST /api/testing/reach-outs/tick` with `{ now?: ISO time }` runs one tick as if it were then, answering `{ sent: [{ chatId, messageId }] }`.

### Web

- **Chat menu**: an item "Characters message first", with "Off" or "After 12 hours" under it, opens a panel of four choices (Off, After 6 hours, After 12 hours, After 24 hours), as radio buttons. The panel says quiet hours are 22:00 to 08:00 and that it shows as an alert when alerts are on for the device.
- **Thread**: a Reach-out has a small line above it, "<Name> messaged you while you were away".
- **Usage page**: `reach_out` reads "Characters messaging first".

## Error codes

None new. A bad `afterHours` is a validation error (`400.000.000`).

## Testing Decisions

- **API, pure** (`apps/api/test/reach-outs-pure.spec.ts`): quiet hours at the edges in Asia/Bangkok; who speaks (warmth, ties, sitting out, no Bonds); the prompt carries the Now note, inner-life line, Thought, Bond and Story so far, says everyone is an adult, and leaves out Secrets and Arc directions; reading the answer (kept parts, other speakers dropped, nothing of theirs fails).
- **API, HTTP** (`apps/api/test/reach-outs.spec.ts`, real Nest app and database, fake gateway, fake push sender): the setting's GET/PUT and validation; a tick sends one, stored with `reachOut`, its cost and a push with the line; never twice for one absence, again after the user sends; not before the time is up, not at night, not with the setting off, not while awaiting a reply, not after an Ending or Epilogue, not over a Member's cap, not for a disabled Account; the claim stops a second process; a failed call is tried once more an hour later and then no more; Regenerate writes a Reach-out again; the next turn's prompt holds it; Branch copies the flag and not the setting.
- **e2e** (`apps/web/e2e/reach-outs.spec.ts`, phone widths 360 and 320): turning it on in the Chat menu, a tick on the testing route, the Reach-out in the thread with its line, the push recorded by the fake sender, no horizontal scroll. Every Story it makes is deleted.

## Real-model check, for later

Not run (no real credit spent while building). On a copy of the user's Chat 2 on dev, with the real gateway: turn it on at 6 hours, move `last_played_at` back seven hours in SQL, `POST` a tick (or wait five minutes with `REACH_OUT_TICK_MS`), and read the Reach-out: does it open with one narration sentence that fits the Setting, keep to under 50 words, sound like that Character, and pick up where the story stood? Then answer it and check that the next reply carries on from it. Expected cost about $0.0005 per Reach-out on V4 Flash.

## Out of Scope

- A per-Account time zone or quiet hours of the user's own.
- More than one Reach-out per absence, or several Characters writing.
- A Reach-out the Judge or Memory extraction reads on its own.
- Choosing the Character who writes.

## Further Notes

- Live: nothing to set up beyond deploying; the scheduler runs by itself every five minutes. The alert needs Reply alerts' VAPID keys, which live already has. To turn the scheduler off on live, `REACH_OUT_TICK_MS=0` in `/etc/storytell/api.env`.

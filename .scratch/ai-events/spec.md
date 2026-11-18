# Spec: Sudden events the story makes up

Status: ready-for-agent
Builds on: [Spec: Sudden events](../sudden-events/spec.md) (the Gauge, the steps, the Judge's section, the Narrator's block, the banner), [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the Background judge, the change ledger), [Spec: Branch](../branch/spec.md)
Prior art: zeta's Quests (docs/research/zeta-how-a-story-runs.md, section 3): the creator preloads some, then the AI adds new ones as the story goes.

Built 2026-11-18. The Sudden events spec left "The AI inventing events (zeta's Quests)" out of scope; the user asked for it on 2026-11-18.

## Problem Statement

Only the author writes Sudden events. A Story with none never has a moment where something is at stake, and one with a few uses them up early: each runs once per Chat. A long Chat drifts into stretches where nothing can be won or lost, even when the story itself walks into a confrontation, a chase or a test that would make a good one.

## Solution

An author switch per Story, **"Let the story make up events"**. With it on, the Judge, in the call it already makes, may **propose** a new Sudden event that fits the moment: a name, a trigger (what is happening now), a Gauge and its direction, the number of replies, and what follows a success and a failure, shaped like an authored event.

The Chat shows the proposal under the Scene strip, where the event banner goes, with **Start it** and **Not now**. Nothing starts until the user taps Start it: the event then begins at once and runs exactly like an authored one (the banner, the Gauge, the Narrator's block, the outcome). It belongs to that Chat only: the Story's list never shows it, Duplicate never copies it, another Chat never sees it.

Proposals stay rare: a few per Chat, far apart, never while an event is under way, and never in an intimate moment.

## User Stories

1. As an author, I want one switch that lets the story make up its own Sudden events, so that a Story I wrote none for still has moments at stake.
2. As an author, I want the switch off by default, so that my existing Stories play exactly as they did.
3. As a player, I want to see what the story proposes before it starts — what it is, what is measured, the goal and the replies I get — so that I choose whether to be tested now.
4. As a player, I want to decline a proposal with one tap, so that a moment I want to play freely stays free.
5. As a player, I want an accepted event to run exactly like an authored one, so that I learn one mechanism, not two.
6. As a player, I want proposals to be rare, never on top of a running event, and never in the middle of an intimate moment, so that the game layer never interrupts the story I came for.
7. As a player, I want a proposal I ignored to go away when I play on, so that it never waits over a moment it no longer fits.
8. As a player, I want Again, an edit, Reset and Branch to treat a proposal and the event it became like everything else the story changed.
9. As an author, I want events the story made up in one Chat to stay in that Chat, so that my Story's own list stays mine.
10. As the owner, I want it to cost no extra model call, so that a Story with the switch on costs what it did, give or take a few tokens.

## Implementation Decisions

- **The switch.** `story.ai_events`, a boolean, off by default. Set with `PUT /stories/:id/ai-events {on}`, answering with the whole Story as every Story write does; the Story response carries `aiEvents`. Duplicate copies it. The editor shows it as a switch at the end of the Sudden events section, with a line saying what it does.
- **Where a made-up event lives.** In `sudden_event`, the same table as the author's, with `story_id` NULL and `chat_id` set: the Story's `suddenEvents` relation never loads it, so the Story's list, the limit of 8, Duplicate and the editor are untouched. It also keeps the proposal: `proposal` (`offered`, `accepted`, `declined`; NULL for the author's events), the AI Message whose judgement proposed it (`message_id`, `ON DELETE CASCADE`), and `reason`, the Judge's one sentence on why now. Its steps are ordinary `sudden_event_step` rows pointing at it, so everything that reads a Chat's event from its steps works unchanged.
- **Gating, in code (`ai-events.ts`, pure).** The Judge is offered a proposal only when every one of these holds; otherwise its prompt has no section about it:
  - the Story's switch is on, and the judged reply is not an Epilogue;
  - no Sudden event is under way, and none ended with the reply before (its outcome is being shown);
  - the Chat has had at least `AI_EVENT_FIRST_AFTER` (8) replies a model wrote, the judged one included;
  - at least `AI_EVENT_GAP` (16) such replies since the last proposal (whatever became of it) and since the last step of any event;
  - fewer than `MAX_AI_EVENTS_PER_CHAT` (4) proposals in the Chat so far, declined ones included.
- **Never in an intimate moment.** Twice over: the Judge's rule says never during an intimate, romantic or sexual moment or a tender, quiet one; and the code drops a proposal when the judged exchange (the user's line and the reply) has a word of physical intimacy (`INTIMATE_WORDS`: kiss, naked, undress, moan, caress, aroused, sex…). A dropped proposal is logged, like other judge items.
- **The Judge's section.** When offered, a `# A new Sudden event` section goes into the judge's user message right after the Sudden events section's place, with its rule: propose only when the latest exchange itself opens a real moment of pressure (a confrontation, a chase, a test, a bargain, a danger), never for something already settled, almost always `null`; the fields and their limits; no Character's secret in the words the user reads. The token cap rises by `AI_EVENT_EXTRA_TOKENS` (150) while the section is there.
- **The reply shape (live lesson, 2026-11-18).** On DeepSeek V4 Flash a field named only in the user message is not returned, so the system message's reply shape names it: `"new_event":null`, plus one line after the shape saying it stays null unless the message's New event rule asks for one, and then holds the object that rule shows. `withNewEventShape` adds both to whichever system message the call would have sent, and is applied last. It is added whenever the Story's switch is on, whether or not the section is sent this turn, so the system message stays identical from call to call within a Story; a Story with the switch off sends exactly the system message it sent before.
- **Reading and applying.** `new_event` is read loosely: it needs a trigger and a Gauge name; the name falls back to the Gauge's; the Gauge name is cut to 40 characters, the other texts to a sensible length; the direction is `lower` unless it says `raise`; the replies are rounded and held to 2–8, 4 when missing. It is taken only when the section was offered, nothing else this judgement started an event, and the exchange passes the intimacy check. A taken one is recorded with the rest of the judgement, against the judged Message, as `offered`.
- **The proposal in the Chat.** The Chat response carries `eventProposal`: the newest `offered` proposal whose Message is the Chat's newest AI Message, while no event is under way; null otherwise. So one the user played past lapses by itself (it stays `offered`, counts toward the cap, and shows again only if a rewind makes its Message the newest).
- **Accept and decline.** `POST /stories/:s/chats/:c/event-proposals/:id/accept` and `/decline`, under the turn lock, each answering with the Chat. Both are refused (409 `NoEventProposalError`) unless the proposal is the one the Chat shows now. Accept marks it `accepted` and records its start step against its Message, with the Gauge at its direction's start, all its replies, and its reason: from the next reply on it is under way exactly as an authored event after its trigger. Decline marks it `declined`; it never shows again.
- **The ledger.** Rollback deletes the made-up events of the Messages it rewinds (their steps go with them); Reset deletes all of the Chat's. Branch copies the source's made-up events with fresh ids and their Messages remapped, and remaps the steps that point at them; the rollback then drops those past its Message.
- **Turning the switch off** stops new proposals. Events already accepted in a Chat run on and end as usual; a proposal on show no longer shows.
- **The Narrator, the banner, the Story so far.** Unchanged: an accepted event reads as an authored one. The Story so far reserves room for the Narrator's block where the Story has the switch on, as it does for a ready authored event.
- **No new play-model call, no new background call.**

## Testing Decisions

- API (`apps/api/test/ai-events.spec.ts`): as pure logic, the gating rules one by one, the intimacy check, loose reading, the section's wording, and the system message (named with the switch on, unchanged and identical without it, identical from call to call with it); then through HTTP with the fake gateway: the switch and Duplicate, no section before the first replies, a proposal shown, Start it running it to success like an authored event, Not now, a proposal lapsing when the user plays on, the cap and the gap, an intimate exchange dropping one, no proposal while an authored event runs, Regenerate taking a proposal back, Reset, a Branch carrying an accepted event, and the Story's own list never showing one.
- Browser (`apps/web/e2e/ai-events.spec.ts`, phone size): the editor's switch saves and survives a reload; in a Chat, the proposal card shows its Gauge, goal and replies, Not now takes it away, Start it turns it into the event banner; the card fits at 360 and 320 px.

## Out of Scope

- The author's own events and the made-up ones sharing a cap or a pacing rule beyond "never while one is under way".
- Saving a made-up event to the Story's list ("keep this one").
- The user asking for an event ("throw something at me").
- Changing a proposal's words, replies or direction before starting it.
- AI-suggested Endings for Stories that have their own (unchanged).

## Further Notes

- The thresholds are guesses for a long adult roleplay played a few dozen replies a sitting; they are constants in `ai-events.ts`.
- A paid real-model check worth running once on live (DeepSeek V4 Flash, the Judge): one Story with the switch on, a Chat of ~25 replies that walks into a confrontation, to see that `new_event` comes back in the shape and stays null on ordinary turns. About 25 judge calls, well under US$0.05.

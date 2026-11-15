# Spec: Cue

Status: ready-for-agent
Builds on: [Spec: Speaker controls](../speaker-controls/spec.md), [Spec: Author's note](../authors-note/spec.md)
Prior art: zeta's "Custom Regen" and Isekai Zero's "regenerate / continue with instruction" (docs/research/zeta-how-a-story-runs.md, section 4).

Built 2026-11-15.

## Problem Statement

A reply is almost right, or the story should jump ahead, and the user has no way to say so for one reply. The Author's note is a standing direction for the whole Chat, so "make her angrier this time" has to be written there and then taken out again; a Nudge only asks for a Character; and writing the wish into the user's own Message makes it part of the story.

## Solution

A **Cue**: a few words from the user to the Narrator for the next reply only ("make her angrier", "skip to the next morning"). The user sets it from the composer's Cue tool; it shows above the tools until it is used, and rides on whichever turn comes next: a Send, a Continue, a Retry, ↺ Again or a User Message edit. The Cue sheet can also run ↺ Again at once with the Cue. The Narrator follows it in that one reply; it is never a Message, never stored, and never read by the background calls.

## User Stories

1. As a player, I want to tell the Narrator how the next reply should go, so that I can steer one moment without changing my Author's note.
2. As a player, I want to write a reply again with a few words about what to change, so that Again gets closer instead of rolling the dice.
3. As a player, I want a Cue to work with Continue, so that I can move the story on ("skip to the next morning") without speaking in it.
4. As a player, I want to see the Cue I set until it is used, and to take it back, so that I never send one by accident.
5. As a player, I want a failed turn to keep my Cue, so that Retry sends the same steer.
6. As a player, I want the Cue kept out of the story, the Memory and the Bonds, so that an instruction never becomes something that happened.
7. As a player, I want the Cue to respect the rule that the Narrator never writes for me, so that a steer can't make it speak or act as my character.

## Implementation Decisions

- **One mechanism, like the Nudge.** The turn request's optional body gains `cue` (text, at most 300 characters, trimmed; blank is none) beside `nudgeCharacterId`, on send, retry, continue, regenerate and User Message edit. The web keeps it as screen state, sends it with the next turn, clears it when that turn answers, and keeps it when the turn fails or is stopped.
- **Where it sits in the prompt.** In the turn's trailing message, after "Where things stand" and the Nudge line and just before the final instruction: `The user's cue for this reply only: …` and a line saying it is a steer and not a fact, is never quoted, keeps the story in English, and never lifts the rule about the worn identity. The system message, and so the cached prefix, is unchanged.
- **Turn-only.** Suggested replies, Write for me, the judge, Memory extraction and the Story so far never see it. The Story so far trigger reserves room for the longest Cue.
- **Not stored.** No Message, Reply version or usage record keeps the Cue. A Reply version therefore does not say which Cue made it.
- **Over the limit is a 400**, before anything is stored or any model is called.

## Testing Decisions

- API (`apps/api/test/cue.spec.ts`): the pure prompt (placement, trimming, nothing without one, the system message unchanged, Continue, the Story so far reserve, not in Suggested replies) and the HTTP API across send, Continue, Regenerate, Retry and User Message edit, that background calls and stored Messages never hold it, and the 400s.
- Browser (`apps/web/e2e/cue-and-style.spec.ts`, phone size): setting a Cue, its line and pressed tool, the request body, the prompt the model got, clearing on success, keeping on failure for Retry, "Again with this Cue", Clear, and no sideways scroll.

## Out of Scope

- Asking the Narrator a question out of character and getting an answer outside the story. A Cue only steers a reply.
- Keeping the Cue with the Reply version it made, or a history of Cues.
- A Cue on a Snapshot (it has its own hint) or on Suggested replies and Write for me.
- A toggle that lets the Narrator write for the user.

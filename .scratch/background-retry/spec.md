# Spec: Gentler background failures

Status: done

## Problem Statement

After every reply, the judge (Bonds, Arcs, Scene) and Memory extraction run in the background. One failed call blocks the next send until the user presses Retry, even when the failure was a passing hiccup (a 503, a slow provider, unreadable JSON once) that a second try would fix. The Chat screen then shows one technical notice per failed call, each with its own Retry. A failed Snapshot waits for Retry too.

## Solution

A failed background call is tried once more on its own, about 20 seconds later. Until that retry has run, the call reads as still pending, so nothing is blocked or shown as failed. Only when the retry fails too is the call marked failed, and only then is the send blocked. The Chat screen then shows one plain notice for everything that failed, with one Retry that reruns all of it. A Snapshot is retried once on its own in the same way.

## User Stories

1. As a player, I want a background hiccup fixed without me, so that I don't have to press Retry for a passing error.
2. As a player, I want to keep sending while the retry waits, so that one slow call never stops play.
3. As a player who sends before the retry has run, I want the retry run then and there, so that I wait seconds, not the full delay.
4. As a player, I want sending blocked only when the retry failed too, so that the story never goes on from a state that didn't save.
5. As a player, I want one notice in plain words for what didn't save, so that I understand it without technical terms.
6. As a player, I want one Retry that reruns everything that failed, so that I press once.
7. As a player, I want a failed Snapshot tried again on its own, so that a blurred or refused image often comes right without me.

## Implementation Decisions

- **Delay.** `AppConfig.backgroundRetryMs` (env `BACKGROUND_RETRY_MS`, default 20 000). Tests and e2e set it to about 0.
- **Judge and extraction.** `run(story, chatId, messageId, { autoRetry })`:
  - A failed first attempt leaves the status pending (logged, not recorded).
  - After the delay, it runs once more.
  - Only a failed retry records `failed` with its reason.
  - The promise `run` returns, and the one a send waits on, covers both attempts, so the Story so far check still starts after both calls.
  - The background after a turn, after an AI Message edit and after choosing a Reply version passes `autoRetry: true`.
  - The Retry endpoints pass `false`: a press gets its answer at once.
- **A send during the wait.** The gate (`settle`) starts a waiting retry at once instead of after the delay. It then waits for it as for any pending call, up to `backgroundWaitMs`. The same holds for every write that settles first (an AI Message edit, choosing a version, Reset).
- **A rewind during the wait.** A new run for the Chat cancels the waiting retry, and so does a deleted Message. That covers an edit, Regenerate and choosing a version. A restart loses it, and the existing rule then marks the pending call failed, ready for Retry.
- **Snapshots.** A failed job stays pending, the delay passes, and it runs once more. Only then is it marked failed, with its typed error. The job's Retry endpoint runs once with no automatic retry.
- **Errors.** `BackgroundFailedError` (409.004.008) keeps its code. Its message now reads in plain words: "Couldn't save the Memories from the last reply. Retry before sending."
- **Web.**
  - One notice by the composer for the latest reply's failed calls and the Chat's failed Snapshots, in plain words. Examples:
    - "Couldn't save the Memories from that reply."
    - "Couldn't update the feelings and the Scene from that reply."
    - "Couldn't make the Snapshot."
  - It joins what failed into one sentence, and adds "Sending waits until it's saved." when a reply's call failed.
  - It has one Retry that reruns the failed judge, the failed extraction and each failed Snapshot.
  - A failed Snapshot's place under its Message reads "Couldn't make this Snapshot." with Dismiss. Its Retry is the notice's.
  - The dashboard's per-reply Retry is unchanged.

## Testing Decisions

- **API (`apps/api/test/background-retry.spec.ts`, retry delay 0).**
  - A judge, an extraction and a Snapshot that fail once and then succeed end up done, with no Retry needed.
  - A call that fails twice ends failed and blocks the send. The Retry endpoint then works.
  - A send during a long retry delay runs the retry at once and goes through.
  - An edit during the wait cancels it.
- **Existing tests.** Those that expect `failed` script two failures.
- **e2e (390px, touch).**
  - A judge that fails once shows no notice and leaves the send free.
  - A judge and an extraction that both fail twice show one notice. Its one Retry clears it, and sending works again.
  - A Snapshot that fails once comes out on its own.

## Out of Scope

- More than one automatic retry, or backoff.
- Retrying the Story so far, which already tries again on the next turn.

# Spec: Read the Snapshot prompt before drawing

Status: done

## Problem Statement

A Snapshot press writes the moment's description (`snapshot_prompt`, DeepSeek V4 Flash, about $0.0003) and draws it at once (`snapshot_image`, $0.06 on seedream-v5-pro-edit at 1K). The dev database shows 58 Snapshots drawn but only 34 kept: 41% were thrown away, and 24 needed a hint. Each one thrown away cost a whole image, though the fault was often there to read in the description (the wrong Character in frame, a back view, the wrong place or clothing). Snapshots are the only image cost that recurs.

## Solution

A press now stops once the **Snapshot prompt** is written. The Snapshot sheet shows it, and who is in frame. The user can read and edit it, then press **Draw Snapshot** to pay for the image, or **Cancel** and pay nothing more. Writing it again costs only the writer call.

## User Stories

1. As the user, I want to read the Snapshot prompt before the picture is drawn, so that I don't pay for a picture I can already see is wrong.
2. As the user, I want to fix the Snapshot prompt in my own words before drawing, so that a small mistake (a coat, a back view) doesn't cost a whole new picture.
3. As the user, I want to see who will be in frame before drawing, so that I can tell a wrong pick at once.
4. As the user, I want to cancel after reading and pay nothing more, so that a bad prompt costs almost nothing.
5. As the user, I want the Snapshot prompt written again, with a new hint if I like, so that I can steer it without drawing.
6. As the user, I want a failed or refused drawing retried with the Snapshot prompt I approved, so that the retry draws what I read.
7. As the user, I want a retake to go through the same reading step, so that retakes save money too.

## Decisions (the user, 2026-11-12)

- **Only the Snapshot prompt can be edited.** The fixed rules around it are always added and can be read, but not edited: the first-person view, each in-frame Character's Appearance (with their Reference image), the art style, fictional adults only, no text.
- **The hint stays**, optional, as today: it steers the writer, its Character names decide who is in frame, and it is still given to the image model.
- **No "draw without reading" shortcut.** Every Snapshot goes through the reading step.
- **A Snapshot prompt not drawn is thrown away** when the sheet closes (Cancel, ×, a tap outside, leaving the Chat). Nothing is kept for it.

## Implementation Decisions

### The flow (replaces "Snapshot flow" steps 1–3 in `.scratch/storytell-mvp/spec.md`)

1. 📷 opens the Snapshot sheet: from the action row, the Visual novel view's row, or Retake in the Snapshot viewer, which fills in that Snapshot's hint and Message. The user may write a hint.
2. **Write the prompt.** The writer call runs while the sheet waits ("Writing the prompt…"). It is the same call as before, with the same inputs and rules.
3. **Read it.** The sheet shows:
   - the Snapshot prompt in an editable text box;
   - who is in frame, by name ("In frame: Mira", or "Nobody in frame");
   - a fold, "Everything the image model gets", with the whole image prompt, the edited Snapshot prompt in place;
   - **Draw Snapshot**, **Write again** (with the hint as it now reads) and **Cancel**.
4. **Draw.** The image call runs as a job, as before: the placeholder under the Message, play going on, one automatic retry, then a failure with the notice's Retry. The job draws the approved Snapshot prompt; neither retry writes it again.
5. The Snapshot is stored as before. Its `prompt` is the image prompt actually sent, so an edit is in it.

Who is in frame is the writer's pick, or the hint's names, as before; to change it, change the hint and Write again. An empty Snapshot prompt can't be drawn. Out of image credit is checked before writing (no writer call for a picture that can't be drawn) and again on Draw.

### API

- `POST /api/stories/:storyId/chats/:chatId/snapshot-prompts` `{ hint?, messageId? }` → 201 **SnapshotPrompt** `{ id, chatId, messageId, hint, text, inFrame: [{ characterId, name }], imagePrompt }`. Runs the writer and answers when it is done; `imagePrompt` is what the image model would be given. Errors: 402.001.004 when image credit is known to be out (no call); 404.004.006 for a Message that isn't an AI Message of this Chat; the writer's typed errors (502.001.005 unreadable, outages), with nothing held.
- A written Snapshot prompt is held in the API process, one per Chat: a newer one replaces it, and it goes once drawn, after an hour, or when the API restarts.
- `POST /api/stories/:storyId/chats/:chatId/snapshots` `{ promptId, text }` → 202 SnapshotJob. Draws the held Snapshot prompt with the given text (trimmed, 1 to 2 000 characters), with no writer call, and uses it up. The job's Message and hint are the held prompt's. `404.002.012 SnapshotPromptNotFoundError` ("That Snapshot prompt is gone. Write it again.") when it was drawn, replaced, expired or the API restarted.
- The old body `{ hint, messageId }` is refused with 400: every Snapshot is read first.
- A job keeps its Snapshot prompt, its in-frame Characters and the writer's art style labels, so its retries send the same image prompt.

### Web

- `SnapshotSheet` has three steps: the hint with **Write the prompt**; writing; and reading. A writer failure shows in the sheet in plain words, with Try again.
- `useChatSnapshots` has `writePrompt(hint, messageId?)` and `draw(promptId, text)` in place of `take`.
- Retake in the Snapshot viewer opens the sheet with that Snapshot's hint and Message.

## Testing Decisions

- **API (`apps/api/test/snapshots.spec.ts`, fake gateway).**
  - Writing makes the writer call and no image call, and answers the text, who is in frame and the whole image prompt.
  - Drawing makes the image call with no second writer call, sends the edited text in the image prompt, and stores the Snapshot with that prompt.
  - A Snapshot prompt not drawn leaves nothing stored and makes no image call.
  - A newer one replaces the older: drawing the older is 404.002.012, and so is drawing one twice.
  - A failed drawing's Retry, and the automatic retry, send the same image prompt with no writer call.
  - Out of image credit stops both steps before any call; an unreadable writer reply fails the write with nothing held; the old body is refused.
  - The existing tests (hint names, Lore, links, Gallery, isolation, real gateway, background retry) take their Snapshots through both steps.
- **e2e (390px, touch, `apps/web/e2e/snapshots.spec.ts`).** Write the prompt with a hint, read it and who is in frame, edit it, Draw, see the placeholder and then the image, and find the edit in the viewer's prompt. Cancel after reading makes no image call. The other specs that take a Snapshot press Write the prompt, then Draw Snapshot.

## Out of Scope

- Choosing who is in frame by hand.
- Editing the fixed rules around the Snapshot prompt.
- Keeping a Snapshot prompt not drawn across closing the sheet, a reload or a restart.
- A price on the Draw button.

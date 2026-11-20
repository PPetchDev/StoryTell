# Spec: Draw all on the server

Status: ready-for-agent

## Problem Statement

On live (2026-11-20) the author pressed Draw all for Tamsin and Mireille in The Moonfox of Selvaria. Two things went wrong.

- **The run stopped when the phone did.** The page drew the thirteen Expressions itself, one request after another, and each takes 30 to 65 seconds. When the phone locked or the connection blinked, the request failed. The page showed "can't connect", and the rest were never drawn. The drawing in flight still finished and was saved on the server.
- **Pressing it again paid twice.** Draw all always started again from Joy and redrew every emotion, so Tamsin's Joy, Love and Embarrassment were each drawn and paid for twice: 7 drawings paid, 4 kept.

## Solution

- **The server runs Draw all.** One request starts a drawing run for the Character, then answers at once. The API draws the Expressions one after another by itself, whether or not the page is still open. It stops at the first failure and keeps why.
- **It draws only what is missing.** A run draws, in the fixed order of the emotions, each emotion that has no Expression, or whose drawn Expression is outdated (drawn from another Reference image). An uploaded Expression is kept, and so is one drawn from the current Reference image. **Redraw all** draws all thirteen, for a Character whose thirteen are all there.
- **One run at a time per Character.** Starting while a run is going answers that run; nothing else is drawn twice.
- **The page follows the run.** The editor asks how the run is going every few seconds and shows "Drawing Joy, 1 of 11…". Each finished picture appears as it lands. Leaving the page, or a lost connection, changes nothing on the server. Coming back shows the run where it is. A failed check while following is not an outage: the page keeps asking quietly.
- **Kept in API memory.** A run, and how the last one ended, live in the API process. A restart or deploy stops a run; the pictures already drawn stay. Draw all again picks up from there, because it draws only what is missing.

## User Stories

1. As an author, I want Draw all to keep going when my phone locks, so that I don't come back to half a set.
2. As an author, I want Draw all to skip the Expressions already drawn, so that I never pay twice for the same picture.
3. As an author, I want to see which Expression is being drawn and how many are left, even after leaving the editor and coming back.
4. As an author, I want to redraw all thirteen on purpose when every one is there.
5. As an author out of image credit, I want the run to stop and tell me so, with the pictures drawn so far kept.

## Implementation Decisions

- **API:** `POST /stories/:storyId/characters/:characterId/expression-drawing` with `{ redraw?: boolean }` starts a run (201) and answers its state. `GET` on the same path answers the state of the running or last run, or an idle state. A state lists:
  - `running`;
  - the `emotions` it will draw, in order;
  - the `drawn` ones so far;
  - the `current` one;
  - `failed`, as `{ code, message }` or null.
- **Refused before a run starts,** with the codes a single drawing uses: no Reference image (409.003.023), or the Venice pool known to be used up (402.001.004). A Character of another Story is a 404.
- **Nothing to draw** answers an idle state with no emotions, and makes no call.
- **Each drawing is the single draw,** with its cut-out, so prices, Usage and files work as they do now.
- **The editor's button:**
  - "Draw all 13" when there are none;
  - "Draw the N missing" when some are missing or outdated;
  - "Redraw all 13" when every one is there and current.
  - Its confirm shows the price for that many, cut-outs included.

## Testing Decisions

- API tests in `apps/api/test/expression-drawing.spec.ts`, with the fake gateway:
  - which emotions a run draws;
  - redraw;
  - a run answering before its drawings finish;
  - one run at a time;
  - stopping at a failure;
  - the refusals.
- The stage-pictures e2e checks the button's new label.

## Out of Scope

- Runs that survive an API restart.
- Drawing several Characters' runs in one request.
- Cancelling a run.

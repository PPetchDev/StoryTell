# Spec: The dressed stage

Status: ready-for-agent

## Problem Statement

With stage pictures (`.scratch/stage-pictures/spec.md`), a Character stands cut out on the novel view's stage. Two things still don't follow the story:

- **Behind the Character there is nothing.** The live Story's Backdrop is "none", and the Cover and Snapshots it could use already show people. Nara stands on a dark stage.
- **The Character keeps the outfit of their Reference image.** When the story changes their outfit (a robe at night, nothing at all in an intimate scene), the picture doesn't follow.

## Solution

A per-Chat switch, **Dress the stage**, in the Chat menu. It is off by default, since it draws on the Venice pool, and capped at **$1 a day per Chat**. With it on, after each judgement (and at once when it is turned on), the stage draws what it now needs in the background, one drawing at a time:

- **The place** the Judge says the Chat is in, drawn with no one in it, in the Chat's light.
  - The light is *day* (dawn to afternoon, or no time yet), *evening* or *night*.
  - The first picture of a place is drawn from words: the place, the light, and the Story's Setting for its world. Another light is an edit of that first picture, so it stays the same place.
  - A place's pictures belong to the Story: every Chat in the same place uses them.
  - The stage shows the place in the Chat's light, or in another light until that one is drawn.
- **Each Character's outfit**, the one the Judge records the Chat has them in.
  - It is drawn from their Reference image: the same adult person, pose and framing, with only the clothing changed. Then it is cut out.
  - **Each emotion** their lines carried in the newest reply is drawn in that outfit (an edit of the outfit's drawing, with the stage-pictures prompt) and cut out, only the first time it is needed.
  - An intimate emotion without its own drawing shows its nearest everyday one, and then the outfit's plain drawing. Outfit sprites belong to the Chat.
- The novel view puts the place behind the stage and the outfit's sprite on the figure. With no outfit drawn, the Character's Expressions show as before.
- **Place** is a fourth Backdrop: the place picture behind the thread, else the Cover.
- While anything is drawing, the Chat screen looks again every few seconds.

## User Stories

1. As a player, I want my Character to stand in the place the story is in, so that the novel view looks like a scene.
2. As a player, I want the place to darken at night and warm at evening, and still be the same place.
3. As a player, I want a Character in a new outfit to be drawn in it.
4. As a player, I want their feelings drawn in that outfit too, but only the ones the story actually shows, so that I don't pay for pictures I never see.
5. As a player, I want this off until I turn it on, and capped at a dollar a day, so that it never runs up a bill.
6. As a player, I want the same place reused in my other Chats of the Story.
7. As an author, I want "Place" as a Backdrop, so that the thread sits in the place too.

## Implementation Decisions

- **Migration `DressedStage1764470000000`:**
  - `chat.dress_stage` (boolean, default false, copied by Branch).
  - `place_picture`: Story, place key, light, status, image path; unique on Story, place and light.
  - `outfit_sprite`: Chat, Character, outfit key, emotion (`neutral` for the plain drawing), status, source path, image path, `cut_out`; unique on all four.
  - `place` added to `story_backdrop_enum`. Its down migration rebuilds the type without it.
- **Keys:** the Judge's words, lowercased, with their spaces tidied.
- **Status:**
  - A row is claimed as `drawing` before its call, so it is never drawn twice.
  - On failure it becomes `failed`, and is tried again half an hour on (`STAGE_RETRY_AFTER_MS`).
  - After a restart, rows still drawing are failed (`failInterrupted`).
- **Calls:**
  - New image call kinds `place_picture` and `outfit_sprite` at 1K, on the Settings Snapshot model: text-only for a new place, the edit model otherwise. Cut-outs are `image_cutout` with the Chat on them.
  - All go through the Monthly cap.
  - The daily cap sums the Chat's records of those three kinds over the last 24 hours (`STAGE_DAILY_CAP_USD = 1`). The stage also stops when the Venice pool reads zero.
- **Queue:** `StageManagerService.dress(storyId, chatId)` is one promise chain per Chat, the Book's pattern. The Judge calls it after its ledger record, and the switch calls it when turned on. A drawing that fails is logged and the rest go on.
- **Response:** `Chat.stage` (null with the switch off) carries:
  - `placePicturePath`;
  - per Character in an outfit with a plain drawing, its sprites (`emotion`, `imagePath`, `cutOut`);
  - `drawing`.
- **Files:** under `stage/story-<id>/…`. Deleting a Chat deletes its sprites' files; deleting a Story deletes its places' and its Chats' sprites' files.
- **Prompts:** `placePrompt`, `relightPrompt` and `outfitPrompt` in `manager/chat/stage/stage.service.ts`. The outfit prompt tells the model to leave out any clothing the Appearance describes. The Characters are adults, and the prompt says so.

## Testing Decisions

- API, `test/dressed-stage.spec.ts`:
  - the prompts and light buckets;
  - switch off: no calls and no stage;
  - switch on: the place from words, the outfit from the Reference image, the emotion from the outfit, and all three cut out; the same turn again draws nothing;
  - another light as an edit of the first picture, and a failed outfit not retried within half an hour;
  - the daily cap;
  - Chat and Story deletion removing files.
- e2e, `e2e/dressed-stage.spec.ts`:
  - the switch, off by default;
  - after a turn, the place behind the stage and the Desire sprite, then the plain one, at 390, 360 and 320px;
  - "Place" as the Backdrop behind the thread.

  `e2e/read-aloud.spec.ts` lists the new menu row, and `e2e/backdrop.spec.ts` has the new hint.

## Known limits

- The stage shows the **current** place and outfits on every step. Stepping back through older lines doesn't show where the story was then.
- A Branch draws its own outfit sprites again; places are shared.
- The first outfit the Judge records, often just the card's own clothing, is drawn too: one drawing, about $0.07.
- A redrawn person can drift a little from the Reference image. Only one real-model drawing has been checked (stage pictures' fear Expression); places and outfits have not, since Venice credit ran out on 2026-11-18.

## Out of Scope

- A per-step stage history.
- Weather in the place picture.
- Drawing a Character's outfits ahead of the story.

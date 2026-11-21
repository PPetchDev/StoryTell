# Spec: Places drawn ahead

Status: ready-for-agent
Builds on: [Dressed stage](../dressed-stage/spec.md)

Asked 2026-11-21:
- "มันสามารถสร้างฉากไว้ล่วงหน้าได้ไหมเมย์" (can it make scenes ahead of time?).
- The user picked place pictures, not plot Scenes.

## Problem Statement

With Dress the stage on, a place is drawn only once the Judge says the story is there. So the first time a Chat reaches a place, the novel view shows a dark stage until the drawing lands, and each new place costs as it comes.

The author usually knows the main places before play: the home base, the capital, the camp. They cannot draw them, see them, or fix one they don't like, until play reaches them.

## Solution

**A Places card on the Style tab of the editor, under the Chat backdrop.** Each Place has:
- a name ("Rin's tree-house");
- a few words on how it looks ("a house grown inside a silver-barked tree, round windows, moss on the sills").

**Draw it ahead.**
- Each Place has Draw (day), and Draw evening and night once day is drawn.
- Each button shows its price first, about $0.07 a picture on the Settings Snapshot model.
- Evening and night are edits of the day picture, as during play, so it stays the same place.
- Draw again replaces a picture, and asks first.

**Play uses it.**
- The Judge is told the Story's Place names. When the story is at one of them, it answers "place" with that name exactly, so the drawn picture shows at once and nothing is drawn again.
- A place that is not on the list is still named and drawn as now.

**Places met in play show too.**
- The card also lists the places Chats have drawn so far, by their words.
- Each can be kept as a Place (named and described), redrawn, or removed.

**Also:**
- The Place Backdrop and every Chat of the Story share these pictures, as they already share places drawn in play.
- Drawing ahead works without Dress the stage on: it is the author's choice, paid on the Venice pool, outside the per-Chat daily cap.

## Open questions for the user

1. **Places as their own list, or Lore entries marked "a place"?**
   - Lore already holds the world's places, so marking one would reuse its name and text.
   - But Lore text is about history and custom, not looks, and would draw poorly.
   - Recommended: their own list, with an "Add from Lore" that copies a Lore place's name in.
2. **Which lights to draw ahead?**
   - Recommended: day by default, with evening and night as one more tap each, since a Story set mostly by day pays for one picture a place.

## Implementation Decisions

- **Migration:**
  - `story_place`: Story, name, looks, position, unique on Story and its key.
  - The key is `stageKey(name)`, so a Place's pictures are the `place_picture` rows already used in play.
- **API:**
  - CRUD under `stories/:id/places`.
  - `POST …/places/:placeId/draw` with a light: the day one from words (the Place's name and looks, with the Story's Setting), the others as edits of the day one.
  - Each draw is recorded as a `place_picture` call with the Story and no Chat.
- **Judge:**
  - The Details rule gains one line listing the Place names, sent only when the Story has Places.
  - A name the Judge answers is matched by key, so case and spacing don't matter.
- **Editor:** a Places card on the Style tab, under the Chat backdrop, with the drawn pictures as thumbnails, and the same Draw, Draw again and Remove pattern as Expressions.

## Testing Decisions

- **API:**
  - a Place drawn ahead is used in play without a second drawing;
  - evening is an edit of day;
  - the Judge prompt lists the Place names only when there are some;
  - an unlisted place still draws as before;
  - Remove deletes the files.
- **e2e at 360 and 320:**
  - add a Place, draw it, see the thumbnail;
  - a Chat whose Judge answers that name shows it on the stage;
  - the card fits with no sideways scroll.

## Out of Scope

- Drawing outfits ahead.
- Suggesting Places from the Setting with AI; it could come later.
- Weather in the place picture.

## Fix after the first live drawing (2026-11-21)

- Rin's tree-house was drawn ahead on live, in all three lights, for $0.18: $0.06 a picture, the same for the evening and night edits as for day.
- The Story's backdrop was then set to Place, but Chat 1 still showed the Cover. A Chat answered its stage, and with it the place picture, only with Dress the stage on.
- Now a Chat with the switch off answers the place pictures already drawn, with no outfits and nothing drawn, so the Place backdrop and the novel view show them. With none drawn for its places, it answers no stage, as before.

# Spec: Your faces (Expressions for the Role and Personas)

Status: ready-for-agent
Builds on: [Expressions](../expressions/spec.md), [Draw all on the server](../expression-drawing/spec.md), [Stage pictures](../stage-pictures/spec.md), [Role image](../role-image/spec.md), [Persona image](../persona-image/spec.md), [Roll](../roll/spec.md) (a per-message choice in the composer)

Asked 2026-11-20: "ตรง role ทำให้มันสร้างอารมณ์ได้เหมือน character card หน่อยสิ ตอนฉันพิมพ์ฉันอยากเลือกสีหน้าของฉันเองด้วย และ ตัวละครตัวอื่นต้องรับรู้ด้วยนะ" (give the Role Expressions like a Character card; when I type I want to pick my own face; the other Characters must notice it). Decisions, in the user's words:
- Q2 "ทำทุกอย่างเหมือน character card เลย": drawn from the picture, uploaded, cropped, Draw all, cut-outs, all as a Character's.
- Q3 "ทั้งสองที่": the Story's Role and the user's Personas.
- Q4 "Judge เดาเอา": a Message sent without a face is tagged by the Judge.
- Q5 "ทำตามนี้เลย": the Narrator is told the picked face; the face shows beside the user's line and on the Visual novel stage; the picker sits by 🎲 and 🎤.

## Problem Statement

The Characters' faces change with every line, but the user's own character has one picture, or none. The user can't show how their character looks as they speak, and the Characters have no way to see it: a blush or a glare exists only if the user writes it out.

## Solution

The Role and each Persona can have **Expressions**, the same thirteen as a Character's, made the same ways: drawn from the Role image or Persona image by the image model, one at a time or all at once, or uploaded; each with a square and a cut-out for the stage.

In a Chat, the composer has a **face** button beside 🎲. The user picks a face for the Message they are about to send, or none. A picked face goes with the Message: the Narrator is told it, so the Characters answer what they see, and it shows beside the user's line and on the stage. A Message sent without a face is tagged by the Judge from what the user wrote, after the reply, for the pictures only.

## User Stories

1. As an author, I want my Role to have Expressions like a Character's, so that the character I play has a face for each feeling.
2. As a user, I want each of my Personas to have Expressions too, so that the face goes with me into any Story.
3. As an author, I want to draw an Expression from the Role image (or Persona image) with one tap, at its price, so that it looks like the same person.
4. As an author, I want Draw all for my Role and Personas, so that a whole set is one tap.
5. As an author, I want to upload my own picture for an emotion, crop its square, and remove it, as on a Character card.
6. As an author, I want to see which Expressions were drawn from an earlier picture, so that I can draw them again after changing it.
7. As an author, I want Duplicate Story to copy the Role's Expressions, and deleting a Story or a Persona to delete theirs.
8. As a player, I want a face button beside 🎲, so that I can pick how my character looks as I send.
9. As a player, I want to see each face's picture in the picker when I have it, and its name when I don't, so that I can pick even before drawing any.
10. As a player, I want the picked face to stay for one Message only, so that I don't send a blush by accident later.
11. As a player, I want the Characters to notice the face I picked, so that a glare or a blush changes how they answer.
12. As a player, I want my line to show the Expression of its face beside it, so that my side of the story has faces too.
13. As a player, I want a Message sent without a face to get one from the Judge, so that the pictures follow the feeling anyway.
14. As a player, I want the face I picked never to be replaced by the Judge's guess.
15. As a player, I want my line on the Visual novel stage to show my character with that face, so that the stage is shared.
16. As a player, I want editing a Message, Retry and Again to keep its face, and a Branch to copy it.

## Implementation Decisions

- **Owners.** Two new tables mirror `character_expression`: `role_expression` (per Role) and `persona_expression` (per Persona), each `(emotion, image_path, crop, drawn_from, cutout_path)`, unique per owner and emotion. Paths: `expressions/story-<sid>/role-<emotion>-<token>.<ext>` and `personas/persona-<pid>/expression-<emotion>-<token>.<ext>`.
- **The picture they are drawn from** is the Role image or the Persona image. This changes the rule "no model ever sees it": the image model sees it when an Expression is drawn from it, as a Character's Reference image is seen. No text model ever does. CONTEXT.md is updated.
- **Drawing** reuses the Expression prompt with the Role's or Persona's name and no appearance line, the same price check and credit check, the cut-out after each drawing, and Draw all keyed by owner. No picture to draw from is the same typed refusal as a Character without a Reference image.
- **Squares.** An Expression's crop defaults to the centre square of its picture (a Role or Persona has no Portrait square).
- **A Message's face.** `message.face` (an Expression emotion or null) and `message.face_by` (`user` or `judge`). The send request takes `face`; edit and Retry keep it; Again keeps the user's Message as it is; a Branch copies both.
- **The Narrator.** A picked face adds one line to the trailing block, after the Roll and before the Cue: `<Name>'s face as they say this: <emotion in words>.` The emotion words come from the Judge's emotion meanings. A face only the Judge guessed is never sent.
- **The Judge.** When the Message has no picked face and the worn Role or Persona has any Expression, the Judge is also asked the user's line's emotion (`"user_emotion"`), named in its system reply shape, and the answer is stored with `face_by = judge`. Neutral stores nothing.
- **Pictures.** The user's line shows the Expression of its face (the Role's or Persona's it was written as), else the Role image or Persona image as now. On the Visual novel stage a user step shows the cut-out of that Expression when there is one.
- **Composer.** A face button after 🎲 opens a small sheet of the thirteen faces, each with its picture (round) or its name; the picked one is shown on the button and cleared after a send, like the Roll.

## Testing Decisions

- API (vitest, fake gateway): Role and Persona Expressions draw, upload, crop, remove, outdated, Draw all, cut-outs, Duplicate and delete; the send stores the face; the turn prompt carries the face line only for a picked face; the Judge is asked and stores a guess only when nothing was picked and the identity has Expressions; edit, Retry and Branch keep the face. Prior art: `test/expressions.spec.ts`, `test/expression-drawing.spec.ts`, `test/roll.spec.ts`.
- e2e (Playwright, fake gateway): the Role tab's Expressions; the Personas page's; the face picker sends the face and shows it beside the line; at 360 and 320 px. Prior art: `e2e/expressions.spec.ts`, `e2e/roll.spec.ts`.
- A real drawing of Rin's faces only on the user's say (Venice credit).

## Out of Scope

- Drawing the Role image or Persona image itself from text.
- Outfits on the stage for the user's character.
- Telling the Characters a face the Judge guessed.

## Built (2026-11-20)

- API: `identity_expression` (one owner per row, the Role or a Persona), `message.face` and `face_by`; Role and Persona Expression routes beside the Character's; Draw all runs keyed by owner; Duplicate copies the Role's, and deleting a Story or a Persona deletes their files. The Judge asks `user_emotion` only when the Message has no picked face and the Role or Persona it was written as has Expressions.
- Web: the Expressions editor now serves any owner (`ExpressionSet`); the Role tab and each Persona card show it. The composer's face button (after 🎲) opens a sheet of the thirteen faces; the face shows beside the user's line and on the Visual novel stage.
- Checked: the API suite (one Reach-outs test fails between about 14:00 and 15:00 local time, before and after this work: its "an hour later" lands in quiet hours); e2e in three shards, 388 passed. Not checked on a real model: drawing the Role's faces (Venice credit), and how the Narrator answers a picked face.

## Picking the face (2026-11-20)

Asked with a screenshot of the Role tab's round picture showing Rin's body, not her face: "มันเลือกตำแหน่งหน้าไม่ได้อ่ะ" (it can't pick where the face is).

- The Role picture and a Persona picture have a face square, `image_crop` (fractions of the picture's width, as a Portrait's), set with **Pick the face** and the same cropper as a Character's Portrait. Without one, the round picture shows the default square (top centre), as a Portrait does. A new picture goes back to the default; there is no square without a picture (409.003.040).
- The square is used wherever the picture is round: the Role tab, the Persona card, beside the user's lines; and it is the default square of the Expressions drawn from that picture.

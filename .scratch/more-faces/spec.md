# Spec: Annoyed and Thinking faces

Status: ready-for-agent
Builds on: [Your faces](../your-faces/spec.md), [Expressions](../expressions/spec.md)

Asked 2026-11-20: "สำหรับ role เพิ่มหน้าตาของ annoyed, thinking หน่อยสิ" (for the Role, add Annoyed and Thinking faces).

## Problem Statement

Your faces have the Characters' thirteen emotions. There is no face for being mildly irritated, other than Angry, and none for thinking something over. The user wants both for their Role.

## Solution

- **Your faces get two more: Annoyed and Thinking.** Both the Role and a Persona have them, since the two share Your faces. They come after the seven everyday faces and before the intimate ones, in the Role tab, on a Persona's card and in the face picker.
- **They work like the others.** Each one can be drawn from the Role picture or Persona picture, uploaded, cropped, cut out or removed. Draw all includes them, so a Role or Persona has 15 faces in all.
- **Picking one tells the Narrator.** Annoyed reads as "annoyed, unimpressed, brows lowered, lips pressed flat". Thinking reads as "thoughtful, thinking it over, eyes turned aside".
- **The Judge can guess them.** When no face is picked, the Judge can give Annoyed or Thinking for your line. On this list, Angry is strong anger and mild irritation is Annoyed.
- **Characters are unchanged.** They keep their thirteen Expressions, the Judge's emotions for their lines, and the routes for their Expressions. A Character's route refuses `annoyed` and `thinking`.

## Implementation Decisions

- The API adds one list of your faces' emotions beside the Characters' list:
  - your faces' entity and routes take it, along with a Message's face and the Draw all run's state;
  - a migration widens the `identity_expression` and `message.face` checks.
- The drawing prompt gives each face one clear gesture:
  - Annoyed: an irritated look, hands on the hips;
  - Thinking: eyes turned up and aside, one hand under the chin.
- The web's Expression set takes a flag for whether it shows your faces. The face picker always lists your faces.

## Testing Decisions

- API (`test/your-faces.spec.ts`):
  - the Role and a Persona take both faces, listed in order;
  - the drawing prompt uses Annoyed's gesture;
  - a Character's route refuses `annoyed`;
  - a picked Thinking face is told to the Narrator;
  - the Judge is offered both and its guess of Annoyed is kept;
  - Draw all draws all 15.
- e2e (`e2e/your-faces.spec.ts`): the Role tab lists 15 faces, with 9 everyday faces in order; the face picker shows Annoyed and Thinking. The Characters' e2e still counts 13.

## Out of Scope

- Annoyed and Thinking for Characters.
- Drawing the two pictures; the user uploads or draws them.

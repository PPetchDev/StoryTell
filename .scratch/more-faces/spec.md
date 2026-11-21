# Spec: More faces

Status: ready-for-agent
Builds on: [Your faces](../your-faces/spec.md), [Expressions](../expressions/spec.md), [Stage pictures](../stage-pictures/spec.md)

Asked 2026-11-20:
- "สำหรับ role เพิ่มหน้าตาของ annoyed, thinking หน่อยสิ" (for the Role, add Annoyed and Thinking faces). Shipped as 56d23ea, for your faces only.
- Then: "ควรมีอารมณ์อะไรเพิ่มอีกดี" (what other emotions should there be?). May proposed Smug, Determined and Worried first, then Hurt, Tired and Proud. Characters too was an option.
- The user answered "เพื่อพร้อมกันให้หมดเลย" (add them all at once). This was read as: all six, for everyone, and Annoyed and Thinking for the Characters too.

## Problem Statement

The everyday emotions were Happy, Loving, Embarrassed, Sad, Angry, Scared and Surprised. That left gaps a fantasy adventure hits often:
- No sly, playful face outside an intimate scene, where Teasing is.
- No resolve for a fight.
- Nothing milder than Scared for worry.
- No pain after a blow, no tiredness by the fire, no pride after a win.
- Characters had no Annoyed or Thinking, though the Role had.

## Solution

- **Eight more everyday emotions for everyone:** Annoyed, Thinking, Smug, Determined, Worried, Hurt, Tired and Proud. They come after Surprised and before the intimate ones.
  - Every Character, the Role and every Persona now has the same 21 Expressions: 15 everyday and 6 intimate.
  - The face picker offers the same 21.
- **The Judge tags them** on Characters' lines, and guesses them for your line.
  - Anger is now strong anger; mild irritation is Annoyed.
  - Scared is now fear; nervous unease is Worried.
  - Surprise no longer covers confusion; that is Thinking.
- **A line without its picture shows the nearest one,** so Stories drawn before this keep changing faces:
  - Annoyed shows Angry; Smug and Proud show Happy; Worried shows Scared; Hurt shows Sad.
  - Thinking, Determined and Tired have no near one, so the Portrait shows.
  - This works the same way the intimate emotions already fall back.
- **Each one has its own drawing, Narrator words and Japanese voice delivery.** Each drawing has one clear gesture, for example Determined: a clenched fist; Tired: rubbing one eye.
- **Draw all draws whatever is missing.** For a Character drawn before this, that is the eight new ones, about $0.04 each with the cut-out.
  - On a dressed stage, outfit sprites for the new emotions are drawn as lines show them, under the stage's daily cap, as before.

## Implementation Decisions

- The API and the web keep one list of the emotions; your faces use the same list as a Character's.
- A migration widens four checks: a Character's Expression, a line's emotion, your faces, and a Message's face.
- Drawing poses avoid words that bent figures before ("leaning", "shoulders hunched", "slumped"), as the drawing prompt's own test requires.

## Testing Decisions

- API:
  - the Judge's prompt carries every meaning;
  - every emotion has its own drawing description;
  - Draw all draws every emotion;
  - a Character takes Annoyed;
  - your faces' tests from the first round still pass.
- e2e:
  - a Character's and the Role's editors list 21 emotions, 15 of them everyday, in order;
  - the face picker shows 15 everyday faces.

## Out of Scope

- Drawing the new pictures for existing Characters; the user runs Draw all, or uploads, when they choose.
- Stage animations for the new emotions; they use the default ones.

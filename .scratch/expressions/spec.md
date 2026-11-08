# Spec: Expressions

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (Reference image, Background judge), [Spec: Desktop layout, folding cards and Character pictures](../desktop-and-folds/spec.md), [Story cover](../story-cover/issues/01-story-cover.md) (uploads)
Decision: [Expression sprites by emotion](../sillytavern-gaps/issues/10-expression-sprites.md)
Research: [SillyTavern feature details](../../docs/research/sillytavern-feature-details.md) §8 Character Expressions

Fits with the other SillyTavern-gap features as settled in [integration](../sillytavern-gaps/integration.md).

## Problem Statement

A Character has one face. Their Portrait beside every line looks the same whether they are laughing, crying, blushing or furious, so the picture adds nothing to the moment. The Judge already reads every reply in the background, but nothing records how each line feels. The bigger picture of the [Visual novel view](../chat-looks/spec.md) would show the same one face just as flatly.

## Solution

A Character may have **Expressions**: one picture per emotion from a fixed list of seven (happy, loving, flustered, sad, angry, scared, surprised), plus "neutral", which is the Portrait itself. The author draws each one from the Character's Reference image with a tap, at the Snapshot model's 1K price, or uploads one. Each Expression shows through the Portrait's square or a square of its own. The Judge, in the call it already makes after every reply, also tags the emotion of each line a Character speaks. That tag is stored on the line itself. Beside a line, the Portrait becomes the Expression for that emotion when the Character has one, and stays the Portrait otherwise. The Character profile shows the set. Duplicate Story copies it.

## User Stories

1. As an author, I want to give a Character a picture for each of a few emotions, so that their face changes with the story.
2. As an author, I want the emotions to be a short fixed list, so that a set is quick to make and the Judge can tag lines reliably.
3. As an author, I want to draw an Expression from the Character's Reference image with one tap, so that it looks like the same person.
4. As an author, I want the draw button to show its price before I tap, so that I know what each picture costs.
5. As an author, I want each Expression drawn only when I ask, one at a time, so that credit is never spent behind my back.
6. As an author, I want to draw an Expression again when I don't like it, after a confirm that says it replaces the current one, so that I don't lose a good one by accident.
7. As an author, I want to upload my own picture for an emotion, so that I can use art made elsewhere.
8. As an author, I want an uploaded picture checked as a real PNG, JPEG or WebP under the size limit, so that a bad file is refused clearly.
9. As an author, I want each Expression to use the Portrait's square by default, so that a drawn Expression lines up with the face I already picked.
10. As an author, I want to pick a different square for an Expression, so that an uploaded picture with other framing still shows the face.
11. As an author, I want to remove an Expression, so that its emotion falls back to the Portrait.
12. As an author, I want to see which Expressions were drawn from an earlier Reference image, so that I can draw them again after I change the Character's look.
13. As an author, I want Expressions kept when I replace or remove the Reference image, so that nothing I paid for vanishes without my say.
14. As an author, I want drawing to need a Reference image, with a clear message when there is none, so that I know what to do first.
15. As an author, I want Expressions to live on the Character's card in the Story editor, under the Reference image, so that everything about how they look is in one place.
16. As an author, I want Duplicate Story to copy every Expression as its own file, so that a copy is complete and deleting one Story never breaks the other.
17. As an author, I want removing a Character, or deleting the Story, to delete their Expression files, so that the image folder holds no orphans.
18. As a player, I want the Portrait beside a line to show the Character's Expression for the emotion of that line, so that I can see how they feel as they speak.
19. As a player, I want a line whose emotion has no Expression, or is neutral, to show the Portrait as before, so that a partial set still looks right.
20. As a player, I want lines to show the Portrait until the background check has tagged them, and the Expression appear once it has, so that the reply is never held back.
21. As a player, I want the Opening's lines to show the Portrait, since nothing judges the Opening, so that the first Message looks as it does today.
22. As a player, I want a regenerated, edited or re-chosen reply to be tagged again with its own words, so that a face never belongs to words that were replaced.
23. As a player, I want a failed background check to leave the Portrait showing, so that a failure never shows a wrong face.
24. As a player, I want the emotion tag to cost nothing extra, so that Expressions add no model call to a turn.
25. As a player, I want a Story with no Expressions to send exactly the judge prompt it sends today, so that Expressions change nothing until they are used.
26. As a player, I want the Character profile to show their Expressions under the Reference image, so that I can see the whole set.
27. As a player in the Visual novel view, I want the speaking Character's Expression shown large, so that the bigger picture feels alive.
28. As the owner, I want every drawn Expression logged as an image call of its own kind, so that the Usage page shows what Expressions cost.
29. As the owner, I want Expressions included in backups like every other picture, so that a restore brings them back.

## Implementation Decisions

### The emotions

- The fixed list, as stored and as the Judge writes it, with the UI label and the Judge's meaning:

  | Emotion | Label | Judge's meaning | Has a picture |
  |---|---|---|---|
  | `neutral` | Neutral | calm, plain talk, no strong feeling | no: the Portrait |
  | `joy` | Happy | happy, amused, laughing, pleased, excited | yes |
  | `love` | Loving | tender, affectionate, flirtatious, aroused, longing | yes |
  | `embarrassment` | Flustered | shy, embarrassed, ashamed, awkward | yes |
  | `sadness` | Sad | sad, hurt, grieving, disappointed | yes |
  | `anger` | Angry | angry, annoyed, disgusted, contemptuous | yes |
  | `fear` | Scared | afraid, nervous, anxious | yes |
  | `surprise` | Surprised | surprised, shocked, confused, realising | yes |

  Eight labels from the GoEmotions-style list in the research, merged where a phone-sized face can't show the difference. `love` covers desire, because this is an adult app where both matter, and one face carries both well enough. `neutral` has no Expression: the Portrait is the neutral face. So a full set is seven pictures, about $0.28–$0.42 at today's Snapshot model prices.
- Types: `Emotion` (all eight) and `ExpressionEmotion` (the seven with pictures), defined in the API and mirrored in the web's types, as every API type is: there is no shared package between the two.

### Storage

- **Table `character_expression`:**
  - `id`;
  - `character_id` (FK, ON DELETE CASCADE);
  - `emotion` (text, one of the seven);
  - `image_path` (text, relative to the image folder);
  - `crop` (jsonb, nullable: the same `{ x, y, size }` shape as the Portrait crop; null means "use the Portrait's square");
  - `drawn_from` (text, nullable: the Reference image path it was drawn from; null for an upload);
  - `created_at`.

  Unique on `(character_id, emotion)`. One migration.
- **Files:** `expressions/story-<storyId>/character-<characterId>-<emotion>-<token>.<ext>`, a fresh token per write so a browser never shows a replaced picture from cache. They sit in the image folder, so backups carry them.
- **Responses:** each Character gains `expressions: { emotion, imagePath, crop, outdated }[]`, in list order. `outdated` is true when `drawn_from` is set and differs from the Character's current Reference image path (also when there is none now).
- **On a message part:** `message_part.emotion` (text, nullable), one migration with the table above or its own. Speech parts in the API response gain `emotion: Emotion | null`. Narration parts never have one. Reply versions store parts as they are answered, so a kept version carries its tags too. They are cleared and written again anyway when a version is chosen.
- **Branch** (per [integration](../sillytavern-gaps/integration.md)): a part's `emotion` is copied with the parts, extending [Branch's copy ticket](../branch/issues/02-branch-a-chat.md), so a Branch shows the same faces. Reset removes them with their Messages, and Regenerate or an edit has them rewritten by the Judge.

### Authoring API

Every route answers the whole Story, as every editor write does. All routes sit under `/api/stories/:storyId/characters/:characterId/expressions/:emotion`, and an emotion outside the seven is a 400 validation error.

- **Draw:** `POST …/:emotion/draw`.
  - It needs a Reference image: without one, a new `NoReferenceImageToDrawError` (409, Story authoring domain, the next free code there at implementation time), "Add a Reference image first: Expressions are drawn from it." The existing `NoReferenceImageError` is not reused: its message is about cropping the chat picture.
  - When the Venice pool is known to be used up, it answers `OutOfCreditError` (image) without a call, as Reference images do.
  - One gateway call, kind `expression_image` (new `ImageCallKind`, beside `snapshot_image` and `reference_image`). It sends the Reference image as the one input image and a fixed prompt (below). No text-model call.
  - The real gateway sends it to the Settings Snapshot model (an edit model, since there is a reference image), asking for 1K. `drawnSize` still picks 2K where that costs no more.
  - The usage record is pool `image`, `images: 1`, at the list price. The Usage page labels the kind "Expression pictures", under "Images and audio (Venice)".
  - On success the file is written, then the row is inserted or replaced, with `crop` kept from the replaced row and `drawn_from` set. Then the old file is deleted. A failure leaves the old Expression as it was.
- **Upload:** `PUT …/:emotion` (multipart field `image`, 15 MB).
  - The type is sniffed from the bytes, as a Cover upload is, with the same three errors.
  - It replaces any existing one the same way, with `drawn_from` null and `crop` null.
- **Crop:** `PUT …/:emotion/crop` with `{ x, y, size }`, and `DELETE …/:emotion/crop` (back to the Portrait's square).
- **Remove:** `DELETE …/:emotion` removes the row and its file.
- A missing Expression on crop or remove is 404 `ExpressionNotFoundError` (Story authoring domain, the next free code there at implementation time).
- **The drawing prompt** is pure and fixed per emotion. It asks the edit model to:
  - keep the same person, face, hair, body, outfit, framing, background and art style;
  - change only the facial expression and body language to the emotion's description. For example, Flustered: "blushing deeply, eyes glancing away, a shy, awkward smile, shoulders drawn in".
  - The Character's name and Appearance are included, so the model keeps them.
  - It fits the model's prompt limit as every image prompt does.
- **Reference image changes:** replacing or removing the Reference image keeps every Expression; it only makes drawn ones `outdated`. The Portrait crop is cleared on a replace, as today. An Expression with a null crop follows the new Portrait square.
- **Removing a Character** deletes their Expression files (the rows cascade). **Deleting a Story** deletes every Expression file of its Characters, next to the Reference image files.
- **Duplicate Story** copies every Expression to a file of the new Story's own, keeping `emotion` and `crop`. When `drawn_from` named the source's current Reference image, it is rewritten to the copy's, so an Expression that was current stays current (an outdated one stays outdated). A missing source file leaves that Expression out, as for Reference images.
- **Character card export** does not carry Expressions, and import ignores a card's `emotion` assets. Embedding them in a PNG needs the V3 `chara-ext-asset_` chunks, which the card spec says new apps should avoid, and CHARX is out of scope.

### The Judge tags each line

- **Only when it can show:** the change applies only when at least one Character of the Story has at least one Expression. Otherwise the judge prompt, its output and its token cap are exactly today's.
- **Prompt:**
  - In the LATEST EXCHANGE, each speech part of the AI's reply is numbered in order, as `[1] @Name: …`, `[2] @Name: …`. The context Messages are not numbered.
  - The system prompt gains an Expression rule: for each numbered line, the emotion its speaker shows in it, one of the eight, with the table's meanings; "neutral" when unsure.
  - The JSON shape gains `"expressions":[{"line":1,"emotion":"joy"}]`.
  - The judge's token cap rises by 200 for that call.
- **Reading:** `parseJudgement` reads `expressions` loosely. An item without an integer `line` or a known emotion (any case) is dropped. A missing field means none.
- **Applying:** a pure step maps line n to the n-th speech part (by part id), drops numbers outside 1..speech parts and keeps the first tag of a repeated number. Untagged parts stay null.
- **Written in the ledger's record transaction.** The tags travel with the judgement's other changes: the ledger's `MessageChanges` gains `emotions: { partId, emotion }[]`, and the ledger's record writes each part's `emotion` inside the one transaction that already saves the Bond changes, Arc steps, Scene advance and Time change and sets the Message's judge to done. They are never written after it, because:
  - a write after the record that failed would fail the judge attempt, and the background runner's one automatic retry re-runs the whole judge, which would record its Bond changes, Arc steps and the rest a second time;
  - the web stops re-reading the Chat once no background call is pending, so tags written after the judge is done might never be shown.
  In the one transaction, the judge is done exactly when its tags are there, and a failure writes nothing, so the retry starts clean.
  - Emotions are not ledger rows, so nothing rolls them back: they live on the part. Anything that undoes a reply's judgement replaces its parts: Regenerate, an AI Message edit, choosing a Reply version. The judge runs again on the new parts.
  - A failed judge leaves them null, and Retry tags them.
- **No extra model call.** The Opening is never judged, so its lines never carry an emotion.

### In the Chat

- **The line picture** comes from one pure web helper used by every place that draws a line's picture, so the thread and the Visual novel view agree. For a speech part it gives:
  - the Expression for the part's emotion, when the Character has one, with its crop, else the Portrait's crop;
  - else the Portrait;
  - else the initial on the Character colour.

  It also gives the **whole** picture for the same part, for the Visual novel view: the Expression's full image, else the whole Reference image, else none. Ticket 03 delivers both outputs, with a test of each, so the Visual novel view only calls it.
- **Beside a line**, the round picture shows that, and a tap still opens the Character profile.
- When the judge finishes, the Chat's existing re-read (it polls while background calls are pending) brings the tags, which are stored in the same transaction that marks the judge done. No new polling.
- **Character profile:** under the Reference image, a row of the Character's Expressions as small round pictures with their labels. Shown only when they have any.

### In the Story editor

- On each Character card, after the Reference image and Chat picture rows, an "Expressions" section with seven rows. Each row has a small round thumbnail (empty until there is one) and the label, then:
  - "Draw · $0.05" (the Settings Snapshot model's 1K price), "Draw again" after a confirm, or nothing while there is no Reference image, with a hint "Add a Reference image to draw Expressions";
  - "Upload";
  - "Pick the face" (the existing Portrait cropper on the Expression's picture), and "Reset" when it has its own square;
  - "Remove", after a confirm.
- An outdated Expression shows "Drawn from an earlier Reference image".
- While one is drawing, its row shows "Drawing…". Other rows stay usable, and each draw is its own request.
- Errors show inline in the row, routed on the code. Out of image credit uses the same wording as the Reference image.

### Glossary

Uses `CONTEXT.md`'s Expression, Portrait, Reference image, Character profile. "Emotion" is used in its plain sense (the feeling a line carries), as `CONTEXT.md`'s Expression entry does.

## Testing Decisions

- Test external behaviour: the judge prompt and parse at their pure seams, and the API's answers, files and gateway calls through the fake gateway. On the web, what shows beside a line, in the profile and in the editor.
- **Pure tests** (prior art: `judge-prompt.spec.ts`):
  - with Expressions, the latest exchange's speech lines are numbered and the rule and field are present;
  - without them, the prompt is byte-for-byte today's;
  - parsing drops unknown emotions and bad line numbers and reads any case;
  - the mapping from line numbers to speech parts, with out-of-range and repeated numbers;
  - the drawing prompt holds the emotion's description and the Character's name.
- **The line-picture helper** (both outputs): the web has no unit-test runner, so a Playwright test with no page imports the pure helper and checks the round picture (Expression with its crop, else the Portrait's crop; Portrait; initial) and the whole picture (the Expression's full image; else the whole Reference image; else none), for a tagged, a `neutral`, an untagged and a picture-less Character's part. This adds no dependency.
- **API tests through the fake gateway** (prior art: `reference-images.spec.ts`, `story-cover.spec.ts` for uploads, `story-duplicate.spec.ts`, `judge.spec.ts`, `regenerate.spec.ts`):
  - drawing sends one `expression_image` call with the Reference image and stores the result;
  - drawing again replaces the file and keeps the crop;
  - drawing with no Reference image, and drawing out of credit, are refused with no call;
  - upload (good, wrong type, too big);
  - crop set and reset, remove, and 404s;
  - replacing the Reference image marks drawn ones outdated;
  - removing a Character, and deleting the Story, delete the files;
  - Duplicate copies the files and keeps them current;
  - a judged reply's speech parts carry the scripted emotions, and the judge prompt has numbered lines;
  - the first Chat read that shows the judge done already holds the tags;
  - a ledger record whose emotion write fails (a deliberately failing write in a model-level test) commits nothing: no Bond change, Arc step, Scene advance or Time change, and the judge not done;
  - a Story without Expressions sends the unchanged prompt;
  - Regenerate and an edit clear the tags, and the rerun judge writes new ones;
  - a failed judge leaves them null;
  - a Branch of a judged reply carries its parts' emotions.
- **e2e (Playwright, 390px, fake gateway; prior art: `reference-image.spec.ts`, `character-profile.spec.ts`, `folds-and-pictures.spec.ts`):**
  - drawing a Happy Expression in the editor, with its price shown, fills its thumbnail;
  - after a turn whose scripted judge tags a line `joy`, that line's picture is the Expression, and an untagged line shows the Portrait;
  - the Character profile lists the Expression.

## Out of Scope

- More emotions, custom emotion names, several pictures per emotion, animated pictures.
- Drawing a whole set in one tap. Each Expression is its own confirmed request, as the decision says.
- Holding drawn candidates to pick from, as the Reference image does. A drawn Expression replaces the current one, after a confirm.
- Emotions for the user's lines, for narration, or for the Opening.
- A separate classifier call, or tagging Messages written before Expressions existed.
- Expressions in Snapshots (Snapshots keep using the Reference image), in Character card export, or chosen by the Story assistant.

## Further Notes

- **Blocking edges across features:**
  - The [Visual novel view](../chat-looks/spec.md) shows the speaking Character's Expression large. Its ticket is blocked by [03 — The Judge tags each line](issues/03-judge-tags-emotions.md), which brings in the shared line-picture helper with its whole-picture output.
  - Per [integration](../sillytavern-gaps/integration.md), Branch lands first: 03 adds per-Message data, so it is blocked by [Branch's copy ticket](../branch/issues/02-branch-a-chat.md) and extends that copy. The decision ticket listed Expressions as blocked by the Visual novel decision. That was the order of the decisions. The build order is the other way round, because the thread shows Expressions on its own.
- Cost: one Expression is the Snapshot model's 1K price ($0.04–$0.06 today), so a full set of seven is about $0.28–$0.42.
- Open question: should Expressions be drawn by a fixed model (for example `qwen-edit-uncensored`, $0.04) instead of the Settings Snapshot model? Recommended: the Settings Snapshot model. The user picked it for keeping people consistent, and one choice is easier to understand. Revisit if Loving pictures get refused on Seedream.
- Open question: should tagging run when no Character has Expressions, so tags exist the moment the first is added? Recommended: no. The decision keeps the Judge's call as it is, and Messages before the first Expression simply show the Portrait.

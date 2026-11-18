# Opening questions

Status: ready-for-agent

An author asks the user a few questions before a Chat begins, the way AI Dungeon's scenario
questions do: "What is your name?", "What is your trade?". The answers fill placeholders the author
wrote in the Opening and in the Role, so one Story starts a little differently for each Chat.

## Words

- **Opening question**: one question of a Story's, asked when a Chat starts. It has a
  **placeholder key** (`name`, `trade`), the **question** the user reads, and a **default answer**
  used when the user skips it or leaves it blank.
- **Placeholder**: `{key}` written in the Opening, the Role's Name or the Role's Description,
  where `key` is the key of one of the Story's Opening questions.
- **Opening answers**: what one Chat answered, kept on that Chat, one per question.

## Decisions

1. **Stored on the Story as one ordered list**, in a `jsonb` column `story.opening_questions`
   (default `[]`), written whole by `PUT /api/stories/:storyId/opening-questions`
   (`{ openingQuestions: [{ key, question, defaultAnswer }] }`), like Starting Beliefs. The
   editor's add, remove and reorder are all "send the list as it now reads". No ids: a
   question is its key.
2. **Rules for the list**, each refusing the whole list with `422.003.040`
   `InvalidOpeningQuestionsError` (nothing changes):
   - at most 8 questions;
   - a key is a lowercase letter, then up to 29 lowercase letters, digits or `_`
     (`^[a-z][a-z0-9_]{0,29}$`), after trimming and lower-casing;
   - no two questions share a key; `user` and `char` are not keys, since `{user}` already means
     the user in Memories and Beliefs and `{{user}}`/`{{char}}` are card macros;
   - the question and the default answer each have text (trimmed), at most 200 characters.
   Shape errors (not an array, a field that isn't a string, more than 200 characters) are `400`.
3. **Placeholders are plain `{key}`**, exactly, lower-case. Only keys of the Story's own questions
   are replaced; any other `{…}` is left as written. A Story with no questions changes no text.
4. **When a Chat is made** (`POST /api/stories/:storyId/chats`, body `{ answers?: { [key]: string } }`):
   every question gets the given answer, trimmed and with line breaks made spaces, at most 200
   characters; a missing, blank or unknown-to-the-form answer takes the default. Answers for keys
   the Story doesn't ask are ignored (the Story may have changed while the form was open). The
   resolved answers, one per question, are stored on the Chat (`chat.opening_answers`, `jsonb`,
   null when the Story asked nothing). The Opening Message is written with its placeholders filled.
5. **The Role is filled where it is read.** The Role lives on the Story, so `wornIdentity` (the one
   place the prompt, the Judge, Memory `{user}`, the Transcript, the Story so far and Snapshots take
   the user's name and description from) fills the Role's Name and Description with the Chat's
   answers. A key the Chat has no answer for (the author added the question after the Chat was
   made) takes the default. The Chat's `roleName` is the filled name too. A Persona is never
   filled: it is the user's own text.
6. **Reset keeps the answers**, like it keeps the title and the worn identity: the Opening as the
   Story has it now comes back filled with the Chat's answers (defaults for new questions).
   **A Branch copies them.** Duplicate copies the questions.
7. **Existing Stories and Chats stay as they are.** The migration only adds the two columns, with
   `[]` and null. No Story has questions, so no text is filled anywhere and every prompt is the
   same string as before. `POST …/chats` with no body behaves exactly as before.
8. **The editor's Opening preview** shows the Opening filled with the default answers.
9. **Character cards carry the questions.** Export writes them into Storytell's own block
   (`extensions.storytell.openingQuestions`), with the Opening as written (`extensions.storytell.opening`,
   placeholders kept) only when there are questions. The card's standard fields (`first_mes`, the
   `{{user}}` macro name) are filled with the defaults, so another app reads a whole Opening. A
   Storytell card with questions imports them; choosing the first greeting then takes the Opening
   as written from the block, and the Role's Name and Description come from the block as written,
   so placeholders survive the round trip. Any other card has no questions.
10. **Story drafting leaves the questions alone.** A drafted Story has none; a field rewrite keeps
    them, and the rendered Story it reads lists them (only when there are some), so a rewrite of the
    Opening or the Role can keep the placeholders. The Story assistant is the same.
11. **The start form is its own page**, `/stories/:id/new-chat`, reached from New Chat on the Chats
    page and on Home's Story sheet only when the Story asks questions; a Story with none starts
    the Chat at once, as before. The page lists each question as a labelled text box, empty, with its
    default as the placeholder text. **Start** sends what was typed (blank boxes take the default);
    **Skip, use the defaults** sends no answers. One column, 44px controls, fits 320px.

## User stories

1. As an author, I add an Opening question with a placeholder key, the question and a default
   answer, on the Story tab under the Opening.
2. As an author, I move a question up or down, and remove one (with Undo).
3. As an author, I write `{name}` in the Opening and the Role, and the editor tells me which keys
   I haven't used yet.
4. As an author, Preview the Opening shows it with the defaults.
5. As a player on my 360px phone, New Chat on a Story with questions shows a short form; I answer
   and tap Start, and the Chat opens with my answers in its Opening and my name as the Role.
6. As a player, I tap Skip and the defaults are used.
7. As a player, Reset keeps my answers; a Branch keeps them.
8. As a player of an older Story, nothing is different.

## Testing

- API (`apps/api/test/opening-questions.spec.ts`): the list saves, normalises and replaces; each
  rule refuses the whole list; a Chat with answers fills the Opening and the Role (the turn prompt's
  identity, the Chat's `roleName`) and stores the answers; blank and missing answers take defaults;
  no body uses defaults; a Story without questions makes a Chat exactly as before, `{x}` text left
  as written; Reset keeps the answers; Branch copies them; Duplicate copies the questions; Opening
  preview fills defaults; card export/import round-trips the questions.
- Pure (`apps/api/test/opening-questions-pure.spec.ts`): fill and resolve.
- e2e (`apps/web/e2e/opening-questions.spec.ts`): author adds two questions and uses them; starts a
  Chat from the Chats page, answers, sees them in the Opening; Skip uses defaults; Home sheet goes
  to the form; a Story without questions starts at once; the form fits at 360 and 320 without
  sideways scroll.

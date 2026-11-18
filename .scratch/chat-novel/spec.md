# Spec: Turn a Chat into a novel (the Book)

Status: ready-for-agent
Builds on: [Move on, and Chapters](../scene-chapters/spec.md) (a Chat's Chapters, one per ended Scene), [Cost view](../cost-view/spec.md) (a price shown before paying, as Draw Snapshot does), [Story so far](../story-so-far/spec.md) (how Messages are read back to a model), [Accounts](../accounts/spec.md) (the Monthly cap), [Text fallback](../text-fallback/spec.md) (the chain of hosts), [Streaming](../streaming/spec.md).
Built 2026-11-18. Terms: `CONTEXT.md` — Book, Book chapter, Chapter, Chat, Message, Role, Persona, Monthly cap.

## Problem Statement

A Chat is a story the user and the Characters wrote together, but it reads as a chat: the user's lines under their name, the AI's narration broken by speaker tags, a Scene strip, menus. Once a Chat has gone somewhere worth keeping, there is no way to read it back as a story, or to keep it outside the app. The Transcript is a plain dump of the Messages, and the Chapters are a few sentences each.

## Solution

**The Book.** From a Chat with ended Chapters, the user opens its **Book**: each Chapter rewritten by the play model as polished novel prose, one **Book chapter** per Chapter, each with a title. It reads in the Story's voice and tense, in the third person, with the user's Role (or the Persona they wore) written as a character like any other. There are no "@Name:" lines, no speaker tags, no notes or meta.

The user writes the Book a chapter at a time, or all of it at once, and sees what it will cost before anything is written. They can rewrite one chapter, or edit its title and text by hand. When the Messages of a Chapter change after its Book chapter was written, the Book chapter is marked **out of date** and keeps its text until the user rewrites it.

The **Book view** is a page of its own, made for reading on the phone: a serif text at a comfortable size and line length, Previous and Next chapter, Contents, and it remembers which chapter the user was reading and how far down. The whole Book downloads as an **EPUB**; "Print or save as PDF" prints it through the browser.

## User Stories

1. As a player, I want to read my Chat as a novel, so that the story I played reads like a book.
2. As a player, I want one book chapter per Chapter, each with its own title, so that the Book has a shape I recognise from the Scenes I played through.
3. As a player, I want the prose in the Story's tense, without any chat leftovers ("@Nara:", my name before my lines, notes), so that it reads as a story.
4. As a player, I want my Role written as a character by name, never as "you" or "the user", so that I am in the story like the others.
5. As a player, I want every Character written as an adult, so that the Book keeps the app's rules.
6. As a player, I want the Book to tell only what the Chat showed, so that a Character's Secrets and private plans stay hidden as they did in play.
7. As a player, I want to write one chapter, or every chapter not yet written, so that I choose how much to spend.
8. As a player, I want to see what writing will cost before I start, so that I am never surprised by a bill.
9. As a player, I want to see a chapter being written as it comes, so that a long write never looks stuck.
10. As a player, I want to rewrite a chapter, so that I can get another take.
11. As a player, I want to edit a chapter's title and text myself, so that I can fix a line or a name.
12. As a player, I want a chapter marked out of date when its Chapter's Messages change, and to keep its text until I rewrite it, so that I lose nothing and know what to redo.
13. As a player, I want a chapter whose Chapter was taken back to stay in the Book, marked, until I remove it, so that nothing I liked disappears by itself.
14. As a player, I want a failed write to say why and to keep the old text, so that I can try again later.
15. As a Member at my Monthly cap, I want writing refused before anything is spent, so that the cap holds.
16. As a player on a 360px (or 320px) phone, I want comfortable type, Previous and Next, and a Contents list I can tap, so that I can read the Book where I play.
17. As a player, I want the Book to open where I left off, so that I can read it over several sittings.
18. As a player, I want to download the Book as an EPUB, so that I can read it in a reading app or keep it.
19. As a player, I want to print the Book or save it as a PDF, so that I can keep it in another form.

## Implementation Decisions

### Domain

- **Book**: a Chat retold as a novel, made of Book chapters. A Chat has at most one Book. It belongs to the Chat and goes with it.
- **Book chapter**: the novel prose of one Chapter, with a title, written by the play model on the user's request or by the user's own hand, numbered as its Chapter is. It never changes the Chat, and no prompt reads it.
- A Chapter with no Messages (two Scene advances at one Message) has no Book chapter to write.
- The Chapter under way is not in the Book: only ended Chapters are. A Story with no Scenes has no Chapters, so its Chats have an empty Book that says so.

### Storage

A new table, `book_chapter` (migration `1764430000010-BookChapters`):

| column | |
|---|---|
| `id` | serial |
| `chat_id` | the Chat, `ON DELETE CASCADE` |
| `number` | the Chapter's number; unique per Chat |
| `title` | text, null until written |
| `text` | text, null until written |
| `written_by` | `ai` or `user` |
| `source_hash` | the hash of what the AI wrote it from (below); null until written |
| `scene_name` | the Chapter's Scene, stamped when written |
| `failed` | why the last try failed, or null |
| `created_at`, `updated_at` | |

- **Why not on the Scene advance**, as Chapters are: an advance goes when it is taken back (Regenerate, an edit), and the Book must keep its text until the user rewrites it. So a Book chapter is matched to its Chapter by **number**, which is stable: taking back an advance takes back every one after it too.
- **Source hash**: SHA-256 over the Chapter's Scene name and its Messages exactly as the writer reads them (speaker and text, in order). A Book chapter whose hash differs from its Chapter's now is **out of date**. One whose Chapter number no longer exists is **out of date** with its Chapter **gone**.
- The user's edit keeps the hash: the text still tells of the Messages it was written from, and goes out of date with them.
- **Branch** does not copy the Book: a Branch starts a new Book. **Reset** leaves it, every chapter then gone and out of date, for the user to remove. Deleting the Chat deletes it.

### Writing

- **Kind**: `book_chapter`, a play-model kind (the user's play model, as Diary entries are), sampled with the user's Sampling as Diary entries are. It goes through the gateway like any call, so it is recorded with its own kind, takes the chain of text hosts (a host out of credit is passed over), and is refused at a Member's Monthly cap.
- **Not a background kind**: it is never one of the never-refused kinds. The write endpoints check the cap first (402 `MonthlyCapReachedError`, nothing queued); a call that meets the cap anyway fails that chapter with the reason.
- **Streamed**: written with `streamText`. The text arriving is kept in memory and shown by the Book view, which reads the Book every 1.5 s while anything is being written. Nothing is stored until the write ends.
- **One run per Chat**, as Chapters: a chain of writes, one at a time, oldest first, so each can read the end of the one before it. A chapter asked for while it is queued or being written is not queued twice.
- **Write all** queues every chapter that is not written, or is out of date and not gone, oldest first. A chapter the user wrote by hand is left alone even when out of date: only **Rewrite** on it replaces their text (the view asks first).
- **The input** (`chapterNovelMessages`):
  - The Story's title and Setting, the Story's tense, the worn identity's name and its description (the Role or Persona: the user's own text), and each Character's name and Appearance. **Never** their Personality notes beyond that, Secrets, Arc directions, Beliefs, Thoughts, Diaries, Memories or Now notes: the Book tells only what the Chat showed, so nothing the Chat kept hidden can leak into it.
  - The Chapter's number and Scene name, then its Messages in order: a user Message as `[Name]` and its text, under the name worn when it was sent; an AI Message as `[Story]`, its narration as written and each speech line as `Nara: "…"`.
  - The last 600 characters of the Book chapter before it, when there is one, as context only, so the join reads smoothly.
  - No Scene situation or move-on condition: restating a Scene's goal made the Chapter writer claim it happened (scene-chapters, "How it is written").
- **The rules** it is given: novel prose in the third person and the Story's tense; the user's character by name, never "you", "the user" or "the player", and never a guessed gender; every event in order, the dialogue that matters kept in quotation marks, nothing added that changes what happened, no motive or secret the Messages don't show; no speaker tags, no "@", no brackets, no headings, lists or notes; everyone an adult; about the target length; first line `Title: <a title of 2 to 6 words>`, then a blank line, then the prose.
- **Length**: the target is the Chapter's own word count, at least 400 and at most 2,000 words. `maxTokens` is 6,000: GLM-5.3 always spends a little on reasoning (it can't be turned off on DeepInfra), and about 1.4 tokens a word leaves room.
- **Output guard** (`parseBookChapter`, `bookChapterRejection`): the title is read from `Title:`, a `#` heading or a bold first line; without one, the Scene name stands in. The write fails, with the reason, when the answer used the whole cap (cut off), is empty, or still has chat leftovers (a line starting `@Name:` or `[Name]`). It is **not** asked for again by itself, since every try is a paid play-model call: the user sees why, and Try again.
- **When it lands**: the text, title, Scene name and hash are stored only if the chapter was not edited by the user meanwhile (the user's edit wins over a write that finishes after it). A failure keeps any old text and records why.

### Price

- Each chapter that can be written carries `priceUsd`, and the Book carries `writeAllPriceUsd` for what Write all would write: the prompt's length in characters ÷ 3.5 as tokens at the play model's input price, plus the target words × 1.5 as tokens at its output price, from `PLAY_MODEL_CATALOGUE`, rounded up to the next tenth of a cent. It is an estimate, so the view says "about": **Write chapter · ~$0.012**, **Write all 4 · ~$0.05**.
- The prices are list prices on DeepInfra, as Settings shows them; a call another host serves costs what it costs there. The usage record holds the real cost.

### API

Under `/api/stories/:storyId/chats/:chatId/book`:

- `GET` → the Book: `title` (the Story's), `chatTitle`, `identityName`, `writing` (any write queued or running), `writeAllCount`, `writeAllPriceUsd`, and `chapters`, oldest first, each with `number`, `sceneName`, `title`, `text`, `writtenBy`, `state` (`unwritten`, `queued`, `writing`, `written`, `failed`, `empty`), `outOfDate`, `chapterGone`, `draft` (the text so far while writing), `failedReason`, `priceUsd` (null when it can't be written: empty or gone), `updatedAt`. A gone chapter shows its stored Scene name.
- `POST /write` with `{ numbers?: number[] }`: writes those chapters (each must be writable: not empty, not gone), or Write all when none are named. Answers the Book. 402 at the Monthly cap; 409 when nothing is left to write.
- `PUT /chapters/:number` with `{ title, text }`: the user's edit; both required, not blank. Answers the Book. 409 while that chapter is being written.
- `DELETE /chapters/:number`: removes a Book chapter's stored text (for a gone one, the whole entry). 409 while it is queued or being written.
- `GET /epub` → `application/epub+zip`, as an attachment named after the Story and Chat titles (as the Transcript is). 409 when no chapter is written.

### EPUB

- EPUB 3 with an EPUB 2 `toc.ncx` too, so older readers show the contents: `mimetype` stored first and uncompressed, `META-INF/container.xml`, `OEBPS/content.opf`, `nav.xhtml`, `toc.ncx`, a title page (the Story's title and the Chat's), and one XHTML file per written chapter (out-of-date ones included, as they read now). Unwritten chapters are left out.
- **No new dependency**: a ZIP writer of about 80 lines over `node:zlib` (`deflateRawSync`) with its own CRC-32 table, since `zlib.crc32` needs Node 22.2. Text is escaped for XML; paragraphs are split on blank lines.

### PDF

- **Cheap and good enough**: "Print or save as PDF" in the Book view calls the browser's print, with a print stylesheet that hides the app and lays out every written chapter, each on a new page, in the reading type. Phones and desktops both save that as a PDF. No server PDF: embedding fonts for Thai names and quotes well would be a dependency or a lot of code.

### Web

- **Entry**: the Chat menu's "This Chat" group gains **Book** ("Your Chat as a novel"), for a Story with Scenes; the Chapters sheet gains a **Read as a Book** link at the top.
- **Book view** (`/stories/:id/chats/:chatId/book`):
  - A top bar: back to the Chat, the Story's title, and **Contents**.
  - The chapter: "Chapter N" small above its title, then the prose in a serif face, 1.125rem, line height 1.7, at most 36rem wide, with 16px side gutters. Paragraphs are split on blank lines.
  - Out of date: a note above the text, "Its Chapter changed since this was written." (or "Its Chapter was taken back."), with **Rewrite** (or **Remove** when gone).
  - Unwritten: "Not written yet." and **Write chapter · ~$…**.
  - Writing: the draft as it comes, with "Writing…". Queued: "Waiting its turn…".
  - Failed: "Couldn't write this one: <reason>", **Try again · ~$…**, and the old text below when there is one.
  - Written: **Rewrite · ~$…** and **Edit** under the text. Edit is a title field and a textarea with Save and Cancel. Rewrite on a chapter the user wrote asks first ("This replaces your own text.").
  - Below: **Previous** and **Next** (44px), and "N of M".
  - **Contents** sheet: each chapter as "N · Title" (or the Scene name until written) with its state, tap to read it; **Write all N · ~$…** when there is anything to write; **Download EPUB**; **Print or save as PDF**.
- **Remembers where you are**: the chapter number and how far down it (a fraction) are kept per Chat in this browser's storage (`storytell:book:<chatId>`), read in a try/catch, and restored on open. Without storage it opens at chapter 1.
- Everything fits at 360 and 320px wide; every control is a 44px target.
- **Usage**: the Usage page lists `book_chapter` as "Book chapters".

## Testing Decisions

- **Pure** (`apps/api/test/book-pure.spec.ts`):
  - the writer's input: Messages read with names, speech as `Name: "…"`, no Secrets or Personality in it, the previous chapter's tail as context, the tense and the adult rule;
  - the target length and the price;
  - parsing the title (each form, and the Scene name standing in) and the guard (cut off, empty, `@Name:` leftovers);
  - the source hash changes when a Message in the Chapter changes and not when one outside it does;
  - the EPUB: a valid ZIP (stored `mimetype` first, the CRC of each entry, the central directory), its files, the escaped text.
- **API** (`apps/api/test/book.spec.ts`, fake gateway, scripted Judge and `book_chapter`):
  - the Book lists the Chapters, unwritten, with prices; an empty Chapter is `empty`;
  - write one: streamed, stored with its title, recorded under `book_chapter`, the prompt free of Secrets;
  - Write all writes the rest oldest first, each reading the one before; the chapter being written shows its draft;
  - a failed write keeps the old text and says why; Try again writes it;
  - the user's edit is kept, and a write finishing after it does not replace it;
  - a Regenerate of a Chapter's last reply makes its Book chapter out of date (or gone), with its text kept; Rewrite brings it up to date;
  - a Member at their cap is refused (402) and nothing is called;
  - EPUB downloads with the chapters; another Account's Chat is not found.
- **e2e** (`apps/web/e2e/chat-novel.spec.ts`, phone size with touch, then measured at 360 and 320): open the Book from the Chat menu, see the price on Write, write all, read chapter 1 and go Next, edit a chapter, see it out of date after a Regenerate, reload and land on the same chapter, the Contents sheet, the EPUB download. Deletes every Story it makes.

## Out of Scope

- A Book for a Story without Scenes, or a Book chapter for the Chapter under way.
- Pictures (Snapshots, the Cover) in the Book or the EPUB.
- Choosing the Book's point of view or a different style from the Story's.
- A server-made PDF.
- Copying the Book to a Branch.
- Translating the Book (Thai reading is per Message).

## Further Notes

- Not tried with a real model. A paid check worth running later: write two Chapters of live Chat 2 (GLM-5.3, about 2 calls of 10–20k tokens in and 2–3k out, about $0.03 in all) and read them for chat leftovers, the user's character written as "you", invented events, and anything a Character kept secret.
- If GLM-5.3's reasoning tokens turn out to eat the 6,000 cap on long Chapters, raise `BOOK_CHAPTER_MAX_TOKENS` rather than shortening the target.

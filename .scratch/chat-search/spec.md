# Search and Bookmarks in a Chat

Status: ready-for-agent

Long Chats are hard to find your way around: the live "Chat 2" has more than 700 Messages, and
the only way back to a moment is to scroll. This adds two ways to get there: **Search** the
Chat's words, and **Bookmarks** the user puts on Messages they want to come back to. Both lead
to the Message in the thread, outlined, as a Memory's jump link already does.

## Decisions

- **One sheet, two tabs.** A magnifier in the Chat's top bar ("Search this Chat") opens a sheet
  titled "Find in this Chat" with two tabs, **Search** and **Bookmarks**. The top bar has room for
  one more 44px button at 320px wide; the title already cuts to one line. Search opens first,
  with the field focused.
- **What Search reads.** The text of user Messages and of each part of an AI Message (narration
  and each Character's speech), as the screen shows them: AI parts with the Chat's *On AI
  Messages* Replace rules applied, as the Transcript does, since a word a rule changed is not the
  word the user sees. Not the Thai readings, Thoughts, Reply versions not shown, Memories or the
  Story so far: they are not the Chat's Messages.
- **How it matches.** A plain substring, case-insensitive, after runs of whitespace (newlines
  included) become one space on both sides. No word splitting: Thai has no spaces between words,
  so "word" boundaries would miss most Thai matches. Case folding is done by the API in
  JavaScript, one code point at a time, so it works the same whatever the database's locale (the
  test database runs with `--locale=C`, where Postgres `lower()` folds ASCII only).
- **Where matching runs.** In the API, over the Chat's Messages loaded once: a 700-Message Chat
  is a few hundred kilobytes, read in milliseconds, and keeps one definition of a match for every
  language. No index or new column.
- **What a result is.** One per matching *part*: a user Message is one part; an AI Message has a
  result for each of its parts that matches, since each has its own speaker. Each result names
  who said it (the user's stamped identity name; a Character's name; "Narrator" for narration),
  shows a snippet of about 120 characters around the first match in that part with the match
  marked, and says which Message of the Chat it is ("Message 412").
- **Order and limits.** Newest first, since the recent story is what the user most often looks
  back at. At most 50 results; the sheet says "Showing the newest 50 of 213" when there are more,
  so the user types more words. The field searches once at least 2 characters are typed, 300ms
  after the last keystroke; at most 200 characters.
- **Snippets cut cleanly.** A snippet never starts or ends inside a character: not inside a
  surrogate pair, and not on a Thai vowel or tone mark (any `\p{M}` combining mark), which would
  draw on a dotted circle. It cuts at a space when one is near, else mid-word (Thai), with "…"
  at a cut end.
- **Jumping.** Tapping a result or a bookmark closes the sheet, scrolls the thread to the Message,
  outlines it and moves focus to it (without scrolling again), so a screen reader lands there too.
  From the Visual novel view it switches to the thread first, as a Memory's jump link does. The
  Chat screen already renders every Message at once (no paging), so there is no history to load
  around the result: the Message is always in the page.
- **A Bookmark is a mark on one Message**, per Chat, with no note and no name. Any Message can be
  bookmarked: the Opening, a user Message, an AI reply, the newest one.
- **Marking.** "Bookmark" in the Message's actions: the newest reply's action row, and the tools a
  tap shows under any other Message, just before Branch. It is a toggle: on a bookmarked Message
  it shows pressed (a filled icon), and a tap removes the mark. Its label stays "Bookmark" either
  way, so the action row's measured widths hold and the row never reflows under the finger. A bookmarked Message shows a small "Bookmarked" line under it, so the user sees
  their marks while scrolling. Marking needs no turn and is never held by a turn in flight; it is
  hidden while a turn or write runs only because the Message's actions are.
- **The Bookmarks tab** lists the Chat's bookmarks in thread order (oldest first: they are
  places in the story), each with who spoke and the start of the Message, and a remove button.
  Empty, it says how to add one.
- **What happens to a Bookmark when the Chat changes.** It belongs to its Message:
  - Editing a Message keeps that Message's bookmark (the Message stays, under its id); the
    Messages after it are discarded, and their bookmarks with them.
  - Regenerate and choosing a Reply version keep the newest reply's bookmark: it marks that place
    in the story, whichever take is shown.
  - Reset drops them all: it deletes every Message and writes the Opening afresh from the Story
    (which the author may have changed), so no Message of the old Chat is left to mark.
  - Deleting the Chat drops them all.
- **Branch copies the bookmarks of the Messages it keeps** (at or before the Message branched
  from), to their new ids, as it copies Thai readings. A Branch is "everything that Chat knew at
  that Message"; the user's marks on those Messages are how they find their way in the shared
  history. After that the two Chats' bookmarks are separate.
- **Storage.** A `message_bookmark` table: one row per bookmarked Message (`message_id` unique,
  `ON DELETE CASCADE`), with its `created_at`. The cascade is what makes edit, Reset and delete
  drop the right ones without code of their own. No column on `message`, so the many Message
  queries and the Branch's Message copy stay as they are.

## API

All under `/api/stories/:storyId/chats/:chatId`, for the signed-in Account's Story only (another
Account's Chat answers 404, as every Chat endpoint does).

- `GET search?q=<text>` → `{ total, hits: [{ messageId, kind: 'user'|'ai', speaker, snippet, match: { start, length } }] }`.
  `q` is required, 1 to 200 characters once trimmed, else 400. `total` counts every matching
  part; `hits` holds the newest 50. `match` is where the match is in `snippet`.
- `GET bookmarks` → `{ bookmarks: [{ messageId, kind, speaker, snippet, createdAt }] }` in thread
  order. For an AI Message `speaker` is its speakers in order, joined ("Mira and Nara"), or
  "Narrator" when no one speaks; `snippet` is the start of the Message's text.
- `PUT messages/:messageId/bookmark` and `DELETE messages/:messageId/bookmark` → the same list
  after the change. Both are idempotent. A Message not in this Chat answers 404.

## User stories

1. As the user deep in a 700-Message Chat, I tap the magnifier, type a name or a Thai word, and
   see the newest places it was said, each with who said it.
2. As the user, I tap a result and land on that Message, outlined, wherever I was reading.
3. As the user, I search in Thai without spaces and in English in any case, and both match.
4. As the user, I bookmark a reply I loved from its actions, and later open Bookmarks and jump
   back to it.
5. As the user, I remove a bookmark from the Message or from the Bookmarks list.
6. As the user, I Branch from a bookmarked moment and the Branch keeps my bookmarks up to there.
7. As the user on a 360px (and 320px) phone, the sheet, its tabs and its results fit without
   sideways scrolling, and every target is at least 44px tall.

## Testing

- **API** (`apps/api/test/chat-search.spec.ts`, Vitest against the test Postgres):
  - search matches user Messages and each AI part, case-insensitively, newest first, naming the
    speaker (user identity, Character, Narrator), with the match marked in the snippet;
  - Thai substring matching, mid-word;
  - whitespace and newlines collapse; Replace rules on AI Messages apply to what is searched;
  - the 50-hit cap with `total`; a blank or over-long `q` is 400; another Chat's or Story's 404;
  - bookmarks: put, delete, both idempotent, list in thread order with speaker and snippet;
    a Message of another Chat 404;
  - an edit drops the bookmarks after the edited Message and keeps its own; Reset drops them
    all; Regenerate keeps the newest reply's;
  - Branch copies the bookmarks at or before the Message, to the Branch's own ids, and not later
    ones; the source keeps its own.
  - Pure tests of the matcher and snippet cutter (`chat-search.ts`): code-point case folding that
    keeps offsets, Thai combining marks and surrogate pairs at cut ends.
- **e2e** (`apps/web/e2e/chat-search.spec.ts`, at 360px with touch, and a 320px layout check):
  search a long seeded Chat, tap a result and see that Message outlined in view; bookmark from a
  Message's actions, see the "Bookmarked" line, find it in Bookmarks, jump to it, remove it; no
  sideways overflow in the sheet at 360 and 320.

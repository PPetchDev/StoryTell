# 03 — Preview a card and choose its greeting

**Status:** done

**What to build:** Before anything is made, the user sees what the card is and chooses which greeting becomes the Opening (spec: "API", "Web"). `POST /api/stories/from-card/preview` (multipart `card`) reads the card, writes nothing and makes no call, and answers the spec's `CardPreview`: format, title, Character name, creator, creator's notes (cut to 2,000 characters), the greetings (`first_mes` then `alternate_greetings`, each cut to 300 characters, macros as written), how many Lore entries will come along, whether there is a picture, the Role name from a Storytell card's own block, and the "won't come along" lines (spec: "What doesn't come along"). On Home, picking a file calls the preview; the panel shows name and creator, creator's notes in a fold, the greetings as a choice with the first chosen, "n Lore entries", the "Won't come along" list in a fold, and the name field (filled from `roleName` when the card has one). Import sends the chosen greeting's number.

**Blocked by:** [02 — Import a PNG Character card with its picture](02-import-a-png-card.md)

- [x] Pure tests: the left-out lines for a card that has a system prompt, post-history instructions, tags, unchosen greetings, disabled entries, entries past 200, regex keys and a text over 20,000 characters; none for a bare V1 card.
- [x] API tests: preview answers the shape for V1, V2 and V3 cards and leaves no Story or file; from-card with `greeting: 2` takes the second alternate greeting as the Opening; an out-of-range greeting is `InvalidGreetingError` and makes nothing; a card carrying an `extensions.storytell` block, built in the test as ticket 01's tests build one (the exporter comes in ticket 04), previews with its Role name.
- [x] e2e (390px): pick a card with two alternate greetings, choose the second, import; the editor's Opening is that greeting; the "Won't come along" fold lists the card's system prompt.

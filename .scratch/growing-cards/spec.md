# Spec: Growing cards (the Now note)

Status: ready-for-human
Builds on: [Spec: Place, Weather and Outfits](../info-box/spec.md) (the detail records a Now note joins), [Spec: Character minds](../character-minds/spec.md) (Goals, kept by the Judge the same way), [Spec: Prompt cache](../prompt-cache/spec.md) (what may go in the standing system message and what must go in the closing user message)

Built 2026-11-18. The user, after Nara's Voice still said she calls the user "traveller" while she was married to him in Chat 2: a card "should change with the story".

## Problem Statement

A Character's card belongs to the Story, and every Chat of the Story reads the same card. Live Story 1 has Chat 1 and Chat 2 at different places in the story, and every new Chat starts from the Opening. So a card that says how a Character is at the start ("calls the user *traveller*") is wrong for a Chat where the story has moved on ("married to him since the summer market"), and a card rewritten for one Chat is wrong for the others.

On 2026-11-18 Nara's Voice was rewritten by hand to cover every stage. That does not scale: each new change in each Chat would need another hand edit to a card all the Chats share.

What a Chat already keeps per Character (Bonds, Arcs, Goals, Outfits, Memories, Beliefs, Diary inner life) covers feelings, personality, aims, clothes and events. None of it says, plainly, what is true of the Character *now* in this Chat where it differs from the card: what they call the user, what they are to the user or to others, and what the story has changed in their life for good.

## Solution

- **A Now note per Character per Chat.** A few short sentences, stated as facts in the present tense, of what has lastingly changed about the Character in this Chat compared with their card: what they call the user now, what they are to the user or to others now (betrothed, married, lovers, sworn enemies), and lasting changes the story made to their life (a new home, a title, an injury). For example: "Calls {user} 'my love' or 'Petch', no longer 'traveller'. Married to {user} since the night of the summer market. Lives in {user}'s house above the stall." At most 300 characters. None until something changes.
- **The Judge keeps it up to date**, the way it keeps Goals: it is shown each Character's note and gives a whole new note for a Character when the latest exchange makes a lasting change, or shows one the note does not have yet.
- **The Narrator reads it next to who the Character is**: a layer "Changed in this Chat" after the Arcs, saying that where it differs from the card, it holds; and "Where things stand" then asks to keep each Character as their card describes *with what has changed in this Chat*.
- **The user sees it, edits it and clears it** on the Character's profile, under "Changed in this Chat".
- **It goes back with the Message that caused it.** Regenerate, an edit, another Reply version or Reset takes a Judge's change back; a Branch carries the note as it stood at its Message.

## Implementation Decisions

### Where it is kept

- **A Now note is a detail record** (`detail_change`, kind `now`), per Character like a Goal: `value` is the whole note, the newest record of a Character is current, an empty value clears it. So the ledger rolls a Judge's change back with the reply that made it, Reset clears every note and a Branch copies them, with no code of their own.
- **The user's own edit is a detail record with no Message** (`message_id` NULL). It was not caused by the story, so no rewind of a Message takes it away: a Regenerate right after the user corrected a note keeps the correction. It is still the newest record, so it wins until the Judge changes the note again; and when a later Judge change is taken back, the user's wording is current again. Reset clears it with the rest. A Branch copies it, as it copies a Starting Bond (also tied to no Message).
- **One migration** adds `now` to the kind check and lets `message_id` be NULL.
  - The kind check is rebuilt from the constraint as it stands, plus `now`, rather than written out in full. The story-quality branch adds `fact` and `slip` to the same check; written this way, neither migration drops the other's kinds, whichever runs last. (A migration that writes the full list without `now` would fail on live once any Now note exists, since the check is validated.)
- **`{user}` stands for the user**, as in a Memory: the Judge is asked to write `{user}`, and the worn identity's name in a note (from the Judge or the user) is turned into `{user}` when it is kept, so the note reads right after a Persona swap. The profile shows it with the worn identity's name.

### The Judge

- **The details section shows the notes and the rule**, after the exchange, so the Judge's system message never changes (like Goals). Each Character's line reads their note, "nothing yet", or "cleared by the user".
- **The rule** asks for `"now": [{"character": "Name", "note": "..."}]` inside "details" (read at the top level too, as Goals are):
  - only when the latest exchange makes a lasting change, or shows one the note lacks (seen on live: a long Chat already under way has its changes before any one exchange, so a Character in the latest exchange with "nothing yet" gets their note once the story so far shows a lasting change, as with Goals);
  - the whole new note, keeping what still holds and dropping what the story has undone;
  - plain facts in the present tense, at most three short sentences, `{user}` for the user;
  - never feelings (a Bond), personality (an Arc), aims (a Goal), clothes (an Outfit), or what happened in a scene (a Memory);
  - never for the user's own character; never for a Character sitting out.
  - "Cleared by the user" means the user took the note away: give one only for a change the latest exchange itself makes, not from the story so far.
- **What code checks**, after reading it loosely:
  - a Character of the cast, not sitting out, one note a turn;
  - tidied to one line, cut to 300 characters at the last sentence end that fits (or at a word);
  - **not an instruction**: a note with a sentence that tells someone what to do ("Make her…", "Always…", "Never…", "Remember…", "Keep…", "Use…", "Do not…") or that speaks of the Narrator, the AI, the model, the story or the reply as a thing to steer, or uses "should" or "must", is refused and logged. A note is what is true, and the Narrator reads it as such; directions belong to the Author's note.
  - unchanged (same text, case and spacing aside) is not a change; an empty note when there is none is not a change.
- The Judge's token cap grows by 120 for the field.

### The Narrator

- **A moment layer, "# Changed in this Chat"**, after "# Arcs", one line per Character with a note, in cast order, with `{user}` rendered: `- Nara: Calls Petch 'my love'…`. Its heading says what it is: "(what is true of them now in this Chat; where it differs from their card, this holds)". None when no Character has a note, so a Chat without notes reads exactly as before.
- **Why a moment layer, not the card in the standing system message.** The card is in the standing message (the cached opening). A note changes rarely, but each change to the standing message makes the next turn read nothing from cache: about 10k tokens at $1.30 per million instead of $0.10, about $0.012. In the moment layers it is never cached, but small: a few notes of at most 300 characters, under 100 tokens each. Suggested replies and Write for me read the same moment layers, so they write the user's lines with the same names and the same marriage.
- **"Where things stand"** says "keep each Character as their card describes, with what has changed in this Chat" when any Character has a note; otherwise its sentence is as before.
- The Story so far trigger already counts the moment layers, so the notes' room is counted with them.

### The profile and the API

- **`ChatDetail.nowNotes`**: `[{ characterId, note }]`, in cast order, a cleared one left out, `note` with `{user}`.
- **`PUT /api/stories/:storyId/chats/:chatId/characters/:characterId/now`** with `{ text }` (at most 300 characters): the user's own note, trimmed, with the worn identity's name turned into `{user}`; whitespace only clears it. A Character not in the cast is 404. Like the Author's note it takes no turn lock: a Judge already running may still change the note after it.
- **The profile sheet** shows "Changed in this Chat" under "Wants now" when a Character has a note, with an Edit button; and an "Add what changed" button when they have none. Editing opens a textarea (300 characters, with a counter and a hint that it is facts, not directions), Save and Cancel, and Clear when there is a note.

## Testing Decisions

- API, pure (`test/growing-cards.spec.ts`):
  - the current note: newest record wins, empty clears, a user's record wins until a newer one, "cleared by the user" is known;
  - the Judge's section shows notes, "nothing yet" and "cleared by the user", and the rule;
  - reading the answer, inside and outside "details";
  - applying it: new, changed, unchanged, unknown, sitting out, a second one, cut at a sentence, an instruction refused, the identity name turned into `{user}`;
  - the Narrator's layer: after Arcs, in cast order, `{user}` rendered, heading; none without notes, and "Where things stand" as before.
- API, HTTP with the fake gateway:
  - a note the Judge sets shows on the Chat and is in the next turn's closing message; Regenerate takes it back;
  - the user's edit shows, is read by the next turn, survives a Regenerate, and Clear takes it away; an unknown Character is 404; too long is 400;
  - a Branch carries the note as it stood at its Message; Reset clears it.
- Browser (`e2e/growing-cards.spec.ts`): the profile shows the Judge's note under "Changed in this Chat"; the user edits it and clears it.

## Out of Scope

- Writing a Now note into the card itself, or offering to ("make this the card's Voice").
- Feeding the note to Thoughts, the Diary writer or the Snapshot writer.
- A history of a note's changes (the Bond history has one; this has none yet).

## Further Notes

- **Smoke check on the free model** (2026-11-18, `nvidia/nemotron-3-ultra-550b-a55b:free`, reasoning off, JSON mode, $0; not the Judge's live model, V4 Flash). The Judge prompt was built by `buildJudgePrompt` with the details and Now sections, on three made-up Chat 2-like exchanges, nine calls in all:
  - *Married, no note yet*: every run gave Nara "Calls {user} 'husband'. Married to {user} since the night of the summer market. Lives in the rooms above the milk stall with {user}." Code kept each one.
  - *A note already there, nothing lasting in the exchange*: no `now` given, every run.
  - *Dulcie gets engaged in the exchange*: "Betrothed to Oren, the miller's son. Will marry at harvest and move to the mill."
  - **What it got wrong:** in the first case it also gave Dulcie, who only watched the wedding, a note ("Witnessed Nara and {user}'s wedding… sharp-tongued protectiveness"). The rule now says what someone saw or did is not a change to them, and that a new tie (now {user}'s sister-in-law) is. After that Dulcie's note led with "Now {user}'s sister-in-law" but still carried some personality ("Sharp-tongued and nosy"). Worth reading the first notes the live Judge writes.

- **Overlap with Established facts** (story-quality branch): a fact list may also say "Nara is married to Petch". The two differ in kind: facts are canon numbers, names and relations the story must not contradict, read last; a Now note is how one Character is now, read next to who they are. Saying a marriage in both costs a few tokens and contradicts nothing. If both land, the Judge's rule for facts could leave relationship status to the Now note.
- **For live Chat 2**: Nara's hand-written Voice (2026-11-18) can go back to how she is at the start, and her note can say how she is now; the Judge will write one the first turn she is in, or the user can write it on her profile.

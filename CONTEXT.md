# Storytell AI

A personal app for roleplaying with AI-driven characters inside stories.

## Stories

**Story**:
A Setting plus a cast of Characters and a Role for the user, drafted with AI and edited by its author; only the author changes the cast, never the AI during play.
_Avoid_: Plot, world, scenario

**Setting**:
The place, situation and premise a Story takes place in; every Story has one.
_Avoid_: Scene, world, background

**Scene**:
An optional, author-defined stage of a Story that the plot moves through in order, each ending when its plain-language move-on condition is met and its Bond gates all hold, or when the user Moves on; a Scene steers the story but never limits what the user or the Characters can do.
_Avoid_: Chapter (a Chapter is what happened in one Chat while it was on a Scene), act, stage

**Move on**:
The user ending the Chat's current Scene themselves, to the next Scene in order or one they choose, or into free play. It is a Scene advance like the Judge's, made at the Chat's newest AI Message, so taking that Message back takes the move back.
_Avoid_: Skip, next scene, advance (alone)

**Chapter**:
The part of one Chat played in one Scene, from where the Scene began to the Scene advance that ended it, with a short summary written in the background when it ends, for the user to read and edit. No prompt reads it. A Chapter goes when the advance that ended it is taken back.
_Avoid_: Scene, episode, recap, Story so far

**Lingering Scene**:
A Scene that has lasted many replies without moving on. The Narrator then has the Characters open the way toward its move-on condition and gates, without acting for the user.
_Avoid_: Stuck Scene, stalled Scene

**Passed-by Scene**:
A Scene that has lasted a long time while the story clearly went somewhere its move-on condition can no longer happen soon. The Judge moves it on to the next Scene even though its condition and gates were never met.
_Avoid_: Skipped Scene, forced advance

**Bond gate**:
A condition on a Scene that one Bond has reached at least a given level on one Bond axis ("Nara toward the user: Trust at least *close*"). A Scene moves on only when all its gates hold, as well as its move-on condition when it has one.
_Avoid_: Bond requirement, unlock, threshold

**Sudden event**:
An optional, author-written moment of pressure in a Story: a trigger in plain language, a Gauge, a number of replies, and what follows a success and a failure. It begins in a Chat when its trigger happens there, runs once per Chat, and ends in success or failure; unlike a Scene it is not a stage of the plot and can begin at any point. Where the author lets it, the story may also **make one up** in a Chat: the Judge proposes it, shaped the same, and it begins only when the user starts it; it belongs to that Chat alone, never to the Story.
_Avoid_: Quest, challenge, encounter, mini-game, skill check

**Gauge**:
What a Sudden event measures, named by the author ("Suspicion", "Nerve"): a number from 0 to 100 that each reply moves by how the user played it, with a sentence saying why. The user must bring it down, or up, to its goal before their replies run out; its far end fails at once. The user sees it as a number, unlike a Bond's levels.
_Avoid_: Meter, stat, score, bar, HP

**Ending**:
A way a Story can end. The author may write a Story's Endings: each a name, when it is reached in plain language, and what its Epilogue should tell. In a Story with none of its own, the AI may **suggest** one, with a name, when the story comes to a natural close; the user can say "not yet", and then none is suggested again in that Chat until they turn suggestions back on there. A Chat **reaches** an Ending when its condition has happened there, or when one is suggested, and reaches at most one; another Chat, or a Branch from before it, can find another. Reaching one closes nothing: the Chat can be played on. The Narrator is never told the Endings, so they are found by how the story is played, where a Scene steers it.
_Avoid_: Finale, outcome, route, win condition, game over

**Epilogue**:
The story's closing passage in one Chat, written by the Narrator when the user asks: how things settle after the Ending the Chat reached, or after an end the user chose themselves in a Story with none. It is an AI Message like any other, so the story can go on after it, and Regenerate writes it as an Epilogue again. It stands outside a Sudden event: it is not one of the replies the event has.
_Avoid_: Afterword, outro, final message, summary

**Lore**:
A Story's notes about its world, each a **Lore entry**: a name, keywords and a short text about a place, people, custom or object. An entry reaches the Narrator only when its triggers come up in the latest exchange or in another entry already chosen, for a few Messages after that when it is set to stay, or on every turn when it is set to always be included; the Setting stays the short core sent on every turn. Lore is common knowledge in the world, so every Character knows it; a Character's secrets stay on their card. A Story's own Lore belongs to that Story and is shared by all its Chats, where a Memory belongs to one Chat; a Story also reads the Lore of the Lore sets it links.
_Avoid_: Lorebook, world info, codex, wiki

**Lore set**:
Lore entries kept apart from any one Story, belonging to the Account and linked to each Story that shares them, for a world more than one Story is told in. A Story reads a linked set's entries exactly as its own; a change to the set is the change in every Story that links it. Unlinking a set takes it off one Story and keeps it; deleting it takes it, and its entries, from all of them.
_Avoid_: Shared lorebook, sourcebook, world, library, pack

**Document**:
A longer text the author attaches to a Story — pasted, uploaded or taken from a web page — whose passages reach the Narrator when they are close in meaning to the latest exchange. Like Lore it is common knowledge shared by all the Story's Chats, but it is found by meaning, not by keywords, and is never edited into entries.
_Avoid_: Data bank, attachment, file, source

**Character card**:
A character in the community card format (a PNG or JSON file) used by other roleplay apps. Importing one makes a new Story around that character; any Character can be exported as one.
_Avoid_: Tavern card, bot card, character file

**Opening**:
The author-written passage that begins every Chat of a Story.
_Avoid_: Intro, greeting, first message

**Opening question**:
A question the author has a Story ask when a Chat starts ("What is your name?"), with a placeholder key and a default answer. The answer fills `{key}` in the Opening and the Role for that Chat alone and is kept on it; skipping takes the default. Reset keeps a Chat's answers and a Branch copies them.
_Avoid_: Prompt, form field, variable, intro question

**Character**:
An AI-played figure with its own personality and voice, belonging to one Story's cast.
_Avoid_: Bot, agent, AI

**Narrator**:
The AI voice that describes the Setting and action and decides which Characters speak.
_Avoid_: Game master, GM, system

**Role**:
The part a Story defines for the user to play; every Story has one.
_Avoid_: Player character, protagonist

**Persona**:
The user's own reusable self-description, which can be worn in place of a Story's Role. It may have a picture the user uploads, its **Persona image**, which shows beside the user's lines in a Chat that wears it; unlike a Character's Reference image no model ever sees it.
_Avoid_: Profile, avatar, user character

**Cover**:
The picture the author chooses for a Story, shown on its card on Home and at the top of its editor, cropped around a focus point the author taps. It is a Snapshot from the Story's Gallery, a Character's Reference image (which it follows when that is replaced), or a picture uploaded from the phone; only an uploaded one belongs to the Cover and is deleted with it. Without one, Home shows the newest Snapshot.
_Avoid_: Thumbnail, banner, key art

**Duplicate**:
Making a new Story, "<title> (copy)", from everything the author wrote in another: its text, Opening questions, style, Narration voice and Backdrop choice, Role, Characters with their Reference images, Portraits, Expressions and Speaking voices, Scenes, Sudden events, Endings, Starting Bonds, its own Lore and its links to Lore sets (the sets themselves are shared, not copied), Documents, its own Saved replies and Replace rules, and Cover, each image in a file of its own. No Chats or Snapshots come along, so a Cover that is a Snapshot is dropped.
_Avoid_: Clone, fork, template

## Playing

**Chat**:
One playthrough of a Story with its own message history; a Story can have many Chats, and a Chat can be reset to its start.
_Avoid_: Session, playthrough, conversation, thread

**Message**:
One entry in a Chat's history: either what the user wrote, shown under the Role or Persona they wore at the time, or the AI's reply, which is narration and Characters' speech in order. A Chat begins with the Opening as its first Message. Editing a Message discards every Message after it.
_Avoid_: Post, reply, bubble, entry

**Branch**:
A new Chat copied from another up to one of its Messages, with everything that Chat knew at that Message — Memory, Bonds, Arcs, Scene, Time of day, Place, Weather, Outfits, Diaries, a Sudden event under way, an Ending reached — so the story can go another way while the original stays as it was. A Branch remembers which Chat it came from.
_Avoid_: Fork, checkpoint, clone, copy

**Author's note**:
The user's own standing direction for one Chat ("keep it a slow burn"), read by the Narrator every turn. It directs; it is never a fact (a Memory) or a stage of the plot (a Scene).
_Avoid_: Director's note, system note, instruction

**Nudge**:
Asking the Narrator to give one Character a line in the next turn; a hint it may pass over, never a forced speaker.
_Avoid_: Force talk, mention, ping

**Cue**:
A few words from the user to the Narrator for the next reply only ("make her angrier", "skip to the next morning"), given with a Message, a Continue or a Regenerate. It steers that one reply; it is never a Message, a fact or a standing direction, and nothing keeps it.
_Avoid_: Instruction, direction, hint, OOC, prompt

**Roll**:
A d20 the app throws for one Message the user sends, when they ask for it, to decide whether what they attempt in it works: it succeeds on the number the Story's Difficulty sets or more, and a natural 20 and 1 are critical. A Roll made for one of the Role's Stats adds that Stat to the throw. The Roll stays with its Message, so every reply written to that Message reads the same one; the Narrator writes the outcome and never names the dice.
_Avoid_: Dice event, check, skill check, save, RNG

**Roll offer**:
The Judge offering the user a Roll at a key moment of the latest exchange (a risky act, persuading someone who resists, a chase), saying what is at stake and which Stat applies. The user takes it, which arms a Roll with that Stat for their next Message, or waves it away. Offers are rare: several replies apart, never on a reply to a Roll, never in an intimate moment, and only in a Story whose author left them on.
_Avoid_: Check request, prompt, challenge, skill check

**Stat**:
Something the Story's Role is good or bad at, named by the author with a whole number from -3 to 5 ("Strength +2", "Charm -1"), at most six per Role. It adds to a Roll made for it and shows in the Scene strip; it never changes in play.
_Avoid_: Attribute, skill, ability score, trait

**Sitting out**:
A Character the user keeps out of a Chat's turns until bringing them back; the Narrator doesn't write them, but their Memories and Bonds stay as they were.
_Avoid_: Mute, disable, remove

**Write for me**:
Asking the AI to write the user's next Message in English, as the Role or Persona they wear, from whatever is in the composer (Thai, notes, half a line) or from nothing; the result only fills the composer.
_Avoid_: Impersonate, autocomplete, auto-reply

**Thai reading**:
A Thai translation of one Message, made when the user asks and kept for re-reading; it is never part of the Chat and the AI never reads it.
_Avoid_: Translation (alone), localisation

**Saved reply**:
A line the user wrote once and keeps for reuse, for the whole app or one Story, that fills the composer in one tap.
_Avoid_: Quick reply, macro, snippet

**Replace rule**:
A find-and-replace the user sets, applied to AI Messages as they are shown (what is stored never changes) and, when chosen, to the user's own Message before it is sent.
_Avoid_: Regex, filter, script

**Dictation**:
Speaking into the composer instead of typing, in Thai or English; what is heard becomes ordinary composer text.
_Avoid_: Voice input, speech-to-text

**Read aloud**:
Playing an AI Message as speech: narration in the Story's Narration voice and each Character's lines in their Speaking voice.
_Avoid_: TTS, narrate, voice playback

**Backdrop**:
The dimmed picture behind a Chat's Messages: the Story's Cover or the Chat's newest Snapshot.
_Avoid_: Background, wallpaper

**Visual novel view**:
A way of showing a Chat one part at a time, with the speaking Character's picture large over the Backdrop and their words in a box below; the Chat itself is the same in either view.
_Avoid_: VN mode, stage view

**Transcript**:
A Chat as a plain text file the user downloads from the Chat menu: a title line, then every Message in order, the user's lines as "Name: …" under the identity worn when each was sent, and the AI's narration and speech as readable text.
_Avoid_: Export, log, dump

**Continue**:
Asking the Narrator to write the next part of the Chat without a Message from the user; the result is an ordinary AI Message, and it never speaks or acts for the user.
_Avoid_: Skip, auto-play, next

**Regenerate**:
Writing the Chat's newest AI Message again, undoing everything the shown one changed; the replaced one is kept as a Reply version.
_Avoid_: Reroll, swipe, retry, redo

**Reply version**:
One take of the Chat's newest AI Message. That Message keeps up to five: the shown one, which the Chat, the AI and the Bonds, Arcs and Memory know, and the ones Regenerate replaced, which only wait to be chosen again. Choosing one undoes what the shown one changed. Anything that adds a Message after it, or takes it away, drops the others.
_Avoid_: Swipe, alternative, variant, draft

**Suggested reply**:
One of three things the user might write next, offered on request in the voice of the Role or Persona they wear; it only fills the composer and is never part of the Chat's history.
_Avoid_: Smart reply, quick reply, hint

**Memory**:
A fact established during one Chat — an event that happened, a detail of the world, something learned about the user, or an open promise or plan — that the Chat carries forward; it is known only to the Characters who witnessed or learned of it, never records feelings (a Bond) or a change of personality (an Arc), and the user can see, add, edit and delete it. A Chat starts with no Memories and keeps every one it makes; each turn, the ones the user locked, the **Settled Memories**, and the ones closest in meaning to the moment reach the Narrator. Settled Memories are those that kept coming up in the turns before the Story so far was last written; they stay the same until it is written again.
_Avoid_: Note, lorebook entry, context, summary

**Belief**:
Something one Character holds to be true within one Chat, which may be false: a lie they were told, a mistake, a guess. Unlike a Memory it is that Character's alone, and it may contradict a Memory; when the story shows them the truth, the Belief is given up. A Story may set **Starting Beliefs** that every new Chat begins with.
_Avoid_: False memory, misconception, rumour

**Established fact**:
One of a Chat's canon numbers, ages, lengths of time, dates, names and ties ("Nara's years at the stall: nine summers"), recorded by the Judge as the story states it and changed only when the story itself changes it. The Narrator reads them every turn, and they win over a Memory, the Story so far or an earlier Message that says otherwise. A Message that told one differently is a **slip**, which the next turn is told not to repeat. The user sees them in the **Facts panel**, opened from the Scene strip, where they can edit, delete or add one; what the user sets there is theirs, and no rewind of a Message takes it away.
_Avoid_: Canon, lore fact, stat

**Item**:
A thing that matters in one Chat's story (a key, a letter, a ring, a gift, a weapon), with who has it now — the user, a Character, or someone or somewhere else — and how it came to them ("given by Nara", "found in the well"). The Judge records an Item as the story shows it come to someone, change hands or end; an Item **ends** when it is used up, lost or destroyed, and stays listed as gone. A thing used up or destroyed never comes back; a lost one comes back when someone finds it. The Narrator reads who has what every turn, so no reply has the user holding what they gave away. The user sees them in the **Items** sheet, opened from the Scene strip, where they can change who has one, mark one gone, add one or delete one; like an Established fact, what the user sets there no rewind takes away. It is the thing itself, where an Outfit is what a Character is wearing.
_Avoid_: Inventory, possession, loot, object

**Memory graph**:
A picture of a Chat's Memories, shown in place of their list when the user chooses it: the identity the user wears and the Characters as people, and each Memory as a dot linked to the people it is about. Who a Memory is about is read from its text (`{user}` or a name), or failing that is the Characters who know it; it is not stored, and it is a different thing from who knows the Memory. On request it also draws the Bonds between the people.
_Avoid_: Mind map, knowledge graph, relationship map

**Story so far**:
A Chat's account, in order, of the events in its oldest Messages: what the AI reads in place of those Messages once the whole Chat no longer fits in a turn. A Chat has at most one, and none while the whole Chat still fits. It is written again from all the Messages it covers each time, and the user may correct it; their corrections win. A Story so far is events, where a Memory is a fact.
_Avoid_: Summary, recap, chat history

**Time of day**:
Where a Chat's story is in the day — dawn, morning, noon, afternoon, evening or night — or none until the story makes it clear; it changes only when an AI Message moves the story on to a new time, and editing or regenerating that Message takes the change back.
_Avoid_: Clock, hour, daytime

**Place**:
Where a Chat's story is right now, in a few words ("the lamp room"), or none until the story makes it clear; like the Time of day it changes only when an AI Message moves the story somewhere else, and taking that Message back takes the change back. A Place is a spot in the story at this moment, where the Setting is the world the whole Story happens in.
_Avoid_: Location, setting, scene, map

**Weather**:
What the weather is doing in a Chat's story right now, in a few words, or none until the story shows it; kept and taken back as the Place is.
_Avoid_: Climate, conditions

**Outfit**:
What a Character is wearing right now in one Chat, in a short phrase, set when the story first describes it or changes it; none until then. It is the moment's clothes, where a Character's Appearance is how they usually look, and Snapshots draw the Character in it.
_Avoid_: Costume, clothes, skin, look

**Bond**:
A Character's feelings toward the user or toward another Character within one Chat, which change as the story unfolds: a short label and description in words, and a level on each of four **Bond axes** — Trust, Affection, Desire and Tension. In play they show only through how the Character behaves; the user can look at them, and how they moved over time, but never edit them, and never sees a level as a number.
_Avoid_: Affinity, relationship, love meter, stat, score

**Arc**:
An intended, lasting change to a Character's personality within one Chat, always traceable to an event in the story that caused it; a later event can turn it back. The user can see that a Character has changed and the events that changed them, but never the direction the author set, which would give the story away.
_Avoid_: Drift, character development, evolution

**Now note**:
What has lastingly changed about one Character in one Chat compared with their card, in a few sentences of plain fact: what they call the user now, what they are to the user or to others, and what the story has changed in their life for good. The Judge keeps it as the story goes, and the user can write, correct or clear it on the Character's profile, under "Changed in this Chat"; the Narrator reads it next to the card, and where the two differ, the note holds. A change the Judge made goes back with the Message that caused it; the user's own wording stays until the story changes the note again. It is never a feeling (a Bond), a change of personality (an Arc), an aim, or a direction to the Narrator (an Author's note).
_Avoid_: Status, override, character state, card edit

**Diary**:
What one Character writes in private, in their own voice, about one Chat's story: an **entry** now and then as the story goes (when a Scene ends, at an Ending or the Epilogue, and every so often between), or when the user asks, telling of what happened since their last one as they saw it, coloured by how they feel and what they know. It is for the user to read. With each entry the Character also writes a line or two of how they feel and what they mean to do, never shown; the Narrator reads only that line from their newest recent entry, never the entry, so nothing an entry tells becomes part of the story or a fact (a Memory). It never tells the Character's Secrets or Arc direction, and the Character never speaks of it. An entry is written at the Chat's newest AI Message and goes when that Message is taken back.
_Avoid_: Journal, inner thoughts, monologue, log

**Drift**:
An unintended loss of a Character's established personality or voice, as opposed to an Arc.
_Avoid_: Character development, inconsistency

**Snapshot**:
An AI-generated image of the moment of a Chat's latest Message, seen through the user's eyes and made only on the user's request, once they have read its Snapshot prompt; it is kept in the Story's Gallery even after editing or resetting the Chat takes its moment away.
_Avoid_: Illustration, picture, render

**Snapshot prompt**:
What a Snapshot will show, written by the AI from the moment (and the user's hint, if any) for the user to read and edit before anything is drawn. Drawing it pays for the picture; closing the sheet throws it away. The picture's own rules are always added around it: the user's first-person view, each in-frame Character's Appearance, the art style and fictional adults only.
_Avoid_: Scene (a Scene is a stage of a Story), caption, description

**Snapshot size**:
How large Snapshots are drawn, 1K or 2K, chosen in Settings next to the Snapshot model; 2K is offered only for a model Venice draws at 2K, and costs that model's 2K price.
_Avoid_: Resolution, quality

**Gallery**:
The collection of every Snapshot taken in any of a Story's Chats, grouped by Chat. The main menu's Gallery shows every Story's, grouped by Story and then by Chat.
_Avoid_: Album, library

**Reference image**:
An image of a Character, chosen by the author, that keeps the Character looking the same in every Snapshot; in play its Portrait shows beside their lines, and the whole image only in their Character profile.
_Avoid_: Avatar, profile picture

**Portrait**:
The square of a Character's Reference image that the author picks to stand for the Character: beside their lines in a Chat, on their node in the Memory graph, on the Dashboard and on their cards in the Story editor; until one is picked, a square near the top middle stands in, and without a Reference image, the Character's initial on their Character colour.
_Avoid_: Avatar, profile picture, icon

**Expression**:
A Character's picture for one emotion, drawn from their Reference image or uploaded by the author. When a line of theirs carries that emotion it shows in place of their Portrait; without one, the Portrait shows as usual.
_Avoid_: Sprite, emote, mood picture

**Speaking voice**:
The synthetic voice a Character's lines are read aloud in, chosen by the author; unrelated to the Character's Voice, which is how they talk on the page. A Story also has a **Narration voice** for everything that is not a Character's line.
_Avoid_: TTS voice, audio voice

**Character profile**:
What a tap on a Character's Portrait in a Chat opens: their whole Reference image, name, what they are wearing, their Now note, their Diary, Appearance, Personality, Voice and Background, but never their Secrets or Arc directions, which would give the story away.
_Avoid_: Bio, character card

## Accounts

**Account**:
One person who can sign in to this Storytell. Everything they make (Stories and all inside them, Personas, app-wide Saved replies and Replace rules) belongs to their Account and is invisible to every other Account.
_Avoid_: User (in the glossary "the user" is whoever is playing), profile, login

**Owner**:
The one Account that runs this Storytell: it pays the provider credit, chooses the Models and Sampling for everyone, adds and removes Members, and sees everyone's spending.
_Avoid_: Admin, host

**Member**:
An Account the Owner added by email, playing on the Owner's credit within a Monthly cap. A Member can't see or change Models, Sampling, credit settings or other people's spending.
_Avoid_: Guest, friend, user

**Monthly cap**:
The most a Member may spend in one calendar month (UTC), in US dollars, set by the Owner. Once reached, a new send or picture is refused until the month turns or the Owner raises it; what a turn already started still finishes.
_Avoid_: Quota, limit, budget

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
An optional, author-defined stage of a Story that the plot moves through in order, each ending when its plain-language move-on condition is met; a Scene steers the story but never limits what the user or the Characters can do.
_Avoid_: Chapter, act, stage

**Lore**:
A Story's notes about its world, each a **Lore entry**: a name, keywords and a short text about a place, people, custom or object. An entry reaches the Narrator only when its triggers come up in the latest exchange or in another entry already chosen, for a few Messages after that when it is set to stay, or on every turn when it is set to always be included; the Setting stays the short core sent on every turn. Lore is common knowledge in the world, so every Character knows it; a Character's secrets stay on their card. It belongs to the Story and is shared by all its Chats, where a Memory belongs to one Chat.
_Avoid_: Lorebook, world info, codex, wiki

**Document**:
A longer text the author attaches to a Story — pasted, uploaded or taken from a web page — whose passages reach the Narrator when they are close in meaning to the latest exchange. Like Lore it is common knowledge shared by all the Story's Chats, but it is found by meaning, not by keywords, and is never edited into entries.
_Avoid_: Data bank, attachment, file, source

**Character card**:
A character in the community card format (a PNG or JSON file) used by other roleplay apps. Importing one makes a new Story around that character; any Character can be exported as one.
_Avoid_: Tavern card, bot card, character file

**Opening**:
The author-written passage that begins every Chat of a Story.
_Avoid_: Intro, greeting, first message

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
The user's own reusable self-description, which can be worn in place of a Story's Role.
_Avoid_: Profile, avatar, user character

**Cover**:
The picture the author chooses for a Story, shown on its card on Home and at the top of its editor, cropped around a focus point the author taps. It is a Snapshot from the Story's Gallery, a Character's Reference image (which it follows when that is replaced), or a picture uploaded from the phone; only an uploaded one belongs to the Cover and is deleted with it. Without one, Home shows the newest Snapshot.
_Avoid_: Thumbnail, banner, key art

**Duplicate**:
Making a new Story, "<title> (copy)", from everything the author wrote in another: its text, style, Narration voice and Backdrop choice, Role, Characters with their Reference images, Portraits, Expressions and Speaking voices, Scenes, Starting Bonds, Lore, Documents, its own Saved replies and Replace rules, and Cover, each image in a file of its own. No Chats or Snapshots come along, so a Cover that is a Snapshot is dropped.
_Avoid_: Clone, fork, template

## Playing

**Chat**:
One playthrough of a Story with its own message history; a Story can have many Chats, and a Chat can be reset to its start.
_Avoid_: Session, playthrough, conversation, thread

**Message**:
One entry in a Chat's history: either what the user wrote, shown under the Role or Persona they wore at the time, or the AI's reply, which is narration and Characters' speech in order. A Chat begins with the Opening as its first Message. Editing a Message discards every Message after it.
_Avoid_: Post, reply, bubble, entry

**Branch**:
A new Chat copied from another up to one of its Messages, with everything that Chat knew at that Message — Memory, Bonds, Arcs, Scene, Time of day — so the story can go another way while the original stays as it was. A Branch remembers which Chat it came from.
_Avoid_: Fork, checkpoint, clone, copy

**Author's note**:
The user's own standing direction for one Chat ("keep it a slow burn"), read by the Narrator every turn. It directs; it is never a fact (a Memory) or a stage of the plot (a Scene).
_Avoid_: Director's note, system note, instruction

**Nudge**:
Asking the Narrator to give one Character a line in the next turn; a hint it may pass over, never a forced speaker.
_Avoid_: Force talk, mention, ping

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
A fact established during one Chat — an event that happened, a detail of the world, something learned about the user, or an open promise or plan — that the Chat carries forward; it is known only to the Characters who witnessed or learned of it, never records feelings (a Bond) or a change of personality (an Arc), and the user can see, add, edit and delete it. A Chat starts with no Memories.
_Avoid_: Note, lorebook entry, context, summary

**Memory graph**:
A picture of a Chat's Memories, shown in place of their list when the user chooses it: the identity the user wears and the Characters as people, and each Memory as a dot linked to the people it is about. Who a Memory is about is read from its text (`{user}` or a name), or failing that is the Characters who know it; it is not stored, and it is a different thing from who knows the Memory.
_Avoid_: Mind map, knowledge graph, relationship map

**Story so far**:
A Chat's account, in order, of the events in its oldest Messages: what the AI reads in place of those Messages once the whole Chat no longer fits in a turn. A Chat has at most one, and none while the whole Chat still fits. It is written again from all the Messages it covers each time, and the user may correct it; their corrections win. A Story so far is events, where a Memory is a fact.
_Avoid_: Summary, recap, chat history

**Time of day**:
Where a Chat's story is in the day — dawn, morning, noon, afternoon, evening or night — or none until the story makes it clear; it changes only when an AI Message moves the story on to a new time, and editing or regenerating that Message takes the change back.
_Avoid_: Clock, hour, daytime

**Bond**:
A Character's feelings toward the user or toward another Character within one Chat, which change as the story unfolds; in play they show only through how the Character behaves, and the user can look at them but never edit them.
_Avoid_: Affection, affinity, relationship, love meter

**Arc**:
An intended, lasting change to a Character's personality within one Chat, always traceable to an event in the story that caused it; a later event can turn it back.
_Avoid_: Drift, character development, evolution

**Drift**:
An unintended loss of a Character's established personality or voice, as opposed to an Arc.
_Avoid_: Character development, inconsistency

**Snapshot**:
An AI-generated image of the moment of a Chat's latest Message, seen through the user's eyes and made only on the user's request; it is kept in the Story's Gallery even after editing or resetting the Chat takes its moment away.
_Avoid_: Illustration, picture, render

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
What a tap on a Character's Portrait in a Chat opens: their whole Reference image, name, Appearance, Personality, Voice and Background, but never their Secrets or Arc directions, which would give the story away.
_Avoid_: Bio, character card

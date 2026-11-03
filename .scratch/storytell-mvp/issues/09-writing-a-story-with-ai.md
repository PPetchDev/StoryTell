# Writing a Story with AI

Type: grilling
Status: resolved
Blocked by: 01
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What fields make up a Story (Setting, cast of Characters, Role, optional Scenes, and whatever Bond/Arc needs from the author), and how does the idea → AI draft → user edit flow work?

Constraint from [How Bond and Arc change](13-how-bond-and-arc-change.md): per Character, the author may set optional starting Bonds (toward the Role and toward other Characters; unset = stranger) and optional Arc directions. Scene move-on conditions are written in plain language and may refer to Bond. Stories have no system-defined ending.

## Answer

Grilled 2026-11-03.

**Story fields**
- **Story**: Title, Setting (one free-text block covering place, situation and premise), Opening (the author-written passage that begins every Chat), and three Style fields: POV (1st/2nd/3rd), tense, reply length. No tagline, tags, genre or pacing presets. Anything else about tone goes into the Setting in plain language.
- **Role** is required on every Story: Name + Description. Starting Bonds point at it. A Persona can still be worn in its place any time (see [When a Persona replaces a Role](14-persona-replacing-a-role.md)).
- **Characters**: 1–6 per Story. Each has Name, Appearance (also used for Snapshots), Personality, Voice (with optional example lines), Background, optional starting Secrets, optional starting Bonds and optional Arc directions (per [How Bond and Arc change](13-how-bond-and-arc-change.md)).
- **Secrets** are only the author's starting point. A Character's authored Secrets go only into that Character's prompt. What a Character learns during play is not written back into Secrets. It becomes Memory tagged with which Characters know it, rolled back on message edit like Bond/Arc. Mechanics belong to [Memory design](08-memory-design.md). There are no layered reveal conditions: the AI judges when a Character is ready to reveal a secret, with Bond in view.
- **Scenes** (optional): an ordered list. Each Scene has a name, its situation/goal, and a plain-language move-on condition. The last Scene may leave the condition empty. After the last Scene, play continues freely.
- No separate world notes or lore entries in the MVP. The Setting holds world facts, and Secrets hold per-Character knowledge.

**Scenes in play**
- A Scene only steers. It never limits what the user or the Characters can do. The user can wander off and nothing pulls them back. Any Character can appear in any Scene, so Scenes have no cast list. The current Scene simply stays until its condition is met.
- The same background call that judges Bond and Arc (DeepSeek V4 Flash, after every turn) judges the move-on condition. Each Scene advance is tied to its causing message, so editing an earlier message rolls it back. Resetting a Chat returns to the first Scene.
- The current Scene and the event that advanced it show on the read-only Bond/Arc dashboard. The user cannot skip or rewind Scenes by hand. A bad judgement is undone by editing the causing message.

**Drafting flow**
- The user types an idea of any length. GLM-5.3 drafts the required fields in one go: Title, Setting, Opening, Style, Role and Characters. Optional fields (Scenes, Secrets, starting Bonds, Arc directions) are filled only when the idea implies them.
- The user then refines in three ways:
  - edit the form by hand
  - press "rewrite this field" on any field
  - instruct an assistant chat beside the form ("give Mira a sister", "add Scenes")
- The assistant applies its changes straight to the draft, highlights the changed fields, and offers Undo. There is no accept/reject step.
- The assistant keeps no conversation history. Each time it opens, it starts fresh with the current Story as its context. It is available on any Story, including ones that already have Chats.
- The Story saves automatically, and there is no draft/published state. Play is enabled once every required field is filled.

**Editing a Story that has Chats**
- Every field stays editable. Text edits reach existing Chats on their next turn.
- Opening, starting Bonds and Arc directions only affect new or reset Chats.
- The author may add Characters at any time. A new Character joins existing Chats as a stranger with no Bonds or history.
- Removing a Character deletes its Bonds and Arcs in every Chat, after a warning.
- The AI never adds Characters during play. Only the author changes the cast.

Glossary: **Story** no longer says the cast is fixed at creation; only the author changes it. **Scene** steers but never limits play. **Role** is required. **Opening** is new.

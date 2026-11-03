# Data model

Type: grilling
Status: open
Blocked by: 07, 08, 09, 13
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What is the persistent shape of Story, Setting, Scene, Character, Role, Persona, Chat, Message, Memory, Bond, Arc and Snapshot, including what a Chat reset clears and what editing a message changes?

Constraint: editing a message rewinds the Chat — see [What editing an earlier message does](15-editing-an-earlier-message.md); state from discarded messages must roll back.

Constraint: Persona can replace the Role mid-Chat with Bond and Memory carried over — see [When a Persona replaces a Role](14-persona-replacing-a-role.md).

Constraint: Bond and Arc shape — see [How Bond and Arc change](13-how-bond-and-arc-change.md). Bond is directional per pair (Character → user, Character → Character), created only where authored or where feelings form, holding a short label and a 1–2 sentence description. Arc is a per-Character, per-Chat list of steps. Every Bond/Arc change records its causing message and event (for rollback on edit and for the dashboard). Story-level optional starting Bonds and Arc directions; Chat reset restores the starting values.

Constraint: Story fields — see [Writing a Story with AI](09-writing-a-story-with-ai.md). Story: Title, Setting (one text block), Opening, Style (POV, tense, reply length). Role: required, Name + Description. Character (1–6 per Story): Name, Appearance, Personality, Voice + optional example lines, Background, optional starting Secrets, starting Bonds and Arc directions. Scene: ordered, name + situation/goal + plain-language move-on condition (optional on the last). Each Chat tracks its current Scene, and each Scene advance records its causing message and event (rolled back on edit, reset to the first Scene). Story edits reach existing Chats live, except Opening and starting Bonds/Arc directions, which apply only to new or reset Chats. Adding a Character joins existing Chats as a stranger. Removing one deletes its Bonds/Arcs in every Chat. Knowledge a Character gains in play is Memory tagged with which Characters know it, not a change to the Character. No draft/published state on Story.

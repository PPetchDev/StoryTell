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

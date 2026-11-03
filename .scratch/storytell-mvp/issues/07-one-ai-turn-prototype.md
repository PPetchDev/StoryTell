# How one AI turn behaves

Type: prototype
Status: open
Blocked by: 01, 05, 12, 13
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What does one AI turn look like when played: how the Narrator describes action, decides which Characters speak (possibly several per turn), avoids acting for the user's Role, reflects Bond and Arc, and judges from the conversation when to move to the next Scene? Build a rough playable prototype to react to.

Run the same turns on GLM-5.3 (DeepInfra) and DeepSeek V4 Pro (GMICloud) through OpenRouter with pinned hosts, and record which one writes adult content willingly and plays several Characters better. That decides the primary model (see [Choose the text LLM](05-choose-text-llm.md)).

Constraint from [How Bond and Arc change](13-how-bond-and-arc-change.md): after every turn a DeepSeek V4 Flash background call judges Bond/Arc changes (only changes, each with its cause and only for Characters who witnessed or learned of the event). Check that V4 Flash judges feelings sensibly and at the agreed pace: gradual Bond, rare and event-cited Arc. Every Character's prompt carries all Bonds in the Chat with a "you don't know others' feelings" instruction, plus a short "Arc so far" note; the core definition is never rewritten. Record how often feelings leak; if it hurts play, switch to sending only the speaking Character's own Bonds. Scene move-on conditions are plain language judged with Bond in view.

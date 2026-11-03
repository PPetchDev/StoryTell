# How Bond and Arc change

Type: grilling
Status: resolved
Blocked by: 01, 12
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What makes a Character's Bond and Arc change during a Chat: does the AI judge it from the conversation, can the Story author set starting values or rules, can Bond gate Scenes or endings, and how is the hidden state kept so the Character stays consistent with it without ever being shown to the user?

## Answer

Grilled 2026-11-03.

**Who and when**
- The AI judges every Bond and Arc change from the conversation; the user never sets or edits them. A background call (DeepSeek V4 Flash, per [Choose the text LLM](05-choose-text-llm.md)) runs after every turn on the latest user message, the AI reply and the current Bond/Arc state. It returns only what changed, each change with the story event that caused it.
- Each change is tied to the message that caused it, so editing an earlier message rolls it back (see [What editing an earlier message does](15-editing-an-earlier-message.md)). That rewind is the only way to undo a bad judgement.
- Pace: Bond shifts gradually and jumps only on a major event (betrayal, rescue, confession). Arc needs a significant event it can cite and changes far less often than Bond.
- Only Characters who witnessed an event, or plausibly learned of it later, have their Bond changed by it.

**Bond**
- Directional and per pair: a Character's Bond toward the user, and toward other Characters (Mira → Kai can differ from Kai → Mira). Pairs exist only where the author set a starting Bond or where the AI judges that feelings have formed. Not every pair in the cast is tracked.
- Shape: a free 1–3 word English label chosen by the AI (e.g. "reluctant ally") plus a 1–2 sentence description. No numbers, meters or thresholds.
- The author may set an optional starting Bond per Character toward the Role and toward other Characters. If none is set, the Character starts as a stranger. A Persona switch keeps the Bond toward the user (see [When a Persona replaces a Role](14-persona-replacing-a-role.md)).

**Arc**
- Mixed origin: the author may write optional Arc directions per Character (e.g. "if trusted, her coldness thaws"). The AI may also start Arcs nobody planned, provided a story event causes them.
- Kept as a separate per-Character, per-Chat list of Arc steps, each with its cause. The core Character definition is never rewritten. The prompt carries a short note on the Arc so far (ArcANE-style, per [ticket 12](12-keeping-characters-in-character.md)).
- Arcs can reverse: a new step with its own cause. Earlier steps stay in the history.
- Bond vs Drift: a Bond or Arc change always names what changed and which event caused it. Unexplained change against the core definition is Drift.

**What Characters see**
- Every Character's prompt includes all Bonds in the Chat, not just its own, with an instruction that other Characters' feelings are unknown to it unless shown in the story. Some leakage is accepted. If it hurts play, [How one AI turn behaves](07-one-ai-turn-prototype.md) may switch to sending only the speaking Character's own Bonds.

**Visibility**
- Bond and Arc never appear on the Chat screen. In play they show only through behaviour.
- A separate, read-only dashboard opened from the Chat lists every Character's Bonds (label + description) and Arc steps, each with the event that caused it.

**Scenes and endings**
- No numeric gates. An author writes a Scene's move-on condition in plain language (e.g. "once Mira trusts you"), and the AI judges it with Bond in view.
- Stories have no system-defined ending in the MVP.

**Resetting**
- Resetting a Chat returns all Bonds and Arcs to the author's starting values.

Glossary: **Bond** now covers feelings toward other Characters and is viewable but not editable; **Arc** must trace to a story event and can reverse.

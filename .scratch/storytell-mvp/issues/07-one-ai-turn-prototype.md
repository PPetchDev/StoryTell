# How one AI turn behaves

Type: prototype
Status: resolved
Blocked by: 01, 05, 12, 13
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What does one AI turn look like when played: how the Narrator describes action, decides which Characters speak (possibly several per turn), avoids acting for the user's Role, reflects Bond and Arc, and judges from the conversation when to move to the next Scene? Build a rough playable prototype to react to.

Run the same turns on GLM-5.3 (DeepInfra) and DeepSeek V4 Pro (GMICloud) through OpenRouter with pinned hosts, and record which one writes adult content willingly and plays several Characters better. That decides the primary model (see [Choose the text LLM](05-choose-text-llm.md)).

Constraint from [How Bond and Arc change](13-how-bond-and-arc-change.md): after every turn a DeepSeek V4 Flash background call judges Bond/Arc changes (only changes, each with its cause and only for Characters who witnessed or learned of the event). Check that V4 Flash judges feelings sensibly and at the agreed pace: gradual Bond, rare and event-cited Arc. Every Character's prompt carries all Bonds in the Chat with a "you don't know others' feelings" instruction, plus a short "Arc so far" note; the core definition is never rewritten. Record how often feelings leak; if it hurts play, switch to sending only the speaking Character's own Bonds. Scene move-on conditions are plain language judged with Bond in view.

## Answer

Prototyped 2026-11-03. Prototype: `prototypes/one-ai-turn/` (kept on branch `prototype/one-ai-turn`). It is a local page that plays turns of a sample Story ("The Drowned Lantern": Mira, Kai, Oren) through OpenRouter with pinned hosts and `allow_fallbacks: false`. It also includes:

- a scripted 10-turn battery run on both models in both turn shapes,
- a side-by-side reader,
- a replay that re-judges the same transcripts with a changed judge prompt.

Played text stays in the gitignored `runs/`. The user played one turn by hand. The model and shape verdicts come from the user reading the battery side by side.

**Primary model: unchanged.** GLM-5.3 on DeepInfra stays primary and DeepSeek V4 Pro on GMICloud stays the manual fallback. Over 40 battery turns, both models wrote the intimate and explicit turns willingly: no refusals, no content-filter stops, no fade-to-black.
- **GLM-5.3:** richer interplay, more distinct voices, longer turns (~300–400 words). It occasionally narrates a thought for the user ("irritation, you think").
- **V4 Pro:** tighter (~100–250 words), never acted for the user in the battery, slightly faster (~7 s vs ~10 s).

**Host facts the spec must carry** (corrects [Choose the text LLM](05-choose-text-llm.md)):
- DeepInfra's GLM-5.3 rejects reasoning off ("Reasoning is mandatory for this endpoint"). `reasoning: {effort: "minimal"}` works and spends 0–120 reasoning tokens per call. V4 Pro and V4 Flash accept `enabled: false`.
- GMICloud's V4 Pro endpoint doesn't support `stop`; the DeepInfra endpoints do. DeepInfra serves GLM-5.3 at fp4.
- OpenRouter credit is account-wide and reserved per in-flight request. A near-empty balance fails parallel requests with "would exceed your available credits". The $30 hard cap needs a dedicated account or a per-key credit limit.
- One transient "Provider returned error" came up in ~120 calls, and the retry succeeded. This fits the error-with-retry rule.

**Turn shape: one call writes the whole turn.**
- Narration is plain paragraphs. Each Character's speech and small actions go on `@Name:` lines, with names checked against the cast. The Narrator picks the speakers in the same call.
- 3–4 Characters interplayed naturally, and the side Character (Oren) spoke rarely and on cue.
- Rejected: a Narrator call, then one call per chosen speaker carrying only that speaker's card. Against one call (~$0.0025, 7–10 s per turn), it:
  - usually picked one speaker,
  - cost ~3× (~$0.007–0.008 per turn),
  - took 18–23 s on average and up to 48 s,
  - still wrote other Characters' actions inside `*asterisks*`, and the Narrator quoted dialogue it was told to leave to the Characters.
- Consequence: [ticket 12](12-keeping-characters-in-character.md)'s "send only the speaking Character's card" and structural per-Character knowledge separation don't apply. All cards, Bonds and Memory sit in one prompt, so who-knows-what relies on prompt instructions. Revisit only if leaks hurt play.

**Not acting for the user.** These layers worked together:
- a rules block,
- a final instruction after the user's message,
- stop strings on `\n<Role name>:` where the host supports them,
- a backend cut at any `<Role name>:` or `You:` line.

Not caught: narration that states the user's thoughts in second person. It is rare (GLM, about 1 in 10 turns).

**Bond/Arc judge (V4 Flash on DeepInfra):** about $0.0002 and 2 s per turn. Causes were sensible, only witnesses changed, and Scene judgements were strict and cited events.
- The first prompt was too jumpy. The main Bond's label changed nearly every turn (12–14 changes in 10 turns), and Arc steps repeated themselves ("thaw deepens" twice).
- The fix was three rules: change a Bond only when the feeling changes in kind or on a major event, never by rephrasing or intensifying; at most one change per Bond per turn; never add an Arc step that restates or deepens the last one.
- Re-judging the same transcripts then gave 8–10 Bond changes and 0–1 Arc steps over 10 deliberately event-heavy turns. The backend also drops "changes" to the same label.

**Feelings leakage:** every prompt carried all Bonds plus "you don't know others' feelings". In the leak probe, Ash asks Kai what Mira thinks of them, and Kai answered only from what he had seen. Keep sending all Bonds (the default from [ticket 13](13-how-bond-and-arc-change.md)). The evidence is thin: one probe per setup.

**Scenes:** the background call judges the move-on condition after each turn, and the next turn's prompt carries the new Scene. Scene 1 moved on when Mira took Ash somewhere private. Scene 2 moved on only where the narration actually brought the crew home. Prose models sometimes rush a Scene's goal: in split mode Mira invited Ash upstairs on turn 1. The judge was right; the pacing fault was the Narrator's.

**Cost:** a one-call turn is ~$0.0025 and the judge ~$0.0002. At ~60 turns/day that's about $5/month at the battery's prompt sizes (1–5k tokens). Longer Chats and Memory calls add to it.

Graduated fog: "Model-specific techniques for keeping Characters in character" is answered above: one call, `@Name:` lines, minimal reasoning for GLM, stop strings plus a backend cut, a final instruction, and the judge rules.

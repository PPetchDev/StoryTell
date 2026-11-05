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

Prototyped 2026-11-03. Prototype: `prototypes/one-ai-turn/` on master (added in commit `99969a4`). It is a local page that plays turns of a sample Story ("The Drowned Lantern": Mira, Kai, Oren) through OpenRouter with pinned hosts and `allow_fallbacks: false`. It also includes:

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

## Comments

### 2026-11-03 — Venice comparison: `venice-uncensored-role-play` and GLM 5.3 on Venice against GLM-5.3 on DeepInfra

Evidence for the user's choice. The ticket 05 decision is unchanged. Prototype changes came from branch `claude/beautiful-lamport-a28661` (merged into master; both branches since deleted):
- a Venice transport in `server.mjs`: direct `POST https://api.venice.ai/api/v1/chat/completions`, with `venice_parameters.include_venice_system_prompt: false`
- model keys `vrp` and `vglm`
- `battery.mjs model:shape` args
- `analyze.mjs`
- a multi-run `report.mjs`

Every Venice field was checked against `docs.venice.ai/swagger.yaml`:
- `stop` takes up to 4 strings
- `reasoning.effort` exists
- the response carries `cost.usd`

Prices come from Venice's live `/models`:
- `venice-uncensored-role-play`: $0.50 in / $2.00 out per million tokens, 128K context, no cache-read price
- `z-ai-glm-5-3`: $1.75 / $5.50, cache read $0.325

For comparison, GLM-5.3 on DeepInfra is $0.5625 / $2.50, cache read $0.125 (OpenRouter's live endpoint list). Logged per-call costs matched these list prices exactly.

**Setup.** Same 10 scripted Ash lines and the same Story, one-call shape only, judge unchanged (V4 Flash on DeepInfra). Each model played the battery 3 times (runs A, B, C, 90 turns in all), because a single run's T4/T5 outcome turned out to depend on how Mira took T3. Played text is in the gitignored `runs/`. To read it side by side:

```bash
node prototypes/one-ai-turn/report.mjs battery-2026-11-03T16-44-48-100Z.json battery-2026-11-03T16-48-51-595Z.json battery-2026-11-03T16-58-41-000Z.json
```

Then open http://localhost:5177/report with the server running.

**Numbers, mean over 3 runs (per-run range in brackets):**

| | GLM-5.3 (DeepInfra) | Venice Uncensored Role-Play | GLM 5.3 (Venice) |
|---|---|---|---|
| Cost per turn (play only) | $0.00223 ($0.0020–0.0024) | $0.00208 ($0.0018–0.0023) | $0.00621 ($0.0052–0.0071) |
| Monthly at 60 turns/day, battery prompt sizes (~2.4–3.3k in), incl. judge ~$0.31 | **~$4.3** | **~$4.1** | **~$11.5** |
| Monthly at 60 turns/day, 12k-token prompt, 450 out, no cache hits | ~$14.2 | ~$12.4 | ~$42.3 |
| Same, 80% of the prompt a cache hit | ~$6.6 | ~$12.4 (no cache discount) | ~$17.6 |
| Latency mean (median), max | 15.4 s (~12 s), 49.8 s | 6.0 s (~6 s), 9.2 s | 15.4 s (~13 s), 34.6 s |
| Words per turn | 330 (228–439) | 258 (100–425) | 345 (260–451) |
| Speakers per parsed turn | 2.1 | 1.5–1.9 (run B: 0 parsed) | 1.7–2.2 |
| Reasoning tokens per 10 turns (`effort: minimal`) | 214–427 | n/a (no reasoning) | 339–654 |

**Intimate and explicit turns (T3–T5).** There were no out-of-character refusals, no content-filter stops and no "fade to black" wording, in any of the 90 turns. The differences are in how the Characters played the scene:
- **GLM-5.3 (DeepInfra):** wrote T4 and T5 fully explicit in 2 of 3 runs. In run A, Mira rebuffed Ash in-story: a knife at T4, then at T5 a blow with the flat of the knife while Oren held a pistol.
- **Venice Uncensored Role-Play:** wrote no full explicit T5 in any run.
  - Run A: the scene was written as summary ("you lose yourself in Mira's body"), with Kai and Oren calling up from the bar meanwhile.
  - Run B: the scene starts, then Kai interrupts and Mira shoves Ash off.
  - Run C: Mira refused at T4 and again at T5.
- **GLM 5.3 (Venice):** wrote T5 fully explicit in 1 of 3 runs (B).
  - Run A: T5 started explicit and then Mira stopped it.
  - Run C: Mira refused at T4 and at T5.
  - The refusals carry a consent framing ("I said no. Not 'persuade me'"), and in run A Kai brings the "no" up again in T7.

**Acting for Ash.** No turn wrote an `@Ash:` line, so the backend cut never fired. In narration:
- **GLM-5.3 (DeepInfra):** about 1 in 10 turns states Ash's thoughts ("part of you knows it instantly", "you think she's changed her mind"), as in the original battery.
- **Venice Uncensored Role-Play:** about 1–3 in 10 turns per run, read by hand (the heuristic also counted in-dialogue "you"):
  - it narrates Ash's actions ("You ignore her, trailing kisses higher")
  - it narrates Ash's thoughts ("But you know it can't last")
  - it repeats Ash's own line back as narration (run A, T3)
  - once it ends on an out-of-character "What do you do, stranger?"
- **GLM 5.3 (Venice):** no clear cases. A few borderline lines, such as "You gave her cost and quiet".

Run A also showed something on both GLM hosts. Ash's T6 line assumed the sex had happened. Both GLMs denied it ("There are no sheets to be tangled in"), which is consistent with their own T5.

**`@Name:` format and text quality.**
- **GLM (both hosts):** speech is on `@Name:` lines, with ~0 quoted dialogue in narration. DeepInfra's run A put stray `@` before stage directions inside speech lines ("@He fans his cards…", 24 times). Runs B and C did not.
- **Venice Uncensored Role-Play:**
  - Its format is inconsistent. It puts quoted dialogue in narration (6–10 of 10 turns per run). It uses `@Mira: "…"` with quotes. In run B it wrapped every `@Name:` inside quotation marks (`"@Mira: …"`, 50 times), so the parser found **no speech lines at all** in that run.
  - It has garbled tokens in runs A and B: "اريعWho the hell are you?", " amerikanskeeting", "Mirror looks at him", " betegin'", "..Identity lost her ship", " officier", "cholesterol off", "pissions".
  - Scene continuity slips: Kai and the dockhands stay present during the private office scene, and stock closers repeat ("the storm rages on", 12 times in run A).

**Voices across 3–4 Characters.**
- **GLM (both hosts):** Mira (clipped, "you."), Kai (flirting, "sweetheart") and Oren (accurate King James quotes, speaks on cue) stay distinct. These were the same strengths the original battery noted.
- **Venice Uncensored Role-Play:** Mira and Kai are recognisable but more generic. Oren spoke in most turns despite "speaks rarely". In run B he cited chapter and verse, once wrongly: "cut it off" given as Proverbs 24:12. In run A he invoked a "Goddess of the Storms", which doesn't fit the defrocked-priest card.

**Host facts found on the way:**
- **Venice GLM 5.3 reasoning:** Venice lists GLM 5.3 with `supportsReasoningEffort: false`. Even so, `reasoning: {effort: "minimal"}` worked: 0 reasoning tokens on the probe and 34–65 per turn in the battery. `venice_parameters.disable_thinking: true` instead leaked the model's thinking into `content` ("The user wants me to say hi as a pirate…Ahoy, matey!"). Don't use it.
- **DeepInfra's V4 Flash judge:** it returned 429 `engine_overloaded` from OpenRouter's shared upstream pool.
  - Run B: 29 of 30 judge calls failed. With no judge, Scenes and Bonds never advanced in run B, equally for all three models.
  - Run C, with up to 4 retries over ~42 s: 9 of 30 still failed.
  - This bears on the background-call host. Venice also serves `deepseek-v4-flash` ($0.138 / $0.275); it wasn't tested here.
- **Balances:** OpenRouter has ~$4.5 of $25 left. Venice had $4.80 before these runs.

**Summary, neutral:**
- **Venice Uncensored Role-Play:** costs about the same as GLM-5.3 on DeepInfra at battery sizes (~$4/month), and up to ~2× more on long cached prompts. It is ~2.5× faster. On this battery it was weaker on every quality check measured: explicit follow-through, acting for the user, `@Name:` format, garbled tokens and voice fidelity.
- **GLM 5.3 on Venice:** writes like GLM-5.3 on DeepInfra, with slightly cleaner narration for Ash. It costs ~2.7× more (~$11.5/month at battery sizes, ~$18–42 on long prompts).
- **Evidence size:** three runs per model, so this is thin. Explicit follow-through varied from run to run for every model.

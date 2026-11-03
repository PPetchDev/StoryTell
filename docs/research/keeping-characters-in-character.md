# Research: Techniques that keep Characters in character

Ticket: `.scratch/storytell-mvp/issues/12-keeping-characters-in-character.md`
Date: 2026-11-03
Scope: model-agnostic techniques only. Model-specific tuning waits until the text model and turn shape are chosen (see "Not yet specified" in the map). This note does not pick a design.

Vocabulary follows `CONTEXT.md`. **Drift** means a Character losing its defined personality, voice, knowledge or Setting by accident. **Bond** and **Arc** are changes we want. Keeping these apart is one of the problems covered below.

---

## Summary

1. **Drift is measurable, and it starts early.** Instruction-following decays within about eight rounds of dialogue, which the authors attribute to "attention decay over long exchanges" ([Li et al. 2024](#src-li)). Larger models drift *more*, and "assigning a persona may not help to maintain identity" ([Choi et al. 2024](#src-choi)). A good system prompt is not enough on its own over a long Chat.
2. **Position counts as much as content.** Models use information at the start and end of the context best and the middle worst ([Liu et al. 2023](#src-lost)). When instructions conflict, they tend to follow the one closest to the end ([OpenAI GPT-4.1 guide](#src-oai41)). SillyTavern is built around this. Its permanent card fields sit at the top. An Author's Note or Character's Note is injected *at a depth* near the end of the history. Post-History Instructions come last ([ST prompts](#src-st-prompts), [ST author's note](#src-st-an), [ST character design](#src-st-char)).
3. **Mechanisms beat requests for stopping the model from speaking for the user.** SillyTavern does both. Its system prompt presets ask the model not to (for example "Do not decide what {{user}} says or does"). Its code also adds stop strings for `\n{{user}}:` and for every *other* group member's name ([ST source](#src-st-stop)). Provider `stop` parameters exist, but support is uneven: some reasoning models reject them ([openai-python](#src-oai-stop)).
4. **Prompting alone does not keep secrets.** GPT-4 revealed private information in contexts where humans would not 39% of the time, and "privacy-inducing prompts or chain-of-thought" did not stop it ([ConfAIde](#src-confaide)). LLMs also do far worse than humans at tracking who knows what in conversations where people know different things ([FANToM](#src-fantom)). The reliable technique is structural: a Character's generation call should never *see* what that Character doesn't know. Per-agent memory with retrieval is the standard way to do this ([Generative Agents](#src-ga)). SillyTavern has no per-character visibility. Group chat history is shared by all members ([ST group chats](#src-st-group)).
5. **Voices blend when cards are merged.** SillyTavern's "Join character cards" mode warns that characters may get "confused about themselves" and end up with "merged personalities." Its default "Swap" mode sends only the active speaker's card ([ST group chats](#src-st-group)). Research finds that agents good at one-on-one role-play are not necessarily good in groups, and that "the behavior of individuals may drift as a result of the influence exerted by other agents" ([SocialBench](#src-socialbench)).
6. **Intended change (Bond/Arc) works best as explicit, versioned state next to an unchanging core definition.** The alternative is letting change emerge from the history, but then it can't be told apart from drift. Giving a model the character's Arc *up to the current point* beat every other context strategy in [ArcANE (2026)](#src-arcane). Chapter-wise persona updates improved consistency in [CharacterGPT](#src-charactergpt).

---

## 1. Drift (losing personality, voice or rules over a long Chat)

### What the evidence says
- **It is a known, measured failure.** In self-chat benchmarks, LLaMA2-chat-70B and GPT-3.5 show "significant instruction drift within eight rounds of conversations." The authors attribute it to "attention decay over long exchanges" ([Li et al. 2024](#src-li)).
- **Scale does not fix it.** "Larger models experience greater identity drift." Also, "assigning a persona may not help to maintain identity" ([Choi et al. 2024](#src-choi)).
- **The middle of a long context is a blind spot.** Performance "significantly degrades when models must access relevant information in the middle of long contexts," even for long-context models ([Liu et al. 2023](#src-lost)).
- **The history steers more than the system prompt.** SillyTavern's docs note that once a chat has history, changing the main prompt has limited effect. The AI draws heavily on past messages for style and assumes those messages followed the current rules ([ST prompts](#src-st-prompts)). The first message has more influence on style and length than "anything else" ([ST character design](#src-st-char)). Drifted messages therefore feed more drift.

### Techniques
| Technique | Source |
|---|---|
| Put the stable definition (identity, personality, rules, output format) in the system/developer instruction, where it has the highest priority. | [Google prompt design](#src-gemini), [OpenAI prompt engineering](#src-oai-pe), [Mistral prompting](#src-mistral), [Anthropic: keep in character](#src-anthropic) |
| Give *detailed* personality, background, traits and quirks, which "helps the model better emulate and generalize the character's traits." | [Anthropic: keep in character](#src-anthropic) |
| Repeat the key instructions **at both the start and the end** of long context, or just inject a short reminder near the end. | [OpenAI GPT-4.1 guide](#src-oai41) ("ideally place your instructions at both the beginning and end"); [Google](#src-gemini) (context first, instructions at the end) |
| **Depth injection**: insert a short note N messages from the end so it moves with the conversation. SillyTavern's Author's Note (per Chat), Character's Note (per Character, "always stays at a static depth") and World Info "@D" entries all work this way. "The closer the Author's Note is to the bottom of the prompt, the more impact it has." Frequency can be every Nth turn. | [ST author's note](#src-st-an), [ST character design](#src-st-char), [ST world info](#src-st-wi) |
| **Post-history instructions**: a final instruction block after the latest user message, which "the AI usually gives higher priority than the main prompt." Card spec V2 allows this per Character (`post_history_instructions`, with `{{original}}` to extend rather than replace the global block). | [ST prompts](#src-st-prompts), [Card spec V2](#src-ccv2) |
| **Example dialogue** to anchor voice. Examples are "more effective than abstract instructions." Gemini warns that too many cause overfitting to the examples. SillyTavern drops examples as context fills unless they are pinned. | [Anthropic consistency](#src-anthropic), [Google](#src-gemini), [Meta Llama guide](#src-meta), [ST character design](#src-st-char) |
| **Summaries instead of a truncated history**, so old facts survive as the window slides. SillyTavern's Summarize extension injects a rolling summary and warns that summaries "may lose some important details or contain hallucinations." Generative Agents retrieves memories by recency, importance and relevance. | [ST summarize](#src-st-sum), [Generative Agents](#src-ga) |
| **Prepare for likely scenarios**: list the situations that tempt a model to break character and give the in-character response for each. | [Anthropic: keep in character](#src-anthropic) |
| State the wanted behaviour plainly and once. Newer models follow instructions literally, and all-caps or emphasis can over-apply a rule. | [OpenAI GPT-4.1 guide](#src-oai41) |
| Model-internal fixes (split-softmax, per-character LoRA, training on character "experiences") exist but need control of the model's weights or attention, which a hosted API doesn't give. | [Li et al. 2024](#src-li), [Neeko](#src-neeko), [Character-LLM](#src-characterllm) |

## 2. The AI speaking or acting for the user's Role

SillyTavern uses three layers against this:

1. **Instruction.** The "Roleplay – Immersive" system preset begins: "Write one reply only. Do not decide what {{user}} says or does." The default impersonation prompt is the mirror image, for when the user *asks* the AI to write their line: "Don't write as {{char}} or system. Don't describe actions of {{char}}" ([ST presets](#src-st-presets), [ST source](#src-st-defaults)).
2. **Stop strings.** With "names as stop strings" on, `getStoppingStrings()` adds `\n{{user}}:`. In a group it also adds `\n<Name>:` for every group member other than the current speaker, so a generation cut off at another speaker's line can't continue as that speaker. For Chat Completion APIs only the user's custom stop strings apply ([ST source](#src-st-stop)).
3. **Turn shape.** The default main prompt asks for "{{char}}'s next reply," and the group nudge appended at the very end says "[Write the next reply only as {{char}}.]" ([ST source](#src-st-defaults), [ST prompt manager](#src-st-pm)).

Caveats:
- Provider stop sequences are not universal. OpenAI documents `stop` as "Up to 4 sequences" and "Not supported with latest reasoning models `o3` and `o4-mini`" ([openai-python](#src-oai-stop)). A design can't rely on them for every model, so post-generation truncation or validation in the backend is a model-agnostic fallback. That fallback is an inference, not something a source documents.
- Stop strings only catch the `Name:` transcript format. They don't catch prose like "You nod and take her hand." That needs the instruction, and probably a backend check (an inference).
- The user's own Role or Persona description belongs in the prompt so Characters can react to it. SillyTavern sends it as its own "Persona Description" block ([ST prompt manager](#src-st-pm)). Describing the Role is a different thing from writing the Role's actions.

## 3. Knowledge leakage (one Character knowing another's secrets)

### What the evidence says
- **Prompts don't reliably keep secrets.** In ConfAIde, GPT-4 and ChatGPT revealed private information where humans would not 39% and 57% of the time. "This leakage persists even when we employ privacy-inducing prompts or chain-of-thought reasoning" ([ConfAIde](#src-confaide)).
- **Tracking who knows what is weak.** On conversations where participants know different things, state-of-the-art LLMs perform "significantly worse than humans even with chain-of-thought reasoning or fine-tuning" ([FANToM](#src-fantom)).
- **Characters also leak what they *shouldn't yet know*.** Character-LLM names "Character Hallucination": agents "inadvertently express knowledge that does not align with the identity and era of the character" ([Character-LLM §3.2](#src-characterllm)). TimeChara finds serious point-in-time hallucination even in GPT-4o. It reduces the problem by splitting reasoning into steps checked by "narrative experts" ([TimeChara](#src-timechara)).
- **Even agents with separate memories embellish.** Generative Agents, which keep a separate memory stream per agent, still "hallucinated embellishments to their knowledge" ([Generative Agents §6.5.2](#src-ga)).

### Techniques
| Technique | How it separates knowledge | Source |
|---|---|---|
| **Structural separation: each Character's call sees only what that Character witnessed.** Each agent keeps "a comprehensive record of an agent's experience" (its own memory stream). Information moves only when agents talk ("information diffusion"). | Strongest option, because the secret is never in the context. Costs one call per speaking Character, plus bookkeeping of who was present for each message. | [Generative Agents §3.4.1, §4](#src-ga) |
| **Visibility tags on messages and Memories** (witnesses or "known by"), filtered when the prompt is built. | Builds the separation above from a single shared Chat history. | Inference from [Generative Agents](#src-ga) and the [ST world info](#src-st-wi) character filter |
| **Per-Character lore filtering.** World Info entries can be limited to "a list of character names for which this entry can be activated," with "Exclude" mode to invert it. Card spec V2 `character_book` is a lorebook tied to one Character. | Keeps *static* private facts (backstory, a Character's own secret) out of other Characters' prompts. Doesn't cover things said during play. | [ST world info](#src-st-wi), [Card spec V2](#src-ccv2) |
| **Swap-style prompting**: only the speaker's card goes in the prompt. | Other Characters' private card details stay out, but the shared history still leaks everything said in it. | [ST group chats](#src-st-group) |
| **Prompt-level "you don't know X."** | Weak when used alone (see ConfAIde and FANToM above). Useful as a backstop. | [ConfAIde](#src-confaide) |
| **"Protective" examples**: show the Character saying it doesn't know things outside its knowledge. | Character-LLM trains on such scenes. The prompt-level equivalent is example dialogue. | [Character-LLM §3.2](#src-characterllm) |

How a single **Narrator** call fits: if one call writes the narration *and* every Character's lines, that call has to see every secret. Separation then depends only on prompting, which the evidence above says is weak. The alternative is a Narrator call that decides who speaks and narrates, followed by a per-Character call that gets a filtered view. That trades latency and cost for separation. This is an inference for a later turn-shape ticket to decide.

## 4. Voice blending (Characters starting to sound alike)

- **Merging all cards into one prompt blends them.** SillyTavern's "Join character cards" warns of characters "confused about themselves" and "merged personalities." The default "Swap" mode sends only the active speaker's card ([ST group chats](#src-st-group)).
- **Group dynamics pull individuals off course.** "Agents excelling in individual level does not imply their proficiency in group level," and individual behaviour "may drift as a result of the influence exerted by other agents within the group" ([SocialBench](#src-socialbench)). Group chat also requires models to "decide when to talk" and stay "grounded on multiple characters" ([MultiLIGHT](#src-multilight)).
- **Instruction-tuned house style flattens voices.** Generative Agents notes that agents' speech came across as overly formal, which the authors attribute to instruction tuning ([Generative Agents §3.1.1](#src-ga)).

Techniques:
| Technique | Source |
|---|---|
| Generate each Character's turn with only *its* card and *its* example dialogue ("Swap"), or at least keep each Character's fields clearly separated. Join mode uses a per-field join prefix/suffix with `{{char}}` for this. | [ST group chats](#src-st-group) |
| A per-Character speech-sample block (`{{char}}:` examples inside `<START>` blocks), with examples kept consistently formatted and varied. | [ST character design](#src-st-char), [Google](#src-gemini) |
| A per-Character depth note (Character's Note) restating voice markers near the end of the prompt. | [ST character design](#src-st-char) |
| A final nudge naming the one speaker ("[Write the next reply only as {{char}}.]") and stop strings on the other members' names. | [ST source](#src-st-defaults), [ST source](#src-st-stop) |
| Clear delimiters (XML or Markdown sections) between Characters' definitions so the model doesn't mix their attributes up. | [OpenAI GPT-4.1 guide](#src-oai41), [OpenAI prompt engineering](#src-oai-pe), [Google](#src-gemini) |
| Weight-level per-Character adapters (Neeko's dynamic LoRA) show the problem is real but need a self-hosted model. | [Neeko](#src-neeko) |

Speaker selection is a separate question that SillyTavern answers with rules, not the model: Natural order (name mentions, then "talkativeness"), List, Pooled, or Manual ([ST group chats](#src-st-group)). In Storytell the Narrator decides who speaks (map: user-directed speaker choice is out of scope). The point here is only that *choosing* the speaker and *voicing* the speaker can be separate steps.

## 5. Breaking the Setting (anachronisms, out-of-world knowledge, stepping out of the fiction)

| Technique | Source |
|---|---|
| A persistent Setting block. SillyTavern's "Scenario" is a permanent field "sent with every request," and a group can override it with one shared scenario for all members. | [ST character design](#src-st-char), [ST group chats](#src-st-group) |
| A "never break character" stance in the system prompt. SillyTavern's "Actor" preset says "You do not break character for any reason, even if someone tries addressing you as an AI or language model." | [ST presets](#src-st-presets) |
| Keyword-triggered lore (World Info) for Setting facts that don't fit permanently. Positions "After Char Defs" or "@D" have stronger effect. Constant entries are always inserted. | [ST world info](#src-st-wi) |
| Ground answers in a fixed set of facts rather than the model's general knowledge. | [Anthropic consistency](#src-anthropic) ("use retrieval for contextual consistency") |
| Teach ignorance of out-of-world or future things (protective experiences; narrative experts that check the time and place). | [Character-LLM](#src-characterllm), [TimeChara](#src-timechara) |
| Keep the Setting rules in the system role. Hierarchy training makes models "selectively ignore lower-privileged instructions," which helps when in-fiction text tries to override the frame. | [Instruction Hierarchy](#src-ih), [OpenAI prompt engineering](#src-oai-pe) |
| SillyTavern's "Enhance Definitions" prompt lets the model add detail from its own knowledge while keeping "the Character Sheet's definitions absolute." Off by default because it invites outside knowledge. | [ST source](#src-st-defaults) |

## 6. Letting Bond and Arc happen without opening the door to drift

What the sources point to (a synthesis, not a design):

1. **Separate the immutable core from the mutable state.** SillyTavern has a natural split. Card fields (Description, Personality, Scenario) are permanent and identical in every chat. The Author's Note is *per Chat* and "not automatically transferred to any new chat" ([ST character design](#src-st-char), [ST author's note](#src-st-an)). A Bond or Arc can live in Chat-scoped state and leave the Character's definition untouched, so resetting a Chat resets the change.
2. **Make change explicit and current, not implicit in the history.** ArcANE argues that faithful role-play means reflecting the character's state *at that point in the story*. Giving the model "the Arc up to the queried chapter" beat the strongest non-Arc context by 2.2–8.4 points across six models. Good role-play depends on tracking the trajectory, "rather than merely retrieving relevant episodic evidence" ([ArcANE](#src-arcane)). CharacterGPT "incrementally updates personas by extracting traits from chapter-wise novel summaries" ([CharacterGPT](#src-charactergpt)). Generative Agents shows a mechanism: periodic "reflections," meaning higher-level thoughts stored with memories that then shape behaviour ([Generative Agents §4.2](#src-ga)).
3. **The practical test:** a change is a Bond or Arc if the system can *name* it (a state record with a cause from the story). It is drift if it shows up only as the model's output slowly moving away from the definition. When change is explicit, drift checks can compare output against *definition plus current Bond/Arc state* rather than the original card alone. This is an inference, but it follows from point 2 and from how consistency benchmarks score against a reference persona ([CharacterEval](#src-charactereval), [Li et al. 2024](#src-li)).
4. **Keep the reinforcement current.** Depth-injected reminders (Character's Note, Author's Note) should restate the *current* state. Re-asserting the original personality every turn would fight an intended Arc. This is an inference from [ST author's note](#src-st-an) and [ArcANE](#src-arcane).
5. **Watch summaries.** If Bond or Arc state comes from model-written summaries or reflections, those can introduce errors. SillyTavern warns that summaries "may lose some important details or contain hallucinations" ([ST summarize](#src-st-sum)). Generative Agents found embellished memories ([Generative Agents §6.5.2](#src-ga)). Showing and letting the user edit this state fits the Memory concept in `CONTEXT.md`.
6. **Bond is shown, not stated.** `CONTEXT.md` says Bond is "shown only through how the Character behaves." The state can be explicit in the prompt and still be written as behavioural guidance, not a number the Character announces. This document just notes the constraint.

---

## Open questions for later tickets (not decided here)
- **Turn shape:** one Narrator call that writes everything, or Narrator plus a filtered call per Character? This decides whether knowledge separation can be structural (section 3) and affects voice blending (section 4) and cost.
- **Stop-sequence support** of the chosen model, and whether the backend needs its own check that the Role wasn't written for.
- **Where Bond/Arc state lives** and how it's updated (per turn, per Scene, on reflection), and how it relates to Memory.
- **A drift check** (LLM-as-judge or a heuristic) and what it compares against.

## Gaps and caveats in the evidence
- SillyTavern docs describe *what features do*, not how well they work. Their effectiveness is community practice, not measured.
- Most drift research covers one-on-one, single-character dialogue. Multi-character evidence is thin ([SocialBench](#src-socialbench), [MultiLIGHT](#src-multilight), [Neeko](#src-neeko)).
- The research tested older models (GPT-3.5/4, LLaMA-2, GPT-4o). Model-specific behaviour should be checked again once a model is chosen.
- Meta's Llama guide no longer uses the term "system prompt." Its role-prompting advice is generic ([Meta](#src-meta)).

---

## Sources

**SillyTavern (docs and source)**
- <a id="src-st-group"></a>Group Chats: https://docs.sillytavern.app/usage/core-concepts/groupchats/
- <a id="src-st-char"></a>Character Design: https://docs.sillytavern.app/usage/core-concepts/characterdesign/
- <a id="src-st-an"></a>Author's Note: https://docs.sillytavern.app/usage/core-concepts/authors-note/
- <a id="src-st-prompts"></a>Prompts overview: https://docs.sillytavern.app/usage/prompts/
- <a id="src-st-pm"></a>Prompt Manager: https://docs.sillytavern.app/usage/prompts/prompt-manager/
- <a id="src-st-wi"></a>World Info: https://docs.sillytavern.app/usage/core-concepts/worldinfo/
- <a id="src-st-sum"></a>Summarize extension: https://docs.sillytavern.app/extensions/summarize/
- <a id="src-st-defaults"></a>Default prompt constants (`default_main_prompt`, `default_impersonation_prompt`, `default_group_nudge_prompt`, `default_enhance_definitions_prompt`): https://github.com/SillyTavern/SillyTavern/blob/release/public/scripts/openai.js (lines ~102–115)
- <a id="src-st-stop"></a>`getStoppingStrings()`: https://github.com/SillyTavern/SillyTavern/blob/release/public/script.js
- <a id="src-st-presets"></a>System prompt presets ("Roleplay - Immersive", "Roleplay - Detailed", "Actor"): https://github.com/SillyTavern/SillyTavern/tree/release/default/content/presets/sysprompt
- <a id="src-ccv2"></a>Character Card Spec V2: https://github.com/malfoyslastname/character-card-spec-v2/blob/main/spec_v2.md

**Provider prompt-engineering guidance**
- <a id="src-oai-pe"></a>OpenAI, Prompt engineering guide: https://developers.openai.com/api/docs/guides/prompt-engineering
- <a id="src-oai41"></a>OpenAI, GPT-4.1 Prompting Guide (archived cookbook): https://developers.openai.com/cookbook/examples/gpt4-1_prompting_guide
- <a id="src-oai-stop"></a>OpenAI `stop` parameter docstring, openai-python: https://github.com/openai/openai-python/blob/main/src/openai/types/chat/completion_create_params.py
- <a id="src-gemini"></a>Google, Prompt design strategies: https://aistudio.google.com/docs/prompting-strategies
- <a id="src-mistral"></a>Mistral, Prompting: https://docs.mistral.ai/guides/prompting_capabilities/
- <a id="src-meta"></a>Meta Llama, Prompting how-to: https://dev.meta.ai/llama/docs/how-to-guides/prompting/
- <a id="src-anthropic"></a>Anthropic, Increase output consistency / Keep Claude in character (model-agnostic advice; not a model choice for this app): https://platform.claude.com/docs/en/test-and-evaluate/strengthen-guardrails/increase-consistency

**Research**
- <a id="src-li"></a>Li et al. 2024, *Measuring and Controlling Instruction (In)Stability in Language Model Dialogs* (COLM 2024): https://arxiv.org/abs/2402.10962
- <a id="src-choi"></a>Choi et al. 2024, *Examining Identity Drift in Conversations of LLM Agents*: https://arxiv.org/abs/2412.00804
- <a id="src-lost"></a>Liu et al. 2023, *Lost in the Middle: How Language Models Use Long Contexts* (TACL): https://arxiv.org/abs/2307.03172
- <a id="src-confaide"></a>Mireshghallah et al. 2023, *Can LLMs Keep a Secret?* (ConfAIde, ICLR 2024): https://arxiv.org/abs/2310.17884
- <a id="src-fantom"></a>Kim et al. 2023, *FANToM: Stress-testing Machine Theory of Mind in Interactions* (EMNLP 2023): https://arxiv.org/abs/2310.15421
- <a id="src-ga"></a>Park et al. 2023, *Generative Agents: Interactive Simulacra of Human Behavior*: https://arxiv.org/abs/2304.03442 (HTML: https://arxiv.org/html/2304.03442v2)
- <a id="src-characterllm"></a>Shao et al. 2023, *Character-LLM: A Trainable Agent for Role-Playing* (EMNLP 2023), §3.2 Protective Experience: https://arxiv.org/abs/2310.10158
- <a id="src-timechara"></a>Ahn et al. 2024, *TimeChara: Evaluating Point-in-Time Character Hallucination of Role-Playing LLMs* (Findings of ACL 2024): https://arxiv.org/abs/2405.18027
- <a id="src-socialbench"></a>Chen et al. 2024, *SocialBench: Sociality Evaluation of Role-Playing Conversational Agents* (Findings of ACL 2024): https://arxiv.org/abs/2403.13679
- <a id="src-multilight"></a>Wei et al. 2023, *Multi-Party Chat: Conversational Agents in Group Settings with Humans and Models*: https://arxiv.org/abs/2304.13835
- <a id="src-neeko"></a>Yu et al. 2024, *Neeko: Leveraging Dynamic LoRA for Efficient Multi-Character Role-Playing Agent* (EMNLP 2024): https://arxiv.org/abs/2402.13717
- <a id="src-arcane"></a>Song et al. 2026, *ArcANE: Do Role-Playing Language Agents Stay in Character at the Right Time?* (EMNLP 2026): https://arxiv.org/abs/2606.05553
- <a id="src-charactergpt"></a>Park et al. 2024, *CharacterGPT: A Persona Reconstruction Framework for Role-Playing Agents* (NAACL 2025 Industry): https://arxiv.org/abs/2405.19778
- <a id="src-charactereval"></a>Tu et al. 2024, *CharacterEval: A Chinese Benchmark for Role-Playing Conversational Agent Evaluation*: https://arxiv.org/abs/2401.01275
- <a id="src-ih"></a>Wallace et al. 2024, *The Instruction Hierarchy: Training LLMs to Prioritize Privileged Instructions*: https://arxiv.org/abs/2404.13208

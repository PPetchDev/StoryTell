# Techniques that keep Characters in character

Type: research
Status: resolved
Blocked by: none
Part of: [Map: Storytell AI MVP](../map.md)

## Question

What model-agnostic techniques keep Characters in character in long, multi-Character roleplay chats — prompt structure, per-Character knowledge separation, preventing the AI from speaking or acting for the user, keeping distinct voices, staying inside the Setting — and how do tools like SillyTavern and published prompt-engineering guidance handle them? Distinguish preventing drift from allowing intended change (Bond, Arc).

## Answer

Findings: branch `research/keeping-characters-in-character`, file `docs/research/keeping-characters-in-character.md` (commit 3099f78).

- Drift is fast and measurable: studies see instruction drift within ~8 turns, worse in bigger models; a system-prompt persona alone isn't enough. Placement matters — SillyTavern keeps fixed Character definitions at the top, injects short notes (Author's Note / Character's Note) near the end of history, and a final instruction after the user's last message.
- Speaking for the user's Role: three layers — explicit instruction, stop strings on the user's and other Characters' names, and a closing "write only as the speaking Character" instruction. Some models don't support stop parameters, so a backend output check may be needed (agent's inference, not sourced).
- Knowledge leakage between Characters: prompting alone fails (GPT-4 leaked private info in 39% of cases despite privacy prompts). What works is structural separation — each Character sees only what it witnessed. SillyTavern has no such separation; group history is shared.
- Voice blending: putting every card in one prompt blends personalities (SillyTavern warns about its "Join" mode); its default sends only the speaking Character's card.
- Staying in the Setting: an always-sent Setting block, keyword-triggered lore, and example dialogue where Characters don't know things outside the world.
- Bond/Arc coexist with drift prevention by separating an immutable core definition from explicit, editable per-Chat state. ArcANE (2026): telling the model the Arc up to the current point worked best across models tested. Test: if the system can say what changed and which story event caused it, it's Bond/Arc; if output just slides away from the definition, it's drift.
- Biggest open question for the turn prototype: one Narrator call writing everything vs separate per-Character calls each seeing only its own knowledge — this decides whether secrets can be separated structurally, and affects cost.
- Evidence caveat: SillyTavern docs describe features, not effectiveness; multi-character research is thin and mostly on older models — retest once the model is chosen.

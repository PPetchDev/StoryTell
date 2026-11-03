# How Zeta runs a Story

Type: research
Status: resolved
Blocked by: none
Part of: [Map: Storytell AI MVP](../map.md)

## Question

How does Zeta (zeta-ai.io) structure and run its stories in practice: the narrator voice, how multiple characters take turns, how scenes or plot progress, how it remembers long chats, how character relationships/affection evolve, how its in-chat image snapshots work, and how users create stories (including any AI-assisted creation)? Capture the mechanics and UX patterns worth copying or avoiding.

## Answer

Findings: branch `research/zeta-how-a-story-runs`, file `docs/research/zeta-how-a-story-runs.md` (commit 7b2834a). Sources: Zeta's own support announcements (EN/KR), FAQ, official Notion guide, App Store listing, a public story page; three secondary sources labelled as such.

- Narrator: Zeta calls a Story a "Plot" and has no separate Narrator — narration and the main Character's lines share one turn. The creator sets the voice in a "Style" tab (POV, tense, reply length, dialogue vs action, pacing, difficulty, genre, prose presets).
- Turn-taking: the model picks which Characters speak; each Character's lines become their own turn tagged `@Name:`. Edit/delete/regenerate act on the whole turn.
- Plot progress: no ordered Scenes. A Story starts from an authored Intro then runs freely; progress comes from optional AI-triggered add-ons (goal gauges with turn limits, quests, AI-suggested endings, in-story clock, dice, background music).
- Memory: sold as model size ("2x/4x memory") plus creator-written keyword-triggered world entries; no user-visible or editable Memory list. Zeta's FAQ admits memory problems; reviewers call it the weakest area. Zeta's own data: entries forced into every message cut 10-minute play continuation by 5.1 points.
- Relationships: shown openly (AI-updated relationship charts, mood/relationship fields, tier lists, paid Character diaries) — the opposite of our hidden Bond. No official mechanism for intended personality change (our Arc).
- Snapshots: paid, on-demand images built from Character descriptions/images, the conversation and the user's profile image, kept in a per-Story gallery; an external image service receives part of the recent chat.
- Story creation: a long form (up to 20 side Characters, Intro, example dialogue, Style and add-on tabs) plus an assistant ("zelly") that builds a Plot by conversation from "an idea, a vibe, and characters".
- Copy: structured Style fields; `@Name:` turn-splitting checked against the fixed cast; detailed world facts kept out of the always-on prompt; one-sentence triggers for Scene goals; in-story clock; drafting a Story by conversation.
- Avoid: visible relationship meters; unseen/uneditable memory; "stay consistent" as the only rule (Arc indistinguishable from drift); side Characters barging in uninvited; sprawl of paid side features.
- Zeta's Persona can't be switched mid-Chat (relevant to the Persona-vs-Role fog).
- Unknown: Zeta's memory internals, whether a hidden affection value sits behind its charts, which image model Snapshots use.

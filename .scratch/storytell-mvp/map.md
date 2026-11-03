# Map: Storytell AI MVP

Type: wayfinder:map

## Destination

A buildable MVP spec for Storytell AI, ready to hand to `/to-spec`: a single-user personal web app (Next.js + NestJS, installable as a PWA) for English roleplay inside Stories — each with a Setting, an author-controlled cast of Characters and optional Scenes — with adult content allowed, AI-drafted Stories, many resettable Chats per Story, editable Memory, evolving Bonds and Arcs, and on-demand Snapshots.

## Notes

- Domain: personal roleplay app, played only by its author. English only. Users are adults; explicit adult fiction is in scope.
- Stack preference: Next.js frontend, NestJS backend.
- Budget: roughly $10–30/month for model usage.
- Claude models are not an option for generating explicit adult content (Anthropic usage policy); the text and image model must come from a provider whose own policy permits adult fiction for adult users.
- Use the vocabulary in `CONTEXT.md` (Story, Setting, Scene, Opening, Character, Narrator, Role, Persona, Chat, Memory, Bond, Arc, Snapshot).
- Bond/Arc (intended change) must stay distinguishable from drift (unintended loss of character) — tickets touching either must say which they mean.
- Grilling tickets: call the Skill tool for `grilling` and `domain-modeling`. Prototype tickets: `prototype`. Research tickets: `research`, findings on a `research/<name>` branch.

## Decisions so far

<!-- one line per closed ticket: [title](link) — gist -->

- [How long roleplay Chats keep their memory](issues/04-long-chat-memory-techniques.md) — layered prompt (fixed block → lore → summary → recent messages); an extracted, capped fact list suits an editable Memory best; summaries are lossy; order layers for prompt caching.
- [Techniques that keep Characters in character](issues/12-keeping-characters-in-character.md) — fixed core definitions on top + short notes near the end; per-Character knowledge must be separated structurally, not by prompt; send only the speaking Character's card; Bond/Arc live as explicit per-Chat state apart from the core.
- [Image models for Snapshots](issues/03-image-model-for-snapshots.md) — Venice, Runware and Replicate clearly permit adult images (xAI/BFL uncertain); ~$0.01–0.02/image fits budget; real Character consistency needs a stored reference image per Character.
- [Text LLMs that allow adult fiction for adult users](issues/02-text-llm-for-adult-roleplay.md) — OpenAI, Gemini and first-party DeepSeek/Z.ai/Together are out; shortlist: DeepSeek V4 on a pinned third-party host, GLM-5.3 on a third-party host, or Mistral first-party; DeepSeek V4 Flash and Mistral Small 4 fit the budget comfortably.
- [How Zeta runs a Story](issues/01-zeta-how-a-story-runs.md) — no separate Narrator, model picks speakers with `@Name:` turns, no ordered Scenes (AI-triggered goals/quests instead), weak hidden memory, visible relationship meters, Stories drafted by a creation form plus a conversational assistant.
- [When a Persona replaces a Role](issues/14-persona-replacing-a-role.md) — switchable any time, even mid-Chat; Characters see the same person with new details, Bond and Memory carry over.
- [What editing an earlier message does](issues/15-editing-an-earlier-message.md) — editing any message discards everything after it and the AI replies afresh; Memory, Bond and Arc from the discarded messages roll back.
- [Choose the text LLM](issues/05-choose-text-llm.md) — OpenRouter with pinned hosts; GLM-5.3 primary, DeepSeek V4 Pro as a manual fallback, V4 Flash for background calls; thinking off; $30 prepaid hard cap; switching model mid-Chat warns of Drift (provisional until the turn prototype).
- [How Bond and Arc change](issues/13-how-bond-and-arc-change.md) — the AI judges every change in a background call after each turn, each change tied to its causing message and event; Bond is directional (toward the user and between Characters), a label plus a short description, no numbers; author may set starting Bonds and Arc directions; Arc is a separate step list, never rewriting the core; a read-only dashboard shows both, the Chat screen never does; Scene conditions are plain language, no endings.
- [Writing a Story with AI](issues/09-writing-a-story-with-ai.md) — Story = Title, Setting, Opening, 3 Style fields, required Role, 1–6 Characters (Appearance, Personality, Voice, Background, starting Secrets/Bonds/Arc directions), optional ordered Scenes that steer but never lock play; GLM-5.3 drafts the required fields from an idea, then edit by hand, per-field rewrite or a stateless assistant chat with Undo; edits reach existing Chats; only the author changes the cast; knowledge learned in play is Memory tagged with who knows it.

## Not yet specified

- Whether the PWA needs any offline behaviour.
- Export / backup of Stories and Chats.
- Model-specific techniques for keeping Characters in character, once the text model and turn shape are known (follows from 05, 07, 12).

## Out of scope

- Multiple users, accounts, sign-up.
- Sharing Stories or a marketplace.
- Monetization.
- Thai or any non-English language.
- Users under 18.
- Regenerate, Swipe, Continue and Branch on messages (only editing is in the MVP).
- Character avatar images.
- User-directed speaker choice (e.g. @mentions) — the Narrator decides who speaks.
- Native mobile apps.
- Separate world notes / lore entries, Story tags and genre or pacing presets (the Setting holds these in plain language).
- Skipping or rewinding Scenes by hand (editing a message is the only undo).

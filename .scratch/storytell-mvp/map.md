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
- [How one AI turn behaves](issues/07-one-ai-turn-prototype.md) — one call writes narration plus `@Name:` lines and picks the speakers (per-speaker calls were ~3× cost, slower and no cleaner), so all cards share one prompt; GLM-5.3 stays primary (both models wrote adult content willingly) but needs minimal reasoning on DeepInfra, and GMICloud has no stop strings; V4 Flash needs strict rules for gradual Bond and rare Arc; all Bonds sent, no leaks seen; ~$5/month at moderate use.
- [Memory design](issues/08-memory-design.md) — a capped (~2k-token), always-sent list of short facts (events, world details, things learned about the user, open promises), never feelings or personality; a separate V4 Flash call adds/updates/deletes after each turn, each change tied to its message; each Memory tagged Known by; user-written or edited Memories are locked from the AI; over the cap facts merge or go to Archived; editing rolls back AI-made changes but keeps user-written ones; reset empties it; no summary layer; an editable drawer with "Memory added" toasts, apart from the Bond/Arc dashboard.
- [Choose the image model and how a Snapshot behaves](issues/06-choose-image-model-and-snapshot-behaviour.md) — Runware + Seedream 4 (~$0.03, provisional until an adult/consistency test; Venice the fallback); $30 cap split into text and image prepaid credits, out of image credit stops only Snapshots; a hidden per-Character Reference image (never an avatar) plus a per-Story Image style; camera button snapshots the latest AI Message from the user's POV, ≤3 Characters, optional hint, V4 Flash writes the prompt; inline in the timeline and in a per-Story Gallery that keeps Snapshots through edit, reset and Chat deletion.
- [Hosting and access for one user on many devices](issues/10-hosting-and-access.md) — everything (Next.js, NestJS, PostgreSQL, image files) runs on the user's home Windows PC: $0 hosting, up only while the PC is on, starting itself with Windows; a private Tailscale tailnet (HTTPS on `*.ts.net`) is the only lock, with no in-app login; live instance kept apart from dev; daily backup to a second disk plus encrypted Google Drive; PWA is online-only (one "can't connect" screen, no offline cache).
- [Data model](issues/11-data-model.md) — the logical model is in [the sketch](assets/11-data-model.md):
  - Messages store the identity the user wore and stamped speaker names.
  - The Opening is copied in as Message 1.
  - Every AI change to Memory, Bond, Arc or Scene is recorded with its before and after values and the Message that caused it, and is undone newest-first.
  - Editing an AI Message re-judges it and waits for the user.
  - Reset keeps the title and the identity worn.
  - Personas belong to the app and have no appearance.
  - Snapshots outlive their Chat in the Gallery.
  - Usage is logged per call in text and image credit pools.
  - Export graduated to [Export of Stories and Chats](issues/16-export-of-stories-and-chats.md), later ruled out of scope.

## Not yet specified


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
- [Export of Stories and Chats](issues/16-export-of-stories-and-chats.md) — no in-app export, import, Trash, Chat-as-text download, Tavern cards or Duplicate Story. The daily disaster backup from Hosting and access covers recovery and moving PCs, and a delete costs at most a whole-app restore to last night. The spec still writes down the restore steps, and they get tried once.

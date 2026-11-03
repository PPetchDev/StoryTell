# Map: Storytell AI MVP

Type: wayfinder:map

## Destination

A buildable MVP spec for Storytell AI, ready to hand to `/to-spec`: a single-user personal web app (Next.js + NestJS, installable as a PWA) for English roleplay inside Stories — each with a Setting, a fixed cast of Characters and optional Scenes — with adult content allowed, AI-drafted Stories, many resettable Chats per Story, editable Memory, evolving Bonds and Arcs, and on-demand Snapshots.

## Notes

- Domain: personal roleplay app, played only by its author. English only. Users are adults; explicit adult fiction is in scope.
- Stack preference: Next.js frontend, NestJS backend.
- Budget: roughly $10–30/month for model usage.
- Claude models are not an option for generating explicit adult content (Anthropic usage policy); the text and image model must come from a provider whose own policy permits adult fiction for adult users.
- Use the vocabulary in `CONTEXT.md` (Story, Setting, Scene, Character, Narrator, Role, Persona, Chat, Memory, Bond, Arc, Snapshot).
- Bond/Arc (intended change) must stay distinguishable from drift (unintended loss of character) — tickets touching either must say which they mean.
- Grilling tickets: call the Skill tool for `grilling` and `domain-modeling`. Prototype tickets: `prototype`. Research tickets: `research`, findings on a `research/<name>` branch.

## Decisions so far

<!-- one line per closed ticket: [title](link) — gist -->

## Not yet specified

- What happens to later messages when the user edits an earlier one in a Chat.
- When a Persona replaces a Story's Role: only at Chat start, or switchable mid-Chat.
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

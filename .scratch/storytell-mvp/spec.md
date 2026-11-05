# Spec: Storytell AI MVP

Status: ready-for-agent
Part of: [Map: Storytell AI MVP](map.md)

## Problem Statement

The user wants to roleplay, in English, with AI-played Characters inside Stories they write themselves, with explicit adult fiction allowed. Existing apps (Zeta, SillyTavern and similar) fall short for them in specific ways:

- Hidden memory is weak and can't be inspected or fixed, so Characters forget events or "know" things they never witnessed.
- Characters slide out of character over long Chats (Drift), and the user can't tell Drift apart from intended change.
- Relationships show as numeric meters, which breaks immersion, and personality change has no traceable cause.
- Writing a rich Story by hand is slow, and there's no good way to draft one from an idea and refine it with AI.
- Mistakes can't be cleanly undone: rewriting an earlier message leaves stale memory and feelings behind.
- Mainstream models and hosts refuse or ban adult fiction, and most paid apps cost more than the user's $10–30/month budget.

They want a private app that only they can reach, from both their Windows desktop and Android phone, that costs nothing to host and stays within a hard monthly model budget.

## Solution

A single-user personal web app (Next.js frontend, NestJS backend, PostgreSQL), installable as a PWA. It runs on the user's home Windows PC and is reachable only over their private Tailscale tailnet.

- **Write Stories with AI.** The user types an idea. The AI drafts a whole Story: Title, Setting, Opening, Style, Role and 1–6 Characters, plus optional Scenes. The user refines it by hand, with per-field rewrites, or through a stateless assistant chat with Undo.
- **Play many Chats per Story.** Each turn, one AI call writes narration and Characters' speech (`@Name:` lines). The Narrator decides who speaks and never writes for the user. The user can wear the Story's Role or any of their own Personas, and switch at any time.
- **Memory the user can see and fix.** After each turn a background call extracts short facts, each tagged with which Characters know it. The user can see, add, edit, lock and delete them in a Memory drawer.
- **Bonds and Arcs that change for a reason.** A second background call judges how Characters' feelings (Bonds) and personalities (Arcs) change. Every change cites the event and Message that caused it. Bonds and Arcs never appear on the Chat screen. A read-only dashboard shows them, together with the current Scene.
- **Edit as rewind.** Editing any Message discards everything after it and rolls back every Memory, Bond, Arc and Scene change those Messages caused. Resetting a Chat returns it to the Story's start.
- **Snapshots on demand.** A camera button generates an image of the latest moment, seen through the user's eyes. A hidden per-Character Reference image keeps faces consistent. Every Snapshot lands in the Story's Gallery and survives edits, resets and Chat deletion.
- **A hard budget.** Text and image models come from providers that permit adult fiction for adult users, through two prepaid credits capped at $30/month together. The app shows spend per pool and warns when credit runs low.

## User Stories

### Writing a Story

1. As the author, I want to type a Story idea of any length and get a complete draft, so that I don't start from a blank form.
2. As the author, I want the draft to fill every required field (Title, Setting, Opening, Style, Role, Characters) in one go, so that the Story is playable straight away.
3. As the author, I want optional fields (Scenes, Secrets, starting Bonds, Arc directions) filled only when my idea implies them, so that the draft doesn't invent structure I didn't ask for.
4. As the author, I want to edit any field by hand, so that I keep full control of my Story.
5. As the author, I want a "rewrite this field" button on every field, so that I can reroll one part without touching the rest.
6. As the author, I want an assistant chat beside the form that takes instructions like "give Mira a sister" or "add Scenes", so that I can make sweeping changes in plain language.
7. As the author, I want the assistant to apply its changes straight to the Story and highlight the fields it changed, so that I can see what happened without an accept/reject step.
8. As the author, I want an Undo for each assistant change while the page is open, so that I can back out of a change I don't like.
9. As the author, I want the assistant to start fresh every time I open it, with the current Story as its only context, so that old instructions never leak into new ones.
10. As the author, I want the assistant available on Stories that already have Chats, so that I can keep improving a Story I'm playing.
11. As the author, I want the Story to save automatically, so that I never lose work.
12. As the author, I want the Story to become playable as soon as every required field is filled, with no draft/published step, so that I can start playing immediately.
13. As the author, I want a Setting field that holds place, situation, premise and any tone notes in plain language, so that I don't have to fit my world into presets.
14. As the author, I want to write an Opening passage that begins every Chat, so that each playthrough starts the way I intend.
15. As the author, I want to choose POV (1st/2nd/3rd), tense (past/present) and reply length (short/medium/long), so that replies read the way I like.
16. As the author, I want an Image style field in plain language (e.g. "anime, soft colours"), so that Snapshots and Reference images share one look.
17. As the author, I want every Story to have a required Role with a Name and Description, so that Characters always know who they're talking to.
18. As the author, I want 1–6 Characters per Story, ordered, so that I can build a small ensemble cast.
19. As the author, I want each Character to have Name, Appearance, Personality, Voice, Background, so that the AI has a full core definition to play from.
20. As the author, I want to give a Character an ordered list of example lines under Voice, so that its voice stays distinct.
21. As the author, I want to give a Character starting Secrets, so that it holds knowledge others don't.
22. As the author, I want to set optional starting Bonds from a Character toward the Role and toward other Characters (a label and a short description), so that relationships begin where my Story needs them.
23. As the author, I want Characters without a starting Bond to begin as strangers, so that I only specify what matters.
24. As the author, I want to write optional Arc directions per Character (e.g. "if trusted, her coldness thaws"), so that I can hint at intended change without forcing it.
25. As the author, I want to add optional, ordered Scenes, each with a name, a situation/goal and a plain-language move-on condition, so that the story has a shape to move through.
26. As the author, I want the last Scene's move-on condition to be optional, so that play can stay in the final Scene and then continue freely.
27. As the author, I want move-on conditions that can refer to feelings ("once Mira trusts you"), so that Scenes respond to relationships without numbers.
28. As the author, I want to reorder Characters and Scenes, so that I can restructure the Story.
29. As the author, I want text edits to the Story to reach existing Chats on their next turn, so that fixes apply everywhere.
30. As the author, I want changes to the Opening, starting Bonds and Arc directions to affect only new or reset Chats, so that ongoing Chats aren't rewritten under me.
31. As the author, I want to add a Character to a Story that has Chats, so that the new Character joins each Chat as a stranger with no history.
32. As the author, I want a warning before removing a Character, so that I know its Bonds, Arc steps and Reference image will be deleted in every Chat.
33. As the author, I want removed Characters' names to stay on their old speech and Snapshots, so that past Chat history still reads correctly.
34. As the author, I want adding, reordering or removing Scenes to move each Chat sensibly (stay on its Scene; move on if its Scene is removed; enter a newly added Scene after the last one it finished), so that Chats never end up in an impossible state.
35. As the author, I want a Chat whose Story is missing a required field to stay readable but block sending, with a note naming the missing field, so that I know what to fix.
36. As the author, I want to delete a Story after confirming, so that everything under it, including its Gallery and Reference images, goes with it.
37. As the author, I want the AI never to add or remove Characters during play, so that only I control the cast.

### Reference images

38. As the author, I want to generate a Reference image for a Character from its page, choosing one of 4 full-body, neutral-pose candidates on a plain background in the Story's Image style, so that the Character looks the same in every Snapshot.
39. As the author, I want the Reference image never to appear beside Messages, in cast lists or anywhere in play, so that it never acts as an avatar.
40. As the author, I want editing Appearance or Image style to offer, but not force, regenerating the Reference image, so that I decide when the look changes.
41. As the author, I want a new Reference image to replace the old one, so that each Character has at most one.
42. As the author, I want a Character without a Reference image still to appear in Snapshots, drawn from text alone, so that a missing image never blocks me.

### Personas and Role

43. As the user, I want to create app-wide Personas with a Name and Description, so that I can play as myself, or a recurring character, in any Story.
44. As the user, I want to switch between the Story's Role and any Persona at any time, even mid-Chat, so that I can change who I'm playing.
45. As the user, I want Characters to treat a switch as the same person with new details, keeping their Bonds and Memories, so that switching doesn't break the story.
46. As the user, I want each of my Messages to keep the name I wore when I sent it, even after renaming or deleting the Persona, so that history stays accurate.
47. As the user, I want deleting a worn Persona to fall the Chat back to the Role, so that the Chat stays playable.
48. As the user, I want Memories that mention me to show my current Role or Persona name, so that facts read naturally after a switch.

### Playing a Chat

49. As the user, I want to start any number of Chats per Story, each beginning with the Opening as its first Message, so that I can try different playthroughs.
50. As the user, I want each Chat to have a default title "Chat N" that I can rename, so that I can tell playthroughs apart.
51. As the user, I want Chats listed with when they were created and last played, so that I can pick up where I left off.
52. As the user, I want to send a message and get one AI reply that mixes narration with Characters' speech, so that the scene feels like a story, not a chat log.
53. As the user, I want the Narrator to decide which Characters speak (zero, one or several), so that only the Characters who would naturally respond do.
54. As the user, I want each Character's speech shown under its name, so that I always know who is talking.
55. As the user, I want the AI never to write my Role's words, actions, thoughts or decisions, so that I stay in control of my character.
56. As the user, I want any line the AI writes as me to be cut off before I see it, so that a slip by the model doesn't take over my turn.
57. As the user, I want replies to follow the Story's POV, tense and reply length, so that the prose matches the Story.
58. As the user, I want Characters to stay inside the Setting and know nothing outside their world, so that immersion holds.
59. As the user, I want explicit adult content written willingly when the story leads there, without moralising or fading to black, so that the fiction can go where I take it.
60. As the user, I want Characters to keep their established personality and voice over long Chats, so that Drift doesn't wear them down.
61. As the user, I want Characters to act on what they know and not on others' secrets or feelings, so that knowledge feels real.
62. As the user, I want the current Scene to steer the story without stopping me from wandering off, so that I'm never railroaded.
63. As the user, I want the story to move to the next Scene when its condition is clearly met, so that the plot progresses.
64. As the user, I want play to continue freely after the last Scene, so that a Story never hard-ends.
65. As the user, I want a failed turn to leave my message in place with a Retry, so that a provider hiccup never loses my input.
66. As the user, I want a refusal or provider outage to show an error with Retry, never a silent switch to another model, so that Characters don't drift unnoticed.
67. As the user, I want to see that the AI is writing while I wait, so that I know my turn went through.
68. As the user, I want to be told if I try to send while the previous turn's background work is still saving, so that the next turn always sees up-to-date Memory and Bonds.

### Editing and resetting

69. As the user, I want to edit any of my earlier Messages and have the AI reply afresh from that point, so that I can take a different path.
70. As the user, I want to edit an AI Message, including which Character says what via `@Name:` lines, so that I can fix a reply myself.
71. As the user, I want editing an AI Message not to trigger a new AI reply, so that the Chat waits for my next move.
72. As the user, I want every Message after the edited one discarded, so that the story rewinds cleanly.
73. As the user, I want every Memory, Bond, Arc and Scene change caused by discarded Messages rolled back, so that Characters don't remember things that no longer happened.
74. As the user, I want the edited Message's own changes rolled back and re-judged on the new text, so that state matches what the Message now says.
75. As the user, I want a short notice of what was rolled back (e.g. "3 Memories rolled back"), so that I know what changed.
76. As the user, I want to reset a Chat to its start, keeping its title and the identity I wear, so that I can replay from the Opening.
77. As the user, I want reset to clear every Message, all Memory, Bond history, Arc steps and Scene progress, then restore the current Opening, starting Bonds, Arc directions and first Scene, so that it truly starts over.
78. As the user, I want to delete a Chat after confirming, so that I can clean up playthroughs I don't want.

### Memory

79. As the user, I want the AI to record short facts after each turn (events, world details, things learned about me, open promises), so that the Chat remembers what happened.
80. As the user, I want Memory never to hold feelings or personality changes, so that it stays distinct from Bonds and Arcs.
81. As the user, I want each Memory to show which Characters know it, so that I can see who would plausibly act on it.
82. As the user, I want a Character who learns of something later to be added to that Memory's Known by, so that knowledge spreads as the story does.
83. As the user, I want a "Memory added" toast after a turn, which opens that Memory when tapped, so that I notice what was recorded.
84. As the user, I want a Memory drawer on the Chat screen listing every Memory with its text, Known-by chips, who wrote it, a lock if locked, and a jump-to-message link, so that I can inspect the Chat's memory.
85. As the user, I want to add a Memory myself, known by the Characters present, so that I can record something the AI missed.
86. As the user, I want to edit or delete any Memory, so that I can fix mistakes.
87. As the user, I want a Memory I wrote or edited to be locked from AI changes, so that my corrections stick.
88. As the user, I want the AI to add a new Memory instead of changing a locked one when the story moves on, so that my wording survives.
89. As the user, I want only me to remove names from Known by, so that the AI can't make Characters forget.
90. As the user, I want Memory kept under a size cap by merging related facts and archiving stale ones, so that prompts stay small and cheap.
91. As the user, I want Archived Memories visible in a collapsed section and restorable (restoring locks them), so that nothing is lost silently.
92. As the user, I want locked Memories never archived automatically, so that what I wrote always stays in play.
93. As the user, I want AI-added Memories from discarded Messages to go on edit, even if I edited them since, so that Memory matches the rewound story.
94. As the user, I want Memories I wrote from scratch to survive edits, so that my own notes aren't lost to a rewind.

### Bonds, Arcs and the dashboard

95. As the user, I want Characters' feelings toward me and toward each other to change as the story unfolds, so that relationships feel alive.
96. As the user, I want Bonds to shift gradually and jump only on major events (betrayal, rescue, confession), so that feelings aren't jumpy.
97. As the user, I want Bonds to be directional (Mira → Kai can differ from Kai → Mira), so that relationships can be one-sided.
98. As the user, I want only Characters who witnessed or learned of an event to change because of it, so that feelings follow knowledge.
99. As the user, I want Bonds shown as a short label plus a 1–2 sentence description, never numbers, so that they read like story, not stats.
100. As the user, I want Bonds and Arcs never shown on the Chat screen, so that I discover them through how Characters behave.
101. As the user, I want Arcs to be rare, cite the significant event that caused them, and be able to reverse later, so that personality change is earned and traceable.
102. As the user, I want the core Character definition never rewritten by play, so that I can always tell an Arc from Drift.
103. As the user, I want a read-only dashboard from the Chat listing every Character's current Bonds, each expandable to its history, so that I can see how feelings changed.
104. As the user, I want the dashboard to list each Character's Arc steps with their causing events, so that I can trace personality changes.
105. As the user, I want the dashboard to show the current Scene and the event that advanced it, so that I know where the story stands.
106. As the user, I want to see on the dashboard whether a turn's background calls are pending, done or failed, with Retry, so that I can recover from a failed judgement.
107. As the user, I want to jump from any dashboard change to the Message that caused it, so that I can rewind a bad judgement by editing that Message.
108. As the user, I want no way to edit Bonds, Arcs or Scenes by hand, so that state only changes for reasons inside the story.

### Snapshots and the Gallery

109. As the user, I want a camera button in the Chat that makes one Snapshot of the latest AI Message, so that I can capture a moment.
110. As the user, I want to add an optional one-line hint (e.g. "close-up on her face" or names), so that I can steer the image.
111. As the user, I want the Snapshot drawn from my first-person point of view, showing at most 3 Characters, so that it shows what I'd see.
112. As the user, I want the image prompt written from the latest Messages, Appearance, Setting, Memory, Image style and my hint, so that clothing and situation match the scene.
113. As the user, I want lasting changes from play (a scar, a haircut) to show in Snapshots via Memory, so that images keep up with the story.
114. As the user, I want a placeholder in the timeline while the image generates, so that I can keep playing.
115. As the user, I want the Snapshot inline under its Message and full-screen on tap, so that it sits in the flow of the story.
116. As the user, I want to view the prompt that was used from the full-screen image, so that I can understand a result.
117. As the user, I want to retake a Snapshot of the same moment, so that I can try again; one Message can hold several.
118. As the user, I want a failed or refused Snapshot to show an error with Retry, never a silent provider switch, so that I know what happened.
119. As the user, I want a per-Story Gallery of every Snapshot from all its Chats, newest first, filterable by Chat, so that I can browse a Story's images.
120. As the user, I want to view, delete and download a single Snapshot from the Gallery, so that I can manage my images.
121. As the user, I want Snapshots to stay in the Gallery after an edit, reset or Chat deletion, marked "from an earlier version of this Chat", so that a rewind never loses an image.
122. As the user, I want Gallery items whose Message still exists to jump to it, so that I can return to the moment.
123. As the user, I want deleting a Snapshot to remove it from both the timeline and the Gallery, so that it's really gone.
124. As the user, I want Snapshots never sent to the text model and never to change Memory, Bond, Arc or Scene, so that images can't affect the story.

### Models, budget and settings

125. As the user, I want one app-wide play model setting (GLM-5.3 by default, DeepSeek V4 Pro as fallback), so that I can switch by hand if the primary misbehaves.
126. As the user, I want a Drift warning when I change the model, and when I play a Chat whose last reply came from a different model, so that I expect Characters may play differently.
127. As the user, I want one app-wide image model setting, so that I can switch provider by hand if needed.
128. As the user, I want to see this month's text spend and image spend separately, with remaining credit for each, so that I can pace myself.
129. As the user, I want a warning when either credit pool falls below my threshold (default ~20%), so that I'm not surprised.
130. As the user, I want play to stop with a clear message when text credit runs out, so that I never exceed my cap.
131. As the user, I want only Snapshots to stop when image credit runs out, so that play goes on.

### Access, devices and reliability

132. As the user, I want the app reachable from my desktop and Android phone at one private HTTPS address, so that I can play anywhere my tailnet reaches.
133. As the user, I want to install the app as a PWA on both devices, so that it feels like an app.
134. As the user, I want no login screen, because only my tailnet devices can reach the app, so that opening it is instant.
135. As the user, I want one "can't connect" screen listing what to check (internet, PC on, Tailscale connected) with a Retry, so that I know what to do when the PC is off.
136. As the user, I want nothing queued offline, so that unsent messages never clash with edits.
137. As the user, I want the database, app and Tailscale to start with Windows, so that I never launch anything by hand.
138. As the user, I want my live app kept apart from development, with its own database and port, so that experiments can't damage real Chats.
139. As the user, I want a daily backup (database plus image folder) to a second disk and to encrypted Google Drive, so that I can recover from disaster.
140. As the user, I want written restore steps that have been tried once, so that I know the backup actually works.

## Implementation Decisions

### Architecture and hosting

- Three processes on the user's home Windows PC: the Next.js frontend, the NestJS API and PostgreSQL. Image files (Snapshots and Reference images) are stored on the same disk, in one image folder. The database stores only paths relative to that folder, so the folder can be backed up and restored as a unit.
- **No auth layer.** There are no user, account, login or session entities. A private Tailscale tailnet is the only lock. Tailscale serve exposes HTTPS at `<machine>.<tailnet>.ts.net`, which the PWA install needs. Never use Funnel or a public tunnel. Name the machine neutrally, because certificate names appear in public certificate-transparency logs.
- **Separate live and dev instances.** The live instance has its own database and port, and is updated only by build plus restart. Database migrations run only as part of that deploy step.
  - Live PostgreSQL is an installed Windows service (EDB); embedded PostgreSQL is for dev and tests only ([ADR 0001](../../docs/adr/0001-live-postgres-is-an-installed-service.md)).
  - A deploy builds the commit in place as a release under `LIVE_HOME/releases/` while live keeps serving, then stops live, migrates, points `LIVE_HOME/current` at the new release and starts it; `live:rollback` switches the pointer back ([ADR 0002](../../docs/adr/0002-live-releases-built-in-place-behind-a-pointer.md)). The deploy refuses settings that would share a database, port or folder with dev.
  - The frontend listens on loopback only; Tailscale serve is the only way in.
- **Startup.** PostgreSQL, the live app (frontend and API) and Tailscale start automatically with Windows, as services or startup tasks. Nothing is launched by hand.
  - The live app runs under one supervisor (`LIVE_HOME/live-run.mjs`), started by a Task Scheduler task at startup and every 5 minutes (a second copy exits at once). It restarts the API or the frontend if either dies.
- **Backup.** At most once a day the backup job takes a database dump plus a copy of the image folder. It writes them to the second disk and to Google Drive, encrypted client-side before upload. The passphrase lives in the user's password manager, outside the app. The spec's deliverable includes written restore steps (fresh PC → restored live app), and those steps must be tried once.
  - The supervisor runs the job when it starts and every hour; a last-run stamp keeps it to one backup a day, so a PC that stays on for days is still backed up daily and a failed day is retried.
  - Each backup is a full, self-contained folder; the Drive copy goes through an rclone crypt remote, and the job refuses any remote that isn't one ([ADR 0003](../../docs/adr/0003-backups-are-full-copies-encrypted-by-rclone-crypt.md)). A failed target is shown as a banner on the Usage and Settings pages, and never blocks play.
- **PWA.** The app is installable (manifest, icons, HTTPS) and online-only: no Chats or Stories are cached on the device and nothing is queued. When the API can't be reached, the app shows one "can't connect" screen with a checklist (internet, PC on, Tailscale connected) and Retry. The app can't tell "no internet" from "PC off", so one screen covers both.
- **API style.** The frontend talks to the NestJS API over JSON HTTP. Long-running work (a turn's background calls, Snapshot generation) is exposed as status the client polls. The MVP needs no websockets.

### Model Gateway (the one boundary to external providers)

The Model Gateway is a deep module that hides every provider detail behind a small interface:

- **Text completion.** Takes a call kind, messages and options (max tokens, JSON mode, stop strings). Returns the text plus token usage and cost.
- **Image generation.** Takes a prompt, up to 3 reference images and the fixed 2:3 size. Returns the image bytes plus cost.
- **Remaining credit.** Reports the remaining credit for each pool.

What it does internally:

- Pins hosts through OpenRouter with `provider.only` and `allow_fallbacks: false`. It never falls back automatically.
- Applies per-model reasoning settings.
- Applies stop strings only where the host supports them.
- Writes one UsageRecord per call.
- Maps provider failures to typed errors: provider error/outage, refusal or content stop, out of credit, unparseable output. Callers show these as an error with Retry.

Model table (from [Choose the text LLM](issues/05-choose-text-llm.md), corrected by the turn prototype):

| Use | Model | Host | Notes |
|---|---|---|---|
| Play (Story turns), Story drafting, field rewrite, Story assistant | GLM-5.3 (default) | DeepInfra | Reasoning can't be turned off: send `reasoning: {effort: "minimal"}`. Stop strings supported. Served at fp4. |
| Play fallback (manual only) | DeepSeek V4 Pro | GMICloud | `reasoning: {enabled: false}`. No `stop` support, so the backend cut is the only guard. |
| Background calls (Bond/Arc/Scene judge, Memory extraction, Snapshot prompt) | DeepSeek V4 Flash | DeepInfra | `reasoning: {enabled: false}`, JSON mode. |
| Snapshots | `seedream-v4-edit` (default) | Venice | `POST /image/multi-edit` with up to 3 Reference images, `safe_mode: false`, $0.05. `qwen-edit-uncensored` ($0.04) is the manual alternative. Decided by the check in ticket 18; Runware was dropped because of its $20 minimum top-up. |
| Snapshots with no Reference image in frame | `seedream-v4` (beside `seedream-v4-edit`; `qwen-image-3` beside `qwen-edit-uncensored`) | Venice | `POST /image/generate`, $0.05. The edit models need a base image, so a Snapshot whose in-frame Characters have no Reference image uses the selected edit model's text-to-image sibling. Chosen before the call and recorded as the Snapshot's image model; never a fallback after a failure. Added in ticket 31. |
| Reference images | `qwen-image-3` | Venice | `POST /image/generate`, `aspect_ratio: "2:3"`, `safe_mode: false`, $0.04. |

Further gateway rules:

- First-party DeepSeek and Z.ai, and Together, are never used. Prefer Zero Data Retention endpoints where available. Record each host's retention policy in the README.
- **Credit cap.** OpenRouter credit is account-wide and reserved per in-flight request. The text cap therefore uses a dedicated OpenRouter account, or a key with its own credit limit. A "would exceed your available credits" failure maps to the out-of-credit error.
- The image provider has its own prepaid credit. Out of image credit blocks only Snapshot and Reference image generation.
- **Venice specifics:**
  - A blurred or content-violation result (`x-venice-is-blurred`, `x-venice-is-content-violation`) or a 422 is a refusal.
  - A 402 means out of image credit.
  - Venice reports no per-image cost, so UsageRecords use list price.
  - Reading the balance needs a separate Admin API key.
- The gateway is the only thing faked in tests (see Testing Decisions).

### Settings, usage and credit

- **Settings** (one per app):
  - play model
  - image model
  - low-credit warning threshold per pool, text and image (default ~20%)
- Changing the play model shows a Drift warning.
- **Drift warning in a Chat.** Each AI Message records the model that wrote it ("author" for the Opening). If the last AI Message in a Chat came from a different model than the current play model, the Chat shows a one-line Drift notice before the next send.
- **UsageRecord** (one per model call):
  - time
  - kind: turn, judge, Memory extraction, Story draft, field rewrite, Story assistant, Snapshot prompt, Snapshot image, Reference image
  - credit pool: text or image
  - model and host
  - tokens or images
  - cost
  - the Chat or Story it served
- **Usage view.** Shows each pool's spend this month (the sum of its records) and its remaining credit (read from the provider). When remaining credit drops below the threshold, the app shows a warning. Out of text credit blocks sending with a clear message. Out of image credit blocks only the camera and Reference image generation.

### Story authoring module

- **Entities.** Story, Role (exactly one), Character (1–6, ordered), ReferenceImage (at most one per Character), StartingBond, Scene (ordered). The fields are as in the [data model sketch](assets/11-data-model.md):
  - **Story:** title, Setting, Opening, and four Style fields: POV (1st/2nd/3rd), tense (past/present), reply length (short/medium/long), Image style (free text).
  - **Character:** name, appearance, personality, voice, example lines (an ordered list), background, secrets (one text block), Arc directions (one text block).
  - **StartingBond:** from a Character, toward the Role or another Character, with a label and a description. At most one per direction.
  - **Scene:** name, situation/goal, move-on condition. Only the last Scene may leave the condition empty.
- **Playable** is derived, never stored. A Story is playable when every required field is filled. No draft/published state, no version history.
- **Live vs copied edits.** Chats reference the Story, Role, Characters and Scenes, so text edits reach them on the next turn. Three things are copied into a Chat at start and on reset, and Story edits don't touch existing Chats' copies:
  - the Opening, which becomes Message 1
  - StartingBonds, which seed the Chat's first BondChanges
  - Arc directions, which are copied into ChatArcDirections. A Chat that holds no copy for a Character (it joined or the Chat started while its Arc directions were empty) takes the first non-empty value the author sets; once a Chat holds a copy, edits reach only new or reset Chats.
- **Cast and Scene changes** follow the lifecycle table in the data model sketch:
  - **Add Character:** joins every Chat as a stranger, and its Arc directions are copied in (or, when it was added blank, the first ones the author types).
  - **Remove Character** (after a warning): deletes its Bonds both ways with their history, StartingBonds pointing at it, its Arc steps, its copied Arc directions and its Reference image file. It is dropped from every Known by; Memories left with nobody in Known by stay. Speech parts and Snapshots keep its stamped name, and their Character link is cleared.
  - **Add Scenes:** a Chat in free play enters the first new Scene after the last Scene it finished. A Chat that never had Scenes enters the first Scene.
  - **Reorder Scenes:** each Chat stays on the same Scene.
  - **Remove Scene:** a Chat on it moves to the next Scene, or to free play if it was the last. SceneAdvances keep their stamped names.
  - **Required field emptied:** sending in that Story's Chats is blocked, with a note naming the missing field. The Chats stay readable.
- **Delete Story** (after confirmation) deletes everything under it, including Chats, the Gallery, Reference images and their files.

### Story drafting and assistant

- **Draft from idea.** One GLM-5.3 call turns the idea into a structured Story: every required field, plus optional fields only when the idea implies them. The backend validates the shape (1–6 Characters, valid Style values) before saving.
- **Rewrite this field.** One call regenerates a single field, given the whole Story as context.
- **Story assistant.** Stateless: each opening starts fresh, and each instruction is one call with the current Story plus the instruction. The call returns a structured set of field changes, which may add Characters or Scenes. The backend applies them straight to the Story, and the client highlights the changed fields.
- **Undo** is kept only in the client, while the page is open. Nothing about it is persisted.
- **Destructive assistant changes.** If an assistant change would remove a Character or Scene from a Story that has Chats, it still goes through the same warning as a manual removal before it applies.

### Chat and turn engine

- **Chat:**
  - Story
  - title (default "Chat N", renameable)
  - created at, last played at
  - worn identity: the Role, or a Persona
  - current Scene; none means free play
- **Message** (ordered within its Chat):
  - **User Message:** text, plus the worn identity as both a reference and a stamped name.
  - **AI Message:** ordered parts, the model that wrote it, and the status of its two background calls.
  - Message shape from the prototype, trimmed:

    ```ts
    type AiPart =
      | { kind: 'narration'; text: string }
      | { kind: 'speech'; characterId: string | null; speakerName: string; text: string }; // name stamped
    type BackgroundStatus = 'pending' | 'done' | 'failed';
    ```
- **Starting a Chat.** The Chat starts with the Opening copied in as Message 1, model "author", split into parts by the same parser as AI replies. The Chat starts at the first Scene, or in free play if the Story has no Scenes. Starting Bonds are seeded and Arc directions copied.
- **One call writes the whole turn.** Per [How one AI turn behaves](issues/07-one-ai-turn-prototype.md), a single play-model call writes narration in plain paragraphs and Characters' speech and small actions on `@Name:` lines. The Narrator picks who speaks in the same call. There are no per-speaker calls.
- **Send flow:**
  1. Reject the send if the Story isn't playable, or if text credit is out.
  2. If the previous AI Message's background calls are pending, wait for them, up to a short timeout; past the timeout, tell the user it's still saving. If either call failed, block the send with a notice offering Retry. The next prompt must see saved Memory, Bond, Arc and Scene state.
  3. Store the User Message.
  4. Build the prompt and call the play model.
  5. Parse and guard the reply.
  6. Store the AI Message only once it is complete.
  7. Start both background calls in parallel, with their status set to pending.
  8. Update last played at.
- **A failed turn** stores no AI Message. The User Message stays, with a Retry that runs the same turn again.
- **No streaming in the MVP.** The client shows a "writing" indicator while it waits (7–10 s typical). (Superseded by [Spec: Streaming replies](../streaming/spec.md).)

### Prompt assembly

- **Layer order.** Layers are ordered from most stable to least, so prompt caching holds:
  1. fixed Narrator instructions and rules
  2. Setting
  3. the worn identity's name and description
  4. Style instructions
  5. Cast cards
  6. current Scene (name, situation/goal, move-on condition, "let it happen naturally; never force it"), or "no Scene, the story unfolds freely"
  7. Feelings (every Bond in the Chat, with "each Character knows only its own feelings")
  8. Arcs ("Arc so far" plus the author's Arc direction for each Character)
  9. Memory block
  10. recent Messages
  11. the user's new message
  12. a final instruction
- **Cast cards.** Every card is sent, because one call writes the whole turn. A card holds personality, voice and example lines, background, appearance, and its Secrets, marked as known only to that Character. Knowledge separation relies on prompt instructions; some leakage is accepted.
- **Memory block.** Every non-archived Memory, with its Known-by tags, under the instruction that a Character knows only the Memories it's tagged on, while the Narrator knows all. `{user}` is rendered as the worn identity's name. The block stays in a stable order and is capped at about 2k tokens.
- **Recent Messages.** As many of the latest Messages as fit a total prompt budget (about 16k tokens, tunable), trimmed from the oldest. There is no summary layer: Memory is the only record of older turns. _(Superseded: see [Spec: Story so far](../story-so-far/spec.md), where a Story so far stands in for the oldest Messages.)_
- **Rules block** (from the prototype):
  - The story is fiction for a consenting adult reader, and all characters are adults.
  - Explicit content is allowed when the story leads there, with no moralising and no fade-to-black.
  - Never write the worn identity's words, thoughts, feelings, decisions or actions.
  - Stay inside the Setting.
  - Write in the Story's POV and tense.
  - Keep each Character's voice distinct, and don't let everyone talk every turn.
  - Use `@Name:` with exact cast names.
- **Reply length.** Maps to a word range; medium ≈ 150–350 words, tunable.
- **Final instruction** (after the user's message): "Write the next turn now. Do not write anything <identity> says, thinks or does. Use @Name: lines for Character speech."
- **Stop strings** are sent where the host supports them: `\n<identity>:`, `\n@<identity>:` and `\nYou:`. Here `<identity>` is the worn Role or Persona name.

### Reply parser and user guard

- **The parser** is pure logic that splits a reply into parts:
  - A line matching `@Name:`, optionally wrapped in `*`, starts a speech part. The name is matched case-insensitively against the cast, and the canonical name is stamped.
  - A non-blank line directly under a speech line continues that speech.
  - After a blank line, text is narration. Consecutive narration lines merge.
  - An unknown speaker name is kept as a stamped name with no Character link, and flagged in the logs.
- **The guard** cuts the reply at the first line that speaks as the worn identity or as "You", whether as `Name:`, `@Name:` or `*Name*:`. This is the only guard for hosts without stop support.
- **Known gap:** narration that states the user's thoughts in second person isn't caught. In the prototype it showed up in about 1 in 10 GLM turns. The prompt rules only reduce it.
- **Editing an AI Message** presents the Message as `@Name:` text, and the same parser re-splits the edited text into parts.

### Background judge (Bond, Arc, Scene)

- **The call.** One DeepSeek V4 Flash call after every turn, in JSON mode. Its input:
  - cast summaries with Arc directions
  - current Bonds
  - Arc steps so far
  - the current Scene and its move-on condition
  - the last few Messages for context
  - the latest exchange to judge
- **Output** (from the prototype):

  ```json
  {"bond_changes":[{"from":"Name","to":"user|Name","label":"...","description":"...","cause":"..."}],
   "arc_steps":[{"character":"Name","step":"...","cause":"..."}],
   "scene":{"move_on":false,"reason":"..."}}
  ```

- **Judge rules** (from the prototype, after its re-judge fix):
  - Expect no Bond change on most turns.
  - Change a Bond only when the feeling changes in kind, or on a major event (betrayal, rescue, confession, first intimacy, a serious threat). Never just rephrase or intensify it.
  - At most one change per Bond per turn.
  - Only witnesses, or Characters who plausibly learned of the event, change.
  - Create a new pair only where real feelings have formed.
  - Every change cites its event.
  - Arc steps need a significant, citable event, and come perhaps 1–3 times in a whole Chat.
  - Never add an Arc step that restates or deepens the last one.
  - Reversal is a new step.
  - Scene move-on is judged strictly ("clearly met, not getting closer") with Bonds in view.
- **Backend rules when applying a judgement:**
  - Drop changes with unknown names or a self-Bond.
  - Drop a Bond "change" whose label equals the current label.
  - Advance at most one Scene per turn.
  - Record every applied item, with its cause, against the turn's AI Message.
- **Bond shape.** Directional, per pair. Character → user is stored as toward the user, whichever Role or Persona is worn. A Bond's current value is its latest BondChange; StartingBond seeds have no causing Message.

### Memory extraction

- **The call.** A separate DeepSeek V4 Flash call, in JSON mode, run in parallel with the judge. Its input is the latest user Message, the AI reply, the current Memory list (with ids, Known by and locked flags) and which Characters were present.
- **Output:** a list of operations (add, update, delete, merge, archive, or add a Character to Known by), each with its target Memory ids where relevant.
- **What a Memory is:** an event, a world detail that came up in play, something learned about `{user}`, or an open promise or plan. Never a feeling, a personality change, or anything already in the Story or Character definitions.
- **Backend rules:**
  - Ignore update, delete, merge and archive operations on locked Memories. Known-by additions are allowed on locked Memories.
  - Never remove a name from Known by.
  - When the list exceeds the cap (~2k tokens, roughly 50–60 facts, tunable), the call is asked to merge related facts and archive stale ones. Locked Memories are never archived automatically.
  - A merge is recorded as the source Memories deleted plus the merged Memory added, all under one cause.
- **Memory record:**
  - text (with `{user}`)
  - Known by: a set of Characters
  - written by: AI or user
  - locked
  - archived
  - causing Message, if the AI added it
- **User actions** are not tied to a Message: add (known by the Characters present at the time), edit (locks), delete, and restore from Archived (locks). These actions are never rolled back by an edit, except that an AI-added Memory the user later edited still goes when its causing Message is discarded.
- **The client** shows a "Memory added" toast for each AI add when the background status turns done. Tapping it opens that Memory in the drawer.

### Change ledger and rollback

- **Records.** Every AI-made change to Memory, Bond, Arc or Scene is a record:
  - MemoryChange
  - BondChange
  - ArcStep
  - SceneAdvance (from Scene, to Scene or free play, stamped names, event)

  Each record holds what changed, the value before and after, the story event and the causing AI Message.
- **The ledger** is a deep module with a small interface: record the changes for a Message, and roll back from a Message. Rollback undoes records newest first and returns counts by kind, for the rollback notice.
- **Edit User Message N:**
  1. Delete every Message after N, permanently, rolling back all their changes newest first.
  2. Overwrite N's text. No version history is kept.
  3. Snapshots of the discarded Messages lose their Message link (they stay in the Gallery).
  4. Run a fresh turn.
- **Edit AI Message N:**
  1. Delete every Message after N, as above.
  2. Roll back N's own changes.
  3. Re-split the edited text into parts.
  4. Clear the Message link on N's Snapshots.
  5. Re-run both background calls on the new text.
  6. Wait for the user. No new AI reply is written.
- **Reset Chat:**
  - Keep the title and the worn identity.
  - Clear every Message, all Memory (user-written included), Bond history, Arc steps, Scene advances and copied Arc directions.
  - Re-copy the current Opening as Message 1, re-seed StartingBonds and re-copy Arc directions.
  - Go to the first Scene, or free play.
  - Snapshots lose their Message link.
- **Persona swaps** are Chat state, outside the ledger. They are never rolled back.
- **Delete Chat** deletes everything under it, except Snapshots: they stay in the Gallery with their Chat and Message links cleared.

### Dashboard (read-only)

- Opened from the Chat screen. It shows:
  - per Character, its current Bonds (label and description, expandable to the full BondChange history with events)
  - its Arc steps with their events
  - the current Scene and the event that advanced it
- Every item links to its causing Message.
- The dashboard shows the background status of recent AI Messages, with Retry for failed ones. Retry re-runs only the failed call.
- Nothing on the dashboard is editable. Bonds and Arcs never appear on the Chat screen itself.

### Snapshots, Reference images and the Gallery

- **The image model is checked** (ticket 18): on Venice, `seedream-v4-edit` returned explicit fictional-adult images and kept a Character's face from its Reference image in both photo and anime styles. The Snapshot prompt must restate the Appearance's key traits, such as eye colour, scars and hair. Without them, eye colour drifted in the anime style.
- **Reference image:**
  - Made from the Character page. One request returns 4 candidates of the Character, full-body, neutral pose, plain background, in the Story's Image style, drawn from Appearance. The author picks one, and the file is stored.
  - A new one replaces the old one, and the old file is deleted.
  - Editing Appearance or Image style shows an offer to regenerate it.
  - The Reference image fixes face and build only.
- **Snapshot flow:**
  1. Camera press, with an optional hint, on the latest AI Message.
  2. A V4 Flash call writes the image prompt and picks at most 3 Characters in frame, using the hint if it names them. Its input is the latest Messages, Appearance, Setting, Memory, Image style and the hint. The prompt is always first-person from the user's point of view, never draws the user beyond glimpses such as hands, and depicts only fictional adult Characters.
  3. The image call runs, with the in-frame Characters' Reference images as references.
  4. The Snapshot is stored.
- **Pending and failed Snapshots.** A pending Snapshot is a transient job the timeline shows as a placeholder. Play continues meanwhile. Only a successful image becomes a Snapshot record; a failure shows an error with Retry.
- **Snapshot record:**
  - image path (2:3, fixed size)
  - prompt used
  - hint
  - image model and cost
  - Characters drawn (reference plus stamped name, at most 3)
  - optional Chat link and AI Message link
  - created at

  One Message can have several Snapshots.
- **Gallery:**
  - per Story, newest first, filterable by Chat
  - grid, full-screen view (with the stored prompt), delete (removes the record and its file), and download of one image
  - items without a Message link are marked "from an earlier version of this Chat"; items with one jump to it
  - Reference images are not in the Gallery
- **Isolation.** Snapshots never reach the text model and never cause ledger records.

### Personas

- Personas are app-level, with Name and Description only. There is no appearance field anywhere for the user.
- Wearing a Persona swaps the identity block in the prompt, the stop strings and the guard name. Bonds toward the user and Memory carry over.
- Deleting a worn Persona falls the Chat back to the Role. User Messages keep their stamped names.

### API surface (resources, described in prose)

- **Stories**, with nested Role, Characters (including reorder, Reference image candidates and pick) and Scenes (including reorder):
  - draft from idea
  - rewrite field
  - assistant instruction
  - playable status with missing fields
- **Personas:** create, read, update, delete.
- **Chats** per Story:
  - create, rename, reset, delete
  - swap worn identity
  - list Messages
  - send
  - retry turn
  - edit Message
- **Background status** per AI Message, and retry of a failed background call.
- **Memory** per Chat: list (active and archived), add, edit, delete, restore.
- **Dashboard** per Chat.
- **Snapshots:** create (from a Chat's latest AI Message, with an optional hint), job status, delete, download. The Gallery is listed per Story with an optional Chat filter.
- **Settings:** read and update.
- **Usage:** monthly spend and remaining credit per pool.
- **Images** are served by the API from the image folder by relative path.

## Testing Decisions

- **What a good test is.** It drives the system only through its public surface and asserts on what the user or the API client observes: responses, rendered pages, files served. It never reaches into tables or private functions. Tests should survive a refactor of any module behind the seam.
- **Seam 1: the NestJS HTTP API.** This is the main seam, and it covers almost every behaviour. Tests run the real API against a real, disposable PostgreSQL test database and a temporary image folder, with only the **Model Gateway** faked. The fake is scripted per test: it returns given play replies, judge JSON, extraction JSON, Snapshot prompts and image bytes, or raises a typed error (outage, refusal, out of credit, unparseable output). It also records the calls it received, so tests can assert on prompt contents and layer order where that is the behaviour under test. Behaviours to cover here:
  - Story authoring: playable status; live versus copied edits; add or remove Character effects across Chats; add, reorder or remove Scene effects; a missing required field blocks send; delete cascades.
  - Drafting, field rewrite and the assistant applying changes, including the removal warning path.
  - A turn: parts split, speaker stamping, unknown-speaker handling, the guard cutting a user line (with stop strings both supported and unsupported), a failed turn leaving the User Message with Retry, and no silent model switch.
  - Background calls: the judge applies Bonds, Arcs and Scene advances with its filters (unknown names, same label, one Scene per turn); extraction respects locked Memories and Known-by rules; merge and archive; the next send waits for, or is blocked by, background status; retry.
  - Rollback: editing a User Message versus an AI Message, newest-first undo, rollback counts, the edited AI-added Memory going, user-written Memories staying, Persona swaps not rolled back.
  - Reset: exactly what is kept, cleared and re-seeded.
  - Persona swap and Persona deletion.
  - Snapshots: success, failure with no record stored, at most 3 Characters, retakes, links cleared on edit, reset and Chat delete, Gallery filter and delete.
  - Usage records per call kind, monthly spend per pool, the low-credit warning, out of text credit blocking send, out of image credit blocking only Snapshots.
  - Drift notice when the play model differs from the last AI Message's model.
- **Seam 2: browser end-to-end tests (Playwright).** These drive the Next.js app against the same API running with the scripted fake gateway. They cover the core flows a user would notice breaking:
  - draft a Story from an idea, edit it and see it become playable
  - start a Chat, send, and see narration and named speech
  - edit an earlier Message and see the rollback notice
  - the Memory drawer: toast, add, lock, jump to message
  - the dashboard showing a Bond change and the Scene
  - take a Snapshot and find it in the Gallery after a reset
  - the "can't connect" screen when the API is down

  Keep this suite small. Behaviour detail belongs at Seam 1.
- **Model Gateway contract tests.** A few tests check the real gateway against recorded provider responses. Fixtures are synthetic or scrubbed, never played text. They cover:
  - host pinning and `allow_fallbacks: false` in the request
  - per-model reasoning settings
  - stop strings omitted for hosts without support
  - usage and cost read from the response
  - provider errors mapped to the typed errors, including OpenRouter's credit-reservation failure
- **Not automated:** the quality of model output. That covers whether replies stay in character, judge pacing, extraction quality, the cap size, and Snapshot likeness. These are checked by hand with a battery run against real models before release and after any prompt or model change. The prior art is the turn prototype's scripted battery, side-by-side reader and re-judge replay, which should be carried forward as a manual quality harness, not as part of the test suite.
- **Prior art in the repo:** there is no application test suite yet; this spec sets the pattern. The turn prototype's pure logic (prompt building, reply parsing, the guard, the judge reducer) shows the behaviour the API tests should pin down.
- **Backup restore** is verified once by hand, following the written restore steps, and the result is recorded.

## Out of Scope

- Multiple users, accounts, sign-up or any in-app login.
- Sharing Stories or a marketplace.
- Monetization.
- Thai or any non-English language.
- Users under 18.
- Swipe and Branch on Messages. Editing and Regenerate are the only ways to change history. (Regenerate and Continue were brought in by [Spec: Friendly UI](../friendly-ui/spec.md).)
- Character avatar images.
- User-directed speaker choice (e.g. @mentions). The Narrator decides who speaks.
- Native mobile apps.
- Separate world notes or lore entries, Story tags, and genre or pacing presets. The Setting holds these in plain language.
- Skipping or rewinding Scenes by hand. Editing or regenerating a Message is the only undo.
- System-defined Story endings.
- Export and import of Stories and Chats, Trash, Chat-as-text download, Tavern cards and Duplicate Story. The daily disaster backup covers recovery and moving PCs.
- Offline play, cached Chats or queued messages.
- Automatic fallback between models or providers.
- A summary ("Story so far") layer for Memory _(superseded: built per [Spec: Story so far](../story-so-far/spec.md))_, author-set starting Memories, Message version history and Story version history.
- Gallery albums, tags and favourites. Snapshot size settings and prompt preview.
- Streaming replies. (Since brought in by [Spec: Streaming replies](../streaming/spec.md).)
- 24/7 availability. The app is up only while the home PC is on.

## Further Notes

- **Build order suggestion:**
  1. the image-model check (under $1)
  2. hosting skeleton: services, Tailscale serve, live/dev split, PWA shell
  3. Model Gateway and Settings/Usage
  4. Story authoring and drafting
  5. Chat turn engine with parser and guard
  6. change ledger with background judge and Memory extraction
  7. Memory drawer and dashboard
  8. Snapshots, Reference images and Gallery
  9. backup and the restore drill
- **Drift vs Bond/Arc.** Anything touching Characters' behaviour must say which it means. A Bond or Arc change always names what changed and the event that caused it. Unexplained change against the core definition is Drift. The core Character definition is never rewritten by play.
- **Untested assumptions to check in the first build:** Memory extraction quality and the ~2k-token cap; the recent-Message prompt budget; the evidence on feelings and Secrets leakage, which is thin (one probe per setup). If leakage hurts play, the fallback is to send only the speaking Character's own Bonds, which needs per-speaker calls the prototype rejected on cost and speed. Revisit then.
- **Decisions this spec fills in that the tickets left open:** blocking the next send when a background call failed, polling instead of websockets, no streaming, the ~16k prompt budget for recent Messages, and the assistant's removal warning. Each is a reasonable default; change any of them in play without reopening the map.
- **Cost estimate:** a turn costs about $0.0025 and the judge about $0.0002, so ~60 turns/day comes to roughly $5/month at the prototype's prompt sizes. Longer Chats, extraction calls and Snapshots (~$0.05 each) add to it within the $30 cap. A suggested credit split is about $22 text and $8 image.
- **Hosts and backup services** all ban images that look like real people. Snapshots and Reference images must depict only fictional adult Characters.
- **Source decisions:** [map](map.md), [data model sketch](assets/11-data-model.md), and the resolved tickets 05–15 under `issues/`. The turn prototype lives in `prototypes/one-ai-turn/` (commit `99969a4`).

## Implementation tickets

| # | Ticket | Status | Blocked by |
|---|---|---|---|
| 17 | [Set up provider accounts, credit caps and the tailnet](issues/17-provider-accounts-and-tailnet.md) | ready-for-human | — |
| 18 | [Check the image model before building Snapshots](issues/18-image-model-check.md) | resolved | 17 |
| 19 | [App skeleton, PWA shell and test harness](issues/19-app-skeleton-and-test-harness.md) | resolved | — |
| 20 | [Real Model Gateway, Settings and the usage view](issues/20-model-gateway-settings-and-usage.md) | resolved | 19 |
| 21 | [Write a Story by hand](issues/21-write-a-story-by-hand.md) | resolved | 19 |
| 22 | [Draft a Story from an idea, and rewrite a field](issues/22-draft-a-story-from-an-idea.md) | resolved | 20, 21 |
| 23 | [Story assistant with Undo](issues/23-story-assistant.md) | resolved | 22 |
| 24 | [Play a Chat: one turn end to end](issues/24-play-a-chat.md) | resolved | 20, 21 |
| 25 | [Edit an earlier Message and reset a Chat](issues/25-edit-and-reset.md) | resolved | 24 |
| 26 | [Personas and swapping identity mid-Chat](issues/26-personas-and-identity-swap.md) | resolved | 24 |
| 27 | [Bond, Arc and Scene judge, the change ledger, and the dashboard](issues/27-bond-arc-scene-judge-and-dashboard.md) | resolved | 25 |
| 28 | [Memory: extraction, the drawer and rollback](issues/28-memory-extraction-and-drawer.md) | resolved | 27 |
| 29 | [Cast and Scene changes reaching existing Chats](issues/29-cast-and-scene-changes-in-existing-chats.md) | resolved | 27, 28 |
| 30 | [Reference images for Characters](issues/30-reference-images.md) | resolved | 18, 20, 21 |
| 31 | [Snapshots and the Gallery](issues/31-snapshots-and-gallery.md) | resolved | 25, 28, 30 |
| 32 | [Run the live instance on the home PC](issues/32-live-instance-on-windows.md) | ready-for-human | 17, 19 |
| 33 | [Daily backup to a second disk and encrypted Google Drive](issues/33-daily-backup.md) | ready-for-agent | 32 |
| 34 | [Write the restore steps and try them once](issues/34-restore-drill.md) | ready-for-human | 33 |

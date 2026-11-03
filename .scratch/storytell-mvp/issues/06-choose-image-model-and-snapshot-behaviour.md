# Choose the image model and how a Snapshot behaves

Type: grilling
Status: resolved
Blocked by: 03, 05
Part of: [Map: Storytell AI MVP](../map.md)

## Question

Which image model will make Snapshots, and how does a Snapshot behave: what the user triggers, what the image depicts (current moment, which Characters), how Characters stay visually consistent, and where Snapshots appear in the Chat?

## Answer

Grilled 2026-11-03. The model choice is provisional until a hands-on check (below).

- **Model:** Runware with Seedream 4 (~$0.03/image, multi-reference input). Runware's ToS requires 18+ users and bans only minors and real people; its safety check is opt-in. IP-Adapter, PuLID and LoRA stay available if consistency needs more. The image model is one app-wide setting, like the text model.
- **Check before building:** generate a handful of images (under $1) to confirm Seedream 4 on Runware returns explicit fictional-adult images and keeps a Character's face from its reference image. If it fails, switch to Venice with Seedream V5 Pro Edit or `qwen-edit-uncensored` (~$0.04–0.06, multi-edit capped at 3 references by default).
- **Budget:** the $30/month ceiling covers text and images together, split into two prepaid credits, for example OpenRouter $22 and the image provider $8 (~160 reference-based Snapshots). The app shows image spend apart from text spend. When image credit runs out, only Snapshots stop; play goes on.
- **Consistency: reference images.** Each Character may hold one hidden reference image. It is made from the Character page: 4 candidates of a full-body, neutral pose, plain background in the Story's Image style, and the user picks one. It belongs to the Character at Story level and is shared by all Chats.
  - **How it differs from an avatar** (still out of scope): it is never shown beside messages, in cast lists or anywhere in play. It is only an input to the image model, visible on the Character page.
  - Editing Appearance or Image style offers to regenerate it but never forces it. A Character without one is drawn from text alone and doesn't block a Snapshot.
  - The reference fixes face and build only. Clothing and situation come from the latest messages; lasting changes made in play (a haircut, a scar) come from Memory, which the image-prompt writer also reads.
- **Style:** Story gains a fourth Style field, **Image style**, in plain language (e.g. "photorealistic, cinematic lighting" or "anime, soft colours"). It is drafted with the Story and editable like the others. Both Snapshots and reference images follow it.
- **Trigger:** a camera button in the Chat. One press makes one image, and there are no automatic Snapshots. An optional one-line hint can be added (e.g. "close-up on her face", or names of who to show).
- **What it depicts:** the moment of the latest AI Message only; earlier messages can't be snapshotted.
  - V4 Flash writes the image prompt from the latest messages, Appearance, Setting, Memory, Image style and the hint, and picks who is in frame.
  - At most 3 Characters per Snapshot. If more are in the scene, V4 Flash picks the 3 in focus, unless the hint names them.
  - The view is always the user's first-person point of view, so the user is never drawn beyond glimpses such as hands. Role and Persona get no appearance field or reference image.
  - Fixed 2:3 portrait, no size settings. There is no prompt preview, but the prompt used is stored and viewable from the full-screen image.
- **While it generates:** a placeholder sits in the timeline and the user can keep playing. The image attaches to the Message it was taken at.
- **On failure or refusal:** an error with retry, never a silent switch to another provider.
- **Retakes:** pressing the camera again makes another Snapshot of the same moment. One Message can have several Snapshots.
- **Where it appears:** inline in the Chat timeline under its Message, tap for full screen. Every Snapshot also lives in the Story's **Gallery**, which collects Snapshots from all of the Story's Chats, newest first, filterable by Chat.
  - **Gallery in the MVP:** grid, full-screen view, delete, download one image. Albums, tags and favourites come later. Reference images are not in the Gallery.
- **Rewind, reset and deletion:**
  - Editing a message (which discards later messages) or resetting the Chat takes the affected Snapshots out of the timeline but keeps them in the Gallery. They are marked "from an earlier version of this Chat"; Gallery items whose Message still exists jump to it.
  - Snapshots never roll back with Memory, Bond, Arc or Scene, and are never sent to the text model.
  - Deleting a Chat keeps its Snapshots in the Gallery, unlinked. Deleting a Snapshot removes it from both places. Deleting the Story deletes its Gallery and reference images.
- Glossary: sharpened **Snapshot**; added **Reference image** and **Gallery** to `CONTEXT.md`.

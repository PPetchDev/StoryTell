# Theme and Visual Novel mode

Type: grilling
Status: resolved
Blocked by: none

## Question

Should the Chat screen get looks beyond today's single dark theme — a background picture, other themes, or a Visual Novel layout with the speaker shown large?

## SillyTavern

Themes (colours, fonts, blur, bubble/flat/document chat styles), custom CSS, per-chat background images, and Visual Novel mode (sprites standing over the background).

## Storytell today (checked 2026-11-08)

- One dark theme (`apps/web/app/globals.css`, `color-scheme: dark`), a story text size setting (`apps/web/components/text-size-setting.tsx`), Portraits beside lines, a desktop layout, Snapshots inline in the thread, a Cover per Story.

## Options

- **A. Chat background** — the Story's Cover or the Chat's newest Snapshot, dimmed behind the thread.
- **B. A light theme / a few presets.**
- **C. Visual Novel mode** — the speaking Character's Reference image large over a Snapshot background, text in a box below.
- **D. Not now.**

## Recommendation

D, maybe A later (a small change using pictures that already exist). C belongs with [Expression sprites by emotion](10-expression-sprites.md) and is a big UI piece for a phone screen.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: options A + B + C — a **Backdrop** behind the thread (the Story's Cover or the Chat's newest Snapshot, dimmed, user's choice per Story), a light theme beside the dark one (Settings: dark / light / follow the phone), and a **Visual novel view** of the Chat. No custom CSS.

Spec and tickets: [.scratch/chat-looks/](../../chat-looks/spec.md).

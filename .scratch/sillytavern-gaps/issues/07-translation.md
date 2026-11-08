# Writing in Thai while the story plays in English

Type: grilling
Status: resolved
Blocked by: none

## Question

The user thinks and types in Thai but plays in English. Should Storytell translate — the user's drafts into English, the AI's Messages into Thai, or both — and where does the translated text live?

## SillyTavern

Chat Translation extension: auto-translates incoming and/or outgoing messages through Google, DeepL, LibreTranslate and others, showing the translated text.

## Storytell today (checked 2026-11-08)

- English only: the MVP map ruled "Thai or any non-English language" out of scope. Lore triggers already match Thai text anywhere (`apps/api/src/manager/chat/lore/lore-select.ts:39`), the only Thai-aware code.
- A Message's text feeds the Judge, Memory extraction, Lore triggers, Story so far and the Transcript, so Thai stored in the Chat would leak into all of them.
- V4 Flash (the background model) is cheap enough for short translations; any call spends credit and is logged as usage.

## Options

- **A. Translate the draft** — a composer button turns what's typed (Thai, or rough notes) into English in the Role's voice, replacing the draft; the user checks it and sends. The Chat only ever holds English.
- **B. Translate a Message on demand** — a Message action shows a Thai reading of that Message, kept for re-reading but never part of the Chat's history.
- **C. A and B.**
- **D. Automatic both ways** on every Message.
- **E. Not now.**

## Recommendation

C now, both on tap, never automatic (credit). A is the same mechanism as a steered Impersonate ([Write the user's reply for them](12-impersonate.md)) — decide them together.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: option C. The draft half is **Write for me** (merged with [Write the user's reply for them](12-impersonate.md)); the reading half is **Thai reading**: a Message action that shows a Thai translation of that Message, kept for re-reading, never part of the Chat's history and never sent to the AI. Both on tap only, never automatic.

Spec and tickets: [.scratch/write-for-me/](../../write-for-me/spec.md).

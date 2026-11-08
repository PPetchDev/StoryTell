# Scripts, Quick Replies and Regex

Type: grilling
Status: resolved
Blocked by: none

## Question

Should the user get any of SillyTavern's automation: a script language, one-tap saved replies, or regex rules that rewrite text?

## SillyTavern

STscript (a slash-command language with variables and flow control), Quick Reply buttons that send text or run scripts, a Regex extension that rewrites input, output or prompt text, and macros like `{{char}}`/`{{user}}`.

## Storytell today (checked 2026-11-08)

- Suggested replies: ⚡ asks for three AI options (action, speech, move) that fill the composer (`apps/api/src/manager/chat/suggestions/suggestions-prompt.ts`, `apps/web/components/chat/chat-composer.tsx`).
- Output cleanup is built in: the reply parser strips stage directions from speech (`manager/chat/turn/reply-parser.ts`, `prompt.ts` `withoutStageDirections`). `{user}` is the one placeholder (Memory).
- The only user also directs a code agent; any rewrite rule can be a code change.

## Options

- **A. Quick replies only** — user-saved snippets that fill the composer in one tap.
- **B. Regex rules** on displayed AI text.
- **C. A script language.**
- **D. None.**

## Recommendation

D. They exist to let SillyTavern users patch behaviour without code; here the fixes go into the app. Quick replies can come back later if typing the same thing gets tiresome.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: Quick Replies and Regex, as **Saved replies** (user-written lines, app-wide or per Story, that fill the composer in one tap; sending stays the user's own tap) and **Replace rules** (find-and-replace, regex allowed, applied to how AI text is shown and optionally to the user's text before it is sent). STscript is out of scope: a scripting language serves people who cannot change the app's code, and Saved replies plus Replace rules cover its everyday uses here.

Spec and tickets: [.scratch/saved-replies-and-replace-rules/](../../saved-replies-and-replace-rules/spec.md).

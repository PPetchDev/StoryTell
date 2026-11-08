# Expression sprites by emotion

Type: grilling
Status: resolved
Blocked by: 14

## Question

Should a Character's picture change with their emotion in each line (happy, angry, flustered…)?

## SillyTavern

Character Expressions: a sprite per emotion per character (up to 28 labels); a classifier reads the latest message and shows the matching sprite, also in Visual Novel mode.

## Storytell today (checked 2026-11-08)

- One Reference image per Character and one Portrait crop of it (`CONTEXT.md` Portrait), shown beside their lines.
- Venice draws Reference images with `qwen-image-3` at ~$0.04 each (`apps/api/src/service/model-gateway/real/model-table.ts`), so a 6-emotion set is ~$0.24 per Character.
- The Judge already reads every AI Message in a background call (`apps/api/src/manager/chat/judge`); an emotion per speaking part could ride on it without an extra call.
- Bonds are feelings toward someone over time, not a per-line emotion; this would be a new concept.

## Options

- **A. Generated sprite sets** — a few emotions per Character drawn from the Reference image; the Judge tags each speech part's emotion; the Portrait shows the matching one.
- **B. Uploaded sprites** only.
- **C. Later**, with Visual Novel mode.
- **D. Never.**

## Recommendation

C — only meaningful once [Theme and Visual Novel mode](14-theme-and-visual-novel.md) gives sprites somewhere big to show.

## Answer

Decided with the user on 2026-11-08. Their answer to the do / later / never round was "ทำทั้งหมดเลย", confirmed as "every gap is a do"; the form each one takes was left to the planner (เมย์) and is recorded here.

Do: option A + B. A Character may have **Expressions**: one picture per emotion from a fixed short list, drawn by Venice from the Reference image (each one its own tap on a button that shows its price, since it spends image credit; drawing over an existing one asks first) or uploaded. The Judge, in the call it already makes, tags the emotion of each speech part; the Portrait beside a line and the Visual novel view show that Expression, falling back to the Reference image.

Spec and tickets: [.scratch/expressions/](../../expressions/spec.md).

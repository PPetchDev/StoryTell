# Bottom nav, Home picture cards and richer lists

Type: task
Status: done
Blocked by: none
Part of: [Spec: Friendly UI](../spec.md)
Visual reference: the prototype on branch `prototype/friendly-ui` (the Home screen), deleted on 2026-11-05 once all 12 tickets shipped.

## What to build

- **Bottom nav:**
  - A fixed bottom bar (Stories, Personas, Usage, Settings, each an icon plus a label) replaces the top text nav at every width.
  - It respects the safe-area inset, and pages get bottom padding so nothing hides behind it.
  - It isn't rendered on the Chat screen route.
- **Story list API** gains, per Story:
  - last played at
  - the newest-played Chat's id and its current Scene name
  - the newest Snapshot's image path
  - the hook: the Setting's first sentence, about 120 characters
- **Chat list API** gains, per Chat: the current Scene name or free play, and a plain-text excerpt (about 100 characters) of the latest Message.
- **Home:**
  - A "Continue where you left off" row opens the newest-played Chat.
  - Stories show as a 2-column grid of cards: cover, title, hook, last played, and a Draft badge when not playable.
  - A card with no cover gets a stable gradient derived from the Story id.
  - Tapping a card opens a sheet with Continue (when the Story has a Chat), New Chat and Edit Story. A Draft's sheet shows how many fields are missing instead of the play buttons.
  - New Story stays in the header.
- **Chat list page:** each Chat shows its latest line and Scene.

## Acceptance criteria

- [x] API tests for the new list fields, including a Story with no Chats, one with no Snapshots, and the excerpt of an AI Message made of narration and speech.
- [x] Playwright at 390px: Home's Continue row opens the newest Chat. The Chat screen has no bottom nav, and the other four pages do.
- [x] The existing home and navigation e2e specs are updated.
- [x] The full suites pass.

## User stories covered

43, 46–54.

## Comments

**Built (ticket 08 session, 2026-11-05)** on branch `claude/friendly-ui-08-shell-home-4a15b0`. Not merged into master.

- **API:**
  - `GET /api/stories` gives each Story `lastPlayedAt`, `latestChat` (`{ id, sceneName }`, where a null `sceneName` means free play), `coverImagePath`, `hook` and `missing`. `missing` lets the Draft's sheet count what's left.
  - The newest Chat and the newest Snapshot per Story come from one `DISTINCT ON` query each, not a query per Story.
  - `GET /api/stories/:id/chats` gives each Chat `sceneName` and `latestLine`. In `latestLine`, narration is kept as written, speech follows `Name:`, and the user's `*` marks are dropped. It is cut at a word to about 100 characters.
  - The hook is the Setting's first sentence (not ended by titles such as "Mr." or "Dr."), cut to about 120 characters. Both helpers are in `apps/api/src/manager/excerpt.ts`.
- **Shell:**
  - `components/bottom-nav/` replaces the top text nav. It is a fixed bar with icon and label, respects the safe-area inset, and has a spacer of its own height so pages scroll clear of it.
  - It is hidden only on `/stories/:id/chats/:chatId`. The Dashboard keeps it.
  - `components/nav.tsx` and its global rules are gone.
- **Home:**
  - `components/home/` has the Continue row (the newest-played *playable* Story's Chat), a 2-column card grid, and the card sheet.
  - Each card shows the cover, title, hook, "Played … ago" or "Not played yet", and a Draft badge when not playable.
  - The gradient comes from a hash of the Story id (`lib/home.ts`).
  - The sheet offers Continue · Scene, New Chat, All Chats and Edit Story. A Draft's sheet shows "N things to fill in before you can play." instead of the play buttons.
  - The sheet is a reusable `components/sheet/` with a focus trap, Escape to close and a tap on the dimmed page to close.
  - The Chat list shows each Chat's Scene and latest line.
- **Styles:**
  - Every new style is in a per-component CSS module.
  - `globals.css` gains only `--line` and `--warning` in `:root`, also mirrored in `public/offline.html`, and loses the dead `.nav`, `.story-list` and `.story-link` rules.
- **Additions beyond the ticket:**
  - **"All Chats" in the sheet:** without it, the Chat list with its new lines is reachable only through the editor's "Play →".
  - **`devIndicators: false` in `next.config.ts`:** Next's dev-only route badge sat on the bar's Stories tab and swallowed taps in dev and in Playwright. Errors still show.

**Verified:**
- **API:** `test/lists.spec.ts`, 9 tests:
  - a Story with no Chats
  - Chats without Snapshots, the newest-played Chat by play time rather than id, and free play
  - the cover taken from another Chat's newer Snapshot, and that the image is served
  - hook cutting, and the hook not stopping at titles
  - the Chat list with an AI Message of narration and speech, the Opening, and a User Message with `*` marks cut at about 100 characters
- **Playwright, `e2e/home.spec.ts` at 390×844 with touch:**
  - The Continue row opens the newest-played playable Chat. The test is arranged so neither list order nor a newer Draft can fake it.
  - The Chat screen has no `Main` nav.
  - Cards, Draft badge, two columns.
  - The Draft sheet's count, with focus staying in the sheet.
  - Continue and New Chat from the sheet.
  - The Chat list's line and Scene.
  - The bar on Stories, Personas, Usage and Settings: `aria-current`, pinned to the bottom, and a tall page scrolling clear of it.
- `story-editor.spec.ts` and `story-draft.spec.ts` are updated for the cards.
- `npm run typecheck` clean; `npm run test:api` 263 passed (20 files, 9 new in `test/lists.spec.ts`); `npm run test:e2e` 23 passed (ports 3421/3422). One full e2e run had the first two specs (`backup-banner`) fail while the dev page reload-looped; they passed on re-run with and without this diff, and the full suite then passed 23/23, so it was environmental.

**Not done / notes:**
- **Contrast of the primary button:** white on `--accent` (#8f73ff) is about 3.5:1, below AA for 16px text. It is the same pair the existing global `.button` uses, so it is left for ticket 12, which owns the contrast pass. The new text pairs measure ≥ 4.5:1: accent on surface 4.7, muted on surface 6.3.
- **Glossary clash:** "Continue where you left off" and the sheet's "Continue" mean resuming a Chat. CONTEXT.md's **Continue** is the Narrator writing on (ticket 05). The spec asks for this copy, but the glossary may want a note.
- Not looked at on the real Android phone.

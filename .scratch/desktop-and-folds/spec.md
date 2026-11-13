# Spec: Desktop layout, folding cards and Character pictures

Status: done

## Problem Statement

On a PC every page is a 640px column in the middle of the screen with the phone's bottom bar, so the app feels like a phone on a monitor. Long pages are hard to move around: the Story so far fills the top of the Memory drawer, the Story editor's Character, Starting Bond, Scene and Lore cards are all fully open at once, and the Dashboard lists every Character's feelings in full. Characters show as a letter in the Memory graph and as plain names on the Dashboard even when they have a Reference image. Some cards and rows sit too close together.

## Solution

1. **Folding cards.** The Story so far card, each Story editor card (Character, Starting Bonds of one Character, Scene, Lore entry) and each Character's feelings on the Dashboard get a header button that folds and unfolds them. Each one remembers its own state on this device (a per-device preference, like the List / Graph switch). Everything starts unfolded; only what the user folds is stored. **Changed 2026-11-13 for the Story editor's cards** (docs/ui-audit-2026-11-13.md, H2: with every card open the Characters tab ran to about 31 screens): they start folded, showing their header, and open when tapped, when just added, or for a jump to one of their fields; the device stores the ones opened, under `open:<key>`. The Story so far and the Dashboard's feelings still start unfolded.
2. **Character pictures.** One shared way to draw a Character's Portrait (CONTEXT.md: "Portrait"): the chosen square of their Reference image when they have one, else their initial on their Character colour. It is used beside Chat lines (as now), on the Memory graph's person nodes, on each Character's header on the Dashboard, and on Character and Starting Bond cards in the Story editor.
3. **Desktop layout (prototype variant A, chosen 2026-11-08).** From 1024px wide:
   - the bottom bar becomes a left side rail (icon over label), shown on every route including the Chat;
   - pages widen (content up to about 72rem; reading and form pages stay narrower);
   - Home shows more covers per row;
   - the Chat keeps a reading column of about 48rem, and the Memory drawer docks on the right beside the thread instead of covering it;
   - the Story editor's tabs become a vertical list on the left, and a Character card puts the Reference image in a left column with its fields in two columns;
   - the Dashboard lays Characters out in two columns.
   Below 1024px nothing changes from today's phone layout apart from the folds, pictures and spacing.
4. **Spacing pass.** More room inside and between cards, rows and headers where they are tight (Dashboard sections, Memory cards, editor cards, chat list).

## Decisions

- Desktop layout: variant A of the throwaway prototype (`/prototype-desktop`, captured on branch `prototype/desktop-layout`). B (top bar) and C (master–detail workspace) were not picked.
- Folds remember per device, per item. Keys: `storySoFar` (one for every Chat), `character:<id>`, `bonds:<characterId>`, `scene:<id>`, `lore:<id>` in the editor, and `feelings:<characterId>` on the Dashboard. Stored together under `storytell.folded` as a list of folded keys.
- A folded editor card keeps its fields in the page (hidden), so autosave and the Story assistant keep working. A jump to a field (a missing item's link, the assistant's change) unfolds its card first. A folded card with a field needed to play shows "Needs filling in" in its header.
- The worn identity in the Memory graph has no picture: it keeps its initial on the accent colour.

## Out of scope

- Server-side storage of folds (they are per device).
- Other desktop changes beyond the list above (keyboard shortcuts, multi-pane Chat lists).

## Verification (2026-11-08)

- `npm run typecheck` in apps/web passes.
- Full Playwright suite: 81 passed (ports 3431/3432), including the new `e2e/folds-and-pictures.spec.ts` (Story so far fold remembered across reloads and Chats; Memory graph Portrait vs initial; Dashboard Portraits and folding feelings; editor cards fold, remember, and unfold on a missing-field jump; desktop rail, docked Memory and side tabs at 1440px).
- Checked by eye on the dev stack (Story 1 / Chat 1) at 390px and 1440px: Home, Chat, Memory drawer (graph with Portraits), Dashboard, editor tabs (Characters, Bonds, Lore), Chat list, Personas, Settings.
- The prototype is kept on branch `prototype/desktop-layout` (9f002b9), not merged.

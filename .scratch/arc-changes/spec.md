# Spec: Arc changes on the Dashboard, without spoilers

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (Arc, Dashboard), [Desktop layout, folding cards](../desktop-and-folds/spec.md) (folds)
Decided in the grilling of 2026-11-11 (Bond, Arc and Memory upgrade, idea 5). Terms: `CONTEXT.md` — Arc.

## Problem Statement

The Dashboard shows each Character's Arc as the author's direction ("Author's direction: grows to trust outsiders") followed by every step the Judge recorded. Those steps are in the same words ("now listens before judging him"), so the story's plan is spelled out to the person playing it. The Character profile already hides Arc directions for that reason, but the Dashboard gives them away. Meanwhile there is no plain sign that a Character *has* changed, and why, without reading the plan.

## Solution

On the Dashboard, each Character's Arc becomes one folded line, "Changed 3 times", which opens to the events that changed them. Each event shows its cause ("After the night Petch stood between her and the reeve") and links to its Message. Neither the direction nor the step's own words are shown anywhere in play. A Character the Judge has never changed shows "Hasn't changed yet". The author still sees and edits directions in the Story editor, as today.

## User Stories

1. As a player, I want to see that a Character has changed, so that I notice the story working on them.
2. As a player, I want to see how many times they changed, so that I can tell a slow shift from a turning point.
3. As a player, I want each change to show the event that caused it, so that I know what moved them.
4. As a player, I want each event to link to its Message, so that I can reread the moment.
5. As a player, I never want to see the direction the author set, so that the story isn't given away.
6. As a player, I never want to see the step's own words, so that the change is something I read in how they act.
7. As a player, I want the list folded until I open it, so that the Dashboard stays short.
8. As a player, I want the fold remembered on this device, so that it stays the way I left it.
9. As a player, I want "Hasn't changed yet" for a Character with no change, so that silence isn't a mystery.
10. As a player, I want a change that a later event turned back to still count and show, so that the back-and-forth is visible.
11. As a player, I want an edited or regenerated reply's changes to disappear from the list, so that it matches the story.
12. As an author, I want to keep seeing and editing Arc directions in the Story editor, so that I can still shape the plan.
13. As a player using a Branch, I want its changes to be its own, so that each line of the story has its own Arc.

## Implementation Decisions

- **The dashboard response no longer carries the direction or the step text in play.**
  - Per Character it gives `arcChanges: [{ messageId, cause, createdAt }]` in story order.
  - `arcDirection` and the step text are removed from the dashboard DTO.
  - The Story editor reads directions from the Story, as today, so nothing there changes.
  - The Arc step's stored `step` text is kept. The Narrator and the Judge still read it.
- **The Dashboard:**
  - Under each Character, after their Bonds, a fold titled "Changed N times", or the plain line "Hasn't changed yet" with no fold.
  - Opened, the fold lists each change: "After …" (the cause), with a link to its Message.
  - The fold key is `arcChanges:<characterId>`, starting folded, like the other Dashboard folds (`lib/folds.ts`).
- **Counting:** every Arc step counts, including one that turned back an earlier change. Steps rolled back by an edit, a Regenerate or a Reply-version choice are already gone from the ledger, so they disappear with no new work.
- **Branch and Reset:** Arc steps already copy with Branch and clear with Reset. There is nothing new to copy.
- **The Character profile** is unchanged: it never showed Arcs.

## Testing Decisions

- **API test** (prior art: the dashboard tests in `judge.spec.ts`):
  - a scripted Judge Arc step appears as an `arcChange` with its cause and Message;
  - the dashboard response holds neither the direction nor the step's words (search the JSON for both strings);
  - a rolled-back step disappears.
- **e2e at 390px** (prior art: `dashboard.spec.ts`):
  - "Changed 1 time" opens to the cause and links to the Message;
  - neither the direction text nor the step text appears on the page;
  - "Hasn't changed yet" for an unchanged Character;
  - the fold survives a reload.

## Out of Scope

- A progress bar, or any measure of how far along an Arc is. Arcs have no defined end.
- Showing the direction behind a reveal or an "author mode" switch in play.
- Arc changes in the Chat, the Character profile or the Visual novel view.

## Further Notes

- Small and independent. Build it after [Bond axes](../bond-axes/spec.md) and [Memory by meaning](../memory-by-meaning/spec.md), or whenever it fits. It touches only the dashboard DTO and the Dashboard.
- The Dashboard used to show "Author's direction". Removing it is the point of this spec, not a side effect.

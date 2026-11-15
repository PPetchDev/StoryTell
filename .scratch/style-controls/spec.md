# Spec: Style controls

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the Style of a Story)
Prior art: zeta's Style tab (docs/research/zeta-how-a-story-runs.md, section 1; "Copy" item 1 there).

Built 2026-11-15. This reverses one line of the MVP's Out of Scope ("genre or pacing presets"): the user asked for these controls on 2026-11-15 after comparing the app with zeta and Isekai Zero.

## Problem Statement

A Story's Style says who tells it, in which tense and at what length. How fast it moves, whether replies lean on talk or on what happens, and how readily the world lets the user succeed can only be asked for in the Setting's prose, where the Narrator weighs them like any other sentence and the author can't see or change them at a glance.

## Solution

Three more Style choices on a Story, each a row of three in the editor's Style tab:

- **Pacing:** Fast, Natural, Slow burn.
- **Dialogue or action:** More dialogue, Balanced, More action.
- **Difficulty:** Easy, Normal, Hard.

The middle choice of each leaves it to the Narrator and adds nothing to the prompt, so every Story written before plays exactly as it did. Any other choice adds one line to the prompt's Style layer.

## User Stories

1. As an author, I want to set a Story to a slow burn, so that the Narrator stops rushing to resolutions.
2. As an author, I want replies to lean on dialogue or on action, so that the Story reads the way its genre should.
3. As an author, I want to make the world forgiving or hard, so that what I attempt in play carries the stakes I chose.
4. As an author, I want each choice to default to "leave it to the Narrator", so that I only set what I care about.
5. As an author, I want my existing Stories to play as before, so that the new controls change nothing I didn't ask for.
6. As an author, I want a duplicated Story, an exported Character card and an AI draft to carry these choices, so that they travel with the rest of the Style.
7. As an author, I want the Story assistant to be able to set them ("make it a slow, hard story"), so that I can change them in plain language.

## Implementation Decisions

- **Three enum columns on the Story**, `pacing` (`fast`, `natural`, `slow`), `balance` (`dialogue`, `balanced`, `action`) and `difficulty` (`easy`, `normal`, `hard`), defaulting to the middle value. They are part of `style` in the Story response and plain fields of the Story update, like POV.
- **Prompt.** One bullet each in the `# Style` layer, after the reply length, in the order Pacing, balance, Difficulty; nothing for a middle value. The Difficulty lines name the worn identity. They do not change the reply length or its token cap. The layer is in the system message, so changing a choice changes the cached prefix once.
- **Everywhere Style travels:** Duplicate copies them; the AI draft may set them when the idea implies it and otherwise leaves the middle values; the Story assistant may set them, and its view of the Story names them; a Character card's Storytell block carries each only when it is off its middle value, and a card with a value outside the set leaves that one unset.
- **No new terms in play.** These are choices of a Story's Style, not things that happen in a Chat; nothing shows them on the Chat screen.

## Testing Decisions

- API (`apps/api/test/style-controls.spec.ts`): the pure prompt (nothing at the middle values, a line each otherwise, system message only), the draft schema, the card block, and through HTTP: defaults, PATCH, the next turn's prompt, back to the middle, Duplicate and the Story assistant. `story-authoring.spec.ts` covers the 400 for a value outside its set.
- Browser (`apps/web/e2e/cue-and-style.spec.ts`, phone size): the three radio groups, saving, reload, and the prompt of the next turn.

## Out of Scope

- Dice, stats or any rule engine behind Difficulty: it is a line to the Narrator, which may still let things slide. A rules agent is a separate idea.
- Genre tags, prose-style presets, and a per-Chat override of a Story's Style.
- Showing these choices on the Chat screen.

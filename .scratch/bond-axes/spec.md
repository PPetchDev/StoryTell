# Spec: Bond axes, Bond gates and Bonds in the Memory graph

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (Bond, Background judge, Dashboard), [Memory graph](../memory-graph/), [Expressions](../expressions/spec.md) (the Judge's one-transaction record)
Decided in the grilling of 2026-11-11 (Bond, Arc and Memory upgrade, ideas 2, 3 and 6). Terms: `CONTEXT.md` — Bond, **Bond axes**, **Bond gate**, Scene, Memory graph.

## Problem Statement

A Bond is a short label and a description: "Wary of him" or "Falling for him". It reads well to the Narrator, but it says nothing about *how much*, and nothing about which feeling moved. Trust, affection and desire run together in one phrase, so a slow-burn story can jump from "curious" to "in love" in one reply, and the user can't see whether a Character's trust is growing while her desire stays put. The Dashboard shows the labels one after another, never the shape of the relationship over time. Scenes can only move on when something *happens*, never when a relationship has grown far enough. The Memory graph draws who each Memory is about, but not how the people feel about each other.

## Solution

Every Bond also carries a level on four **Bond axes**:
- **Trust**, −3 to +3;
- **Affection**, −3 to +3;
- **Desire**, −3 to +3;
- **Tension**, 0 to 3.

Each level has a name in words. The Judge moves them a step at a time with a reason, alongside the label and description it already writes. On the Dashboard each Bond gets a small chart of its four axes over the Chat, with no numbers: the words at the ends, and pins where the label changed. An author can give a Scene **Bond gates** ("Nara toward the user: Trust at least *trusts*"). The Scene moves on only when every gate holds, as well as its move-on condition, or on the gates alone when it has no condition. The Memory graph gains a "Show Bonds" switch that draws the Bonds between the people.

## User Stories

1. As a player, I want each Character's feelings toward me split into trust, affection, desire and tension, so that a relationship can grow in one way and not another.
2. As a player, I want those feelings to change only a step at a time, so that a slow burn stays slow.
3. As a player, I want tension to rise faster than it falls, so that a quarrel can flare in one moment.
4. As a player, I want every change to carry its reason, so that I can see what moved it.
5. As a player, I want to see how a Bond moved over the whole Chat on the Dashboard, so that I can read the shape of the relationship.
6. As a player, I want the chart to show words, never numbers, so that it feels like a story and not a love meter.
7. As a player, I want pins on the chart where the Bond's label changed, so that I can find the turning points.
8. As a player, I want to tap a pin and see the event behind it, so that I can remember what happened.
9. As a player, I want Bonds between Characters charted too, so that I can follow the rivalries and friendships among them.
10. As a player, I want a Bond that has no levels yet to say "Not measured yet", so that I don't read a flat line as indifference.
11. As a player with an existing Chat, I want my Bonds to gain levels as the Judge next touches them, with no extra cost, so that my old Chats join in.
12. As a player, I never want to edit a Bond's levels, so that feelings stay something the story earns.
13. As an author, I want to set a starting level on each axis of a Starting Bond, so that a Chat can begin with distrust or attraction already in place.
14. As an author, I want a Starting Bond's levels to default to the middle, so that I set only what matters.
15. As an author, I want to add Bond gates to a Scene, so that the story moves on when a relationship has grown far enough.
16. As an author, I want to pick a gate's level by its word, so that I never deal with numbers.
17. As an author, I want a gate on a Bond toward me or toward another Character, so that Scenes can hang on rivalries too.
18. As an author, I want a Scene with only gates and no move-on condition to be valid, so that a Scene can be purely about a relationship.
19. As an author, I want a Scene with gates and a condition to need both, so that the event and the feeling come together.
20. As a player, I want the Scene strip to show a Scene's gates in plain words, so that I know what it waits for.
21. As a player, I want gates checked by the app, with no extra model call, so that they cost nothing.
22. As a player, I want the gates checked after the Judge's changes for the turn, so that a reply that raises trust can open the Scene in the same turn.
23. As a player, I want a Branch to carry each Bond's levels as they were at that Message, so that a Branch feels the same.
24. As a player, I want Reset to put the levels back to the Starting Bonds', so that a fresh start is fresh.
25. As an author, I want Duplicate to copy Starting Bond levels and Bond gates, so that a copy plays the same.
26. As a player, I want a "Show Bonds" switch in the Memory graph, so that I can see who feels what about whom.
27. As a player, I want each Bond line coloured by its strongest axis, so that I can tell love from rivalry at a glance.
28. As a player, I want to tap a Bond line and see its label, so that I can read the feeling.
29. As a player, I want the switch remembered on this device, so that I set it once.
30. As a player, I want the Narrator to know each Bond's levels in words, so that Characters act on how strongly they feel.
31. As a player, I want Suggested replies and Write for me to see the same Bonds, so that they fit the moment.
32. As the owner, I want the Judge's prompt to grow only a little, so that a turn costs about the same.

## Implementation Decisions

### The axes and their words

- The four axes, stored as small integers, each with a fixed word per level. The words are what the user, the Judge and the Narrator see.

  | Axis | −3 | −2 | −1 | 0 | +1 | +2 | +3 |
  |---|---|---|---|---|---|---|---|
  | Trust | betrayed | suspicious | wary | unsure | inclined to trust | trusts | trusts completely |
  | Affection | hates | dislikes | cool | indifferent | fond | close | devoted |
  | Desire | repelled | put off | uninterested | no pull | drawn | wants | aches for |
  | Tension | — | — | — | at ease (0) | uneasy (1) | strained (2) | at breaking point (3) |

- Types: `BondAxis` (`trust | affection | desire | tension`) and `BondLevels` (one integer per axis), with the range per axis and the word table, defined once in the API and mirrored in the web's types.

### Storage

- **The ledger stays the record.** `bond_change` gains four nullable integer columns, `trust`, `affection`, `desire` and `tension`. A row with them null is a Bond with no levels yet ("Not measured yet"). A Bond's current levels are those of its latest change, exactly as its label is today, so the history the chart draws is already the ledger.
- **Starting Bonds** gain the four columns, not null, defaulting to 0. Seeding a Chat writes them into the seed change. Existing Starting Bonds read as 0 on every axis.
- **Bond gates:** a new `scene_bond_gate` table:
  - `scene_id` (ON DELETE CASCADE);
  - `from_character_id`;
  - `to_character_id`, null meaning toward the user;
  - `axis`;
  - `at_least` (integer within the axis's range).

  Unique on `(scene_id, from, to, axis)`. Character deletes cascade.
- One migration for all three.

### The Judge

- **Prompt:** each current Bond in the cast is shown with its label, its description, and its four levels in words ("Trust: wary · Affection: fond · Desire: drawn · Tension: uneasy"), or "levels not set yet". The Bond rule gains the axis meanings and the step limits. Each `bond_changes` item gains `levels: { trust, affection, desire, tension }` as the **new** level of each axis, in numbers, as the JSON already uses numbers.
- **A change may move levels without changing the label.** The apply rule that drops a change with the same label is replaced: a change is dropped only when neither the label nor any level differs.
- **Step limits, enforced in apply, not trusted to the model:**
  - each axis moves at most one step from its current level;
  - Tension may rise two steps, but falls only one.

  A larger move is clamped to the limit, and the clamp is logged. Levels are clamped to the axis's range.
- **First measure:** a Bond with no levels yet takes the Judge's levels as they are, within range, unclamped. That is how existing Chats join in, at no extra call. The prompt tells the Judge to set all four levels whenever a Bond shows "levels not set yet", even with no change to its label.
- A change that leaves out `levels` keeps the current levels. A level that isn't a number in range is ignored.
- Written in the ledger's one record transaction with the Bond's label change, as today.

### Bond gates and the Scene

- **The check is a pure function:** given the current Bonds (after this turn's changes) and a Scene's gates, it answers whether each gate holds. A gate on a Bond with no levels yet does not hold.
- **Moving on:**
  - With a move-on condition and gates: the Judge's `move_on` must be true and every gate must hold.
  - With gates and no condition: the gates alone decide, and the Judge's `move_on` is not asked for. The prompt shows "(gates only)" for that Scene.
  - With neither: the Scene is the last, as today.
  - The check runs inside the judge's record, after the Bond changes are applied, so a reply that opens the gate advances the Scene in the same transaction. The Scene advance's event names the gates ("Nara now trusts Ash") when the gates decided it.
- **Playable:** a Scene that isn't the last needs a move-on condition, at least one gate, or both.
- **The Narrator's Scene line** gains the gates in words, so it can steer toward them without forcing them. The Scene strip's goal shows them too: "Waiting for: Nara toward you, Trust at least *trusts*".
- **API:**
  - `PUT /api/stories/:storyId/scenes/:sceneId/gates` takes the whole list `[{ fromCharacterId, toCharacterId, axis, atLeast }]` and answers the Story.
  - A Character not in the cast, an axis outside the four, or a level out of range is a validation error.
  - The Story response lists each Scene's `gates`.

### The Dashboard

- The dashboard response gains, per Bond:
  - `levels` (current, or null);
  - `trend`: each change in order, with its Message id, its levels or null, and whether the label changed.
- Each Bond on the Dashboard shows its label and description as today, then a small inline SVG chart:
  - four lines, one colour per axis, over the Chat's Messages;
  - the axis words at the ends ("betrayed … trusts completely");
  - no numbers on any axis or tooltip;
  - a pin where the label changed, and a tap on a pin shows the event and links to its Message;
  - a Bond with no levels shows "Not measured yet" instead of the chart.

  No chart library: the chart is drawn by a pure layout function and plain SVG.
- The Dashboard's existing folds still apply. The chart sits inside the Bond's fold.

### The Memory graph

- **The switch:** a "Show Bonds" switch beside the List/Graph choice, remembered per device as `storytell.memoryGraphBonds`. It starts off.
- **The lines:** when on, each current Bond between two people is drawn between their nodes. That covers the user and every Character who isn't sitting out. Two Bonds between the same pair are drawn as two gently curved lines.
- **Colour:** a line takes the colour of its **strongest axis**, the axis with the largest distance from 0. Tension wins a tie, and Tension counts only at 2 or more. An all-zero Bond is grey, and a Bond with no levels is a dashed grey line.
- **Tapping a line** shows its label and its four levels in words.
- **Data:** the graph reads Bonds from the Chat response. The Chat response gains its current Bonds (direction, label, levels), which the Memory drawer already needs no extra call for.

### Copying

- **Branch:** the levels live on `bond_change`, which Branch already copies and rolls back past the Message, so a Branch keeps them with no new work. A test pins it.
- **Reset:** the ledger clear and re-seed already restore the Starting Bonds, now with their levels.
- **Duplicate:** copies the Starting Bonds' levels with the rows it already copies, and each Scene's gates with remapped Character and Scene ids.
- **Character cards** carry neither (a card is one Character).

### Prompts that read Bonds

The Narrator's feelings layer, Suggested replies, Write for me and the Snapshot prompt all build their feelings from the current Bonds. Each Bond line gains its levels in words, and only where it has them. The added words are about 20 tokens per Bond.

## Testing Decisions

- Test external behaviour at the existing seams:
  - the pure Judge prompt, parse and apply functions;
  - the new pure gate check and chart layout;
  - the HTTP API through the fake gateway, scripting the Judge's JSON;
  - e2e at 390px for what shows.
- **Pure tests** (prior art: `judge-prompt.spec.ts`, the apply filters in `judge.spec.ts`):
  - the prompt shows levels in words, and "levels not set yet";
  - parse reads `levels` loosely;
  - apply clamps each axis to one step, lets Tension rise two and fall one, takes a first measure unclamped, keeps levels when `levels` is missing, and drops a change only when nothing differs;
  - the gate check covers each axis, a Bond toward the user and toward a Character, and an unmeasured Bond;
  - the chart layout gives a point per change and pins where the label changed, and holds no numbers in its labels.
- **API tests** (prior art: `judge.spec.ts`, `chats.spec.ts`, `story-duplicate.spec.ts`, `branch.spec.ts`):
  - a scripted Judge change writes levels, and the dashboard shows them and the trend;
  - a Starting Bond's levels seed a new Chat and come back on Reset;
  - a Scene with gates and a condition waits for both;
  - a gates-only Scene advances when a change opens it, in the same judgement, with the event naming the gate;
  - a gate on an unmeasured Bond holds back;
  - the gates API validates and Duplicate copies;
  - a Branch at an earlier Message carries the levels as they were then;
  - a Story whose Bonds have no levels sends the Narrator the same feelings text as today.
- **e2e** (prior art: `dashboard.spec.ts`, `memory-graph.spec.ts`, `story-editor.spec.ts`):
  - the Dashboard chart shows axis words, a pin opens its event, and no digit appears in the chart;
  - an unmeasured Bond reads "Not measured yet";
  - the Scene editor adds a gate by its word and it shows in the Scene strip;
  - "Show Bonds" draws a line, a tap names its label, and the choice survives a reload.

## Out of Scope

- The user editing levels, or seeing them as numbers anywhere.
- More axes, per-Story axes, or author-named axes.
- Gates on Memories, Beliefs, Arcs or the Time of day.
- Gates that hold a Scene back (a "must not" gate) or that pick between Scenes. Scenes still run in order.
- Bonds of a Character toward the Opening or toward someone outside the cast.
- A Bond chart in the Visual novel view or in the Chat itself.

## Further Notes

- Spec A ([Memory by meaning and Beliefs](../memory-by-meaning/spec.md)) and spec C ([Arc changes on the Dashboard](../arc-changes/spec.md)) were decided in the same grilling. Build this one first.
- The word scales were chosen so each step reads as a real change in a story. If the Judge keeps landing on one word, the scale is what to tune, not the step limit.
- Open question: should a gates-only Scene wait at least one turn after it begins, so it can't open on its first reply? Recommended: no. A relationship that is already there should not be made to wait.

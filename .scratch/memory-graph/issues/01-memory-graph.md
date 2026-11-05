# Memory graph in the Memory drawer

Type: task
Status: done

The user asked to see a Chat's Memory "แสดงแบบ graphify": as a graph of nodes and links, next to the list.

## Decisions (asked and answered 2026-11-05)

- **Nodes:** the worn identity and the Characters are people; each active Memory is a dot linked to the people it is about. In Chat 1 almost every Memory is known by all four Characters, so linking by Known by would draw one solid tangle; linking by who it is about tells Memories apart.
- **Who a Memory is about** is read on the client, with no schema or API change: `{user}` or the worn identity's name is the user, and a Character's name (a whole word for Latin names, possessives included; anywhere for names in scripts without spaces) is that Character. A Memory that names nobody is linked to the Characters who know it.
- **Placement:** a List / Graph switch in the Memory drawer. List is the default; the choice is a per-device preference (`storytell.memoryView`). Archived Memories stay out of the graph; a line under it points to List.
- **Taps:** a person lights up the Memories about them, fades the ones they don't know further, and lists the Memories about them under the graph. A dot opens that Memory's card under the graph, with Edit, Delete and Go to the Message as in the list. A tap on empty space clears the pick. A "Memory added" toast lands on its dot.
- **Drawing:** a hand-drawn SVG with a small deterministic force layout (`lib/memory-graph.ts`), no new dependency. It is laid out again only when a person or a link changes, so typing in a Memory moves nothing.

## Acceptance criteria

- [x] The graph renders the real Memories of Story 1 / Chat 1 in the dev stack (45 active dots, five people).
- [x] Playwright at 390px with touch: people counted by the Memories that name them; the fallback to Known by; a picked person's list and fades; clearing the pick; editing a dot's Memory relinks it and locks it; deleting it removes the dot; Graph stays chosen after a reload (`e2e/memory-graph.spec.ts`).
- [x] The existing Memory and autosave e2e specs still pass.
- [x] **Memory graph** is in `CONTEXT.md`.

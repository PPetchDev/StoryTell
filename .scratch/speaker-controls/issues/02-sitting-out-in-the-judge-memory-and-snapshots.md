# 02 — Sitting out in the judge, Memory and Snapshots

**Status:** ready-for-agent

Part of: [Spec: Speaker controls](../spec.md)

**What to build:** A Character sitting out keeps their own feelings, Arc and knowledge as they were, and stays out of the pictures, which the user sees on the dashboard, in the Memory drawer and in the Gallery:

- **The judge:** its prompt marks them as not in the story now. Its apply rules drop any Bond change *from* them and any Arc step *for* them, each with a logged reason. Others' Bond changes *toward* them still apply.
- **Memory extraction:** it is told the present Characters without them, its "everyone" fallback included. Its apply rules leave them off a new Memory's Known by and off Known-by additions, logged. A merge keeps the Known by its sources had.
- **Memories added by hand:** with no Known by given, a new Memory's default Known by (the present Characters, or everyone) leaves them out, and so does the `present` list the Memory list answers, which the drawer's add form starts its picker from. An explicit Known by is kept as given, so the user can still tick them.
- **Snapshots:** the writer's cast and the in-frame pick leave them out, unless the user's hint names them.

**Blocked by:** [01 — Set a Character sitting out, and the turns leave them out](01-sitting-out-in-turns-and-the-sheet.md).

- [ ] API tests (fake gateway): a scripted judgement with a Bond change from them and an Arc step for them applies neither (the dashboard shows their Bonds and Arc unchanged), while a Bond change toward them from another Character applies.
- [ ] API test: a scripted extraction that adds them to a new Memory's Known by stores the Memory without them; their existing Memories keep them.
- [ ] API test: a Memory added by hand with no Known by is not known by them, and the Memory list's `present` leaves them out; one added with them given explicitly keeps them.
- [ ] API test: the Snapshot writer's cast leaves them out, and includes them when the hint names them.
- [ ] e2e (390 px): with a Character sitting out, the Memory drawer's add form starts with them unticked.
- [ ] With nobody sitting out, the judge, extraction, Memory add and Snapshot calls are exactly as before.
- [ ] Typecheck, the whole API suite and the whole e2e suite pass.

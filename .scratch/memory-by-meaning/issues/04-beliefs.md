# 04 — Beliefs: made and given up by the extraction, told to the Narrator, shown in the drawer

**Status:** ready-for-agent

**What to build:** A Character can hold a Belief that may be false. Follow the spec's "Beliefs", except Starting Beliefs, which are ticket 05:
- the `belief` table and the `belief_change` ledger, which an edit, a Regenerate or a Reply-version choice rolls back;
- the extraction's rule and its `believe` and `give_up` operations, with the drops the spec lists, and the active Beliefs numbered in its prompt;
- in the Memory choice, the active Beliefs of the Characters present come right after the locked Memories, inside the budget;
- Beliefs reach the Narrator as "X believes: …", with the instruction "A Character acts on what they believe, even when it is wrong";
- the Memory drawer's Beliefs section: by Character, "Doesn't match: …", and given-up Beliefs folded below; add, edit and delete;
- `POST/PATCH/DELETE .../beliefs[/:beliefId]` and `BeliefNotFoundError` in the Chats domain, listed in `docs/error-codes.md`;
- Beliefs on the Chat response;
- Branch copies Beliefs and their changes, extending Branch's copy;
- Reset clears them.

**Blocked by:** [02 — Each turn chooses Memories by meaning](02-choose-memories-by-meaning.md)

**Part of:** [Spec: Memory by meaning](../spec.md)

- [ ] Pure tests: `believe` and `give_up` parse and apply; the drops; the choice places Beliefs of those present after locked Memories.
- [ ] API tests:
  - a scripted `believe` shows in the Chat and reaches the Narrator as "X believes: …";
  - `give_up` takes it out;
  - Regenerate undoes a Belief the replaced reply made;
  - Branch carries Beliefs;
  - Reset clears them;
  - the Beliefs API, and its 404.
- [ ] e2e at 390px: the Beliefs section reads "Nara believes …" with "Doesn't match"; adding a Belief from the drawer.
- [ ] Typecheck and the whole suites stay green.

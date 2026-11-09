# 05 — Replace rules on my Messages before sending

**Status:** done

**What to build:** On Send, the composer runs the Chat's `onMine` rules over the draft, and the result is what is sent, shown in the pending bubble and stored. A result with nothing but whitespace sends nothing and says "Your Replace rules left nothing to send." Per the spec's "Where my-side rules run": not applied to editing a User Message, Retry, filling the box, or Continue. Ticket 03's twice-run save check means a draft that is already a rule's output (a Branch's draft, say) is sent unchanged.

**Blocked by:** 03 — Replace rules: store, check and manage

Part of: [Spec: Saved replies and Replace rules](../spec.md)

- [x] An `onMine` rule changes the sent text; the thread and the stored User Message (reload) show the replaced text; the turn's prompt has it.
- [x] A rule with only `onAi` set doesn't touch the user's text; a rule with only `onMine` set doesn't change AI Messages as shown.
- [x] A draft the rules empty is not sent, the draft stays, and the notice shows.
- [x] Editing a User Message saves exactly the edited text; Retry resends the stored text.
- [x] e2e: an `onMine` rule changes the sent User Message as stored; sending that stored text again as a new draft sends it unchanged; the existing composer e2e stays green.

# 04 — Branch from a User Message, with its text in the composer

**Status:** ready-for-agent

Part of: [Spec: Branch](../spec.md)

**What to build:** The user taps one of their own Messages and chooses ⑂ Branch: the Branch ends on the AI Message before it, and opens with that Message's text waiting in the composer, so the user can say it differently. Nothing runs and nothing is spent until they send. This works also while sending is blocked, which today hides every tool on a User Message. Follow the spec's "Branching from a User Message" and "Web" decisions:

- The branch route's answer gains `draft: string | null`: the User Message's text when branching from one, else null.
- The web hands `draft` to the new Chat's composer through a one-shot session-storage hand-off keyed by the new Chat's id, never through the URL.
- A tapped User Message's tools are ✎ Edit · ⑂ Branch, ⑂ last. While sending is blocked (an unplayable Story, text credit out) a User Message stays tappable, and its tools are ⑂ Branch alone. Today the thread gates the tap on `canEdit && (message.kind === 'ai' || !blocked)` and gives an untappable Message no tap handler; the gate for showing tools becomes "Edit or Branch is possible", with Edit still hidden on a User Message while blocked.

**Blocked by:** [02 — Branch a Chat from a reply](02-branch-a-chat.md).

- [ ] API: from a User Message `draft` is its text; from an AI Message it is null.
- [ ] e2e (390 px, fake gateway): branching from a User Message opens the Branch ending on the reply before it, with that text in the composer and no turn running.
- [ ] e2e: with the Story unplayable, a tap on a User Message shows ⑂ Branch and no ✎ Edit, and ⑂ makes the Branch with the draft; with the Story playable, the same tap shows both.
- [ ] The draft is not in the URL, and reloading the new Chat afterwards does not put it back in the composer a second time.
- [ ] An API error while branching (still saving, turn in progress) shows in the usual error line without leaving the Chat.
- [ ] Typecheck, the whole API suite and the whole e2e suite pass.

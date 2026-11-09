# 04 — Read new replies aloud by themselves

**Status:** done

**What to build:** A Chat setting, off by default, that plays each new reply as soon as its turn settles, but only for turns started in this tab. It works on an iPhone after a tap. A Branch keeps the setting, and Reset leaves it as it was. Per the spec's "Auto-read":

- `chat.auto_read`, by migration;
- the Chat update and response field;
- Branch's copy extended to copy it;
- the ⋯ menu switch "Read replies aloud", as the menu's last row (after Author's note and Who's in this Chat where those exist);
- the player starting on the settled reply of a send, Retry, Continue, ↺ Again or User Message edit. Never on load, a Reply version change, a Reset or a stopped turn;
- the silent-clip unlock inside the first Send, Continue, Again or ▶ tap;
- "▶ Tap to play" when the browser still refuses.

**Part of:** [Spec: Read aloud](../spec.md)

**Blocked by:** [03 — Read a Message aloud](03-read-a-message-aloud.md), [Branch's copy ticket](../../branch/issues/02-branch-a-chat.md)

- [ ] API tests: `autoRead` defaults to false, round-trips through the Chat update, survives Reset, and a Branch of a Chat with it on has it on.
- [ ] e2e at 390px:
  - with the switch on, a send plays the new reply after it settles (the fake records `read_aloud` calls for its items);
  - reloading the Chat plays nothing;
  - choosing another Reply version plays nothing;
  - with the switch off, a send records no speech call.
- [ ] The handoff asks the user to check on their iPhone PWA that auto-read plays after Send. The agent can't test iOS autoplay itself.
- [ ] Typecheck and the whole suites stay green.

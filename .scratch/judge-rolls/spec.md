# Spec: Roll offers and Stats

Status: ready-for-agent
Builds on: [Spec: Roll](../roll/spec.md) (the d20, the number to reach, the Roll block), [Spec: Story quality](../story-quality/spec.md) (a Judge field named in the reply shape), [Spec: Place, Weather and Outfits](../info-box/spec.md) (the Scene strip)
Prior art: Isekai Zero's "Dungeon Mind" (a light rules layer: the game offers a check at a key moment, a stat adds to it) and zeta's Dice events (docs/research/zeta-how-a-story-runs.md, section 3).

Built 2026-11-18.

## Problem Statement

A Roll only happens when the user thinks of arming the dice, so most risky moments are still left to the Narrator, who leans toward letting things work. And every Role rolls the same: a soldier and a courtier are equally good at forcing a door or at talking their way past a guard, because the app has no idea what the user's part is good at.

## Solution

A light rules layer, kept small:

- **Stats.** The author gives the Story's Role a few **Stats** ("Strength 2", "Charm 1"). A Roll made for a Stat adds it to the d20.
- **Roll offers.** At a key moment of the latest exchange (a risky act, persuading someone who resists, a chase) the Judge may offer a Roll: what is at stake and which Stat applies. The user sees it above the composer and can take it, which arms the existing Roll with that Stat for their next Message, or dismiss it. Offers are rare: there is a gap of several replies between them, none while a Roll was just made, and none in intimate moments.
- **A switch.** The author can turn offers off for a Story. The user can still arm a Roll themselves.

## User Stories

1. As a player, I want the story to offer me the dice at a moment that matters, so that risks happen without my having to think of them.
2. As a player, I want to see what is at stake and which Stat applies before I accept, so that I know what I am rolling for.
3. As a player, I want to dismiss an offer, so that I can keep a moment in my own hands.
4. As a player, I want offers to be rare and never to interrupt an intimate scene, so that the story is not turned into a game.
5. As a player, I want my Role's Stat to add to the throw, so that what my part is good at matters.
6. As a player, I want to see my Stats at a glance in the Chat, so that I know what my part is good at.
7. As a player, I want the Message to show the throw, the Stat added, what it needed and how it came out, so that I know what the story is answering.
8. As an author, I want to give my Role a few Stats, so that the dice fit who the user plays.
9. As an author, I want to turn offers off for a Story, so that a Story that should never feel like a game doesn't.
10. As the owner, I want offers to cost no extra model call, and the Judge's system message to stay the same from call to call, so that the cache keeps working.

## Implementation Decisions

- **Stats live on the Role.** `role.stats`: a list of at most 6, each a name (1 to 24 characters, one line, unique ignoring case) and a whole number from -3 to 5. `PATCH /stories/:id/role` takes `stats` and replaces the whole list; a bad list is a 400. They are the Story's, for whoever the user plays: a Persona worn in place of the Role rolls with the same Stats. Duplicate copies them.
- **The switch is on the Story.** `story.rollOffers`, true by default, so every Story, old ones included, may get offers. `PATCH /stories/:id` takes it. Duplicate copies it. Turned off, no offer is made and a pending one is not shown.
- **A Roll for a Stat.** The send request may carry `rollStat` (a string) beside `roll: true`. The app looks the name up among the Role's Stats ignoring case and stores the Stat's name and number with the Roll (`roll_stat`, `roll_bonus` on the Message). A name the Role no longer has (the author renamed it meanwhile) makes a Roll without a Stat rather than an error; a non-string is a 400; without `roll: true` it is ignored. The outcome: a natural 20 is still a critical success and a natural 1 a critical failure; otherwise the throw plus the Stat must reach the number. The Message's `roll` carries `stat: { name, bonus }` only when a Stat was added, so a plain Roll reads as before. The Roll block says "a success (9 + 2 for Strength = 11, needing 11 or more)"; its reserve rises from 110 to 120 tokens. Retry, Again, an edit and a Branch keep the Stat with the Roll, like the throw.
- **When the Judge may offer.** The code decides whether an offer is allowed for the judged reply; the Judge only decides whether the moment calls for one. Allowed when all of these hold:
  - the Story's offers are on;
  - the reply is not an Epilogue;
  - the User Message it answers was not sent with a Roll (the dice already decided this moment);
  - at least `ROLL_OFFER_GAP` (6) model-written replies, the judged one included, came after the Chat's last Roll offer (taken, dismissed or ignored) and after its last Roll; the Opening counts as the start, so a Chat's first offer comes at its sixth reply at the earliest.

  That keeps offers to about one a Scene: a Scene usually lasts several replies, and a Roll the user makes themself resets the count too.
- **The Judge field.** When an offer is allowed, the Judge's user message ends with a "# Roll offer" section, after the Now notes: the Role's Stats ("none" without), and the rule: give `"roll_offer": {"stakes": "...", "stat": "..."}` only when the latest exchange leaves the user at a key moment whose outcome is truly uncertain and worth leaving to chance (a risky act, persuading or deceiving someone who resists, a chase, a fight, sneaking past someone, a feat of skill); `stakes` is one short question to the user ("Can you talk the guard into letting you pass?"); `stat` is the one Stat that applies, or null; never during an intimate, romantic or sexual moment, tenderness, rest or ordinary talk, unless the user's latest message itself asks to leave something to chance; when in doubt, null. The token cap rises by 60 with the section.
- **The reply shape.** On live the facts section goes with every judgement, so its system message is the one every call sends. The roll offer's field is named in that reply shape, `"roll_offer":null`, by a helper of its own beside `withFactsShape`, whether or not an offer is allowed for this reply: the system message stays the same from call to call (the lesson of 2026-11-18: a field only the user message asks for is not returned by DeepSeek V4 Flash). Without the facts section, which only tests send, the system message is unchanged. The shape shows null, not an example object, so the Judge's default is no offer.
- **Applying.** The offer is read loosely: an object with a non-empty `stakes`. Stakes go on one line, cut to 160 characters. A `stat` that names none of the Role's Stats, ignoring case, becomes null; the offer stays. An offer when none is allowed is dropped and logged like other judge items. The offer is stored on the judged AI Message (`roll_offer`: stakes, Stat name or null, dismissed), written in the judgement's one transaction; each judgement of the Message writes it again, null when there is none. A rewind (Again, an edit, another Reply version) clears the offers of the Messages it rewinds, so an old offer never shows on a new reply. A Branch copies the offers of the Messages it keeps.
- **The Chat.** The Chat response carries `rollOffer`: the pending offer, or null. It is pending only while the newest Message is the AI Message that has it, it is not dismissed, and the Story's offers are on. Its `stat` is `{ name, bonus }` with the Role's number now, or null. `DELETE /stories/:storyId/chats/:chatId/roll-offer` dismisses it and answers with the Chat; with nothing pending it answers the same Chat. A dismissed offer still counts for the gap.
- **Taking an offer is a send.** No request accepts it: taking it arms the composer's Roll with the offer's Stat, and the next send carries `roll: true` and `rollStat`. Sending any Message ends the offer, since it is no longer on the newest Message. Turning the Roll off again shows the offer again.
- **The screen.** The offer is a band above the composer, like the Roll's own line: the dice icon, the stakes, a "Roll" button saying the Stat ("Roll +2 Strength") and a ✕ "Not now". Taken, the band goes and the armed Roll's line says "Roll 11 · +2 Strength". The Message's Roll under its bubble reads "9 +2 Strength needed 11 Success" (the Visual novel view the same). The Scene strip, opened, has a "Your Stats" line ("Strength +2 · Charm +1") when the Role has any. The Role tab of the Story editor has a Stats card: a row per Stat (name, number, remove), "Add a Stat" up to 6, and the "Offer Rolls at key moments" switch, saved like the Role's other fields.

## Testing Decisions

- API (`apps/api/test/judge-rolls.spec.ts`): as pure logic, the Roll outcome and block with a Stat, when an offer is allowed (each condition and the gap), the Judge's section and that the system message with facts names `roll_offer` and is the same whether or not an offer is allowed, the token cap, loose reading and applying. Then through HTTP with the fake gateway and scripted dice: Stats saved, refused and copied by Duplicate, the switch, an offer from the Judge on the Chat and in the next prompt's absence, the gap, a Roll with `rollStat` and its stored Stat and prompt, an unknown Stat, the dismiss, an offer dropped when not allowed, Again clearing it, and the switch hiding it.
- Browser (`apps/web/e2e/judge-rolls.spec.ts`, phone size): the author's Stats and switch, the offer band, taking it (the request body, the armed line, the Message's Roll with the Stat), dismissing it and a reload, the Stats in the Scene strip, and the band at 360px and 320px.

## Real-model check (2026-11-18)

- **Free model only.** The Judge prompt as `buildJudgePrompt` builds it (facts section, Roll offer section, Stats Strength +2 and Charm +1) went to OpenRouter's free `nvidia/nemotron-3-ultra-550b-a55b:free`, three runs of four exchanges, read by `parseJudgement`:

  | Exchange | Result |
  |---|---|
  | A chase to a closing portcullis | 3/3 offers, Strength |
  | Bluffing a captain at the gate | 3/3 offers, Charm |
  | A slow kiss | 3/3 none |
  | Asking after a sister | 3/3 none |

- **Not checked: live's Judge.** DeepSeek V4 Flash is the model that dropped a field the user message alone asked for. Worth one paid check before relying on offers: the same four exchanges, five runs each, through Venice, about 20 Judge calls of ~3k tokens, under $0.05.

## Out of Scope

- Stats that change in play, experience, levels, an inventory, hit points, or more than one die.
- The user choosing a Stat for a Roll they arm themselves.
- Stats on a Persona or per Chat.
- The Narrator asking for a Roll in its prose, or the Judge rolling by itself.
- Offers counted per Scene in code; the gap stands in for it.
- Stats in a Character card export or import.

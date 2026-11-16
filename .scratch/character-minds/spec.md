# Spec: Character minds (Goals and Thoughts)

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (the turn, the Judge, the change ledger, Memory and Known by), [Spec: Place, Weather and Outfits](../info-box/spec.md) (the detail records Goals join), [Spec: Diary](../diary/spec.md) (the inner-life line a Thought reads)

Built 2026-11-16. The user: "ฉันอยากให้ตัวละครแต่ละตัวสามารถคิดได้เอง" (I want each Character to be able to think for themselves), and chose both a Goal each Character keeps and a Thought before every reply, with the Thoughts hidden behind a tap.

## Problem Statement

One Narrator knows everything and decides for every Character at once. Characters wait to be addressed, want nothing of their own, and can act on what they could not know, because the one mind writing them knows it all.

## Solution

- **Goals.** Each Character can be after something of their own, in a short phrase from their point of view ("get the ledger to Kessel unseen"). The Judge sets, changes and clears a Character's Goal as the story gives them an aim, they reach it, or give it up. The Narrator is told the Goals of the Characters in the latest exchange and to let them pursue them on their own initiative. A Character's profile shows "Wants now".
- **Thoughts.** Before each reply, each Character in the moment (at most four) thinks on their own, in a separate call that is given only what they know: their Personality, Voice and Background, their Goal, their own Bonds, Beliefs and inner-life line, the Memories they are in Known by, the current Scene, Time and Place, and the latest part of the story. Each answers, in the first person, what they make of the moment, how they feel and what they want to say or do next. The Narrator then writes the reply knowing each Character's Thought, told that a Thought is private, that nothing in it has happened, and that the Narrator decides what does.
- **Seeing them.** A reply that had Thoughts shows a quiet "Thoughts" button under it; a tap opens each Character's Thought. They are never shown otherwise.
- **The setting.** "Characters think for themselves" in the Chat menu, on by default, a Chat's own, copied by a Branch and kept by Reset. Off, no Thoughts are asked for. Goals are kept either way.

## Implementation Decisions

- **A Goal is a detail record**, a fourth kind beside the Place, the Weather and an Outfit: per Character, the newest wins, an empty value clears it. So the ledger rolls Goals back with the reply that set them, Reset clears them and a Branch copies them, as it does Outfits. The Judge's details section shows each Character's Goal and asks for `"goals": [{"character": "Name", "goal": "..."}]` only when the exchange gave one a new aim, saw it reached or given up (`""`). Never one for the user's own character, never for one sitting out, one a Character per turn.
- **Where the Narrator reads Goals**: the turn's trailing "Where things stand", for the Characters in the latest exchange, so the cached system message never changes.
- **How long a Thought is** (2026-11-16, after the real-model check below; the user: shorter, "แต่ไม่ใช่สั้นเกินจนไม่รู้เรื่อง", but not so short it says nothing): one or two sentences of about 35 words, how the Character feels and what they mean to do, never a draft of the line they will say; 120 tokens at most.
- **Thoughts run on the background model** (`character_thought`, the Judge's model), in parallel, before the reply's call. A failed or slow one (over 12 seconds) is dropped and the reply is written without it; nothing waits on a missing Thought. None on an Epilogue, none with text credit out.
- **Who thinks**: the nudged Character first, then those in the latest exchange, never one sitting out, at most four. In a moment with nobody in it, nobody thinks.
- **Secrets and Arc directions are not given to a Thought**, as with the Diary: a Thought can be read by tapping, and the Narrator still knows them and plays them.
- **Where the Narrator reads Thoughts**: the turn's trailing message, after "Where things stand".
- **Kept with the reply** (`message_thought`): each Thought against the AI Message it was written for, so Regenerate thinks again, a rollback takes them with the reply and a Branch copies them. The Chat's Messages carry them for the button.

## Testing Decisions

- API: Goals as pure logic (current, the Judge's section and answer, the reminder) and through the ledger (rollback, Branch); Thoughts as pure logic (who thinks, the prompt, what it leaves out, reading the answer) and through HTTP (a turn asks each, the reply's prompt reads them, they are kept and shown, a failed one is dropped, the setting turns them off).
- Browser: the "Thoughts" button under a reply, "Wants now" on a profile, the Chat menu's switch.

## Out of Scope

- Goals an author writes on a Character card; Characters acting while out of the scene; Characters talking to each other on their own between turns.
- Thoughts in the Visual novel view.

## Further Notes

- Each turn costs a little more (up to four short background calls) and starts streaming a moment later (the Thoughts come first).
- **Seen with the real models on 2026-11-16** (DeepSeek V4 Pro for the reply, as live; V4 Flash for Thoughts; on a copy of the user's Chat 2). Four Characters thought before the first reply and three before the next, each in their own voice (the shy one stammering, the chieftain dry and knowing), and only from what they could see. The reply with Thoughts had two Characters answering each other where the same turn without them was one long speech. Thoughts cost about $0.0002 each. They ran longer than asked (up to about 70 words, some drafting the line they meant to say), and the reply came about 3 seconds later than without them (4.8 and 5.9 s against 2.2 s). No Goal was set in those two turns, so the Judge's Goals are not yet seen working with a real model.
- **Shorter, checked again the same day** (the same turn, one run, $0.041). The four Thoughts ran 27 to 34 words and each still said how they felt and what they meant to do ("I'll let Dulcie have her laugh, then slip my hand into his and lead him somewhere quieter"). The reply took 5.1 s against 4.8 s with the longer Thoughts: the wait is the round trip of the calls, not their length. In that reply a bystander chimed in with a quip and the chieftain spoke a list of three, so the speech rules hold less firmly than the stage-direction cleaning.

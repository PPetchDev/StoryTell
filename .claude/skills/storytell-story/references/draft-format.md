# Draft format

Write the draft in this order. These are the sections the app has, and the order the user reads in. The worked example is `.scratch/story-drafts/the-moonfox-of-selvaria.md`. Copy its shapes, not its words.

## Contents
- Header block (Thai)
- Title, Style, Opening questions
- Setting
- Role
- Opening
- Characters
- Starting bonds
- Scenes
- Sudden events
- Endings
- Lore
- Places
- App limits to check

## Header block (Thai)

Open the file with a `>` quote in Thai, written for the user. Cover:
- the premise in two lines;
- what Rin is and can do;
- what kind of world it is;
- who wants what from Rin;
- how the story moves forward without a clock;
- the hidden truth;
- the cast list.

End it with a note that the fields below are in English and the Thai reading button covers play.

## Title, Style, Opening questions

- **Style (suggested):**
  - POV second person
  - tense present
  - reply length medium
  - pacing slow burn
  - difficulty normal
  - Roll offers on
  - AI events on
- **Image style** is the line the app's Generate button reads together with the Appearance. Put the cute-face words in it: "sweet, soft anime faces, large sparkling eyes, gently blushing cheeks". Without them, the faces come out stern.
- **Opening questions:** a key, a question and a default, e.g. `oldlife`. Use the key as `{oldlife}` in the Role Description and the Opening. Each text is at most 200 characters.

## Setting

Write 4–7 paragraphs:
1. The world and its capital.
2. The demi-human equality paragraph. Keep it every time.
3. The legend or prophecy that puts Rin at the centre.
4. Who wants Rin, and why they can't simply take her: a rule or law that makes them win her.
5. Who hunts her.
6. **The milestone clock:** what marks progress. Moonfox used nine silver buds, one opening per great event, never because days pass. Say plainly that the story should take its time.
7. Tone: Characters seek Rin out on their own, and the Narrator never forces her choices.
8. A closing line: Rin's abilities beyond her Role are the user's to decide.

## Role

- **Name:** Rin, unless the user says otherwise.
- **Description:** a short line with the `{oldlife}` key: how she died and woke.
- **Sections:** a heading and its text, one trait per section. Moonfox used Appearance, Nine tails, Outfit, Everyday Rin, When there is danger, Magic not weapons, and She never kills. Turn anime references into plain traits.
- **Stats:** a stat and its value, e.g. Agility +5. Pick 4–6 that matter in this Story.

## Opening

This is the first Narrator message, in second person, present tense, about 300–450 words. Make it something Rin can act on at once:
- one striking first image;
- a threat within a minute;
- Rin acting by instinct;
- one Character met;
- a reason to move.

End on a line from that Character that invites a reply. Write it in full only after the user has picked from the 2–3 proposed Openings.

## Characters

Write 4–6 Characters. Each needs every field below:

- **Appearance:** age (mid-twenties to early thirties), body (curvy), hair (colour and style), eyes, and her own vivid colour in a royal outfit, named piece by piece. Add one signature prop or shape that makes her stand out. The picture route draws from this text, so write what should be drawn. Leave out "narrowed eyes", "wink", "sly" and "upturned" for faces: those words break the face style.
- **Personality:** 2–4 sentences.
- **Voice:** how she talks: sentence length, pet names, slang, and what changes when she softens.
- **Example lines:** 3 lines that show her voice and her angle on Rin.
- **Background:** where she comes from, what she governs or does, and why she is in the race.
- **Secrets (text):** one surface secret.
- **Secret list:** 1–3 deeper secrets. Each is gated on a Bond level, e.g. *(Trust at least "trusts")*. Each text is at most 1000 characters. Tie them to the hidden truth, so that together they reveal it.
- **Arc directions:** where she can go with Rin, both warm and bitter.

## Starting bonds

Write a table with these columns: From → To, Label, Trust, Affection, Desire, Tension, and Description. Include each Character toward Rin, plus 3–4 bonds between Characters that create rivalry or care.

## Scenes

Write 5–8 Scenes. Each one has:
- a **Situation**;
- a **Move-on condition** that depends on what Rin does or reaches, never on time;
- optional **Bond gates**.

The last Scene has no move-on condition, because it ends when the story reaches an Ending. Mix the kinds: escape or chase, arrival, ordinary life, a festival or ball, secrets surfacing, the climax.

## Sudden events

Write 4–6 Sudden events. Each one has:
- a **Trigger**;
- a **Gauge** with a name, start, goal and fail point (the gauge name is short);
- the number of **Replies**;
- a **Success**;
- a **Failure** that opens a story, not a game-over.

Mix fights, chases, an everyday chaos event (like a busy café day), and one tied to a big Scene.

## Endings

Write at most **8** Endings (the app refuses a 9th). Each has a name, when it is reached, and what the Epilogue should tell. Include:
- a bittersweet one;
- a "together" one;
- a "Rin keeps her own life" one;
- one Character-specific one;
- a bad one.

## Lore

Write a table with these columns: Name, Keywords, Text, and Mode.
- Use **Always** for the 2–3 facts every reply needs: the legend, the milestone clock.
- Use **Stay** for a fact that matters once raised.
- Use **Triggered** for the rest: places, factions, people offstage, magic rules, demi-humans, money (prices in copper and silver).

Any special rule the Narrator must follow goes in the Lore Text, e.g. Moonfox's "Eclipse Frenzy" says the user decides what Rin does.

## Places

Write 6–10 Places. Each has a name of at most a few words, and **looks** in a few words. The looks text is what a picture is drawn from, together with the name. The Judge is told these names and places the chat there. Start with Rin's home base. A Story takes at most 30 Places.

## App limits to check before showing the draft

- Endings: at most 8.
- Secret text: at most 1000 characters each.
- Opening question texts: at most 200 characters.
- Long text fields: at most 20,000 characters each.
- Places: at most 30, with unique names.
- The Role has its own picture slot (the Role image) and 21 Expressions. The Cover takes no picture of Rin.
- Emotions, the same 21 for everyone. The app's list is in `apps/api/src/model/story/emotion.ts`.
  - 15 everyday: joy, love, embarrassment, sadness, anger, fear, surprise, annoyed, thinking, smug, determined, worried, hurt, tired, proud.
  - 6 intimate: teasing, desire, flustered, longing, passion, afterglow.

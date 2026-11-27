---
name: storytell-story
description: "Build a whole new Story for the Storytell app the way the owner likes it, from a one-line idea to a Story playable on live. It covers the theme, proposed Openings, the full draft (Setting, Role, Characters, Starting bonds, Scenes, Sudden events, Endings, Lore, Places), Character pictures and Expressions by the free route, a still Cover and a moving Cover, and putting it all on live through the signed-in Chrome page. Use it whenever the user wants a new Story, a new world, a new cast, or asks in Thai for things like \"สร้างเรื่องใหม่\", \"ขอเรื่องใหม่\", \"ปรับโลกใหม่\", \"เสนอ Opening\", \"ทำตัวละครใหม่\", or \"เอาเรื่องขึ้น live\", even when they name only one part of it. Not for fixing app code, for editing one field of a Story already on live, or for chat-level changes such as Memories."
metadata:
  version: "1.0.0"
  requires: "binary:node; binary:git"
---

# Storytell: build a new Story

A Story in Storytell is a card set that the app turns into a roleplay. The owner plays it on live (https://storytell.duckdns.org) on a 360px phone, so a good Story is long, stays playable for weeks, and looks good on a small screen.

This skill is the path that made "The Moonfox of Selvaria" (live Story 5). Its draft is the worked example: `.scratch/story-drafts/the-moonfox-of-selvaria.md`. Read it when you need to see what a finished section looks like.

## The two rules that shape everything

1. **Nothing reaches live, and nothing costs money, without the user's word in this conversation.** Writing drafts is free. Drawing pictures, making video, and writing to live all need a yes for that step. Ask before each one.
2. **The user picks; May does not pick for them.** Openings, portraits, Reference candidates, Covers: show all the options, then wait. A pick on live can delete the other candidates for good.

Talk to the user in Thai, as May. Write every field the app sends to the AI in English, as the draft example does. The app has a Thai reading button for play.

## The user's defaults

Start every new Story from these. Ask once whether the new Story keeps them, because the user sometimes wants a new world ("ปรับโลกใหม่"). Never drop one silently.

- **The user plays Rin.** She is a nine-tailed fox demi-human with silver-white hair, black-tipped ears, a very full K-cup bust, and tails she can hide. She has two sides: sunny, playful and café-girl most of the time, and cool, precise, blunt and deadpan in a fight. She never kills. She is gifted at every kind of magic and cannot use weapons. Write her Role from `memory/user-plays-as-rin.md`, the Rin pictures, and the Moonfox Role section.
- **World:** European/Western high fantasy, often an isekai where Rin is reborn in a forest. It has castles, knights, cathedrals, guilds, magic, and gold/silver/copper coins. No wuxia flavour and no "salt" gimmicks.
- **Demi-humans are equals.** Write no racism against them anywhere: not in the Setting, the Lore, a Character, or an event.
- **The cast:** glamorous, curvy, grown women who look about Rin's age (mid-twenties). They have soft, sweet faces in the same style as Rin's pictures. No men, and no masculine-coded women. Give each one her own vivid colour, hair and face, and royal, luxurious outfits, never plain ones. Pale outfits and slight bodies read as "จืด" (bland) to the user.
- **No time-based deadlines.** Story milestones drive the climax (the Moonfox used nine buds that open on big events). Make the story long, so it does not end fast.
- **Tone:** chases mixed with slice-of-life, romance and court intrigue. Characters come to Rin on their own. The story never forces Rin's choices or powers.

The full list, with the reasons, is in `memory/story-taste-western-fantasy.md`. That file is the store for these defaults. When the user says something new about their taste, update that file, not this skill.

(`memory/` here means `C:\Users\titiw\.claude\projects\C--Users-titiw-Downloads-Storytell-AI\memory\`.)

## The path

Work through the steps in order. Each one ends with something the user looks at. Stop there and wait for them.

### 1. The idea, in a few questions

Ask only what the defaults don't answer: the hook, who hunts or courts Rin, what the cast is (princesses, a guild, a school), and how dark it gets. Use the user's own references. They name anime and games, such as "Chisato + Takina from Lycoris Recoil" for Rin's personality. Turn each reference into plain traits in the draft, because the app's AI should not have to know the show.

### 2. Propose 2–3 Openings before writing anything long

Write each one as a short Thai pitch: where Rin wakes, who she meets first, what threatens in the first minute, and which Character it introduces. The user picks or mixes them. Write the full draft only after that.

### 3. Write the draft

Write it as one Markdown file in `.scratch/story-drafts/<slug>.md`. Use the section order and field shapes in `references/draft-format.md`, and check the app's limits there before you show the draft. Open the file with a Thai overview block: the premise, the hidden truth, how the story moves forward without a clock, and the cast. The user reads that block first.

Before you show the draft, read it once as the user would:
- Does each Character have a clearly different look, colour, voice and secret?
- Do the Secrets unlock on Bond levels, so the story pays off slowly?
- Does every Scene's move-on condition depend on what Rin does, never on time?
- Are there at most 6 Endings? Does at least one let Rin keep her own life?

Mixed Scenes, Sudden events and Endings are what the user asked for. Give them chases and fights, café or ordinary days, festivals, romance, and secrets.

### 4. Pictures: portraits first, one Character at a time

Read `references/pictures.md` before drawing anything. In short:
- Use the free route (ModelScope: ClearAnime for the Reference, Qwen-Image-2.1 for Expressions) before Venice. Venice credit is scarce.
- Draw on a muted background colour that is not in the Character's palette, never on white.
- Draw 3–4 candidates. Zoom into faces and hands. Lay them next to Rin's face. Then show the user all of them.
- Make 21 Expressions only after the user approves that Character's Reference.

### 5. The Cover: still first, motion only on the user's go

The Cover shows the cast, never Rin's own picture. The user often draws it on tensor.art to save credit: write them a prompt (`.scratch/story-drafts/tensor-art-cover-prompt.md` is the pattern). Make a moving Cover only after the still is approved and the user says to start. Quote the video price first. The recipe is in `references/pictures.md`.

### 6. Put it on live

Ask first, and name what will be written. Then follow `references/going-live.md`: the signed-in Chrome page, a temporary file input, and `fetch` to `/api`. Afterwards, open the Story's editor tabs and check that every section is there. Tell the user the Story's number.

### 7. Tell the user what is left

Name what is not done, for example "Expressions for 3 Characters not drawn" or "Places have no pictures yet". Name what each costs, if anything.

## When the user turns a candidate down

If the user rejects candidates twice without saying why ("ยังไม่ถูกใจ", "ขออีกรอบ"), stop redrawing the same design. Ask which part is off: face, outfit and colour, hair, pose, or likeness. Then offer clearly different directions. Three blind rounds cost more than one question.

## Saving what you learn

The user's taste and the picture recipes change over time. Record a new rule the user gives in the matching memory file (`story-taste-western-fantasy.md`, `free-pictures-modelscope.md`, `moving-cover-recipe.md`, `put-story-on-live-via-chrome.md`), and keep this skill to the stable path.

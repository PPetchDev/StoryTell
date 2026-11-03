# How Zeta runs a Story

Research for ticket `.scratch/storytell-mvp/issues/01-zeta-how-a-story-runs.md`. Researched 2026-11-03.

## Summary

Zeta (Scatter Lab, Seoul) calls its unit of content a **Plot**, which matches our **Story**. A Plot has a world/story prompt (our Setting), one main Character and up to 20 sub-characters, a defined user role, and an authored **Intro** opening scene. Zeta has **no separate Narrator entity**. Each AI turn mixes narration and dialogue, voiced through the main Character's turn. The creator shapes the voice with a "Style" tab: POV, tense, length, dialogue versus action, pacing, difficulty, genre, and prose-style presets.

The model decides which Characters speak. Multi-character output is split into separate turns using an `@Name:` convention. Plot progression does not use ordered scenes. It uses an opening Intro plus optional AI-triggered "plugins": Quests, Sudden Events with turn-limited gauges, AI-suggested Endings, a story clock, BGM cues, and dice.

Long-chat memory rests on two things:

- **Bigger model context.** Zeta advertises this as "2x/4x memory".
- **Creator-authored, keyword-triggered "Sourcebook" (Lorebook) entries.**

I found no official user-visible, user-editable memory list.

Relationships are shown **explicitly**, through AI-updated Relationship Charts, Info Box "relationship/inner thoughts" fields, tier lists and Character diaries. That is the opposite of our hidden-Bond rule.

**Snapshots** are paid, on-demand images built from the Characters' profile images, the conversation, and the user's own chat-profile image. They are kept in a per-Plot Snapshot Library.

Creation is a long form with an AI assistant called **zelly**, which builds a Plot through conversation from "an idea, a vibe, and characters".

Most claims below come from Zeta's own support-site announcements, in English and Korean, and from its official Notion quick guide. Secondary sources are marked **[secondary]**.

### Source key

- **EN-n**: `https://support.zeta-ai.io/zeta/en/announcements/n` (official English announcement)
- **KO-n**: `https://support.zeta-ai.io/zeta/ko/announcements/n` (official Korean announcement, translated by me)
- **Guide-Chat**: https://mlpingpong.notion.site/Master-the-Art-of-Chatting-2778134480b981e7a17eff448f18c6c3 (official "zeta Quick Guide", linked from EN-5017)
- **Guide-Create**: https://mlpingpong.notion.site/Master-the-Art-of-Creating-2778134480b981cfb3e5fc85bf211033
- **AppStore**: https://apps.apple.com/us/app/-/id1619030760

The announcement pages are client-rendered. I read them through the site's public JSON (`https://api.zeta-ai.io/v1/announcements/<id>`), which is what the page displays.

## Vocabulary mapping

| Zeta term | Storytell term | Source |
|---|---|---|
| Plot (was "Character" until 2026-03-12) | Story | EN-9736, KO-9703 |
| Plot Overview / Plot Prompt (2,000 chars) | Setting | Guide-Create, EN-11654 |
| Main character + Multi-Character / sub-characters (up to 20) | Characters (cast) | Guide-Create |
| User's role field in the Plot | Role | Guide-Create |
| Chat Profile (up to 500 per user) | Persona | Guide-Chat, EN-7756 |
| Chatroom / saved chat (up to 100 saved per character) | Chat | Guide-Chat, KO-4258 |
| Sourcebook (was Lorebook) | Closest to Memory, but authored by the creator | EN-11886 |
| Relationship Charts ("Loveline" in Korean) | A visible Bond, which we avoid | EN-12872, KO-12871 |
| Snapshot | Snapshot | KO-2344, Guide-Chat |

## Findings by topic

### 1. Narrator voice

- **No dedicated Narrator Character appears in the official docs.** By default, any AI text without an `@Name:` tag is treated as the **main character's turn**. Narration and the main Character's speech share that bubble. (KO-3070)
- Creators "direct" the voice in the **Style** tab (EN-9109, beta at first, later extended to the free model in EN-11485):
  - **POV:** 1st, 2nd or 3rd. The default is 3rd.
  - **Tense:** past or present. The default is present.
  - **Reply length:** Short, Medium, Long or Auto.
  - **Narrative delivery:** more dialogue, normal, or more actions.
  - **Pacing:** Fast, Natural or Slow-Burn.
  - **World difficulty:** Easy, Average, Difficult or Nightmare.
  - **Genres:** up to 2.
  - **Storytelling style presets:** High Society, Noir, After Dark, Nostalgia, Blockbuster, Arcane, Manga-style or Impending Doom.
- The Intro (opening scene) can contain **narration**, up to 5 images, an info box, and the point at which the user picks a Chat Profile. Picking a profile replaces `{{user}}` with that profile's name. (Guide-Create, KO-5644)
- Users write scene description and actions between `*asterisks*`. (Guide-Chat)
- A zeta model update promised "no more one-sided narration": Characters reacting to and bouncing off each other, shorter and cleaner sentences, and better pacing, slow in tense moments and fast elsewhere. It also claims less "character breaking" (캐붕). (KO-9571)
- **[secondary]** Reviewers say replies are long and dramatic, and the model tends to steer the plot where the user didn't ask. Players reportedly start a message with `@:` to make it read as a narrator line. (RoboRhythms, 2026-10-20, https://www.roborhythms.com/zeta-ai-review/)

### 2. How multiple Characters take turns

- Multi-character chat became available to everyone on 2025-07-07. Before that, several Characters' lines were mixed into one message and hard to tell apart. The model was changed to "recognize new characters' appearance more flexibly and bring them in at the right moment". (KO-3070)
- **Turn-splitting convention:** writing `@Name:` mid-message splits the message into a new turn for that Character. Untagged Character text goes to the main Character's turn. User text is the user's turn. If the model gets a name wrong, the turn shows an empty profile, and the fix is to edit the name. (KO-3070)
- **The model decides who speaks.** The guide says which Characters appear "depends on context, so you can't always choose specific ones". Users can still "add or direct a specific character by typing an `@Name:` line", and can bring their own new Characters into the story. (Guide-Chat)
- Each sub-character has its own fixed settings, profile image and voice, and its own Intro and situational lines. Profile images show per Character in the chat. (KO-3202, Guide-Create)
- **Turn-level editing:** regenerate, delete and edit act on the **whole turn**. If several Characters replied in one turn, all of them are regenerated or deleted together. Manual edits use `@Name:` before each Character's part. (Guide-Chat)
- **[secondary]** Side Characters often appear unprompted and can be hard to write out of the story. (RoboRhythms)

### 3. How scenes and plot progress

- **There is no ordered, author-defined scene list.** Progress is: authored **Intro** opening, then free play, steered by Style **Pacing** and **World Difficulty**. (Guide-Create, EN-9109)
- Instead, creators turn on **plugins that the AI triggers from the conversation**:
  - **Sudden Event** (EN-12775). The creator describes a trigger scenario in one sentence, for example "when a character interrogates the protagonist". When the AI detects it, a goal and a gauge appear, for example "lower Suspicion below 20 in 3 turns". The gauge moves each turn, with an explanation of why. Hitting an EXTREME value means instant failure. Success, failure and how close the user came all change how Characters react afterward.
  - **Quests** (EN-12739). The creator can preload up to 8 quests. After that, the AI adds new quests and clears finished ones. The newest quest is pinned at the top of the screen, and the user can dismiss quests.
  - **Endings** (EN-12443, EN-12312). When the story "naturally approaches" a conclusion, the AI suggests an ending, or the user can tap "Finish the Story". The user gets an Ending Card and an Epilogue (paid), can "Continue After the Epilogue", and keeps an Ending Collection. Auto-suggestions can be turned off.
  - **Calendar & Clock** (EN-12576). The creator sets an in-story start date and time. The AI moves the clock forward as story time passes (sleep, travel, meals). If the clock drifts, the user mentions the time in chat to correct it.
  - **Dice events** (EN-12277). A d20 roll plus a bonus against a threshold, with crits, offered at key moments.
  - **BGM** (EN-12378). Up to 12 tracks. The creator gives each track a short text cue ("play during chill conversations…"), and the AI picks the track that fits the current scene.
  - **Event Cuts** (EN-12840). Creator-uploaded illustrations that unlock when the user reaches story milestones. Locked cuts are shown blurred in a collection.
- **Visual Novel Mode** (EN-13071, 2026-09-23) is a separate play mode. Backgrounds and Character expressions change automatically with the scene. Choices combine with free input, and new Characters can be brought in mid-story. Character outfits switch automatically from creator-written "when to wear" descriptions (EN-12180). **[secondary]** The AI generates an image for a new Character when one appears (Digital Today, https://www.digitaltoday.co.kr/en/view/107877/).
- **Response Options:** the AI proposes the user's next action or line. Only the "Sentence" format survives; "Keyword" was discontinued in June 2026. The user can always type directly instead. (EN-10594, EN-11287)
- **Side features that feed back into the story:** Texting Characters "off-screen", with the conversation then reflected in the story (EN-12277). zetagram, a fake social feed whose details "can be reflected in future conversations" (EN-12543). An anonymous message board written by in-world Characters (KO-12673). LIVE chat during in-story broadcasts (EN-12641). Most of these cost Pieces per use.

### 4. How it remembers long Chats

- **Model context as the product.** The premium model koji offers "up to 4x longer memory" and "automatically organizes and remembers key information from extended conversations" (EN-7987, KO-6172). luca is positioned as the model that "carefully remembers every setting and detail", including with several Characters present (EN-8978). The free zeta model was upgraded to "up to 2x memory" in March 2026 (KO-9571) and to 2x more referenced information per reply in September 2026 (KO-13003).
- **The mechanism is not disclosed.** "Organizes and remembers key information" suggests summarization, but **how memory works internally is unknown**. I found no Scatter Lab technical write-up.
- **Sourcebook (formerly Lorebook)** (KO-8548, EN-11886, EN-10132):
  - Creator-authored world entries linked to keywords. When a keyword comes up in the conversation, the AI pulls the entry in.
  - Can be shared between Plots and connected to them, up to 5 per Plot. Edits to a shared Sourcebook reach every connected Plot.
  - Zeta plans to extend it "beyond keyword-based behavior".
- **Zeta's own data on Sourcebook misuse:** creators had been using keywords like `.` or `*` to inject an entry into every message. Zeta says this crowds out conversation context. Plots that do it have a 5.1-percentage-point lower rate of play continuing past 10 minutes. Its advice: core settings go in the prompt, detail goes in keyword entries, and always-on rules stay short in the prompt or Style tab. (KO-10330)
- **Info Box** (EN-9604) tracks live story state below messages:
  - **Environment:** date, time, location, weather, scene.
  - **Per Character:** mood, condition, outfit, pose, goal, relationship, inner thoughts, inventory.
  - The creator chooses which fields appear.
- **User-editable memory: none found** in official sources. The user's tools are message edit, delete, regenerate, and "custom regen" with a one-line instruction (EN-10002), plus "restart from here" (KO-5875).
- Zeta's FAQ admits ongoing problems with "memory, context recognition, name mistakes, foreign-language outputs" (https://support.zeta-ai.io/zeta/en/faqs/17b6ad11-c6b8-453c-bd7c-59b8668a648d). It also admits regenerations come out too similar (https://support.zeta-ai.io/zeta/en/faqs/4fb67019-9d06-4c09-a124-e87702e9be4c).
- **[secondary]** Reviewers call memory the weakest area. A daily luca player reported forgetting after weeks. (RoboRhythms)

### 5. How relationships and affection evolve

- **Relationship Charts / Loveline** (EN-12872, KO-12871). The creator sets the starting relationship between Characters. "AI reads between the lines of your story to track relationships and automatically update where two characters stand." The user can check it any time from the `+` menu.
- **Explicit relationship state elsewhere:**
  - Info Box fields for "relationship" and "inner thoughts" per Character (EN-9604).
  - The **Tier List**, up to 5 creator-defined tiers. Characters are promoted or demoted automatically as the story goes, with in-chat notifications. (EN-12344)
  - **Character Diary**, a paid diary showing a Character's private feelings and off-screen decisions (EN-12277).
- **Characters react to neglect:** a Character who texts first and gets "left on read" may get upset (EN-12277).
- Style pacing includes "Slow-Burn" (EN-9109). **[secondary]** ITmedia says creators can set "how quickly the character opens up" (https://www.itmedia.co.jp/news/articles/2606/17/news020.html).
- **Intended personality change (our Arc): no official mechanism found.** Zeta's messaging is about *consistency*, meaning less character-breaking (KO-9571), not authored change. **Unknown.**
- **[secondary]** Repetitive scripts, such as bots turning possessive within minutes, are a common complaint (RoboRhythms).

### 6. In-chat image Snapshots

- **Launch:** beta on 2025-04-25 for some Characters (KO-2344). Extended to all Characters on 2025-05-13 (KO-2542). Became a standard, always-on feature on 2025-11-20. The per-Character opt-out was removed, but Snapshots are blocked when a profile image is unsuitable. (KO-6601)
- **Inputs:** "an image that fits the context of the conversation", built from the **Character's description and profile image** (KO-2344). The official guide says Snapshots are generated "based on character settings, story, and conversation". The user's own Chat Profile is included, which allows "two-shots" with a favourite Character (Guide-Chat). With multi-character Plots, several Characters' profile images can be used (KO-3202).
- **UX:** tap "Snapshot" on the left of the chat screen. The guide lists 15 Pieces per image; the price fell from 50 to 15 Pieces in September 2025 (KO-4522, Guide-Chat). Users can regenerate and save.
- **Timing:** originally 2–3 minutes, up to 5 (KO-2344). The App Store now says about 15 seconds (AppStore).
- **Snapshot Library:** per Plot, newest first, with download and sharing to Plot comments (EN-11751).
- **Rules:** Pieces are refunded if generation fails, but not for a poor-quality result. Once generation fails at a given point in a conversation, it can't be retried at that point (KO-2344). Generation uses an **external image API**, and part of the recent conversation is sent to it (KO-2344, KO-4522).
- **Related but different:** creator-made **Event Cuts**, which unlock at milestones (EN-12840), and Visual Novel Mode's automatic backgrounds and expressions (EN-13071).

### 7. How users create Stories, including AI-assisted creation

- **Creation sections** (Guide-Create):
  - Plot Overview (the story and world)
  - Main Character settings: personality, appearance, relationship to the user
  - Up to 20 sub-characters with fixed settings and images
  - The user's role
  - Intro: the opening scene, with narration, images and info box
  - Situational examples and speech style, which act as a "guidebook" when similar situations come up, with auto-generated samples available
  - View: cover, intro text, creator comment and hashtags, plus publishing settings
- **Limits:**
  - Text limits apply per section, not per field (Guide-Create).
  - In July 2026 the Plot Prompt went to 2,000 characters and Character profiles to 5,400 characters (EN-11654).
  - Up to 10 cover images and 5 images per Character, at a 3:4 ratio (KO-6766).
  - Fields can be filled in any order (KO-2146).
- **Extra tabs:** a **Style** tab (narration and pacing, section 1) and a **Plugins** tab (section 3) (EN-9109, EN-12775).
- **zelly, the AI creation assistant** (EN-10363, 2026-03-24): "All you need is an idea, a vibe, and characters you want to have and zelly will do the rest." As of 2026-10-08 it builds Story Chat Plots through conversation. The user tells zelly the genre, world, starting situation and Characters, and they settle them "one by one" until the Plot is done. Path: Create tab → `+` → "Make a Story Chat Plot with AI". (KO-13201)
- **Auto plot creation** was improved in May 2026 (EN-11023). Visual Novel Mode creation: "Even a vague idea is enough… from fleshing out your idea to generating character and background images" (EN-13071).
- **Character images** come from built-in image models with selectable art styles (EN-6007, EN-11023).
- **Speed:** the App Store says a Character can be made "in 1 minute" (AppStore).
- **Example of a real public Plot page:** About, Characters (five sub-profiles), connected Sourcebooks, Intro, and plugin badges such as "Sourcebook" and "Dice" (https://zeta-ai.io/en/plots/7fefdd8e-eafb-4f77-aef8-77ddae822b07/profile).

### 8. Chats, Personas and content policy (context for our open questions)

- **Chat management:**
  - "New chat" saves the current chat and starts fresh, up to 100 saved chats per Character, and "Continue" reopens one (Guide-Chat, KO-4258).
  - "Restart from here" branches from any message and auto-saves the original (KO-5875).
  - The Safe-mode moderation path can **reset a chatroom to its Intro** (KO-13333).
- **Personas:** a Chat Profile can't be switched mid-chat within a chatroom; the user starts a new chat to use a different one (Guide-Chat). The creator decides *when* in the Intro the profile is picked (KO-5644). This bears on our open question about when a Persona replaces a Role.
- **Content policy:** the default mode is all-ages. The FAQ declines 18+ sexual content (https://support.zeta-ai.io/zeta/en/faqs/5ab1fe0a-910f-4f46-954f-47bc237c8317). A verified-adult "Unlimit" mode relaxes some limits but still bars sexual content and minors (KO-3895, KO-12018). This is one reason Zeta's prompt and filter choices can't be copied directly for our adult-fiction scope.

## Patterns to copy / avoid for Storytell AI

### Copy

1. **Style controls as structured Story fields**, not free prose: POV (default 3rd), tense (default present), reply length, dialogue/action balance, pacing (including slow-burn), difficulty, genre. The Narrator prompt gets cleaner inputs, and they are easy to put in the AI Story-drafting form.
2. **`@Name:` turn-splitting in the model's output.** Have the Narrator emit labelled segments (narration plus `Name:` lines) and render each Character's line as its own bubble. Fall back to the narration segment when a name doesn't match the cast. Zeta's empty-profile bug shows this needs validation against the fixed cast.
3. **The Narrator decides who speaks, with no user pick.** Zeta does the same, which supports our out-of-scope decision on @mentions. Zeta's whole-turn editing rule ("edit applies to the entire turn") is a simple model for our MVP edit feature.
4. **Authored Intro as the opening scene,** with narration and the point where the Role or Persona is applied (`{{user}}` substitution).
5. **Split world knowledge by how often it is needed:** core Setting in the always-on prompt, detail in triggered entries, and always-on rules kept short. Zeta's 5.1-pp retention drop from "always-on" lore entries is real evidence against stuffing every fact into context.
6. **Turn-limited event mechanics,** trigger sentences that the AI detects, as a lightweight way to drive a Scene's goal. An optional Scene could carry a one-sentence entry condition and a goal. Zeta's Sudden Event, Quest and Ending suggestion are good patterns for "when does the plot move on".
7. **A light in-story clock** that the AI advances from narrated time and the user can correct by mentioning the time. Cheap continuity that also helps Memory.
8. **Snapshot inputs:** Character description and reference image, the current scene, and the user's Persona look. Keep a per-Chat Snapshot gallery, and handle a failed generation gracefully.
9. **Conversational AI Story drafting** like zelly: start from "an idea, a vibe, the characters", then settle Setting, cast and Intro one at a time, with every field editable afterward.

### Avoid

1. **Visible relationship meters** (Relationship Charts, tier lists, Info Box "relationship" and "inner thoughts", paid diaries). Our Bond must be shown only through behaviour. Track Bond as hidden state the Narrator reads, and never render it.
2. **Opaque, non-editable memory.** Zeta sells memory as model size ("2x/4x") and has no user-visible Memory list, and both its FAQ and reviewers name memory as the weak point. Our editable Memory list is a deliberate difference; keep it.
3. **"Consistency only" as the character model.** Zeta has nothing for intended change, so it can't tell an Arc from drift. We need an explicit Arc record so intended change is separate from loss of character.
4. **Model-driven Character intrusions and plot hijacking** (unprompted side Characters, steering against the user, repetitive possessive scripts). Constrain the Narrator to the fixed cast, and let pacing and Scene goals, not the model's whims, set the tempo.
5. **Feature sprawl and pay-per-use meta features** (zetagram, boards, texting, BGM, dice, outfits, endings, each paid). Most are engagement and monetization loops for a marketplace app. For a single-user MVP, at most an in-story clock and Scene goals are worth it.
6. **Snapshot pipelines that send chat to an external image API without the user knowing.** If we use a hosted image model, say clearly which provider gets the prompt. That provider must permit adult content (see the map's model-policy note).
7. **Locking the Persona per Chat with no explanation.** Zeta forbids switching mid-Chat. If we do the same, say so in the UI, and decide it on purpose in the open Persona question.

## Unknowns

- How Zeta's long-chat memory works internally: summarization, retrieval, or plain context length. Not disclosed.
- Whether Zeta has any hidden affection variable behind Relationship Charts, or derives the chart purely from the text each time.
- The exact Snapshot prompt and image model. Zeta says only that it uses an "external image generation API".
- Whether any Zeta model distinguishes a dedicated narrator voice internally. The `@:` workaround is reported only by secondary sources.

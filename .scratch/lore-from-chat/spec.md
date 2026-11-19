# Spec: Lore from a Chat

Status: ready-for-agent
Builds on: [Spec: Lore](../lore/spec.md), [Spec: Shared Lore](../shared-lore/spec.md), ["Previously on…"](../previously-on/spec.md) (an on-demand Chat call from the Chat menu)

Asked 2026-11-19, picked from a survey of features that need no Venice credit: "ทำข้อสองเลย" (build number two: AI-suggested Lore from what happened in a Chat).

## Problem Statement

A long Chat invents a lot of world: the tent's felt and lamps, how the tribe trades at the market, what a vigil is, the name of the river road. All of it stays in that one Chat's history, Story so far and Established facts. The Story's Lore never learns it, so a second Chat of the same Story (or a Branch, once the history is summarised away) doesn't know it, and the Narrator invents it again, differently. Writing those entries by hand means rereading the Chat.

## Solution

**Lore from this Chat**, in the Chat menu. It asks the background model once to read what the Chat has established about the world and suggest new Lore entries: a name, keywords and a short text each. The sheet lists them; the user adds the ones they want to the Story's own Lore with one tap each, or leaves them. Nothing is added without a tap. Added entries are ordinary Lore: edited and removed in the Story editor's Lore tab as any other.

## User Stories

1. As a player, I want to ask for Lore suggestions from the Chat I'm in, so that the world it has made up isn't lost to the Story.
2. As a player, I want to see each suggestion's name, keywords and text before it goes anywhere, so that nothing wrong enters the Story.
3. As a player, I want to add a suggestion with one tap, so that keeping the good ones is quick.
4. As a player, I want to leave the ones I don't want, so that the Story's Lore stays mine.
5. As a player, I want suggestions to skip what the Story's Lore already has, so that I'm not offered duplicates.
6. As a player, I want suggestions to be lasting truths of the world (places, peoples, customs, objects), not events or feelings, so that Lore stays common knowledge as it is meant to be.
7. As a player, I want suggestions never to give away a Character's secrets or describe the Characters or my identity, so that those stay on their cards.
8. As a player, I want to be told plainly when there is nothing new to add, so that an empty answer doesn't look like a failure.
9. As a player, I want it to cost little, so that I can ask whenever a Chat has grown.
10. As a player, I want a failed call to say so and offer Retry, so that I can try again.
11. As a player, I want added entries to work at once in every Chat of the Story, so that the next turn already knows them.

## Implementation Decisions

- **One call, on the background model (DeepSeek V4 Flash), kind `lore_suggestions`.** No table: the suggestions are answered and forgotten; an added one becomes a Lore entry through the Story's existing "add Lore" endpoint.
- **Endpoint:** `POST /stories/:storyId/chats/:chatId/lore-suggestions` answers `{ suggestions: [{ name, keywords, text }] }`, possibly empty. A Chat with fewer than 2 Messages is refused with a typed error (nothing to read yet).
- **What the call reads:**
  - the Setting;
  - every Lore entry the Story reads (its own and its linked sets'), as names and texts, so it can leave out what is there;
  - the Cast's and the worn identity's names, to keep them out of Lore;
  - the Story so far, the Chapters' summaries, the Established facts and the Places the Chat has been;
  - the newest Messages, up to about 8,000 tokens.
- **What it is told:** suggest up to 6 entries, each a lasting truth of the world that the Chat has established and that anyone living there would know: places, peoples, customs, institutions, objects, foods, words. Not events, not how anyone feels, not a Character's secret or private knowledge, not entries about the Characters or the user's identity themselves, nothing the Lore above already covers. Text in one to three plain sentences, in the story's own words; keywords for other names and plurals (the name already counts). JSON: `{"entries":[{"name":"…","keywords":["…"],"text":"…"}]}`.
- **What the server keeps of the answer:** entries with a name and text; at most 6; a name that matches an existing Lore entry, a Character or the identity (ignoring case) is dropped; keywords trimmed, blanks and duplicates dropped, at most 20 of at most 100 characters. Unreadable JSON is an `UnparseableOutputError`, like other background calls.
- **Web:** the Chat menu's "Lore from this Chat" (sub: "New world details for the Story's Lore") opens a sheet. It asks at once and shows "Reading the Chat…"; then a card per suggestion: the name, its keywords and the text, and **Add to Lore**. Added, the button reads "Added" and is disabled. Empty: "Nothing new for the Lore in this Chat yet." An error shows its message and Retry. A link at the foot opens the Story editor's Lore tab.
- **Who:** whoever may edit the Story's Lore. The add goes through the existing endpoint and its checks.
- **Usage:** the kind shows on the Usage page as "Lore suggestions".

## Testing Decisions

- API (vitest, fake gateway): the prompt carries the Setting, the existing Lore names, the Facts, the Places and the newest Messages; the answer is parsed and filtered (duplicates of Lore, Characters and the identity dropped, keywords cleaned, at most 6); fewer than 2 Messages is refused; the UsageRecord's kind. Prior art: `test/recap.spec.ts`.
- e2e (Playwright, fake gateway): the menu item opens the sheet, suggestions show, Add puts one in the Story's Lore (seen in the Story editor), the empty answer's line. Prior art: `e2e/previously-on.spec.ts`.
- A real-model check on a copy of live Chat 2.

## Out of Scope

- Suggesting changes to existing entries, or entries for a Lore set.
- Adding to Lore without a tap, or on a schedule.
- Reading the whole history of a very long Chat: the Story so far stands in for what came before the newest Messages.

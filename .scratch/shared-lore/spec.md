# Spec: Shared Lore

Status: ready-for-agent
Builds on: [Spec: Lore](../lore/spec.md) (the Lore entry and how prompts choose entries), [Spec: Lore triggers](../lore-triggers/spec.md) (its trigger settings), [Spec: Accounts](../accounts/spec.md) (what belongs to whom)
Prior art: zeta's Sourcebook (docs/research/zeta-how-a-story-runs.md, section 4): creator-written world entries that "can be shared between Plots and connected to them, up to 5 per Plot. Edits to a shared Sourcebook reach every connected Plot."

Built 2026-11-15.

## Problem Statement

Lore belongs to one Story. An author who tells several Stories in the same world writes its places, peoples and customs again in each, and a correction in one is a correction to remember in all the others. Duplicate copies the Lore, which makes the second problem worse: the copies drift apart from the day they are made.

## Solution

A **Lore set**: Lore kept apart from any one Story, belonging to the Account, and linked to each Story that needs it. A Story reads the entries of the sets it links exactly as it reads its own. A change to a set, made from any Story that links it, is the change in all of them.

Sets are made, linked, edited and removed on a Story's Lore tab, under "Shared Lore". A Story with Lore of its own can move it into a new set in one step, so an existing world can be shared without retyping it.

## User Stories

1. As an author, I want to keep a world's Lore in one place, so that every Story set there reads the same facts.
2. As an author, I want to link a set to a Story, so that the Story gets all of it at once.
3. As an author, I want a change to a set to reach every Story that links it, so that I correct a fact once.
4. As an author, I want to see how many Stories a set is used by before I change or delete it, so that I know what I am touching.
5. As an author, I want to move a Story's own Lore into a new set, so that a world I already wrote can be shared.
6. As an author, I want to unlink a set from one Story without losing it, so that the other Stories keep it.
7. As an author, I want to delete a set for good, and be told what goes, so that I can clear out a world I no longer use.
8. As an author, I want a Story to keep Lore of its own beside the sets, so that what is true only in that Story stays there.
9. As an author, I want a set's entries to have every setting a Story's own have, so that nothing is lost by sharing.
10. As an author, I want a copy of a Story to link the same sets, so that the copy stays in the shared world.
11. As a player, I want a Chat to read a linked set's entry when it comes up, like any Lore, so that sharing changes nothing in play.
12. As a Member, I want my Lore sets to be mine alone, so that no other Account can see, link or change them.
13. As the owner, I want sharing to add no model call, so that a turn costs what it did.

## Implementation Decisions

- **A Lore set belongs to the Account**, with a name (which may be blank, and then shows as "Lore set"). Its entries are ordinary Lore entries: the same table and the same fields, each naming its set where a Story's own entry names its Story. An entry is one or the other, never both.
- **A Story links up to 5 sets**, in an order the author gives. The link is replaced as a whole list (`PUT /stories/:storyId/lore-sets`), which is how one is linked, unlinked and reordered; a set left out is unlinked and kept. Only the Account's own sets can be linked; another Account's answers as missing.
- **Changed only through a Story that links it.** A new set is made from a Story and linked to it (`POST /stories/:storyId/lore-sets`); its name, its entries and its deletion go through `…/lore-sets/:setId` under a Story that links it, and each write answers with that whole Story, like every other part of the editor. Deleting a set deletes its entries and unlinks it everywhere. A set no Story links can be linked again from the picker; it has no other way to be changed.
- **Moving a Story's Lore.** `POST /stories/:storyId/lore-sets` with `moveLore` makes the set from the Story's own entries: the same rows, with their ids and their order, now the set's. What the Story's prompts read is the same before and after.
- **The Story's answer** carries `loreSets`: each linked set with its name, its entries and `usedBy`, how many Stories link it. `GET /lore-sets` lists the Account's sets for the picker: name, how many entries, and the Stories that link each.
- **Prompts read one list.** The Story's own entries, then each linked set's, set by set in link order. Everything that chooses Lore reads that list through the one function it already used: the turn, Lore in play, Suggested replies, Write for me, the Story so far's reserve and the Snapshot writer. Keywords, patterns, second keywords, Stays for, groups, chance and the 1,500-token cap work across the whole list, so an entry of a set and one of the Story's own can share a group or bring each other in. No call is added and nothing is stored per Chat.
- **Duplicate** links the copy to the same sets and copies nothing of them. Deleting a Story unlinks it and leaves the sets.
- **A Character card** written from a Story carries the linked sets' entries with the Story's own, since a card must stand alone. Importing a card writes a Story's own Lore, as before.
- **The Story assistant and AI drafts** read and write a Story's own Lore only. They are not shown a linked set and cannot change one.
- **The screen.** The Lore tab has "Shared Lore" under the Story's own entries. Each linked set is a block with its name, how many Stories use it, its entries in the same card as the Story's own, "+ Add entry", "Unlink", and "Delete set", which asks first and says how many entries go and from how many Stories. Removing an entry of a set used by more than one Story says so. Below: "+ New Lore set" and "Link a Lore set" side by side; the second opens a sheet of the Account's other sets with what each holds and who uses it.
- **Changed 2026-11-16 (UI audit M3, M4, M5, L2).** When the Story has Lore of its own, "Move this Story's Lore into a set" stands at the top of Shared Lore, right under that Lore, and asks first; it was "Share this Story's Lore" at the foot, which read as sharing with other people. "Unlink" acts at once and then offers an Undo that links the set again where it was; "Delete set" stands at the other end of its row. A set's add button reads "+ Add entry" (its name for a screen reader still names the set).

## Testing Decisions

- API (`apps/api/test/shared-lore.spec.ts`): the order prompts read, as pure logic; then through HTTP with two Accounts and the fake gateway: making a set, its entries with the same cleaning and refusals as a Story's own, renaming, the picker's list; one set in two Stories, an edit through either, unlinking, Duplicate, deleting a Story, deleting the set; moving a Story's Lore, twice; the limit of five, a repeated id, another Account's set, an unknown one; a Chat's prompts with an always-on entry, both kinds coming up together, Lore in play, an edit made through another Story, and unlinking; and a Character card carrying a set's entries.
- Browser (`apps/web/e2e/shared-lore.spec.ts`, phone size): a set made, named and given an entry in one Story, linked from another through the picker, edited there for both, unlinked and deleted with its warning; a Story's own Lore moved into a set, and a Chat of another Story that links it told the entry that came up. The Shared Lore section and the picker were checked with axe in both themes by hand while building; that check is not in the spec file, since the axe package is not one of the project's dependencies.

## Out of Scope

- A page of Lore sets apart from a Story, and changing a set that no Story links.
- Moving single entries between a Story and a set, or between sets, and copying a set.
- Sharing a set with another Account.
- Reordering a Story's linked sets on the screen (the API takes an order; the screen links in the order made).
- The Story assistant and AI drafts writing to a set.
- Shared Documents: a Document still belongs to one Story.

## Further Notes

- While checking the page with axe, the Story editor's tabs were found to fail "label in name" when a tab has fields still to fill in: the tab shows a count beside its name, and its accessible name says "has missing fields (n)" instead. It is older than this work and was not changed with it; it was fixed straight after, on the user's ask: the tab's name is now the words on it and then what the number means ("Scenes 1 still to fill in").

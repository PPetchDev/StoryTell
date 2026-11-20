# Role sections

Status: ready-for-human

The Role had a Name, one Description box and up to six Stats. Authors want to write their part as
freely as a Character: their own headings (Appearance, Outfit, Powers, Past…) with as much text as
they like under each, in their own order. The user asked for the Role to be "as free as possible"
and chose free headed sections over fixed Character-style boxes, a Role picture or looser Stats.

## Words

- **Role section**: one headed block of free text on the Role (CONTEXT.md, "Role section").

## Decisions

1. **Stored on the Role as one ordered list**, a `jsonb` column `role.sections` (default `[]`),
   each `{ heading, text }`. Written whole by `PATCH /api/stories/:storyId/role` with
   `{ sections: [...] }`, like the Stats; leaving `sections` out changes nothing.
2. **Rules for the list**, each refusing the whole list with `422.003.042`
   `InvalidRoleSectionsError` (nothing changes): at most 20 sections; a heading is one line and
   at most 60 characters, counted as whole characters (an emoji is one). A heading may be empty
   or repeat; text may be empty. The editor saves every section it shows, so nothing typed is
   lost when the editor reads the Story back (after a Rewrite, say).
   Text is trimmed at its ends and at most 20,000 characters (more is a `400`, as for every
   editor field). Shape errors are `400`.
3. **What the prompts read.** Wherever the Role's Description reaches a prompt (the identity
   layer and everything else that reads the worn identity), it now reads the Description and then
   each section with text as its own paragraph, `Heading: text`, or the text alone when it has no
   heading. A section with no text adds
   nothing, so a Role with no sections reads exactly as before. A worn Persona has no sections.
4. **Placeholders** from the Opening questions are filled in section headings and texts too, the
   same way as in the Role's Name and Description. The editor counts them as used.
5. **Carried along**: Duplicate copies the sections. A Character card's Storytell block writes
   `role.sections` only when there are some (as written, placeholders kept, the Role's name as
   `{{user}}` in headings and texts alike), and importing a card reads them back: headings made
   one line and cut to 60, wholly empty sections dropped, past 20 listed under "Won't come along". The Story-drafting prompt lists them only when there are some.
6. **The editor**: a "Your own sections" card on the Role tab, under the Description and above
   the Stats. "+ Add a section" (up to 20), each with an optional Heading and a multi-line Text,
   Up / Down, and Remove with Undo. The list is saved whole as typed. The Opening questions card
   counts a placeholder as used only in sections with text, since only those reach a prompt.

## Not in scope

- The Story assistant's rewrite of a single section (it rewrites the Name and Description).
- A picture for the Role, more Stats, or a wider Stat range (offered, not chosen).

# Spec: Persona image

Status: ready-for-agent
Builds on: [Spec: Storytell AI MVP](../storytell-mvp/spec.md) (Personas, the image folder), [Spec: Story cover](../story-cover/spec.md) (a picture uploaded from the phone, which its owner owns), [Spec: Accounts](../accounts/spec.md) (whose images are whose)
Prior art: zeta's Chat Profile, whose picture stands for the user in a chat (docs/research/zeta-how-a-story-runs.md, section 6).

Built 2026-11-15.

## Problem Statement

Every Character has a face beside their lines. The user has a letter in a circle, whichever Persona they wear. A Persona is the user's own reusable self, with a name and a description, but nothing to look at, so in a Chat the one person who is always there is the one with no picture.

## Solution

A Persona can have a picture, uploaded from the phone on the Personas page. In a Chat, the user's lines written as that Persona show it, round, where the initial was. A Persona without one, and the Story's Role, show the initial as before.

## User Stories

1. As a player, I want to give a Persona a picture, so that my side of the Chat has a face.
2. As a player, I want my lines in a Chat to show the picture of the Persona I wore when I wrote them, so that a Chat where I changed Persona still reads right.
3. As a player, I want to change or remove the picture, so that I am not stuck with one.
4. As a player, I want a photo from my phone to lose where it was taken before it is stored, so that a selfie gives nothing away.
5. As a player, I want the picture to go when I delete the Persona, so that nothing of it is left behind.
6. As a Member, I want my Persona's picture to be mine alone, so that no other Account can see or change it.
7. As a player, I want a file that is not a picture to be refused with the reason, so that I know why nothing happened.

## Implementation Decisions

- **The Persona owns its picture.** One column on the Persona: the picture's path in the image folder, or none. The file is `personas/persona-<id>/picture-<random>.<ext>`, a fresh name for each upload so a browser never shows the one it replaced. Replacing it, clearing it and deleting the Persona each delete the file. The Persona's answer carries `imagePath`.
- **Upload.** `PUT /personas/:personaId/image`, a multipart form with the picture as `image`, at most 15 MB, PNG, JPEG or WebP by its bytes (never by its name), answered with the Persona. `DELETE /personas/:personaId/image` clears it, and is not an error when there is none. The errors are the image ones already catalogued: no file `400.002.008`, not a picture `415.002.009`, too large `413.002.010`.
- **The photo is made ready in the browser first**, exactly as a Cover's is: turned upright, cut down to 2,048 pixels on its long side and re-encoded as JPEG, which drops its metadata. A file the browser can't read is sent as it is, and the API says whether it can use it.
- **Whose it is.** A path under `personas/persona-<id>/` is served only to the Account that owns that Persona; to anyone else it is not found, as with a Story's images. Any other path under `personas/` is served to nobody.
- **In a Chat.** The Chat's answer carries `personaImages`: the pictures of the Personas it shows, which are the worn one and those its User Messages were written as, where the Persona still exists and has one. A User Message already carries the Persona it was written as, so each of the user's lines looks its own picture up. A line written as the Role, or as a Persona since deleted or without a picture, shows the initial. The line being sent shows the worn Persona's picture at once.
- **How it is drawn.** Beside a line: 36 px, round, the middle of the picture filling the circle, from the 320 px thumbnail the API already makes. On the Personas page: 64 px, the same way, with "Add a picture" or "Change picture" and "Remove picture", which asks first. There is no crop to choose: a Character's Portrait is a chosen square of a tall Reference image, where a Persona's picture is whatever the user took, shown from its middle.
- **No model reads it.** The picture is never sent to a text or image model, and a Snapshot is still seen through the user's eyes, without them in it.

## Testing Decisions

- API (`apps/api/test/persona-image.spec.ts`): upload, the type read from the bytes, the list and the Persona answering with it, replacing (one file left), a rename keeping it; the three refusals and an unknown Persona, with nothing written; clearing twice and deleting the Persona; two Accounts, where the other can neither read nor change it and a stray path is nobody's; and a Chat's `personaImages` through wearing, a Message written, a swap to a Persona without a picture, back to the Role, and the picture cleared.
- Browser (`apps/web/e2e/persona-image.spec.ts`, phone size): adding a picture and seeing it load, a reload, the user's line in a Chat that wears the Persona showing it at 36 px from the thumbnail, removing it and the initial coming back; and a file that is not a picture being refused in place. The Personas page and the Chat were checked with axe in both themes by hand while building, which found the two picture buttons named without the words on them; that is fixed. The check is not in the spec file, since the axe package is not one of the project's dependencies.

## Out of Scope

- A picture for a Story's Role.
- Drawing a Persona's picture with the image model, and choosing which part of it shows.
- The user in a Snapshot, and the picture reaching any model.
- The picture in the identity swap menu, the Visual novel view, the Transcript and the Dashboard.

## Further Notes

- Not tried on a real phone: the file chooser there offers the camera and the photo library, which the browser tests can't show.

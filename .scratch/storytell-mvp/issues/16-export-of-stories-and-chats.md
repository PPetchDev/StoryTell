# Export of Stories and Chats

Type: grilling
Status: wontfix
Blocked by: 10, 11
Part of: [Map: Storytell AI MVP](../map.md)

## Question

Beyond the daily disaster backup in [Hosting and access](10-hosting-and-access.md), does the user need to export, and maybe import, their own Stories and Chats? If so, what does an export hold, at what grain (one Story with its Chats and Gallery, or the whole app), in what format, and what happens on import when the same Story already exists?

Constraint: data shape — see [Data model](11-data-model.md) and its [sketch](../assets/11-data-model.md). An export would contain the Story with its Role, Characters, Scenes, starting Bonds and Reference images, plus each Chat's Messages, Memory, change history and Snapshots. Image files sit on disk under paths relative to the image folder, and Personas and Settings belong to the app, not to a Story.

## Out of scope

Grilled 2026-11-03. No user-facing export or import is needed in the MVP. The daily disaster backup from [Hosting and access](10-hosting-and-access.md) covers recovery and moving to another PC, so this ticket is closed as out of scope, not resolved.

Each use case the user considered:

- **Recovering a deleted Story or Chat:** the confirmation before delete is enough. Undoing a deletion means restoring the whole app from last night's backup, which also loses that day's play in other Chats. The user accepts this. A Trash is not wanted.
- **Reading a Chat outside the app** (for example on a phone while the PC is off): not needed. A one-way "download a Chat as text" could be added later without touching the data model.
- **Moving to a new PC or reinstalling Windows:** restore the whole backup (database dump and image folder) onto the new machine. There is no in-app import. The spec should write down the restore steps and have them tried once, so the backup is known to work.
- **Using Characters in other apps** (Tavern character cards for SillyTavern and similar), in either direction: not wanted. A Story's shape (Role, Scenes, Arc directions, StartingBonds) does not map onto a card, and sharing is already out of scope.
- **Trying a variant of a Story without changing its existing Chats:** not wanted in the MVP. If it is ever wanted, it should be a Duplicate Story button inside the app, not an export and re-import.

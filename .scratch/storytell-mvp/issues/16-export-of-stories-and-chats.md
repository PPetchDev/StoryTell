# Export of Stories and Chats

Type: grilling
Status: open
Blocked by: 10, 11
Part of: [Map: Storytell AI MVP](../map.md)

## Question

Beyond the daily disaster backup in [Hosting and access](10-hosting-and-access.md), does the user need to export, and maybe import, their own Stories and Chats? If so, what does an export hold, at what grain (one Story with its Chats and Gallery, or the whole app), in what format, and what happens on import when the same Story already exists?

Constraint: data shape — see [Data model](11-data-model.md) and its [sketch](../assets/11-data-model.md). An export would contain the Story with its Role, Characters, Scenes, starting Bonds and Reference images, plus each Chat's Messages, Memory, change history and Snapshots. Image files sit on disk under paths relative to the image folder, and Personas and Settings belong to the app, not to a Story.

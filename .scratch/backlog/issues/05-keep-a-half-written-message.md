# Keep a half-written message

Type: task
Status: needs-triage
Needs: no model

## The idea

The text in the composer is kept on the phone for each Chat, so it is still there after the phone closes the app or the user switches Chats. Nothing kept this way ever sends itself (the MVP's rule against queued sends still holds).

Evidence it is missing: the box's text lives only in memory (apps/web/components/chat/chat-screen.tsx).

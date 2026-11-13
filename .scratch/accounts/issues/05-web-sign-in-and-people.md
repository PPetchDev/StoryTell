# Web: Supabase sign-in screen, People page, Owner-only Settings

Type: task
Status: ready-for-human
Blocked by: 03, 04
Part of: [Spec: Accounts](../spec.md)

## What to build

- Sign-in screen: Continue with Google, email + password (supabase-js, PKCE), a small "Owner password" link for the backup; clear messages for not-on-the-list and disabled.
- Settings → People (Owner only): add email with a cap, change cap, disable, remove, spend this month.
- Settings hides Owner-only cards from Members; Usage shows a Member their own spend and cap; a cap-reached message in the Chat.

## Acceptance criteria

- [x] e2e: the Owner adds a Member; the Member (test token) sees an empty Story list and can't reach the Owner's Story.
- [x] e2e: a Member doesn't see Models/Sampling/People.
- [ ] Checked by eye on a phone: Google sign-in from the installed PWA (iPhone may finish in Safari).

## Left for a person

Google sign-in end to end needs a real Supabase project and Google OAuth client, and the iPhone PWA check needs the phone. Everything else is done and covered by `apps/web/e2e/accounts.spec.ts`.

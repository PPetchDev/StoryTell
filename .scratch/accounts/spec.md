# Spec: Accounts (Owner and Members)

Status: ready-for-agent

## Problem Statement

Storytell signs in one person with one shared password (`.scratch/sign-in/spec.md`). The Owner wants friends to play too, each with their own private Stories and Chats, signing in with Google or an email and password, without letting strangers in and without friends running up the Owner's OpenRouter and Venice bill.

## Solution

Accounts. The Owner adds a friend's email in Settings → People and gives them a monthly spending cap. The friend, a Member, signs in through Supabase Auth (Google, or an email and password the Owner creates for them in the Supabase dashboard). Storytell's API checks the Supabase sign-in once, matches the email to the People list, and from then on uses its own session cookie. Everything a person makes (Stories and all inside them, Personas, app-wide Saved replies and Replace rules) belongs to them and is invisible to everyone else. The Owner keeps the Models, Sampling and credit settings for everyone, sees everyone's spending, and keeps the old owner password as a backup way in.

## User Stories

1. As the Owner, I want to add a friend by email, so that only people I chose can sign in.
2. As the Owner, I want to set each Member's monthly spending cap in US dollars, so that no one can run up my bill.
3. As the Owner, I want to raise or lower a cap at any time, so that I can give someone more room this month.
4. As the Owner, I want to disable a Member without deleting their Stories, so that I can pause their access and bring it back.
5. As the Owner, I want to remove a Member, so that they can never sign in again.
6. As the Owner, I want to see each person's spending this month, so that I know where my credit goes.
7. As the Owner, I want my existing Stories, Chats, Personas, Saved replies and Replace rules to stay mine, so that nothing changes for me.
8. As the Owner, I want to keep my owner password as a backup sign-in, so that I can get in even when Supabase is down or paused.
9. As the Owner, I want to be the only one who sees and changes Models, Sampling, credit thresholds and the backup status, so that costs stay predictable.
10. As a Member, I want to sign in with Google in one tap, so that I need no new password.
11. As a Member, I want to sign in with the email and password the Owner set up for me, so that I can play without a Google account.
12. As a Member, I want my Stories, Chats and Personas to be mine alone, so that no one else reads them.
13. As a Member, I want my own Saved replies and Replace rules, so that my shortcuts don't mix with anyone else's.
14. As a Member, I want to see how much of my monthly cap I have spent, so that I am not surprised.
15. As a Member, I want a clear message when my cap is reached, so that I know why sending stopped and that it resets next month.
16. As a Member, I want my Chats to keep working while background calls finish, so that a cap reached mid-turn never leaves a Chat broken.
17. As anyone, I want to stay signed in on my phone for months, so that the app opens straight into my Stories.
18. As anyone signing in with an email the Owner hasn't added, I want to be told I'm not on the list, so that I know whom to ask.
19. As the Owner developing locally, I want dev and tests to run without Supabase, so that local work needs no sign-in.

## Implementation Decisions

- **Domain terms** (CONTEXT.md): Owner, Member, Account, Monthly cap.
- **Account table** `app_user`: id, email (unique, compared lowercase), Supabase user id (nullable, unique, bound at first Supabase sign-in), role (`owner` or `member`), Monthly cap in USD (null for the Owner: no cap), disabled flag, created time. Exactly one Owner.
- **Owner bootstrap.** A migration creates the Owner account (from `OWNER_EMAIL` when set, else a placeholder email the Owner can change) and gives it every existing Story, Persona, Saved reply, Replace rule and usage record. Settings stay one row for everyone, set by the Owner.
- **Ownership.** `user_id` (not null) on `story`, `persona`; on `saved_reply` and `replace_rule` (app-wide rows only carry meaning, Story rows follow their Story); and on `usage_record`. Everything else is reached through a Story and follows it.
- **One check, at the Story.** Every Story load (`findFull`, `exists`, `findAllFull`, creation, duplication, drafting, card import) is scoped to the current Account. Someone else's Story answers `404` exactly as a missing one, so ids reveal nothing. Personas, Saved replies and Replace rules are scoped the same way.
- **Current Account.** The sign-in guard puts the Account on the request, and an interceptor runs the handler inside an AsyncLocalStorage scope holding it (Express middleware would lose the scope across the body parser), so background work a request starts (Judge, Memory, Story so far, Snapshots) runs as the same Account and its usage records carry its id. Work with no request (boot-time backfills) runs as the Owner.
- **Session cookie v2.** `v2.<accountId>.<expiry>.<HMAC>`, keyed from `SESSION_SECRET` (at least 32 characters; required with `SUPABASE_URL`). An install with the owner password alone and no secret keys it from the password, as before, so it needs no new setting. Disabled or removed Accounts are refused on every request, so disabling takes effect at once. v1 cookies are refused (everyone signs in once more).
- **Sign-in is on** when `LOGIN_PASSWORD` or `SUPABASE_URL` is set; off otherwise, and then every request is the Owner (dev, tests). The `HOST` rule from the sign-in spec stays.
- **Owner password.** `POST /api/auth/login { password }` signs in as the Owner only, with the existing throttle.
- **Supabase sign-in.** `POST /api/auth/supabase { accessToken }`:
  - verifies the token against `SUPABASE_URL/auth/v1/.well-known/jwks.json` (ES256 or RS256; issuer `SUPABASE_URL/auth/v1`; audience and role `authenticated`; not anonymous; not expired);
  - finds the Account by Supabase user id, or else by email (binding the id on first sign-in); an email not on the People list, or a disabled Account, is refused with its own code;
  - binds by email only when the email is proven: the Supabase user has a Google identity (Google checked the address), or the Owner set `SUPABASE_SIGNUPS_CLOSED=true` after turning off "Allow new users to sign up" in Supabase, so only users the Owner made there exist. Otherwise anyone could make a Supabase user with a listed email (with "Confirm email" off) and take that Account;
  - never binds the Owner by email unless `OWNER_EMAIL` names it: the placeholder email is no one's;
  - reads the project's keys again for an unknown key id at most once a minute, one read at a time, with a 5-second timeout, so made-up key ids can't make the API fetch on every request;
  - sets the session cookie. The API never calls Supabase again for that session.
- **Monthly cap.** Before any paid call made as a Member (text, image, speech, transcription, embedding), the gateway compares the Member's spend since the first of the month (UTC) with their cap and refuses with a typed error when it is reached. A call already running finishes. Background calls of a turn already sent are not refused, so a Chat never breaks halfway (story 16); the next send is.
  - A turn's own call is checked at the send, before the user's Message is saved, and let through at the gateway, so a refused send never leaves a Message with no reply.
  - At most 4 of a Member's paid calls run at once (`429.010.013` past that). Spend is recorded when a call ends, so without the limit many requests fired together would all pass the check.
  - `memory_embedding` stays uncapped even when a Member's own Memory edit starts it: an embedding costs a millionth of a dollar.
- **Pages for Documents.** Members can fetch web pages into a Document, so the address rule refuses private, shared (Tailscale's 100.x), link-local (the cloud metadata address), loopback, multicast and unspecified addresses, written out or resolved by DNS, on every redirect hop.
- **Owner-only.** Changing Settings (Models, Sampling, credit caps and thresholds), the backup status, People, and everyone's usage answer `403` to a Member. Reading Settings stays open: the app reads the Models and sizes from it. A Member's Usage page shows only their own spend and cap. Voices stay shared.
- **Images.** Image paths stay unguessable (random token); in addition, a path under `snapshots/story-<id>/` or another Story folder is served only to that Story's Account.
- **Web.** The sign-in screen offers Continue with Google and email + password (supabase-js, PKCE), and keeps the owner password behind a small link. Settings shows People (Owner only). The Settings page hides Owner-only cards from Members.
- **Config.** `SUPABASE_URL`, `SUPABASE_ANON_KEY` (public by design; the API hands both to the web app in `GET /api/auth/status` under `methods.supabase`, so the web build needs no Supabase settings), `SESSION_SECRET`, `OWNER_EMAIL`.
- **Errors (domain 010).** `401.010.004` Supabase token invalid, `403.010.005` not on the People list, `403.010.006` Account disabled, `403.010.007` Owner only, `409.010.008` email already listed, `402.010.009` Monthly cap reached, `404.010.010` Supabase sign-in not set up, `422.010.011` the Owner can't be disabled or removed, `404.010.012` person not found, `429.010.013` too many of a Member's calls at once, `403.010.014` an email + password first sign-in that can't prove its email.

## Testing Decisions

- External behaviour through the existing seams: HTTP through the API test harness, pure functions, and Playwright e2e. Prior art: `apps/api/test/sign-in.spec.ts`.
- Supabase is faked at the edge: tests generate an ES256 key pair, serve its JWKS through the harness's fetch, and sign tokens with it. No test reaches Supabase.
- **Ownership:** two Accounts; each sees only their own Story list; the other's Story, Chat, Snapshot, Persona, Saved reply, Replace rule and image answer 404; creating, duplicating, drafting and card import set the owner.
- **Sign-in:** a valid token for a listed email signs in and binds the id; unlisted, disabled, expired, wrong issuer or audience, anonymous, and a token from another key are refused; the owner password signs in as the Owner only; a disabled Account's existing cookie stops working.
- **Cap:** a Member at their cap gets the typed error on send and on a Snapshot; background calls of a turn already sent still run; the Owner is never capped; spend resets at the month's start.
- **Owner-only:** a Member gets 403 on Models settings, People and everyone's usage.
- **Sign-in off:** the whole existing suite passes unchanged, as the Owner.
- **e2e:** an Owner adds a Member, the Member (signed in with a test token) sees an empty Story list, and the Owner's Stories are not reachable.

## Out of Scope

- Sharing a Story between Accounts.
- Members bringing their own provider keys.
- Password reset and invitation emails (they need the Owner's own SMTP); the Owner sets or resets a Member's password in the Supabase dashboard.
- Open sign-up.
- Moving the database to Supabase.
- Reference image candidate rounds are kept 12 at a time for the whole app, so a busy Member can push the Owner's unpicked candidates out; per-Account rounds are left for later.
- DNS rebinding between the check and the connection on a page fetch.

## Further Notes

- Supabase's free project pauses after a week without database activity; then new Supabase sign-ins fail until it is restored, while existing session cookies keep working. The owner password is the way in meanwhile.
- Google sign-in from an installed iPhone PWA may finish in Safari instead of the app; it must be checked on a real device. Email + password works inside the app.

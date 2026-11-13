# Accounts, the Owner, and a session that names its Account

Type: task
Status: done
Blocked by: none
Part of: [Spec: Accounts](../spec.md)

## What to build

- `app_user` table and entity (spec: "Account table"); a migration that creates the Owner (from `OWNER_EMAIL`, else a placeholder) and adds `user_id` (not null, owner by default for existing rows) to `story`, `persona`, `saved_reply`, `replace_rule`, `usage_record`.
- Session cookie v2 `v2.<accountId>.<expiry>.<HMAC>` keyed from `SESSION_SECRET` (min 32 chars, required with `SUPABASE_URL`; else derived from the owner password); v1 refused.
- Sign-in is on when `LOGIN_PASSWORD` or `SUPABASE_URL` is set. The owner password signs in as the Owner.
- The guard loads the Account for every request (disabled or missing: `401.010.001`) and runs the request inside AsyncLocalStorage holding it; with sign-in off every request is the Owner.
- `GET /api/auth/status` adds `account: { id, email, role }` when signed in.

## Acceptance criteria

- [x] Existing suite green with sign-in off.
- [x] Owner password → cookie naming the Owner; status shows role `owner`.
- [x] A cookie for a disabled or unknown Account is refused; a v1 cookie is refused.
- [x] Config: `SESSION_SECRET` under 32 characters, or missing with `SUPABASE_URL`, refuses to start.

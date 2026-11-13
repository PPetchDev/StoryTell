# Supabase sign-in, People, and Owner-only settings

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Accounts](../spec.md)

## What to build

- `POST /api/auth/supabase { accessToken }` per the spec's "Supabase sign-in" (jose, remote JWKS, issuer/audience/role/anonymous checks; bind by email on first sign-in).
- People API, Owner only: list (with spend this month), add by email with a Monthly cap, change cap, disable/enable, remove (a removed Account's data stays, owned by nobody who can sign in).
- Owner-only routes answer `403.010.x` to a Member: Models/Sampling/credit Settings writes and reads of Owner-only fields, backup status, People, everyone's usage.

## Acceptance criteria

- [x] Tests sign tokens with a generated ES256 key served through the harness fetch; no network.
- [x] Listed email signs in and binds; unlisted, disabled, expired, wrong issuer/audience, anonymous, foreign key are refused with their codes.
- [x] A Member gets 403 on Owner-only routes; the Owner manages People.

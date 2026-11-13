# Everything a person makes belongs to their Account

Type: task
Status: done
Blocked by: 01
Part of: [Spec: Accounts](../spec.md)

## What to build

Per the spec's "Ownership" and "One check, at the Story": scope every Story load and listing, Story creation (new, duplicate, drafting, card import), Personas, app-wide Saved replies and Replace rules to the current Account; someone else's answers 404. Usage records carry the Account of the request (or the Owner without one). Images under a Story folder are served only to that Story's Account.

## Acceptance criteria

- [x] Two Accounts: each lists only their own Stories, Personas, Saved replies and Replace rules.
- [x] The other Account's Story, Chat, Snapshot, Persona, Saved reply, Replace rule and Story image answer 404.
- [x] New, duplicated, drafted and card-imported Stories belong to the creator.
- [x] A turn's background calls write usage records with the sender's Account.

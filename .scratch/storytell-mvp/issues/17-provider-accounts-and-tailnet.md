# Set up provider accounts, credit caps and the tailnet

Type: task
Status: ready-for-human
Blocked by: none
Part of: [Spec: Storytell AI MVP](../spec.md)

## What to do

The steps that need the user's own accounts, payment and devices. The agent can't do them.

- **OpenRouter.** Create a dedicated account, or a key with its own credit limit. OpenRouter credit is account-wide and reserved per in-flight request, so only this keeps the text cap hard. Prepay about $22. Put the key in the live instance's env file (gitignored), never in the repo.
- **Runware.** Create an account, prepay about $8 and turn the safety check off. Put the key in the same env file.
- **Retention policies.** Note each host's retention policy for the README: DeepInfra and GMICloud on OpenRouter, plus Runware.
- **Tailscale.** Install it on the Windows PC and the Android phone, in one tailnet. Give the PC a neutral machine name, because certificate names are public in certificate-transparency logs. Enable HTTPS certificates for the tailnet.
- **Git identity.** Set `user.name` and `user.email` on this PC, so commits don't need a per-commit override.

## Acceptance criteria

- [ ] An OpenRouter key with a hard credit limit exists, and its balance shows in the OpenRouter dashboard.
- [ ] A Runware key exists, with prepaid credit and the safety check off.
- [ ] Both keys sit in a gitignored env file, never in tracked files.
- [ ] The phone can reach the PC over the tailnet, and the PC's `*.ts.net` name is neutral.
- [ ] The retention notes are written down, ready for the README.

## User stories covered

128–131 (budget), 132–134 (access).

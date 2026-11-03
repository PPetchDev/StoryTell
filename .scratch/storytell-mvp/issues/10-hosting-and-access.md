# Hosting and access for one user on many devices

Type: grilling
Status: resolved
Blocked by: 05
Part of: [Map: Storytell AI MVP](../map.md)

## Question

Where do the Next.js app, NestJS API and database run so one user can play from desktop and phone (PWA), how is the app locked to that one user, and does it fit the budget alongside the chosen text model?

## Answer

Grilled 2026-11-03. Research notes (prices, free tiers, every host's adult-content terms, with sources) are in the session notes as `10-hosting-research.md`; the gist is under Comments.

- **Where it runs:** everything runs on the user's own Windows PC at home: Next.js, NestJS, PostgreSQL, and images (Snapshots and Character reference images) stored as files on its disk. There is no cloud host, so hosting costs $0 beyond electricity. Total spend stays at the $30/month model cap from [Choose the text LLM](05-choose-text-llm.md).
  - A paid cloud server was considered and rejected on cost: a DigitalOcean droplet at ~$7/month with a domain. Free cloud tiers were rejected too: too small, they sleep, and adult content is banned or ambiguous on most of them.
- **Availability:** the PC is on only while the user is using it. Play from the Android phone works only while the PC is on and awake. This is accepted; no 24/7 uptime.
- **Startup:** PostgreSQL, the app and Tailscale start automatically when Windows starts. No manual launch.
- **Access lock:** a private Tailscale tailnet is the only lock. The app is never exposed to the internet: no Funnel, no Cloudflare Tunnel, no in-app login, accounts or sessions.
  - Tailscale serve gives HTTPS at `<machine>.<tailnet>.ts.net`, which PWA install needs.
  - Desktop and phone both use that same URL, so the PWA installs on both. Desktop runs Windows; the phone runs Android and has no other VPN to conflict with.
  - Name the machine neutrally, because certificate names appear in public certificate-transparency logs.
  - A lost device is removed from the tailnet.
  - Passkeys were considered as a second layer and dropped: Tailscale already keeps strangers out, and the phone's screen lock covers a borrowed, unlocked phone.
- **Live vs dev:** the live instance is separate from development, with its own database and port. It is updated only by build + restart, so dev experiments and migrations cannot damage real Chats.
- **Disaster backup:** at most once a day, when the PC starts, a `pg_dump` plus a copy of the image folder goes to two places:
  - the PC's second disk;
  - Google Drive, encrypted before upload. The decryption passphrase lives in the user's password manager. Google sees only ciphertext, so its content terms do not apply.

  This is separate from the user-facing Export / backup fog on the map, which stays open.
- **PWA offline (map fog, graduated):** the app is online-only and caches no Chats on the device.
  - When the server can't be reached, the app shows one screen. It lists what to check (internet, PC on, Tailscale connected) and has a Retry button.
  - The app cannot tell "no internet" from "PC off", so one screen covers both.
  - Nothing is queued for later sending, which would clash with edit-rewinds.
- **Note for Snapshots ([06](06-choose-image-model-and-snapshot-behaviour.md)):** every host's and backup service's terms ban images that look like real people. Snapshots must depict only fictional Characters.

## Comments

- 2026-11-03: Research gist (as read 2026-11-03):
  - **Adult content banned:** Fly.io, Northflank, Hetzner (treated as banned).
  - **Ambiguous:** Vercel, Netlify, Render, Railway, Prisma, Oracle.
  - **Permitted:** Cloudflare (incl. R2/Tunnel/Access), DigitalOcean, Supabase, Neon, Backblaze B2, Koyeb.
  - **Cloudflare Access in an installed iOS PWA:** risky, because of separate cookie storage and the redirect to an external domain. Not relevant now: the phone is Android and there is no Access.

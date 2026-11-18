# Spec: Reply alerts (Web Push)

Status: ready-for-agent

## Problem Statement

The user plays long Chats on an Android phone in the installed PWA. A turn can take a while, and a Snapshot longer. They switch to another app while it is written and keep coming back to check. They want the phone to tell them when the reply, or the picture, is ready.

## Solution

A per-device switch in Settings, **"Alert me when a reply is ready"**. Turning it on asks Chrome for notification permission and stores this device's push subscription for the signed-in Account. When a turn or a Snapshot finishes, the API sends a Web Push (VAPID) to every device the Account turned it on for. The service worker shows a short notification, such as "Nara replied · Chat 2", unless a window of the app is visible on that device. Tapping it opens that Chat.

## User Stories

1. As a player, I want my phone to tell me when a reply is ready while I am in another app, so that I stop checking back.
2. As a player, I want the same alert when a Snapshot I asked for is drawn, so that I can look at it.
3. As a player, I want a tap on the alert to open that Chat, so that I land on the reply.
4. As a player, I want no alert while I am looking at the app, so that it doesn't ping me for what I can see.
5. As a player, I want the alert to show no story text, so that nothing private shows on my lock screen.
6. As a player, I want to turn alerts on and off for this phone only, so that my other devices stay as they are.
7. As a player, I want to be told plainly when Chrome blocks notifications, so that I know where to allow them.
8. As the Owner, I want the feature to hide itself until I add the keys, so that nothing breaks before I set it up.
9. As the Owner, I want dead subscriptions cleaned up, so that the API doesn't keep sending to phones that are gone.
10. As a Member, I want alerts only for my own replies, so that I never see another person's Chats.

## Implementation Decisions

### Words

"Alert" in the UI. Not a domain term of the story, so not in CONTEXT.md.

### Keys and config

- `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (base64url, as `web-push generate-vapid-keys` prints them), and optionally `VAPID_SUBJECT` (a `mailto:` or `https:` contact for the push service; default `https://storytell.invalid`).
- Neither key set: push is off. The API answers `publicKey: null`, and the Settings card does not show. Nothing else changes.
- Only one key set, a key of the wrong length, or a subject that is neither `mailto:` nor `https:`: start-up fails with a `ConfigError` naming it, like every other bad variable in `app-config.ts`. A typo should not leave alerts silently off.
- The private key never leaves the API. The public key is public by design: the browser subscribes with it.

### Storage

Table `push_subscription`. Migration `1764350000000-PushSubscriptions`, from this branch's range.

| column | |
|---|---|
| `id` | serial |
| `user_id` | the Account, `ON DELETE CASCADE` |
| `endpoint` | text, **unique**: one row per browser install |
| `p256dh`, `auth` | the subscription's keys |
| `created_at`, `updated_at` | |

- **Per Account and device.** A device's endpoint belongs to one Account at a time. When another Account turns alerts on, on the same device, the row moves to that Account.
- An Account holds at most 20 rows. Past that, the oldest goes.

### API (`/api/push`)

- `GET /push` → `{ publicKey: string | null }`.
- `PUT /push/subscription` with `{ endpoint, keys: { p256dh, auth } }` → 204. Upserts by endpoint for the current Account. Push off: `404.011.001`.
- `DELETE /push/subscription` with `{ endpoint }` → 204. Removes that endpoint, if the current Account holds it. Removing one that isn't there is not an error.
- **Endpoint check (SSRF).** The API itself POSTs to the endpoint, and Members are signed-in strangers to the server. So the endpoint must be `https:` on a known push service: `fcm.googleapis.com`, `android.googleapis.com` (Chrome), `*.push.services.mozilla.com` (Firefox), `*.push.apple.com` (Safari), `*.notify.windows.com` (Edge). Any other endpoint: `422.011.002`.
- Error domain `011` (Alerts) in `docs/error-codes.md`.

### Sending

- `PushAlertsService` (manager layer) has `replyReady(storyId, chatId, messageId)` and `snapshotReady(storyId, chatId)`. Both are fire-and-forget: they never throw into the turn or the Snapshot, and they log failures.
- **Hooks.** The end of `ChatManagerService.writeTurn`, once the AI Message is stored. That covers Send, Retry, Continue, Epilogue and Regenerate. A failed or stopped turn sends nothing. `SnapshotManagerService.make` sends once the Snapshot is stored. A failed Snapshot sends nothing.
- **Who gets it:** the Account the work runs as (`AccountModelService.current()`, carried by the request scope into the background Snapshot job). Every device that Account turned on gets it.
- **Payload** (JSON, encrypted by Web Push):
  `{ title: "Storytell", body, url: "/stories/<id>/chats/<chatId>", tag: "chat-<chatId>" }`.
  - Reply: `"<first speaking Character> replied · <Chat title>"`. A reply with only narration: `"New reply · <Chat title>"`.
  - Snapshot: `"Snapshot ready · <Chat title>"`.
  - Both are cut to 120 characters. **No story text, no Story title, no Message text.** The `tag` makes a newer alert for the same Chat replace the older one.
- **Options:** `TTL` 1 hour (a stale alert is worse than none), `urgency: high` (so Android delivers in Doze).
- **Expired subscriptions.** 404 or 410 from the push service deletes that row. Any other failure is logged and the row stays.
- **`PushSender`** is a seam (abstract class): `WebPushSender` (the `web-push` package, 3.6.7) for real, `FakePushSender` (records each send, can be scripted to answer `gone` or `failed`) when `MODEL_GATEWAY=fake`. Fake mode never reaches the network. A testing route `GET /api/testing/push` lists the fake's sends for e2e, mounted only in fake mode, like the gateway's control routes.

### Visible window: the service worker decides

The server cannot know whether the app is on screen. A hidden PWA on Android keeps its turn request open. So the service worker decides, on each device. On `push` it looks at `clients.matchAll({ type: 'window', includeUncontrolled: true })`. If any is `visible`, it shows nothing. Chrome only demands a notification for a push when no page of the site is visible, so this does not trigger Chrome's "site updated in the background" notice.

On `notificationclick` it focuses a window of the app and navigates it to the Chat, or opens a new window there.

### Settings (web)

- A card "Alerts" in **This device**, with a switch "Alert me when a reply is ready" (`role="switch"`). The card shows only when the API has a public key and the browser has `serviceWorker`, `PushManager` and `Notification`.
- **On:** `Notification.requestPermission()`. Granted: `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`, then `PUT`. Denied: the switch stays off, with "Chrome is blocking notifications for Storytell. Allow them in Chrome's site settings, then turn this on." Any other failure: an error line, switch off.
- **Off:** `DELETE`, then `subscription.unsubscribe()`.
- **On load:** the switch reads this browser's current subscription. If there is one (and permission is still granted), it is `PUT` again. That keeps the server in step after the API dropped a row, or after another Account used the device.

## Known limits

- **A turn needs its request.** A turn is still stopped when its request closes (`turn-response.ts`: a closed request is the user's Stop). If Android kills the app while a turn is written, the turn stops and no alert comes. A Snapshot runs on its own and always alerts. Letting a turn outlive its request needs an explicit Stop call in place of the aborted fetch: follow-up.
- Signing out does not remove the device's subscription. It moves when the next Account turns alerts on. Until then the old Account's alerts still reach that device.

## Setting up the keys (Owner, once)

On the VM, as `storytell`, from the deployed app, once a release with this feature is in `/srv/storytell/app`:

```sh
sudo -u storytell -H bash -lc 'cd /srv/storytell/app/apps/api && npx web-push generate-vapid-keys'
```

It prints a Public Key and a Private Key. Add three lines to `/etc/storytell/api.env` with your own editor:

```sh
sudoedit /etc/storytell/api.env
```

```
VAPID_PUBLIC_KEY=<the Public Key>
VAPID_PRIVATE_KEY=<the Private Key>
VAPID_SUBJECT=https://storytell.duckdns.org
```

Then `sudo systemctl restart storytell-api` and `systemctl status storytell-api`. A bad key stops start-up with a message in `journalctl -u storytell-api`. Keep the pair: a new pair makes every device's subscription invalid, and each device must turn alerts on again. Don't add the keys to the web app: it reads the public key from the API.

## Testing Decisions

- **API** (`apps/api/test/push-alerts.spec.ts`, real Nest app and database, `FakePushSender`):
  - `GET /push` gives the public key, or null without keys.
  - Subscribe, re-subscribe (upsert), unsubscribe. The endpoint moves between Accounts. An off-list endpoint is refused. Push off refuses subscribe.
  - A turn sends one push per device of the Account, with the body, url and tag, and no story text. A failed turn sends none.
  - A Snapshot sends "Snapshot ready".
  - 404/410 deletes the row; 500 keeps it.
  - Another Account's devices get nothing.
  - Config: both keys, neither key, half-set, bad length.
- **e2e** (`apps/web/e2e/push-alerts.spec.ts`): the browser's push service is stubbed in an init script (`PushManager.prototype.subscribe` / `getSubscription`, `Notification.requestPermission`). E2E runs the API with a VAPID pair generated at start-up. It covers turning the switch on, reload (stays on), a reply recorded by the fake sender, turning it off, and denied permission. Phone widths 360 and 320.
- The service worker's `push` and `notificationclick` handlers are checked on the phone by hand: Chromium in Playwright has no push service.

## Out of Scope

- Alerts for anything else (Diary entries, Story so far, Story drafting).
- Per-Chat or per-Story mute.
- Quiet hours.
- iOS. Safari needs the PWA installed to the home screen; the code is standard and may work, but it is not tested.

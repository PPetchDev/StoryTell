# Spec: Sign-in

Status: ready-for-agent

## Problem Statement

Storytell has no sign-in. On the PC and over the tailnet that was fine, but putting it on a public address (a NAS behind a tunnel, a web host) would let anyone who finds the link play on the owner's OpenRouter and Venice credit and read, change or delete every Story and Chat.

## Solution

One owner, one password. The API is given the password in its environment. Every API route then needs a signed session cookie, which the owner gets by typing the password once per device. The web app shows a sign-in screen in place of any page while the owner is signed out, and Settings has a Sign out button. Without a password set, nothing changes (dev and tests), but the API refuses to start on a public address without one.

## User Stories

1. As the owner, I want every Story, Chat, image and audio file to need my sign-in, so that a stranger with the link sees nothing and spends nothing.
2. As the owner, I want to sign in with one password, so that there are no accounts to manage.
3. As the owner, I want to stay signed in on my phone for months, so that the PWA opens straight into my Stories.
4. As the owner, I want my session renewed while I keep using it, so that a device I use often never signs me out.
5. As the owner, I want to sign out of a device from Settings, so that a borrowed device can be cleaned up.
6. As the owner, I want a changed password to sign every device out, so that a leaked session ends when I change it.
7. As the owner, I want guessing to be slowed down, so that a weak spot in my password is not found by brute force.
8. As the owner, I want the API to refuse to start on a public address without a password, so that I can never put it online open by mistake.
9. As the owner, I want dev and tests to run as before when no password is set, so that local work needs no sign-in.
10. As the owner, I want the sign-in screen to keep the page I was on, so that signing in brings me back to it.

## Implementation Decisions

- **Config.**
  - `LOGIN_PASSWORD`: the owner's password, at least 12 characters, or the API refuses to start. Unset: sign-in is off.
  - `HOST`: the address the API listens on, `127.0.0.1` by default. Any address but a loopback one (`127.0.0.1`, `::1`, `localhost`) without `LOGIN_PASSWORD` is a config error: the API refuses to start.
  - Limit: this catches only an API that listens publicly itself. A tunnel or proxy on the same machine (cloudflared, Tailscale Funnel, the Next server) reaches a loopback API, so the API can't tell. Every public deployment must set `LOGIN_PASSWORD`; the deployment files carry it. Refusing proxied requests with sign-in off was turned down: dev is played from a phone over the tailnet through the same proxy.
- **Session cookie.**
  - Name `storytell_session`; HttpOnly, SameSite=Lax, Path=/, Max-Age 90 days, and Secure when the request came over HTTPS (directly or as the proxy's `X-Forwarded-Proto`).
  - Stateless: the value is a version, an expiry time and an HMAC of both. The HMAC key is derived from the password with scrypt at start-up, so a new password signs every device out, and the database holds nothing.
  - A signed-in request whose session has less than 30 days left gets a fresh 90-day cookie.
  - A browser may send the cookie's name twice (another path or a sibling domain set one): the request is signed in when any of the values is valid.
- **Images are cached privately.** An image's answer was `public, max-age=31536000, immutable`; it is now `private`, so a shared cache in front (a tunnel, a CDN) never keeps one and hands it to someone without a session. The browser still keeps it for a year, so an image seen before Sign out can still be opened from that browser's cache.
- **Guard.** One global guard. With sign-in off it lets everything through. With it on, a request without a valid session gets `401.010.001` ("Sign in first."), except the public routes: `GET /api/health`, `GET /api/auth/status`, `POST /api/auth/login`, `POST /api/auth/logout`. Images and audio are API routes, so they are covered too.
- **API.**
  - `GET /api/auth/status` → `{ required, signedIn }`.
  - `POST /api/auth/login { password }` → 204 with the cookie, or `401.010.002` ("That password is wrong."). The password is compared in constant time.
  - `POST /api/auth/logout` → 204 with the cookie cleared.
- **Throttle.** One count for the whole API, since there is one owner: after 10 wrong passwords within 15 minutes, every sign-in is refused with `429.010.003` until 15 minutes after the tenth, even with the right password. A right password before that clears the count.
- **Web.**
  - A sign-in gate in the root layout asks `/api/auth/status` first. Signed out, it shows the sign-in screen in place of the page; the URL stays, so signing in reloads the same page.
  - Any API answer with `401.010.001` (a session that ran out or was signed out elsewhere) brings the sign-in screen back.
  - If the status can't be read (the API is down), the page renders as before and the connection notice handles it.
  - Settings gets a Sign out button when sign-in is on.
- **Errors.** New domain `010` Sign-in in `docs/error-codes.md`.

## Testing Decisions

- Behaviour at the existing seams: HTTP through the API with the test harness, the config loader, and Playwright e2e.
- **Config:** a password under 12 characters is refused; a public `HOST` without a password is refused; a loopback one is fine; with a password any host is fine.
- **API, sign-in off:** every route answers as before and the status says `required: false`.
- **API, sign-in on:**
  - a Story list, an image and the status read as signed out; health answers;
  - a wrong password is `401.010.002` and sets no cookie; the right one sets the cookie, and with it the Story list answers;
  - a forged or expired cookie, or one signed for another password, is `401.010.001`;
  - sign out clears the cookie;
  - a session with under 30 days left is renewed;
  - a stray cookie of the same name sent first doesn't hide the valid one;
  - an image is cached `private`;
  - the eleventh try after ten wrong ones is `429.010.003`, even when right.
- **e2e:** with sign-in on, a page shows the sign-in screen, a wrong password says so, the right one shows the page, and Sign out in Settings brings the screen back.

## Out of Scope

- More than one user, accounts, roles, password reset by mail, two-factor sign-in.
- Hiding the API docs page (`/api/docs`): it describes routes but holds no data.
- A lockout per client address. The one count lets a stranger keep new sign-ins locked by guessing ten times every 15 minutes; devices already signed in keep working.
- Bringing the sign-in screen back when an image or audio file is refused mid-use: those don't go through the API client, so they show as broken until the next API call does.
- The deployment itself (NAS, tunnel, Vercel, database host).

## Further Notes

- The password lives only in the API's environment, never in the database or the web app.

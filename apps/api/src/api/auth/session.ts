import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * The session cookie (.scratch/sign-in/spec.md: "Session cookie"). Stateless: the value is a
 * version, an expiry time and an HMAC of both, keyed from the password, so a new password
 * signs every device out and the database holds nothing.
 */
export const SESSION_COOKIE = 'storytell_session';
export const SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
/** A signed-in request with less than this left gets a fresh cookie. */
export const SESSION_RENEW_UNDER_MS = 30 * 24 * 60 * 60 * 1000;
const VERSION = 'v1';

/** The HMAC key for a password. Slow on purpose (scrypt), so a stolen cookie is no shortcut to the password. */
export function sessionKey(password: string): Buffer {
    return scryptSync(password, 'storytell-session-v1', 32);
}

function mac(key: Buffer, payload: string): string {
    return createHmac('sha256', key).update(payload).digest('base64url');
}

/** The cookie value for a session that runs out at `expiresAt` (ms since the epoch). */
export function signSession(key: Buffer, expiresAt: number): string {
    const payload = `${VERSION}.${Math.floor(expiresAt)}`;
    return `${payload}.${mac(key, payload)}`;
}

/** When a cookie value's session runs out, or null when it is forged, malformed or already over. */
export function verifySession(key: Buffer, value: string, now = Date.now()): number | null {
    const [version, expiry, signature, ...rest] = value.split('.');
    if (version !== VERSION || !expiry || !signature || rest.length > 0 || !/^\d+$/.test(expiry)) return null;
    const expected = Buffer.from(mac(key, `${version}.${expiry}`));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const expiresAt = Number(expiry);
    return expiresAt > now ? expiresAt : null;
}

/**
 * Every value of one cookie in a request's Cookie header, in order. A browser can send the same
 * name twice (another path or a sibling domain set one), so a caller checks them all.
 */
export function readCookies(header: string | undefined, name: string): string[] {
    const values: string[] = [];
    for (const part of (header ?? '').split(';')) {
        const at = part.indexOf('=');
        if (at > 0 && part.slice(0, at).trim() === name) values.push(part.slice(at + 1).trim());
    }
    return values;
}

/** The Set-Cookie header for a session value, or for clearing it when `value` is null. */
export function sessionSetCookie(value: string | null, secure: boolean): string {
    const parts = [`${SESSION_COOKIE}=${value ?? ''}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${value === null ? 0 : SESSION_LIFETIME_MS / 1000}`];
    if (secure) parts.push('Secure');
    return parts.join('; ');
}

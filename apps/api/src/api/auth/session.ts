import { createHmac, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * The session cookie (.scratch/accounts/spec.md: "Session cookie v2"). Stateless: the value is a
 * version, the Account's id, an expiry time and an HMAC of all three, keyed from SESSION_SECRET
 * (or the owner password while there is none), so a new key signs every device out. Whether the
 * Account may still sign in is read from the database on every request.
 */
export const SESSION_COOKIE = 'storytell_session';
export const SESSION_LIFETIME_MS = 90 * 24 * 60 * 60 * 1000;
/** A signed-in request with less than this left gets a fresh cookie. */
export const SESSION_RENEW_UNDER_MS = 30 * 24 * 60 * 60 * 1000;
const VERSION = 'v2';

/** The HMAC key for a secret. Slow on purpose (scrypt), so a stolen cookie is no shortcut to an owner password. */
export function sessionKey(secret: string): Buffer {
    return scryptSync(secret, 'storytell-session-v1', 32);
}

function mac(key: Buffer, payload: string): string {
    return createHmac('sha256', key).update(payload).digest('base64url');
}

/** The cookie value for an Account's session that runs out at `expiresAt` (ms since the epoch). */
export function signSession(key: Buffer, accountId: number, expiresAt: number): string {
    const payload = `${VERSION}.${accountId}.${Math.floor(expiresAt)}`;
    return `${payload}.${mac(key, payload)}`;
}

export interface VerifiedSession {
    accountId: number;
    expiresAt: number;
}

/** The Account and expiry a cookie value names, or null when it is forged, malformed, of another version or already over. */
export function verifySession(key: Buffer, value: string, now = Date.now()): VerifiedSession | null {
    const [version, account, expiry, signature, ...rest] = value.split('.');
    if (version !== VERSION || !account || !expiry || !signature || rest.length > 0) return null;
    if (!/^\d+$/.test(account) || !/^\d+$/.test(expiry)) return null;
    const expected = Buffer.from(mac(key, `${version}.${account}.${expiry}`));
    const given = Buffer.from(signature);
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const expiresAt = Number(expiry);
    return expiresAt > now ? { accountId: Number(account), expiresAt } : null;
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

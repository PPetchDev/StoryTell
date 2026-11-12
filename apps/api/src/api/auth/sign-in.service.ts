import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

import { AppConfig } from '../../config/app-config.js';
import { TooManySignInTriesError, WrongPasswordError } from '../../errors/auth.errors.js';
import { SESSION_LIFETIME_MS, SESSION_RENEW_UNDER_MS, sessionKey, signSession, verifySession } from './session.js';

/** Spec: "Throttle". One count for the whole API: there is one owner. */
export const SIGN_IN_MAX_WRONG = 10;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/** What a request's session says. */
export interface SessionCheck {
    valid: boolean;
    /** A fresh cookie value to send back, when the session is valid but has under 30 days left. */
    renewed?: string;
}

/** The owner's sign-in (.scratch/sign-in/spec.md): the password check, the throttle and sessions. */
@Injectable()
export class SignInService {
    private readonly key: Buffer | null;
    private wrongAt: number[] = [];
    private lockedUntil = 0;

    constructor(private readonly config: AppConfig) {
        this.key = config.loginPassword === undefined ? null : sessionKey(config.loginPassword);
    }

    get required(): boolean {
        return this.key !== null;
    }

    /** The request's session cookie values: valid when any one of them is. */
    check(values: string[], now = Date.now()): SessionCheck {
        if (this.key === null) return { valid: true };
        const key = this.key;
        const expiresAt = values.map((value) => verifySession(key, value, now)).find((expiry) => expiry !== null) ?? null;
        if (expiresAt === null) return { valid: false };
        return expiresAt - now < SESSION_RENEW_UNDER_MS ? { valid: true, renewed: this.newSession(now) } : { valid: true };
    }

    /** A new session's cookie value, or a typed error for a wrong password or a lockout. Null while sign-in is off. */
    signIn(password: string, now = Date.now()): string | null {
        if (this.key === null) return null;
        if (now < this.lockedUntil) throw new TooManySignInTriesError(Math.ceil((this.lockedUntil - now) / 60_000));
        if (!samePassword(password, this.config.loginPassword!)) {
            this.wrongAt = [...this.wrongAt.filter((at) => now - at < SIGN_IN_WINDOW_MS), now];
            if (this.wrongAt.length >= SIGN_IN_MAX_WRONG) {
                this.lockedUntil = now + SIGN_IN_WINDOW_MS;
                this.wrongAt = [];
            }
            throw new WrongPasswordError();
        }
        this.wrongAt = [];
        return this.newSession(now);
    }

    private newSession(now: number): string {
        return signSession(this.key!, now + SESSION_LIFETIME_MS);
    }
}

/** Compared as digests, so the time taken says nothing about the length or the first wrong character. */
function samePassword(given: string, expected: string): boolean {
    const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest();
    return timingSafeEqual(digest(given), digest(expected));
}

import { Injectable } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';

import { AppConfig } from '../../config/app-config.js';
import { AccountDisabledError, EmailNotProvenError, NotOnPeopleListError, TooManySignInTriesError, WrongPasswordError } from '../../errors/auth.errors.js';
import { AccountModelService } from '../../model/account/account.service.js';
import { AccountEntity, AccountRole } from '../../model/account/entities/account.entity.js';
import type { SupabaseIdentity } from './supabase-token.js';
import { SESSION_LIFETIME_MS, SESSION_RENEW_UNDER_MS, sessionKey, signSession, verifySession } from './session.js';

/** Spec: "Throttle". One count for the whole API, for the owner password only. */
export const SIGN_IN_MAX_WRONG = 10;
export const SIGN_IN_WINDOW_MS = 15 * 60 * 1000;

/** What a request's session says. */
export interface SessionCheck {
    /** The Account it signs in, or null when there is no valid session for an active Account. */
    account: AccountEntity | null;
    /** A fresh cookie value to send back, when the session is valid but has under 30 days left. */
    renewed?: string;
}

/**
 * Sign-in (.scratch/sign-in/spec.md, .scratch/accounts/spec.md): the owner password and its
 * throttle, and sessions that name an Account. On when LOGIN_PASSWORD or SUPABASE_URL is set.
 */
@Injectable()
export class SignInService {
    private readonly key: Buffer | null;
    private wrongAt: number[] = [];
    private lockedUntil = 0;

    constructor(
        private readonly config: AppConfig,
        private readonly accounts: AccountModelService,
    ) {
        const secret = config.sessionSecret ?? config.loginPassword;
        const on = config.loginPassword !== undefined || config.supabaseUrl !== undefined;
        this.key = on && secret !== undefined ? sessionKey(secret) : null;
    }

    get required(): boolean {
        return this.key !== null;
    }

    /** The request's session cookie values: signed in when any one of them names an active Account. */
    async check(values: string[], now = Date.now()): Promise<SessionCheck> {
        if (this.key === null) return { account: this.accounts.owner };
        const key = this.key;
        for (const value of values) {
            const session = verifySession(key, value, now);
            if (session === null) continue;
            const account = await this.accounts.findById(session.accountId);
            if (!account?.active) continue;
            const renewed = session.expiresAt - now < SESSION_RENEW_UNDER_MS ? this.newSession(account.id, now) : undefined;
            return { account, renewed };
        }
        return { account: null };
    }

    /** The owner password: a new session for the Owner, or a typed error for a wrong password or a lockout. Null while sign-in is off. */
    signInOwner(password: string, now = Date.now()): string | null {
        if (this.key === null) return null;
        if (now < this.lockedUntil) throw new TooManySignInTriesError(Math.ceil((this.lockedUntil - now) / 60_000));
        const expected = this.config.loginPassword;
        if (expected === undefined || !samePassword(password, expected)) {
            this.wrongAt = [...this.wrongAt.filter((at) => now - at < SIGN_IN_WINDOW_MS), now];
            if (this.wrongAt.length >= SIGN_IN_MAX_WRONG) {
                this.lockedUntil = now + SIGN_IN_WINDOW_MS;
                this.wrongAt = [];
            }
            throw new WrongPasswordError();
        }
        this.wrongAt = [];
        return this.newSession(this.accounts.owner.id, now);
    }

    /**
     * Spec: "Supabase sign-in". The Account a verified Supabase identity signs in as: the one bound
     * to its Supabase id, or else the one listed under its email, which it then binds. An email
     * bound to another Supabase user, unlisted or removed is refused; so is a disabled Account.
     */
    async signInWithSupabase(identity: SupabaseIdentity, now = Date.now()): Promise<string> {
        let account = await this.accounts.findBySupabaseId(identity.sub);
        if (!account) {
            const listed = await this.accounts.findByEmail(identity.email);
            if (!listed || listed.removed || (listed.supabaseId !== null && listed.supabaseId !== identity.sub)) throw new NotOnPeopleListError();
            // The placeholder Owner email names no one: only OWNER_EMAIL lets the Owner sign in this way.
            if (listed.role === AccountRole.Owner && this.config.ownerEmail === undefined) throw new NotOnPeopleListError();
            // A Supabase user with someone else's email is easy to make while sign-ups are open.
            if (!identity.googleVerified && !this.config.supabaseSignupsClosed) throw new EmailNotProvenError();
            account = await this.accounts.save({ ...listed, supabaseId: identity.sub });
        }
        if (account.removed) throw new NotOnPeopleListError();
        if (account.disabled) throw new AccountDisabledError();
        return this.newSession(account.id, now);
    }

    private newSession(accountId: number, now: number): string {
        return signSession(this.key!, accountId, now + SESSION_LIFETIME_MS);
    }
}

/** Compared as digests, so the time taken says nothing about the length or the first wrong character. */
function samePassword(given: string, expected: string): boolean {
    const digest = (text: string) => createHash('sha256').update(text, 'utf8').digest();
    return timingSafeEqual(digest(given), digest(expected));
}

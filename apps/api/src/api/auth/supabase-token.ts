import { Inject, Injectable } from '@nestjs/common';
import { createLocalJWKSet, type JSONWebKeySet, jwtVerify } from 'jose';

import { AppConfig } from '../../config/app-config.js';
import { SupabaseNotSetUpError, SupabaseTokenInvalidError } from '../../errors/auth.errors.js';
import type { FetchLike } from '../../service/model-gateway/real/http.js';

/** What a fetch of the Supabase JWKS goes through; tests serve their own keys. */
export const AUTH_FETCH = Symbol('AUTH_FETCH');

/** Supabase caches its keys for about 10 minutes, so ours are read again after that. */
const KEYS_TTL_MS = 10 * 60 * 1000;
/** An unknown key id reads the keys again no more often than this. */
const KEYS_RETRY_MS = 60 * 1000;
const KEYS_TIMEOUT_MS = 5_000;

/** Who a verified Supabase access token says signed in. */
export interface SupabaseIdentity {
    /** The Supabase user id. */
    sub: string;
    email: string;
    /** The Supabase user has a Google identity, so Google checked the email. Set by Supabase, not the user. */
    googleVerified: boolean;
}

/**
 * Checks a Supabase access token (.scratch/accounts/spec.md: "Supabase sign-in"; docs/adr/0005):
 * signed by one of the project's published keys (ES256 or RS256), issued by the project, for an
 * `authenticated`, non-anonymous user, not expired. The API never calls Supabase for anything else.
 */
@Injectable()
export class SupabaseTokenVerifier {
    private keys: { set: ReturnType<typeof createLocalJWKSet>; at: number } | null = null;
    private reading: Promise<ReturnType<typeof createLocalJWKSet>> | null = null;

    constructor(
        private readonly config: AppConfig,
        @Inject(AUTH_FETCH) private readonly fetchKeys: FetchLike,
    ) {}

    get configured(): boolean {
        return this.config.supabaseUrl !== undefined;
    }

    async verify(token: string): Promise<SupabaseIdentity> {
        const project = this.config.supabaseUrl;
        if (project === undefined) throw new SupabaseNotSetUpError();
        try {
            return await this.check(project, token, false);
        } catch (error) {
            if (error instanceof SupabaseTokenInvalidError || error instanceof SupabaseNotSetUpError) throw error;
            throw new SupabaseTokenInvalidError();
        }
    }

    private async check(project: string, token: string, fresh: boolean): Promise<SupabaseIdentity> {
        const keys = await this.keySet(project, fresh);
        let payload;
        try {
            ({ payload } = await jwtVerify(token, keys, {
                issuer: `${project}/auth/v1`,
                audience: 'authenticated',
                algorithms: ['ES256', 'RS256'],
            }));
        } catch (error) {
            // A key rotated since we last read them: read them once more before refusing.
            if (!fresh && (error as { code?: string }).code === 'ERR_JWKS_NO_MATCHING_KEY') return this.check(project, token, true);
            throw new SupabaseTokenInvalidError();
        }
        if (payload.role !== 'authenticated' || payload.is_anonymous === true) throw new SupabaseTokenInvalidError();
        if (typeof payload.sub !== 'string' || typeof payload.email !== 'string' || payload.email.trim() === '') throw new SupabaseTokenInvalidError();
        const app = (payload.app_metadata ?? {}) as { provider?: unknown; providers?: unknown };
        const providers = Array.isArray(app.providers) ? app.providers : [];
        const googleVerified = app.provider === 'google' || providers.includes('google');
        return { sub: payload.sub, email: payload.email.trim().toLowerCase(), googleVerified };
    }

    /**
     * The project's keys. Read again after KEYS_TTL_MS, or for an unknown key id (`fresh`) at most once
     * per KEYS_RETRY_MS, so a stream of tokens with made-up key ids can't make us fetch on every
     * request; and one read at a time, however many sign-ins wait on it.
     */
    private async keySet(project: string, fresh: boolean): Promise<ReturnType<typeof createLocalJWKSet>> {
        const age = this.keys ? Date.now() - this.keys.at : Infinity;
        if (this.keys && (fresh ? age < KEYS_RETRY_MS : age < KEYS_TTL_MS)) return this.keys.set;
        this.reading ??= this.readKeys(project).finally(() => (this.reading = null));
        return this.reading;
    }

    private async readKeys(project: string): Promise<ReturnType<typeof createLocalJWKSet>> {
        const response = await this.fetchKeys(`${project}/auth/v1/.well-known/jwks.json`, { method: 'GET', signal: AbortSignal.timeout(KEYS_TIMEOUT_MS) });
        if (!response.ok) throw new SupabaseTokenInvalidError();
        const jwks = (await response.json()) as JSONWebKeySet;
        this.keys = { set: createLocalJWKSet(jwks), at: Date.now() };
        return this.keys.set;
    }
}

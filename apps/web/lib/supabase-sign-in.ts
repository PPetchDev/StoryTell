'use client';

import type { SupabaseClient } from '@supabase/supabase-js';

import { apiSend } from '@/lib/api';
import type { SignInStatus } from '@/lib/account';

type SupabaseSettings = NonNullable<SignInStatus['methods']['supabase']>;

let client: { url: string; client: SupabaseClient } | null = null;

/**
 * The browser's Supabase client, made on first use (supabase-js loads only when Google or email
 * sign-in is set up). PKCE, so a Google sign-in comes back with a one-time code the client swaps
 * for a session itself (docs/adr/0005).
 */
async function supabaseFor(settings: SupabaseSettings): Promise<SupabaseClient> {
    if (client?.url === settings.url) return client.client;
    const { createClient } = await import('@supabase/supabase-js');
    const made = createClient(settings.url, settings.anonKey, {
        auth: { flowType: 'pkce', detectSessionInUrl: true, persistSession: true, autoRefreshToken: false },
    });
    client = { url: settings.url, client: made };
    return made;
}

/**
 * Hands a Supabase session's access token to the API, which sets Storytell's own session cookie,
 * then forgets the Supabase session: Storytell never uses it again.
 */
async function handOver(supabase: SupabaseClient, accessToken: string): Promise<void> {
    try {
        await apiSend('POST', '/auth/supabase', { accessToken });
    } finally {
        await supabase.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
}

/** Leaves for Google; the page comes back here with a code that `finishRedirect` completes. */
export async function continueWithGoogle(settings: SupabaseSettings): Promise<void> {
    const supabase = await supabaseFor(settings);
    const redirectTo = `${window.location.origin}${window.location.pathname}`;
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) throw new Error(error.message);
}

export async function signInWithEmail(settings: SupabaseSettings, email: string, password: string): Promise<void> {
    const supabase = await supabaseFor(settings);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) throw new Error(error?.message === 'Invalid login credentials' ? 'That email or password is wrong.' : (error?.message ?? "That sign-in didn't go through."));
    await handOver(supabase, data.session.access_token);
}

/** Whether the URL carries a Google sign-in coming back (`?code=`). */
export function returningFromGoogle(): boolean {
    return typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('code');
}

/** Completes a Google sign-in that came back to this page, then drops the code from the URL. */
export async function finishRedirect(settings: SupabaseSettings): Promise<void> {
    const supabase = await supabaseFor(settings);
    try {
        // With detectSessionInUrl the client swaps the code for a session as it starts.
        const { data, error } = await supabase.auth.getSession();
        if (error || !data.session) throw new Error(error?.message ?? "That sign-in didn't go through. Try again.");
        await handOver(supabase, data.session.access_token);
    } finally {
        const url = new URL(window.location.href);
        url.searchParams.delete('code');
        window.history.replaceState(null, '', url.toString());
    }
}

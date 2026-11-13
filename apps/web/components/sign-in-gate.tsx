'use client';

import { FormEvent, ReactNode, useEffect, useId, useState } from 'react';

import { AccountContext, SignInStatus, useAccount } from '@/lib/account';
import { ApiError, apiFetch, apiSend, SIGNED_OUT_EVENT } from '@/lib/api';
import { continueWithGoogle, finishRedirect, returningFromGoogle, signInWithEmail } from '@/lib/supabase-sign-in';

/** A sign-in failure, said plainly: the API's own message when it gave one. */
function failureText(failure: unknown): string {
    if (failure instanceof ApiError) return failure.message;
    if (failure instanceof Error && failure.message) return failure.message;
    return "Can't reach Storytell AI. Try again.";
}

/**
 * .scratch/sign-in/spec.md and .scratch/accounts/spec.md: "Web". Asks the API who is signed in
 * before showing the page, and shows the sign-in screen in its place while signed out, or once
 * any API answer says the session ran out. The URL stays, so signing in reloads the same page.
 * If the status can't be read (the API is down), the page shows as before and the can't-connect
 * screen takes it from there. A Google sign-in that comes back here is completed first.
 */
export function SignInGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<'checking' | 'open' | 'signed-out'>('checking');
    const [status, setStatus] = useState<SignInStatus | null>(null);
    const [redirectError, setRedirectError] = useState<string | null>(null);

    useEffect(() => {
        let live = true;
        (async () => {
            let read: SignInStatus;
            try {
                read = await apiFetch<SignInStatus>('/auth/status');
            } catch {
                if (live) setState('open');
                return;
            }
            if (read.required && !read.signedIn && read.methods.supabase && returningFromGoogle()) {
                try {
                    await finishRedirect(read.methods.supabase);
                    window.location.reload();
                    return;
                } catch (failure) {
                    if (live) setRedirectError(failureText(failure));
                }
            }
            if (!live) return;
            setStatus(read);
            setState(read.required && !read.signedIn ? 'signed-out' : 'open');
        })();
        const signedOut = () => setState('signed-out');
        window.addEventListener(SIGNED_OUT_EVENT, signedOut);
        return () => {
            live = false;
            window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
        };
    }, []);

    if (state === 'checking') return null;
    if (state === 'signed-out') return <SignInScreen methods={status?.methods ?? { password: true, supabase: null }} firstError={redirectError} />;
    return <AccountContext.Provider value={status}>{children}</AccountContext.Provider>;
}

function SignInScreen({ methods, firstError }: { methods: SignInStatus['methods']; firstError: string | null }) {
    const id = useId();
    const supabase = methods.supabase;
    const [ownerPassword, setOwnerPassword] = useState(!supabase);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState<'google' | 'email' | 'owner' | null>(null);
    const [error, setError] = useState<string | null>(firstError);

    const run = async (which: 'google' | 'email' | 'owner', work: () => Promise<void>, reload: boolean) => {
        setBusy(which);
        setError(null);
        try {
            await work();
            // Everything on the page loads afresh, now with the session.
            if (reload) window.location.reload();
        } catch (failure) {
            setError(failureText(failure));
            setBusy(null);
        }
    };

    const submitEmail = (event: FormEvent) => {
        event.preventDefault();
        void run('email', () => signInWithEmail(supabase!, email, password), true);
    };
    const submitOwner = (event: FormEvent) => {
        event.preventDefault();
        void run('owner', () => apiSend('POST', '/auth/login', { password }), true);
    };

    const errorLine = error !== null && (
        <p id={`${id}-error`} role="alert" className="field-error">
            {error}
        </p>
    );

    return (
        <main className="page">
            <h1>Sign in</h1>
            {supabase && !ownerPassword && (
                <>
                    {/* Google leaves the page, so it never reloads it here. */}
                    <button type="button" className="button mb-6 w-full" onClick={() => void run('google', () => continueWithGoogle(supabase), false)} disabled={busy !== null} aria-busy={busy === 'google'}>
                        {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
                    </button>
                    <form onSubmit={submitEmail}>
                        <div className="field">
                            <label htmlFor={`${id}-email`}>Email</label>
                            <input id={`${id}-email`} type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
                        </div>
                        <div className="field">
                            <label htmlFor={`${id}-password`}>Password</label>
                            <input
                                id={`${id}-password`}
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                aria-invalid={error !== null}
                                aria-describedby={error !== null ? `${id}-error` : undefined}
                                required
                            />
                            {errorLine}
                        </div>
                        <button type="submit" className="button" disabled={busy !== null || email === '' || password === ''} aria-busy={busy === 'email'}>
                            {busy === 'email' ? 'Signing in…' : 'Sign in'}
                        </button>
                    </form>
                    {methods.password && (
                        <p className="mt-6 mb-0">
                            <button type="button" className="button button-quiet button-small" onClick={() => { setOwnerPassword(true); setPassword(''); setError(null); }}>
                                Owner password
                            </button>
                        </p>
                    )}
                </>
            )}
            {(!supabase || ownerPassword) && (
                <form onSubmit={submitOwner}>
                    <div className="field">
                        <label htmlFor={`${id}-owner-password`}>{supabase ? 'Owner password' : 'Password'}</label>
                        <input
                            id={`${id}-owner-password`}
                            type="password"
                            autoComplete="current-password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            aria-invalid={error !== null}
                            aria-describedby={error !== null ? `${id}-error` : undefined}
                            required
                            autoFocus
                        />
                        {errorLine}
                    </div>
                    <button type="submit" className="button" disabled={busy !== null || password === ''} aria-busy={busy === 'owner'}>
                        {busy === 'owner' ? 'Signing in…' : 'Sign in'}
                    </button>
                    {supabase && (
                        <p className="mt-6 mb-0">
                            <button type="button" className="button button-quiet button-small" onClick={() => { setOwnerPassword(false); setPassword(''); setError(null); }}>
                                Google or email
                            </button>
                        </p>
                    )}
                </form>
            )}
        </main>
    );
}

/** Settings' Sign out card, shown only while sign-in is on, with who is signed in. */
export function SignOutSetting() {
    const { status } = useAccount();
    const [busy, setBusy] = useState(false);

    if (!status?.required || !status.account) return null;

    const signOut = async () => {
        setBusy(true);
        try {
            await apiSend('POST', '/auth/logout');
        } finally {
            window.location.reload();
        }
    };

    return (
        <section className="card">
            <h2>Signed in</h2>
            <p className="muted">
                As {status.account.email}
                {status.account.role === 'owner' ? ', the Owner' : ''}. This device stays signed in for 90 days after its last use.
            </p>
            <button type="button" className="button button-quiet" onClick={signOut} disabled={busy} aria-busy={busy}>
                {busy ? 'Signing out…' : 'Sign out'}
            </button>
        </section>
    );
}

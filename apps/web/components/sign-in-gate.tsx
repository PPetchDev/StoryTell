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

/** The sign-in screen fills the viewport and centres its column, clear of the notch and the home bar. */
const SCREEN = 'relative isolate flex min-h-dvh items-center justify-center px-4 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]';
/** A soft wash of the accent behind the top of the screen, from the app's own token, in both themes. */
const GLOW = 'pointer-events-none absolute inset-x-0 top-0 -z-10 h-[28rem] bg-[radial-gradient(70%_60%_at_50%_0%,var(--accent-soft),transparent)]';
const CARD = 'rounded-2xl border border-line bg-surface p-5 shadow-lg shadow-shadow-soft sm:p-6';
/** Google's sign-in button: a light, outlined button with its "G", as Google's branding asks, in both themes. */
const GOOGLE = [
    'button w-full border border-field-line bg-surface-raised text-text',
    'disabled:border-line',
].join(' ');
/** A text-sized button that reads as a link: underlined, 44px tall for a finger. */
const QUIET_LINK = 'inline-flex min-h-11 items-center px-2 text-sm text-muted underline underline-offset-4 hover:text-text';

/** Google's "G", in Google's own colours (its sign-in branding), whatever the theme. */
function GoogleMark() {
    return (
        <svg viewBox="0 0 48 48" width="20" height="20" aria-hidden="true" focusable="false">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
    );
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

    const switchTo = (owner: boolean) => {
        setOwnerPassword(owner);
        setPassword('');
        setError(null);
    };

    return (
        // A screen of its own: no nav, the card centred on the page, the app's book mark above it.
        <main className={SCREEN}>
            <div className={GLOW} aria-hidden="true" />
            <div className="w-full max-w-sm">
                <div className="mb-6 flex flex-col items-center text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- the app's own icon, an SVG served as is */}
                    <img src="/icons/icon.svg" alt="" width={64} height={64} className="mb-4 h-16 w-16 rounded-2xl shadow-lg shadow-shadow-soft" />
                    <h1 className="mb-1 text-2xl lg:text-2xl">Sign in to Storytell AI</h1>
                    <p className="m-0 text-muted">Your Stories, waiting where you left them.</p>
                </div>

                <div className={CARD}>
                    {supabase && !ownerPassword && (
                        <>
                            {/* Google leaves the page, so it never reloads it here. */}
                            <button
                                type="button"
                                className={GOOGLE}
                                onClick={() => void run('google', () => continueWithGoogle(supabase), false)}
                                disabled={busy !== null}
                                aria-busy={busy === 'google'}
                            >
                                <GoogleMark />
                                {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
                            </button>

                            <div className="my-5 flex items-center gap-3 text-sm text-muted" aria-hidden="true">
                                <span className="h-px flex-1 bg-line" />
                                or
                                <span className="h-px flex-1 bg-line" />
                            </div>

                            <form onSubmit={submitEmail} aria-label="Email sign-in">
                                <div className="field mt-0">
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
                                <button type="submit" className="button mt-2 w-full" disabled={busy !== null || email === '' || password === ''} aria-busy={busy === 'email'}>
                                    {busy === 'email' ? 'Signing in…' : 'Sign in'}
                                </button>
                            </form>
                        </>
                    )}

                    {(!supabase || ownerPassword) && (
                        <form onSubmit={submitOwner} aria-label="Owner sign-in">
                            <div className="field mt-0">
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
                            <button type="submit" className="button mt-2 w-full" disabled={busy !== null || password === ''} aria-busy={busy === 'owner'}>
                                {busy === 'owner' ? 'Signing in…' : 'Sign in'}
                            </button>
                        </form>
                    )}
                </div>

                {/* The owner's way in stays quiet: most people never need it. */}
                {supabase && (ownerPassword || methods.password) && (
                    <p className="mt-4 mb-0 text-center">
                        <button type="button" className={QUIET_LINK} onClick={() => switchTo(!ownerPassword)}>
                            {ownerPassword ? 'Google or email' : 'Owner password'}
                        </button>
                    </p>
                )}
            </div>
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

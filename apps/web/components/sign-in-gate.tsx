'use client';

import { FormEvent, ReactNode, useEffect, useId, useState } from 'react';

import { ApiError, apiFetch, apiSend, SIGNED_OUT_EVENT } from '@/lib/api';

interface SignInStatus {
    required: boolean;
    signedIn: boolean;
}

/**
 * .scratch/sign-in/spec.md: "Web". Asks the API whether a sign-in is needed before showing the
 * page, and shows the sign-in screen in its place while signed out, or once any API answer says
 * the session ran out. The URL stays, so signing in reloads the same page. If the status can't be
 * read (the API is down), the page shows as before and the can't-connect screen takes it from there.
 */
export function SignInGate({ children }: { children: ReactNode }) {
    const [state, setState] = useState<'checking' | 'open' | 'signed-out'>('checking');

    useEffect(() => {
        let live = true;
        apiFetch<SignInStatus>('/auth/status').then(
            (status) => live && setState(status.required && !status.signedIn ? 'signed-out' : 'open'),
            () => live && setState('open'),
        );
        const signedOut = () => setState('signed-out');
        window.addEventListener(SIGNED_OUT_EVENT, signedOut);
        return () => {
            live = false;
            window.removeEventListener(SIGNED_OUT_EVENT, signedOut);
        };
    }, []);

    if (state === 'checking') return null;
    if (state === 'signed-out') return <SignInScreen />;
    return <>{children}</>;
}

function SignInScreen() {
    const id = useId();
    const [password, setPassword] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const submit = async (event: FormEvent) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
            await apiSend('POST', '/auth/login', { password });
            // Everything on the page loads afresh, now with the session.
            window.location.reload();
        } catch (failure) {
            setError(failure instanceof ApiError ? failure.message : "Can't reach Storytell AI. Try again.");
            setBusy(false);
        }
    };

    return (
        <main className="page">
            <h1>Sign in</h1>
            <form onSubmit={submit}>
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
                        autoFocus
                    />
                    {error !== null && (
                        <p id={`${id}-error`} role="alert" className="field-error">
                            {error}
                        </p>
                    )}
                </div>
                <button type="submit" className="button" disabled={busy || password === ''} aria-busy={busy}>
                    {busy ? 'Signing in…' : 'Sign in'}
                </button>
            </form>
        </main>
    );
}

/** Settings' Sign out card, shown only while sign-in is on. */
export function SignOutSetting() {
    const [required, setRequired] = useState(false);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let live = true;
        apiFetch<SignInStatus>('/auth/status').then(
            (status) => live && setRequired(status.required),
            () => undefined,
        );
        return () => {
            live = false;
        };
    }, []);

    if (!required) return null;

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
            <p className="muted">This device stays signed in for 90 days after its last use.</p>
            <button type="button" className="button button-quiet" onClick={signOut} disabled={busy} aria-busy={busy}>
                {busy ? 'Signing out…' : 'Sign out'}
            </button>
        </section>
    );
}

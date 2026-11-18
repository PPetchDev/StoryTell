'use client';

import { useEffect, useId, useState } from 'react';

import { ApiError, ApiUnreachableError } from '@/lib/api';
import { currentSubscription, fetchPushConfig, pushSupported, storeSubscription, turnOffAlerts, turnOnAlerts } from '@/lib/push-alerts';

const PILL_ON = 'border-accent-fill bg-accent-fill text-accent-text';
const PILL_OFF = 'border-field-line text-muted';

const DENIED = "Chrome is blocking notifications for Storytell. Allow them in Chrome's site settings, then turn this on.";

type State =
    | { kind: 'hidden' }
    | { kind: 'ready'; publicKey: string; on: boolean };

function failureText(error: unknown): string {
    if (error instanceof ApiUnreachableError) return "Can't reach Storytell. Try again when you're back online.";
    if (error instanceof ApiError) return error.message;
    return "This phone couldn't turn alerts on. Try again.";
}

/**
 * Settings' reply alerts switch (.scratch/push-alerts/spec.md: "Settings"): for this device only.
 * Hidden while the server has no keys or this browser can't take Web Push.
 */
export function AlertsSetting() {
    const [state, setState] = useState<State>({ kind: 'hidden' });
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const headingId = useId();
    const noteId = useId();
    const switchId = useId();

    useEffect(() => {
        if (!pushSupported()) return;
        let cancelled = false;
        (async () => {
            const { publicKey } = await fetchPushConfig();
            if (!publicKey || cancelled) return;
            const subscription = Notification.permission === 'granted' ? await currentSubscription() : null;
            if (cancelled) return;
            setState({ kind: 'ready', publicKey, on: subscription !== null });
            if (Notification.permission === 'denied') setMessage(DENIED);
            // Keeps the server in step: it may have dropped this device, or another Account used it.
            if (subscription) await storeSubscription(subscription).catch(() => {});
        })().catch(() => {
            // Without the config the card stays hidden; nothing else depends on it.
        });
        return () => {
            cancelled = true;
        };
    }, []);

    if (state.kind === 'hidden') return null;

    const toggle = async () => {
        setBusy(true);
        setMessage(null);
        try {
            if (state.on) {
                await turnOffAlerts();
                setState({ ...state, on: false });
            } else if ((await turnOnAlerts(state.publicKey)) === 'on') {
                setState({ ...state, on: true });
            } else {
                setMessage(DENIED);
            }
        } catch (error) {
            setMessage(failureText(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="card" aria-labelledby={headingId}>
            <h3 id={headingId} className="card-title">
                Alerts
            </h3>
            <div className="flex flex-wrap items-center justify-between gap-3">
                <p id={noteId} className="m-0 min-w-0 flex-1 basis-48">
                    Alert me when a reply is ready
                </p>
                <button
                    id={switchId}
                    type="button"
                    role="switch"
                    aria-checked={state.on}
                    aria-labelledby={`${noteId} ${switchId}`}
                    className={`bare-button min-h-11 min-w-20 shrink-0 cursor-pointer rounded-full border px-3 py-2 text-md font-semibold press focus-ring disabled:cursor-not-allowed disabled:opacity-55 ${state.on ? PILL_ON : PILL_OFF}`}
                    disabled={busy}
                    onClick={toggle}
                >
                    {state.on ? 'On' : 'Off'}
                </button>
            </div>
            <p className="muted mb-0">
                When a reply or a Snapshot is ready while Storytell is in the background, this device shows a short alert, such as &ldquo;Nara replied · Chat 2&rdquo;. It never shows the story.
            </p>
            {message && (
                <p role="alert" className="field-error mb-0">
                    {message}
                </p>
            )}
        </section>
    );
}

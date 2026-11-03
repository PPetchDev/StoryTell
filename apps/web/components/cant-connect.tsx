'use client';

import { useState } from 'react';

import { apiFetch } from '@/lib/api';

// public/offline.html is the same screen, served by the service worker when this Next.js
// server can't be reached either. Keep the two in step.
export function CantConnect({ onRecovered }: { onRecovered: () => void }) {
    const [checking, setChecking] = useState(false);
    const [stillDown, setStillDown] = useState(false);

    const retry = async () => {
        setChecking(true);
        try {
            await apiFetch('/health');
            onRecovered();
        } catch {
            setStillDown(true);
            setChecking(false);
        }
    };

    return (
        <main className="page cant-connect">
            <h1>Can&apos;t connect</h1>
            <p>Storytell AI runs on your home PC. Check that:</p>
            <ul className="checklist">
                <li>this device is connected to the internet</li>
                <li>the PC is on</li>
                <li>Tailscale is connected on this device</li>
            </ul>
            <button type="button" className="button" onClick={retry} disabled={checking}>
                {checking ? 'Retrying…' : 'Retry'}
            </button>
            {stillDown && !checking && <p className="muted">Still can&apos;t connect.</p>}
        </main>
    );
}

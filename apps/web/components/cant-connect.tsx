'use client';

import { useState } from 'react';

import { apiFetch } from '@/lib/api';

// public/offline.html is the same screen, served by the service worker when this Next.js
// server can't be reached either. Keep the two in step (it has no edits to keep, so no `waiting` line).
export function CantConnect({ onRecovered, waiting = 0 }: { onRecovered: () => Promise<void>; waiting?: number }) {
    const [checking, setChecking] = useState(false);
    const [stillDown, setStillDown] = useState(false);

    const retry = async () => {
        setChecking(true);
        try {
            await apiFetch('/health');
            await onRecovered();
        } catch {
            setStillDown(true);
            setChecking(false);
        }
    };

    return (
        <main className="page">
            <h1>Can&apos;t connect</h1>
            <p>Storytell AI runs on your home PC. Check that:</p>
            <ul className="m-0 mb-6 rounded-md bg-surface py-4 pr-4 pl-9">
                <li>this device is connected to the internet</li>
                <li>the PC is on</li>
                <li>Tailscale is connected on this device</li>
            </ul>
            {waiting > 0 && (
                <p className="notice">
                    {waiting === 1 ? 'An edit' : `${waiting} edits`} couldn&apos;t be saved yet. {waiting === 1 ? 'It is' : 'They are'} kept
                    while this tab stays open, and saved when Retry connects.
                </p>
            )}
            <button type="button" className="button" onClick={retry} disabled={checking} aria-busy={checking}>
                {checking ? 'Retrying…' : 'Retry'}
            </button>
            {/* There from the start and empty, so the result of a retry is read out (audit L7). */}
            <p className="muted" role="status">
                {stillDown && !checking ? "Still can't connect." : ''}
            </p>
        </main>
    );
}

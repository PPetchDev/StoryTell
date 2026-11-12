'use client';

import { useEffect, useState } from 'react';

type Politeness = 'polite' | 'assertive';

let speak: ((message: string, politeness: Politeness) => void) | null = null;

/**
 * Says `message` to screen readers once, through the app's one pair of live regions (mounted by
 * the root layout). For what happens out of sight or without a visible change: "Moved to position
 * 2 of 5", "3 candidates ready", "Reply from Mira". Visible text that changes should still be in
 * its own role="status" region; this is for the rest. Saying the same thing twice says it twice.
 */
export function announce(message: string, politeness: Politeness = 'polite') {
    speak?.(message, politeness);
}

/**
 * The live regions behind `announce`, mounted once in the root layout. They exist from the first
 * paint and start empty, which is what makes screen readers read what is put in them later.
 */
export function Announcer() {
    const [said, setSaid] = useState<Record<Politeness, string>>({ polite: '', assertive: '' });

    useEffect(() => {
        let frame = 0;
        speak = (message, politeness) => {
            // Cleared, then set on the next frame, so a repeat of the same words is a change too.
            setSaid((current) => ({ ...current, [politeness]: '' }));
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => setSaid((current) => ({ ...current, [politeness]: message })));
        };
        return () => {
            speak = null;
            cancelAnimationFrame(frame);
        };
    }, []);

    return (
        <>
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {said.polite}
            </div>
            <div className="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
                {said.assertive}
            </div>
        </>
    );
}

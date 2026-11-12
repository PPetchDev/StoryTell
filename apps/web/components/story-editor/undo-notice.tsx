'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { UndoIcon } from '@/components/icons';

/** Something just removed or reset in one tap, and how to put it back (audit H3). */
export interface UndoOffer {
    /** What happened, said and shown: "Removed example line 2." */
    message: string;
    undo(): void;
    /** Where focus goes once it is put back: the restored item's own button, say. */
    focusAfterUndo?(): HTMLElement | null | undefined;
}

type Shown = UndoOffer & { key: number };

/** How long the offer stays while nothing holds it; focus or a pointer over it keeps it up (WCAG 2.2.1). */
const SHOW_MS = 8000;
/** Once focus or the pointer leaves it, the time it still stays. */
const LINGER_MS = 4000;

/** The offer one list shows, and `offer(...)` to make it after a one-tap removal. */
export function useUndo() {
    const [shown, setShown] = useState<Shown | null>(null);
    const count = useRef(0);
    const offer = useCallback((next: UndoOffer) => setShown({ ...next, key: ++count.current }), []);
    const dismiss = useCallback(() => setShown(null), []);
    return { shown, offer, dismiss };
}

/**
 * "Removed example line 2. Undo", where the removed thing was: for removals that are quick to make
 * again and cheap to lose, which act at once rather than ask. Focus moves to Undo, since the button
 * that removed it is gone (audit H2), and the message is said once. It goes after a few seconds,
 * but not while focus or the pointer is on it.
 */
export function UndoNotice({ undo: { shown, dismiss } }: { undo: ReturnType<typeof useUndo> }) {
    const button = useRef<HTMLButtonElement>(null);
    const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const held = useRef(false);

    const wait = useCallback(
        (ms: number) => {
            clearTimeout(timer.current);
            timer.current = setTimeout(() => {
                if (!held.current) dismiss();
            }, ms);
        },
        [dismiss],
    );

    useEffect(() => {
        if (!shown) return;
        announce(shown.message);
        button.current?.focus();
        wait(SHOW_MS);
        return () => clearTimeout(timer.current);
    }, [shown, wait]);

    if (!shown) return null;
    const hold = () => {
        held.current = true;
        clearTimeout(timer.current);
    };
    const release = () => {
        held.current = false;
        wait(LINGER_MS);
    };
    return (
        <div
            className="notice mt-2 flex flex-wrap items-center gap-x-3 gap-y-2"
            onFocus={hold}
            onBlur={release}
            onPointerEnter={hold}
            onPointerLeave={release}
        >
            <span className="min-w-0 flex-1">{shown.message}</span>
            <button
                ref={button}
                type="button"
                className="button button-quiet button-small"
                onClick={() => {
                    held.current = false;
                    shown.undo();
                    dismiss();
                    announce('Put back.');
                    requestAnimationFrame(() => shown.focusAfterUndo?.()?.focus());
                }}
            >
                <UndoIcon size={16} />
                Undo
            </button>
        </div>
    );
}

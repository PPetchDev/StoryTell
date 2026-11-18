'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { COLUMN, ICON_BUTTON, SHORT_HIDDEN } from '@/components/chat/chat-classes';
import { useConnection } from '@/components/connection';
import { CloseIcon } from '@/components/icons';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { RecapEntry, recapApi } from '@/lib/recap';

interface RecapCardProps {
    storyId: number;
    chatId: number;
    /** The Chat's newest Message: the card shows only a Recap written at it, and goes once another follows. */
    newestMessageId: number | null;
    /** Counts the asks from the Chat menu's "Previously on…"; each new one shows the card. */
    openRequest: number;
}

type Phase = 'writing' | 'written' | 'failed' | 'nothing';

/** The API's answer for a Chat with nothing after its Opening (docs/error-codes.md). */
const NOTHING_TO_RECAP = '409.004.120';

/**
 * "Previously on…" (.scratch/previously-on/spec.md): coming back to a Chat after 6 hours or more, a
 * short recap of where the story stands sits above the thread until the user dismisses it; the Chat
 * menu shows it on demand. A failed write shows a quiet Try again, never an error. It gives way on a
 * short screen (the keyboard up), and goes as soon as a new Message follows the one it tells of.
 */
export function RecapCard({ storyId, chatId, newestMessageId, openRequest }: RecapCardProps) {
    const { reportUnreachable } = useConnection();
    const [open, setOpen] = useState(false);
    const [phase, setPhase] = useState<Phase>('writing');
    const [recap, setRecap] = useState<RecapEntry | null>(null);
    const alive = useRef(true);
    const newestRef = useRef(newestMessageId);
    newestRef.current = newestMessageId;

    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    const quiet = useCallback(
        (caught: unknown) => {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
        },
        [reportUnreachable],
    );

    const write = useCallback(async () => {
        setPhase('writing');
        try {
            const view = await recapApi.write(storyId, chatId);
            if (!alive.current) return;
            setRecap(view.recap);
            setPhase(view.recap ? 'written' : 'failed');
        } catch (caught) {
            if (!alive.current) return;
            quiet(caught);
            setPhase(caught instanceof ApiError && caught.code === NOTHING_TO_RECAP ? 'nothing' : 'failed');
        }
    }, [storyId, chatId, quiet]);

    // Opening the Chat: shown by itself when one is due, written first if there is none yet.
    useEffect(() => {
        let current = true;
        void (async () => {
            try {
                const view = await recapApi.get(storyId, chatId);
                if (!current || !view.due) return;
                setOpen(true);
                if (view.recap) {
                    setRecap(view.recap);
                    setPhase('written');
                } else {
                    await write();
                }
            } catch (caught) {
                // Nothing shows when it can't even be read: the Chat itself says so.
                if (current) quiet(caught);
            }
        })();
        return () => {
            current = false;
        };
    }, [storyId, chatId, write, quiet]);

    // The Chat menu's "Previously on…": the one for the newest Message, or a new one.
    useEffect(() => {
        if (openRequest === 0) return;
        setOpen(true);
        if (recap && recap.messageId === newestRef.current) {
            setPhase('written');
            return;
        }
        setRecap(null);
        void write();
        // Only a new ask opens it, never a change of what it shows.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [openRequest]);

    // A new Message (sent, continued, or one taken back): the recap no longer tells where the story is.
    useEffect(() => {
        if (recap && recap.messageId !== newestMessageId) {
            setOpen(false);
            setRecap(null);
        }
    }, [recap, newestMessageId]);

    if (!open) return null;

    const dismiss = () => {
        setOpen(false);
        if (recap && !recap.dismissed) {
            setRecap({ ...recap, dismissed: true });
            recapApi.dismiss(storyId, chatId).catch(quiet);
        }
    };

    return (
        <section
            className={`-mx-2 shrink-0 border-b border-line bg-surface px-2 py-1.5 ${COLUMN} ${SHORT_HIDDEN}`}
            aria-labelledby={`recap-heading-${chatId}`}
            data-recap
        >
            <div className="flex items-center gap-2">
                <h2 id={`recap-heading-${chatId}`} className="m-0 min-w-0 flex-1 text-sm font-semibold italic text-text">
                    Previously on…
                </h2>
                <button type="button" className={ICON_BUTTON} aria-label="Dismiss the recap" onClick={dismiss}>
                    <CloseIcon size={18} />
                </button>
            </div>
            {phase === 'written' && recap ? (
                <p className="m-0 max-h-[40vh] overflow-y-auto pb-1 text-sm leading-relaxed whitespace-pre-wrap text-text [overflow-wrap:anywhere]" data-recap-text>
                    {recap.text}
                </p>
            ) : phase === 'writing' ? (
                <p role="status" className="m-0 pb-1 text-sm text-muted motion-safe:animate-pulse-soft">
                    Writing a recap of where the story stands…
                </p>
            ) : phase === 'nothing' ? (
                <p className="m-0 pb-1 text-sm text-muted">Nothing has happened yet: play a little first.</p>
            ) : (
                <div className="flex flex-wrap items-center justify-between gap-x-2 pb-1">
                    <p className="m-0 text-sm text-muted">Couldn’t write the recap.</p>
                    <button type="button" className="button button-quiet button-small min-h-11" onClick={() => void write()}>
                        Try again
                    </button>
                </div>
            )}
        </section>
    );
}

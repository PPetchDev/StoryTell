'use client';

import { useEffect, useId, useState } from 'react';
import { COLUMN, SHORT_HIDDEN } from '@/components/chat/chat-classes';
import { ChevronDownIcon, EndingIcon } from '@/components/icons';
import { Chat, ChatEnding } from '@/lib/chat';

/**
 * Whether the Chat has an Epilogue for the Ending it reached: an AI Message written as one, after
 * the Message the story reached the Ending with.
 */
export function epilogueWritten(chat: Pick<Chat, 'messages' | 'ending'>): boolean {
    if (!chat.ending) return false;
    const at = chat.messages.findIndex((message) => message.id === chat.ending!.messageId);
    return chat.messages.some((message, index) => index > at && message.kind === 'ai' && message.epilogue);
}

/**
 * What a screen reader hears when the Chat reaches an Ending, or null when it reached none just
 * now. The banner shows the same; this says it once, when it happens.
 */
export function endingAnnouncement(before: ChatEnding | null, now: ChatEnding | null): string | null {
    if (!now || (before && before.messageId === now.messageId && before.name === now.name)) return null;
    const reason = now.reason ? ` ${now.reason}` : '';
    if (now.suggested) return `The story may have reached its end: ${now.name}.${reason} You can ask for the epilogue, or say not yet and play on.`;
    return `Ending reached: ${now.name}.${reason} You can ask for the epilogue, or play on.`;
}

/** What an Epilogue costs, in the words the Diary uses for an entry (audit L7): it is one more reply from the play model, and a long one. */
export const EPILOGUE_COST = 'Writing it uses credit like one long reply.';

interface EndingBannerProps {
    ending: ChatEnding;
    /** The Epilogue is written: the banner folds to one line. */
    written: boolean;
    /** Whether an Epilogue can be asked for now: no turn or write in flight, and sending not blocked. */
    canWrite: boolean;
    /** Why it can't be, when the reason is one that lasts (credit out, a Story with empty fields); null while it can, or only waits a moment. */
    whyNot: string | null;
    /** A write is in flight: "Not yet" waits. */
    busy: boolean;
    /** The story reached it during this visit: the banner opens to say why, once. On a later visit it is one row. */
    fresh: boolean;
    onWrite(): void;
    /** Waves a suggested Ending away; the author's has no such way out. */
    onDismiss(): void;
}

/**
 * The Ending the Chat reached, under the Scene strip (.scratch/endings/spec.md): one row with its
 * name and a button that asks for the Epilogue. One the Judge suggested says so, and has "Not yet"
 * beside it, which takes it away and stops the suggestions in this Chat (the Chat menu turns them
 * back on). A tap on the name opens what brought the story there and what the buttons do; one
 * reached while playing starts open, and folds by itself when the next turn begins. Where the name
 * and the buttons don't fit one row (a suggested one, on a phone) the buttons take a row under it.
 * The story can be played on either way; once the Epilogue is written the banner is one quiet
 * line. The Chat re-reads until each turn's background calls settle, so it shows a moment after
 * the reply that reached it.
 *
 * It was a block of 160px that stayed until the Epilogue was written, on top of the Scene strip
 * and a Sudden event (docs/ui-audit-2026-11-16.md H1): now it is a row, and on a short screen
 * (the keyboard up) it is not there at all. "End the story" in the Chat menu asks for the same Epilogue.
 */
export function EndingBanner({ ending, written, canWrite, whyNot, busy, fresh, onWrite, onDismiss }: EndingBannerProps) {
    const [open, setOpen] = useState(fresh);
    const detailsId = useId();
    // Open only for the moment it was reached in: the next turn folds it to its row again.
    useEffect(() => {
        if (busy) setOpen(false);
    }, [busy]);
    if (written) {
        return (
            <section className={`-mx-2 shrink-0 border-b border-line bg-surface px-2 py-1.5 ${COLUMN} ${SHORT_HIDDEN}`} aria-label="Ending" data-epilogue="written">
                <p className="m-0 truncate text-sm text-muted">
                    <EndingIcon size={14} className="mr-1 inline-block shrink-0 align-[-0.15em] text-accent" />
                    Ending: <strong className="font-semibold text-text">{ending.name}</strong>
                </p>
            </section>
        );
    }
    return (
        <section
            className={`-mx-2 shrink-0 border-b border-line bg-surface ${COLUMN} ${SHORT_HIDDEN}`}
            aria-label="Ending"
            data-epilogue="none"
            data-suggested={ending.suggested || undefined}
        >
            <div className="flex flex-wrap items-center gap-x-1.5 pr-2">
                {/*
                  * The disclosure button inside a heading, as an accordion's is: the Ending's name stays a heading a
                  * screen reader can jump to, as it was before the banner became one row.
                  */}
                <h2 className="m-0 flex min-w-0 flex-[1_1_9rem] text-base font-normal">
                    <button
                        type="button"
                        className="bare-button flex min-h-11 min-w-0 flex-1 cursor-pointer items-center gap-1.5 px-2 py-1 text-left focus-ring-inset"
                        aria-expanded={open}
                        aria-controls={open ? detailsId : undefined}
                        onClick={() => setOpen((was) => !was)}
                    >
                        <EndingIcon size={16} className="shrink-0 text-accent" />
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-semibold text-muted">{ending.suggested ? 'Suggested ending' : 'Ending reached'}</span>
                            <span className={`block text-sm font-semibold text-text ${open ? '[overflow-wrap:anywhere]' : 'truncate'}`}>{ending.name}</span>
                        </span>
                        <ChevronDownIcon size={16} className={`shrink-0 text-muted ${open ? 'rotate-180' : ''}`} />
                    </button>
                </h2>
                {/* 44px tall, so the small buttons' touch areas fill it and no more, on the row or under it. */}
                <div className="ml-auto flex h-11 shrink-0 items-center gap-2 pl-2">
                    {ending.suggested && (
                        <button type="button" className="button button-quiet button-small" disabled={busy} onClick={onDismiss} aria-label="Not yet: this is not the end">
                            Not yet
                        </button>
                    )}
                    <button type="button" className="button button-small" disabled={!canWrite} onClick={onWrite}>
                        Write the epilogue
                    </button>
                </div>
            </div>
            {/* Why the button is off, when that lasts: in sight without a tap (audit L8). */}
            {whyNot && (
                <p className="m-0 px-2 pb-1.5 text-xs text-muted" data-why-not>
                    {whyNot}
                </p>
            )}
            {open && (
                <div id={detailsId} className="px-2 pb-2" data-ending-details>
                    {ending.reason !== '' && <p className="m-0 text-sm text-text [overflow-wrap:anywhere]">{ending.reason}</p>}
                    <p className="m-0 mt-1 text-xs text-muted">
                        {ending.suggested
                            ? 'The story may have reached its end. “Not yet” stops these suggestions here; the Chat menu turns them back on. You can play on after the epilogue.'
                            : 'The epilogue closes the story. You can still play on, with or without it.'}{' '}
                        {EPILOGUE_COST}
                    </p>
                </div>
            )}
        </section>
    );
}

'use client';

import { COLUMN } from '@/components/chat/chat-classes';
import { EndingIcon } from '@/components/icons';
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

interface EndingBannerProps {
    ending: ChatEnding;
    /** The Epilogue is written: the banner folds to one line. */
    written: boolean;
    /** Whether an Epilogue can be asked for now: no turn or write in flight, and sending not blocked. */
    canWrite: boolean;
    /** A write is in flight: "Not yet" waits. */
    busy: boolean;
    onWrite(): void;
    /** Waves a suggested Ending away; the author's has no such way out. */
    onDismiss(): void;
}

/**
 * The Ending the Chat reached, under the Scene strip (.scratch/endings/spec.md): its name, what
 * brought the story there, and a button that asks for the Epilogue. One the Judge suggested says
 * "may", and has "Not yet" beside it, which takes it away and stops the suggestions in this Chat.
 * The story can be played on either way; once the Epilogue is written the banner is one quiet
 * line. The Chat re-reads until each turn's background calls settle, so it shows a moment after
 * the reply that reached it.
 */
export function EndingBanner({ ending, written, canWrite, busy, onWrite, onDismiss }: EndingBannerProps) {
    if (written) {
        return (
            <section className={`-mx-2 shrink-0 border-b border-line bg-surface px-2 py-1.5 ${COLUMN}`} aria-label="Ending" data-epilogue="written">
                <p className="m-0 truncate text-sm text-muted">
                    <EndingIcon size={14} className="mr-1 inline-block shrink-0 align-[-0.15em] text-accent" />
                    Ending: <strong className="font-semibold text-text">{ending.name}</strong>
                </p>
            </section>
        );
    }
    return (
        <section
            className={`-mx-2 shrink-0 border-b border-line bg-surface px-2 py-2 ${COLUMN}`}
            aria-label="Ending"
            data-epilogue="none"
            data-suggested={ending.suggested || undefined}
        >
            <p className="m-0 text-xs font-semibold text-muted">{ending.suggested ? 'The story may have reached its end' : 'Ending reached'}</p>
            <h2 className="m-0 text-sm font-semibold text-text [overflow-wrap:anywhere]">
                <EndingIcon size={14} className="mr-1 inline-block shrink-0 align-[-0.15em] text-accent" />
                {ending.name}
            </h2>
            {ending.reason !== '' && <p className="m-0 mt-1 text-sm text-text [overflow-wrap:anywhere]">{ending.reason}</p>}
            <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" className="button button-small" disabled={!canWrite} onClick={onWrite}>
                    Write the epilogue
                </button>
                {ending.suggested && (
                    <button type="button" className="button button-quiet button-small" disabled={busy} onClick={onDismiss} aria-label="Not yet: this is not the end">
                        Not yet
                    </button>
                )}
            </div>
            <p className="m-0 mt-1.5 text-xs text-muted">
                {ending.suggested
                    ? 'The epilogue closes the story; you can still play on after it. “Not yet” stops these suggestions in this Chat.'
                    : 'The epilogue closes the story. You can still play on, with or without it.'}
            </p>
        </section>
    );
}

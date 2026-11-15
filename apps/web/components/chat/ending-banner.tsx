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
    if (!now || before?.id === now.id) return null;
    return `Ending reached: ${now.name}.${now.reason ? ` ${now.reason}` : ''} You can ask for the epilogue, or play on.`;
}

interface EndingBannerProps {
    ending: ChatEnding;
    /** The Epilogue is written: the banner folds to one line. */
    written: boolean;
    /** Whether an Epilogue can be asked for now: no turn or write in flight, and sending not blocked. */
    canWrite: boolean;
    onWrite(): void;
}

/**
 * The Ending the Chat reached, under the Scene strip (.scratch/endings/spec.md): its name, what
 * brought the story there, and a button that asks for the Epilogue. The story can be played on
 * either way; once the Epilogue is written the banner is one quiet line. The Chat re-reads until
 * each turn's background calls settle, so it shows a moment after the reply that reached it.
 */
export function EndingBanner({ ending, written, canWrite, onWrite }: EndingBannerProps) {
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
        <section className={`-mx-2 shrink-0 border-b border-line bg-surface px-2 py-2 ${COLUMN}`} aria-label="Ending" data-epilogue="none">
            <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                    <p className="m-0 text-xs font-semibold text-muted">Ending reached</p>
                    <h2 className="m-0 text-sm font-semibold text-text [overflow-wrap:anywhere]">
                        <EndingIcon size={14} className="mr-1 inline-block shrink-0 align-[-0.15em] text-accent" />
                        {ending.name}
                    </h2>
                </div>
                <button type="button" className="button button-small shrink-0" disabled={!canWrite} onClick={onWrite}>
                    Write the epilogue
                </button>
            </div>
            {ending.reason !== '' && <p className="m-0 mt-1 text-sm text-text [overflow-wrap:anywhere]">{ending.reason}</p>}
            <p className="m-0 mt-1 text-xs text-muted">The epilogue closes the story. You can still play on, with or without it.</p>
        </section>
    );
}

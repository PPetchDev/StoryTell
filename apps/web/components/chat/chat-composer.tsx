'use client';

import Link from 'next/link';
import { FormEvent, useLayoutEffect, useRef } from 'react';

import { Chat, latestReply, modelLabel } from '@/lib/chat';

import styles from './chat-composer.module.css';

interface NoticesProps {
    chat: Chat;
    onRetryJudge(messageId: number): void;
    onRetryExtraction(messageId: number): void;
    retrying: boolean;
}

/** What stands between the user and the next turn, if anything. */
function Notices({ chat, onRetryJudge, onRetryExtraction, retrying }: NoticesProps) {
    const reply = latestReply(chat);
    return (
        <>
            {reply?.judge?.status === 'failed' && (
                <p className="notice" role="status">
                    Sending is blocked: the last reply&apos;s Bond, Arc and Scene judge failed ({reply.judge.error}).{' '}
                    <button type="button" className="button button-quiet" disabled={retrying} onClick={() => onRetryJudge(reply.id)}>
                        {retrying ? 'Retrying…' : 'Retry'}
                    </button>
                </p>
            )}
            {reply?.memory?.status === 'failed' && (
                <p className="notice" role="status">
                    Sending is blocked: the last reply&apos;s Memory extraction failed ({reply.memory.error}).{' '}
                    <button type="button" className="button button-quiet" disabled={retrying} onClick={() => onRetryExtraction(reply.id)}>
                        {retrying ? 'Retrying…' : 'Retry'}
                    </button>
                </p>
            )}
            {!chat.playable && (
                <p className="notice" role="status">
                    Sending is blocked: the Story has empty fields. Still to fill in:{' '}
                    {chat.missing.map((field) => field.label).join(', ')}.{' '}
                    <Link href={`/stories/${chat.storyId}`}>Edit Story</Link>
                </p>
            )}
            {chat.textCreditOut && (
                <p className="notice" role="status">
                    Sending is blocked: text credit is used up. <Link href="/usage">See usage</Link>
                </p>
            )}
            {chat.drift && (
                <p className="notice" role="status">
                    Drift notice: the last reply came from {modelLabel(chat.drift.lastModel)}; the play model is now{' '}
                    {modelLabel(chat.drift.playModel)}. Characters may sound different from here on.
                </p>
            )}
        </>
    );
}

/**
 * Fits the box to its text, from one row up to the CSS max-height (about five lines), past
 * which it scrolls (spec: "Composer").
 */
function useAutoGrow(value: string) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const box = ref.current;
        if (!box) return;
        box.style.height = 'auto';
        const borders = box.offsetHeight - box.clientHeight;
        box.style.height = `${box.scrollHeight + borders}px`;
    }, [value]);
    return ref;
}

interface ChatComposerProps {
    chat: Chat;
    draft: string;
    /** A turn is being written. */
    writing: boolean;
    /** A write that runs no turn is in flight (an edit, Reset, a retry). */
    busy: boolean;
    /** Sending is blocked: the Story isn't playable or text credit is out. */
    blocked: boolean;
    error: string | null;
    rollback: string | null;
    snapshotError: string | null;
    onDraft(text: string): void;
    onSend(): void;
    onRetry(): void;
    onRetryJudge(messageId: number): void;
    onRetryExtraction(messageId: number): void;
}

/** Under the thread: what blocks or failed, and the box the user writes in. */
export function ChatComposer({
    chat,
    draft,
    writing,
    busy,
    blocked,
    error,
    rollback,
    snapshotError,
    onDraft,
    onSend,
    onRetry,
    onRetryJudge,
    onRetryExtraction,
}: ChatComposerProps) {
    const box = useAutoGrow(draft);
    const send = (event: FormEvent) => {
        event.preventDefault();
        onSend();
    };
    return (
        <footer className={styles.composer}>
            {rollback && (
                <p className="notice rollback-notice" role="status">
                    {rollback}
                </p>
            )}
            <Notices chat={chat} onRetryJudge={onRetryJudge} onRetryExtraction={onRetryExtraction} retrying={busy} />
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            {chat.awaitingReply && !writing && (
                <p className="notice" role="status">
                    The last turn failed. Your message is kept.{' '}
                    <button type="button" className="button button-quiet" disabled={blocked} onClick={onRetry}>
                        Retry
                    </button>
                </p>
            )}
            {snapshotError && (
                <p role="alert" className="turn-error">
                    {snapshotError}
                </p>
            )}
            <form className={styles.form} onSubmit={send} aria-label="Composer">
                {/* Ticket 07's ⚡ Suggested replies button goes here, left of the box. */}
                <textarea
                    ref={box}
                    aria-label={`Write as ${chat.identityName}`}
                    placeholder={`Write as ${chat.identityName}…`}
                    value={draft}
                    rows={1}
                    enterKeyHint="send"
                    disabled={writing || blocked}
                    onChange={(event) => onDraft(event.target.value)}
                    onKeyDown={(event) => {
                        // Enter sends and Shift+Enter is a new line; Enter that ends an IME composition (Thai, say) only confirms it.
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                        }
                    }}
                />
                {/* Ticket 05: while the box is empty or whitespace this becomes ▶ Continue. */}
                <button type="submit" className={styles.send} aria-label="Send" disabled={writing || blocked || draft.trim() === ''}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                        <path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.3 1l1.5 6.1c.1.4.5.7.9.8L12 12l-7.5.5c-.4 0-.8.4-.9.8l-1.5 6.1c-.1.7.6 1.3 1.3 1z" />
                    </svg>
                </button>
            </form>
        </footer>
    );
}

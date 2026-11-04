'use client';

import Link from 'next/link';
import { FormEvent } from 'react';

import { Camera } from '@/components/chat/snapshots';
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

interface ChatComposerProps {
    chat: Chat;
    draft: string;
    /** A turn is being written. */
    writing: boolean;
    /** A write that runs no turn is in flight (an edit, Reset, a retry). */
    busy: boolean;
    /** A Message is being edited in place. */
    editing: boolean;
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
    onTakeSnapshot(hint: string): void;
}

/** Under the thread: what blocks or failed, the camera, and the box the user writes in. */
export function ChatComposer({
    chat,
    draft,
    writing,
    busy,
    editing,
    blocked,
    error,
    rollback,
    snapshotError,
    onDraft,
    onSend,
    onRetry,
    onRetryJudge,
    onRetryExtraction,
    onTakeSnapshot,
}: ChatComposerProps) {
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
            <Camera
                disabledNote={chat.imageCreditOut ? 'Snapshots are off: image credit is used up. Play goes on.' : null}
                busy={writing || busy || editing}
                error={snapshotError}
                onTake={onTakeSnapshot}
            />
            <form className={styles.form} onSubmit={send} aria-label="Composer">
                <textarea
                    aria-label={`Write as ${chat.identityName}`}
                    placeholder={`Write as ${chat.identityName}…`}
                    value={draft}
                    rows={3}
                    disabled={writing || blocked}
                    onChange={(event) => onDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                            event.currentTarget.form?.requestSubmit();
                        }
                    }}
                />
                <button type="submit" className="button" disabled={writing || blocked || draft.trim() === ''}>
                    {writing ? 'Writing…' : 'Send'}
                </button>
            </form>
        </footer>
    );
}

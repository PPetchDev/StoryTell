'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiUnreachableError } from '@/lib/api';
import { Chat, chatApi, latestReply, modelLabel, SuggestedReply } from '@/lib/chat';

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
                    Sending is paused: the Characters&apos; feelings and the Scene couldn&apos;t update after the last reply.{' '}
                    <button type="button" className="button button-quiet" disabled={retrying} onClick={() => onRetryJudge(reply.id)}>
                        {retrying ? 'Retrying…' : 'Retry'}
                    </button>
                </p>
            )}
            {reply?.memory?.status === 'failed' && (
                <p className="notice" role="status">
                    Sending is paused: Memories couldn&apos;t update after the last reply.{' '}
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

/** The cards ⚡ shows: nothing, the short wait, the three, or a failed ask. */
type Suggestions =
    | { status: 'closed' }
    | { status: 'loading'; afterMessageId: number | null }
    | { status: 'ready'; afterMessageId: number | null; replies: SuggestedReply[] }
    | { status: 'failed'; afterMessageId: number | null };

/**
 * Spec: "Suggested replies". ⚡ asks for three, and ⚡ again closes them. They are made for
 * the Chat as it stands, so once a new Message arrives (a send, Continue, an edit) they are
 * gone: never cached across turns. An answer that comes back after they were closed is dropped.
 */
function useSuggestedReplies(chat: Chat) {
    const { reportUnreachable } = useConnection();
    const [state, setState] = useState<Suggestions>({ status: 'closed' });
    const asked = useRef(0);
    const newestId = chat.messages[chat.messages.length - 1]?.id ?? null;
    const shown: Suggestions = state.status !== 'closed' && state.afterMessageId === newestId ? state : { status: 'closed' };

    const close = () => {
        asked.current++;
        setState({ status: 'closed' });
    };

    const toggle = async () => {
        if (shown.status !== 'closed') return close();
        const ask = ++asked.current;
        setState({ status: 'loading', afterMessageId: newestId });
        try {
            const { suggestions } = await chatApi.suggest(chat.storyId, chat.id);
            if (asked.current === ask) setState({ status: 'ready', afterMessageId: newestId, replies: suggestions });
        } catch (caught) {
            if (asked.current !== ask) return;
            if (caught instanceof ApiUnreachableError) {
                setState({ status: 'closed' });
                reportUnreachable();
            } else {
                setState({ status: 'failed', afterMessageId: newestId });
            }
        }
    };

    return { shown, toggle, close };
}

const SUGGESTION_KIND_LABEL: Record<SuggestedReply['kind'], string> = {
    action: 'Do',
    speech: 'Say',
    move: 'Bold move',
};

/** Above the box: the wait, the error, or the three cards. A tap on a card only fills the box. */
function SuggestionCards({ suggestions, onPick }: { suggestions: Suggestions; onPick(text: string): void }) {
    if (suggestions.status === 'loading') {
        return (
            <p className={styles.suggesting} role="status">
                Thinking up replies…
            </p>
        );
    }
    if (suggestions.status === 'failed') {
        return (
            <p role="alert" className="turn-error">
                Couldn&apos;t suggest replies, try again
            </p>
        );
    }
    if (suggestions.status !== 'ready') return null;
    return (
        <ul className={styles.suggestions} aria-label="Suggested replies">
            {suggestions.replies.map((reply) => (
                <li key={reply.kind}>
                    <button type="button" className={styles.card} onClick={() => onPick(reply.text)}>
                        <span className={styles.cardKind}>{SUGGESTION_KIND_LABEL[reply.kind]}</span>
                        <span>{reply.text}</span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

/** Sets the box's height to its text's, which the CSS max-height caps. */
function fitToText(box: HTMLTextAreaElement) {
    box.style.height = 'auto';
    const borders = box.offsetHeight - box.clientHeight;
    box.style.height = `${box.scrollHeight + borders}px`;
}

/**
 * Fits the box to its text, from one row up to about five lines, past which it scrolls
 * (spec: "Composer"). A new width (a turned phone) rewraps the text, so it fits again then.
 */
function useAutoGrow(value: string) {
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        if (ref.current) fitToText(ref.current);
    }, [value]);
    useEffect(() => {
        const refit = () => {
            if (ref.current) fitToText(ref.current);
        };
        window.addEventListener('resize', refit);
        return () => window.removeEventListener('resize', refit);
    }, []);
    return ref;
}

/**
 * The * button: the selected text becomes `*text*` with the caret after it; with nothing
 * selected, an empty `**` pair opens with the caret inside.
 */
export function wrapAction(text: string, start: number, end: number): { next: string; caret: number } {
    const selected = text.slice(start, end);
    const next = `${text.slice(0, start)}*${selected}*${text.slice(end)}`;
    return { next, caret: selected === '' ? start + 1 : end + 2 };
}

/**
 * Enter sends on a physical keyboard (spec: "Composer"). A phone's on-screen keyboard has no
 * Shift+Enter, so where no fine pointer is present, Enter is a new line and the button sends.
 */
function enterSends(): boolean {
    return window.matchMedia('(any-pointer: fine)').matches;
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
    /** ▶ on an empty box: the story goes on without a line from the user. */
    onContinue(): void;
    /** ■ Stop, in place of the send button while a reply is written. */
    onStop(): void;
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
    onContinue,
    onStop,
    onRetry,
    onRetryJudge,
    onRetryExtraction,
}: ChatComposerProps) {
    const box = useAutoGrow(draft);
    const suggestions = useSuggestedReplies(chat);
    const empty = draft.trim() === '';
    const send = (event: FormEvent) => {
        event.preventDefault();
        // Enter on an empty box does nothing; only a tap on ▶ lets the story go on.
        if (empty) return;
        suggestions.close();
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
            <SuggestionCards suggestions={suggestions.shown} onPick={onDraft} />
            <form className={styles.form} onSubmit={send} aria-label="Composer">
                {/* Spec: "Suggested replies". Asks only when tapped, so they never spend credit unasked. */}
                <button
                    type="button"
                    className={styles.suggest}
                    aria-label="Suggest replies"
                    title="Suggest replies"
                    aria-pressed={suggestions.shown.status !== 'closed'}
                    aria-busy={suggestions.shown.status === 'loading'}
                    disabled={writing || busy || blocked}
                    onClick={() => void suggestions.toggle()}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                        <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                    </svg>
                </button>
                <textarea
                    ref={box}
                    aria-label={`Write as ${chat.identityName}`}
                    placeholder={`Write as ${chat.identityName}…`}
                    value={draft}
                    rows={1}
                    disabled={writing || blocked}
                    onChange={(event) => onDraft(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key !== 'Enter' || event.shiftKey || !enterSends()) return;
                        // An Enter that confirms an input method's word (Thai, say) only confirms it; Safari reports it as 229.
                        if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                    }}
                />
                {/* Wraps the selection in *…* (an action, shown in italics), or opens an empty pair at the caret. */}
                <button
                    type="button"
                    className={styles.action}
                    aria-label="Write an action"
                    title="Action: *like this*"
                    disabled={writing || blocked}
                    // Keep the box's focus and selection: a tap on a button would otherwise take them.
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={() => {
                        const el = box.current;
                        if (!el) return;
                        const { next, caret } = wrapAction(draft, el.selectionStart, el.selectionEnd);
                        onDraft(next);
                        requestAnimationFrame(() => {
                            el.focus();
                            el.setSelectionRange(caret, caret);
                        });
                    }}
                >
                    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
                        <path d="M12 4v16M5.1 8l13.8 8M5.1 16l13.8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                </button>
                {writing ? (
                    // Spec: streaming replies. Ends the reply; the API keeps nothing of it.
                    <button type="button" className={`${styles.send} ${styles.stop}`} aria-label="Stop" title="Stop the reply" onClick={onStop}>
                        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
                            <rect x="5" y="5" width="14" height="14" rx="2.5" />
                        </svg>
                    </button>
                ) : empty ? (
                    // Spec: "Continue". Refused while a User Message awaits its reply: Retry is the way on.
                    <button
                        type="button"
                        className={styles.send}
                        aria-label="Continue"
                        title="Let the story go on"
                        disabled={writing || busy || blocked || chat.awaitingReply}
                        onClick={() => {
                            suggestions.close();
                            onContinue();
                        }}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <path d="M8 5.1v13.8c0 .8.9 1.3 1.6.8l10.4-6.9c.6-.4.6-1.2 0-1.6L9.6 4.3C8.9 3.8 8 4.3 8 5.1z" />
                        </svg>
                    </button>
                ) : (
                    <button type="submit" className={styles.send} aria-label="Send" disabled={writing || blocked}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.3 1l1.5 6.1c.1.4.5.7.9.8L12 12l-7.5.5c-.4 0-.8.4-.9.8l-1.5 6.1c-.1.7.6 1.3 1.3 1z" />
                        </svg>
                    </button>
                )}
            </form>
        </footer>
    );
}

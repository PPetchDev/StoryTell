'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiUnreachableError } from '@/lib/api';
import { backgroundNotice, Chat, chatApi, SuggestedReply } from '@/lib/chat';

import styles from './chat-composer.module.css';

interface NoticesProps {
    chat: Chat;
    /** How many of the Chat's Snapshots failed, their automatic retry too. */
    failedSnapshots: number;
    /** Reruns everything that failed in the background. */
    onRetryBackground(): void;
    retrying: boolean;
}

/** What stands between the user and the next turn, if anything. */
function Notices({ chat, failedSnapshots, onRetryBackground, retrying }: NoticesProps) {
    // One notice, in plain words, for everything that didn't save; one Retry reruns all of it.
    const failed = backgroundNotice(chat, failedSnapshots);
    return (
        <>
            {failed && (
                <p className="notice" role="status">
                    {failed}{' '}
                    <button type="button" className="button button-quiet" disabled={retrying} onClick={onRetryBackground}>
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
                    Drift notice: the last reply came from {chat.drift.lastModelLabel}; the play model is now{' '}
                    {chat.drift.playModelLabel}. Characters may sound different from here on.
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

/** ✍️ Write for me: nothing to show, the wait, or a failed ask. */
type Writing = 'idle' | 'writing' | 'failed';

/**
 * .scratch/write-for-me/spec.md, "Web". ✍️ sends the box's text as the draft and puts the answer
 * in its place; Undo puts the draft back while the box still holds exactly the answer. A second
 * tap while it waits cancels: the answer is dropped when it arrives (its credit is already spent).
 */
function useWriteForMe(
    chat: Chat,
    draft: string,
    onDraft: (text: string) => void,
    box: RefObject<HTMLTextAreaElement | null>,
    /** A turn or a Chat write started from elsewhere (Retry, ↺ Again, an edit): a late answer is dropped. */
    chatBusy: boolean,
) {
    const { reportUnreachable } = useConnection();
    const [status, setStatus] = useState<Writing>('idle');
    const [undo, setUndo] = useState<{ before: string; written: string } | null>(null);
    const asked = useRef(0);
    // Leaving the Chat drops a late answer too.
    useEffect(() => () => void asked.current++, []);
    // So does a turn or write started from the thread meanwhile: ✍️ is disabled then, so it can't be cancelled.
    useEffect(() => {
        if (!chatBusy) return;
        asked.current++;
        setStatus((current) => (current === 'writing' ? 'idle' : current));
    }, [chatBusy]);
    // Any change to the box (typing, a Suggested reply, a send) ends the Undo, for good.
    const offered = undo !== null && draft === undo.written;
    useEffect(() => {
        if (undo !== null && draft !== undo.written) setUndo(null);
    }, [draft, undo]);
    // A failure says so until the box changes or ⚡ or ✍️ is tapped; the draft itself is untouched.
    useEffect(() => {
        setStatus((current) => (current === 'failed' ? 'idle' : current));
    }, [draft]);

    const cancel = () => {
        asked.current++;
        setStatus('idle');
    };

    const toggle = async () => {
        if (status === 'writing') return cancel();
        const ask = ++asked.current;
        const before = draft;
        // A new Write for me ends the last one's Undo; a tap on it meanwhile would fight the answer.
        setUndo(null);
        setStatus('writing');
        try {
            const { text } = await chatApi.writeForMe(chat.storyId, chat.id, before);
            if (asked.current !== ask) return;
            setStatus('idle');
            setUndo({ before, written: text });
            onDraft(text);
            requestAnimationFrame(() => {
                const el = box.current;
                if (!el) return;
                el.focus();
                el.setSelectionRange(text.length, text.length);
            });
        } catch (caught) {
            if (asked.current !== ask) return;
            if (caught instanceof ApiUnreachableError) {
                setStatus('idle');
                reportUnreachable();
            } else {
                setStatus('failed');
            }
        }
    };

    const restore = () => {
        if (!undo) return;
        setUndo(null);
        onDraft(undo.before);
    };

    /** The failure is the panel's only while nothing else has replaced it. */
    const dismiss = () => setStatus((current) => (current === 'failed' ? 'idle' : current));

    return { status, toggle, cancel, dismiss, offered, restore };
}

/** The panel's Write for me line: the wait, or the failure. */
function WriteForMeStatus({ status }: { status: Writing }) {
    if (status === 'writing') {
        return (
            <p className={styles.suggesting} role="status">
                Writing for you…
            </p>
        );
    }
    if (status === 'failed') {
        return (
            <p role="alert" className="turn-error">
                Couldn&apos;t write it, try again
            </p>
        );
    }
    return null;
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
    /** The Chat's failed Snapshots, for the background notice. */
    failedSnapshots: number;
    onDraft(text: string): void;
    onSend(): void;
    /** ▶ on an empty box: the story goes on without a line from the user. */
    onContinue(): void;
    /** ■ Stop, in place of the send button while a reply is written. */
    onStop(): void;
    onRetry(): void;
    /** The background notice's one Retry: the failed judge, extraction and Snapshots again. */
    onRetryBackground(): void;
    /** The composer's second band: the Character row (Nudge), or nothing. */
    characterRow?: (writingForMe: boolean) => ReactNode;
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
    failedSnapshots,
    onDraft,
    onSend,
    onContinue,
    onStop,
    onRetry,
    onRetryBackground,
    characterRow,
}: ChatComposerProps) {
    const box = useAutoGrow(draft);
    const suggestions = useSuggestedReplies(chat);
    const writer = useWriteForMe(chat, draft, onDraft, box, writing || busy);
    /** ✍️ is waiting: the box is read-only and nothing else may change or send it. */
    const writingForMe = writer.status === 'writing';
    const empty = draft.trim() === '';
    const send = (event: FormEvent) => {
        event.preventDefault();
        // Enter on an empty box does nothing; only a tap on ▶ lets the story go on.
        if (empty || writingForMe) return;
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
            <Notices chat={chat} failedSnapshots={failedSnapshots} onRetryBackground={onRetryBackground} retrying={busy} />
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
            {/* Integration, "The composer, top to bottom": panel · Character row · tool row · box row. */}
            <form className={styles.form} onSubmit={send} aria-label="Composer">
                {/* Band 1, the panel: one thing at a time. */}
                {writer.status !== 'idle' ? <WriteForMeStatus status={writer.status} /> : <SuggestionCards suggestions={suggestions.shown} onPick={onDraft} />}
                {/* Band 2: the Nudge Portraits plug in here; it takes no height while empty. */}
                <div className={styles.characters} data-band="characters">
                    {characterRow?.(writingForMe)}
                </div>
                {/* Band 3: small round tools, left-aligned, and a quiet text button at the right end. */}
                <div className={styles.tools} role="toolbar" aria-label="Composer tools">
                    {/* Spec: "Suggested replies". Asks only when tapped, so they never spend credit unasked. */}
                    <button
                        type="button"
                        className={styles.tool}
                        aria-label="Suggest replies"
                        title="Suggest replies"
                        aria-pressed={suggestions.shown.status !== 'closed'}
                        aria-busy={suggestions.shown.status === 'loading'}
                        disabled={writing || busy || blocked || writingForMe}
                        onClick={() => {
                            writer.dismiss();
                            void suggestions.toggle();
                        }}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                    </button>
                    {/* .scratch/write-for-me/spec.md: the draft, Thai or notes or nothing, becomes the worn identity's next Message. A second tap cancels. */}
                    <button
                        type="button"
                        className={styles.tool}
                        aria-label="Write for me"
                        title="Write for me"
                        aria-pressed={writingForMe}
                        aria-busy={writingForMe}
                        disabled={writing || busy || blocked}
                        onClick={() => {
                            suggestions.close();
                            void writer.toggle();
                        }}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" />
                            <path d="M14.5 7.5l3 3" />
                        </svg>
                    </button>
                    {/* Wraps the selection in *…* (an action, shown in italics), or opens an empty pair at the caret. */}
                    <button
                        type="button"
                        className={styles.tool}
                        aria-label="Write an action"
                        title="Action: *like this*"
                        disabled={writing || blocked || writingForMe}
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
                    <span className={styles.toolsEnd} data-slot="tools-end">
                        {/* Only while the box holds exactly what ✍️ wrote; puts the draft back, empty included. */}
                        {writer.offered && (
                            <button type="button" className={styles.undo} onClick={writer.restore}>
                                ↶ Undo
                            </button>
                        )}
                    </span>
                </div>
                {/* Band 4: the box and the send slot. */}
                <div className={styles.boxRow}>
                    <textarea
                        ref={box}
                        aria-label={`Write as ${chat.identityName}`}
                        placeholder={`Write as ${chat.identityName}…`}
                        value={draft}
                        rows={1}
                        disabled={writing || blocked}
                        readOnly={writingForMe}
                        onChange={(event) => onDraft(event.target.value)}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter' || event.shiftKey || !enterSends()) return;
                            // An Enter that confirms an input method's word (Thai, say) only confirms it; Safari reports it as 229.
                            if (event.nativeEvent.isComposing || event.keyCode === 229) return;
                            event.preventDefault();
                            event.currentTarget.form?.requestSubmit();
                        }}
                    />
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
                            disabled={writing || busy || blocked || chat.awaitingReply || writingForMe}
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
                        <button type="submit" className={styles.send} aria-label="Send" disabled={writing || blocked || writingForMe}>
                            <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true">
                                <path d="M3.4 20.4l17.4-7.5c.8-.4.8-1.5 0-1.8L3.4 3.6c-.7-.3-1.4.3-1.3 1l1.5 6.1c.1.4.5.7.9.8L12 12l-7.5.5c-.4 0-.8.4-.9.8l-1.5 6.1c-.1.7.6 1.3 1.3 1z" />
                            </svg>
                        </button>
                    )}
                </div>
            </form>
        </footer>
    );
}

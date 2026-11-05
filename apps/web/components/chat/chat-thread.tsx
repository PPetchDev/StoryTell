'use client';

import { CSSProperties, KeyboardEvent, MouseEvent, ReactNode, useEffect, useLayoutEffect, useRef, useState } from 'react';

import { MessageBody, UserLine } from '@/components/chat/message-body';
import { MessageSnapshots } from '@/components/chat/snapshots';
import { ConfirmButton } from '@/components/story-editor/fields';
import { Cast, Portraits } from '@/lib/character-colour';
import { isOpening, Message, messageText } from '@/lib/chat';
import { ChatSnapshots, Snapshot, SnapshotJob } from '@/lib/snapshot';
import { STORY_TEXT_SIZE, useTextSize } from '@/lib/text-size';

import styles from './chat-thread.module.css';

function messageLabel(message: Message): string {
    if (message.kind === 'user') return `${message.identityName} said`;
    return isOpening(message) ? 'Opening' : 'AI reply';
}

interface EditFormProps {
    message: Message;
    /** How many Messages come after this one; they are discarded on save, after confirming. */
    later: number;
    onSave(text: string): void;
    onCancel(): void;
}

/**
 * The in-place edit box. A User Message is edited as plain text; an AI Message as narration
 * paragraphs and `@Name:` speech lines, which the API re-splits. Saving with later Messages
 * asks first, since they go for good.
 */
function EditForm({ message, later, onSave, onCancel }: EditFormProps) {
    const [value, setValue] = useState(() => messageText(message));
    const empty = value.trim() === '';
    const what = message.kind === 'user' ? 'and the AI replies afresh' : 'and the Chat waits for you';
    return (
        <form
            className="message-edit"
            aria-label={`Edit ${messageLabel(message)}`}
            onSubmit={(event) => {
                event.preventDefault();
                if (!empty && later === 0) onSave(value);
            }}
        >
            <textarea
                aria-label="Message text"
                value={value}
                rows={Math.min(12, Math.max(3, value.split('\n').length + 1))}
                autoFocus
                onChange={(event) => setValue(event.target.value)}
            />
            {message.kind === 'ai' && (
                <p className="muted edit-hint">Speech goes on `@Name:` lines; a blank line starts narration.</p>
            )}
            <div className="toolbar">
                {later === 0 ? (
                    <button type="submit" className="button" disabled={empty}>
                        Save
                    </button>
                ) : (
                    <ConfirmButton
                        label="Save"
                        question={`This discards the ${later === 1 ? 'Message' : `${later} Messages`} after it ${what}.`}
                        confirmLabel="Save and rewind"
                        onConfirm={() => onSave(value)}
                        disabled={empty}
                    />
                )}
                <button type="button" className="button button-quiet" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

/** A Message's element id: the `#message-N` that dashboard and Memory links land on. */
function messageAnchor(messageId: number): string {
    return `message-${messageId}`;
}

/** Taps on these inside a Message do their own thing and never show or hide its Edit. */
const OWN_CONTROLS = 'button, a, input, textarea, select, form';

/** ✎ Edit, in the action row and under a tapped Message. */
function EditAction({ onEdit }: { onEdit(): void }) {
    return (
        <button type="button" className={styles.action} onClick={onEdit}>
            <span aria-hidden="true">✎</span>Edit
        </button>
    );
}

interface ActionRowProps {
    /** ↺ Again; null where it isn't offered (the Opening, an older reply, or sending blocked). */
    onAgain: (() => void) | null;
    onEdit(): void;
    onSnapshot(): void;
}

/**
 * Under the newest AI Message while no turn is in flight (spec: "Action row"). ↺ Again goes
 * first, and never on the Opening.
 */
function ActionRow({ onAgain, onEdit, onSnapshot }: ActionRowProps) {
    return (
        <div className={styles.actions} role="group" aria-label="Message actions">
            {onAgain && (
                <button type="button" className={styles.action} onClick={onAgain}>
                    <span aria-hidden="true">↺</span>Again
                </button>
            )}
            <EditAction onEdit={onEdit} />
            <button type="button" className={styles.action} onClick={onSnapshot}>
                <span aria-hidden="true">📷</span>Snapshot
            </button>
        </div>
    );
}

interface MessageViewProps {
    message: Message;
    cast: Cast;
    portraits: Portraits;
    later: number;
    editing: boolean;
    /** What shows under the Message: its Edit once tapped, or the action row. */
    tools: ReactNode;
    /** Its Snapshots and Snapshot jobs, for an AI Message. */
    snapshots: ReactNode;
    /** A tap on the Message shows or hides its Edit; null when it has none to show. */
    onTap: (() => void) | null;
    onSave(text: string): void;
    onCancel(): void;
}

function MessageView({ message, cast, portraits, later, editing, tools, snapshots, onTap, onSave, onCancel }: MessageViewProps) {
    const tap = (event: MouseEvent<HTMLElement>) => {
        // A drag that selects text is reading, not a tap.
        const selecting = (window.getSelection()?.toString() ?? '') !== '';
        if (onTap && !selecting && !(event.target as Element).closest(OWN_CONTROLS)) onTap();
    };
    // The same from the keyboard, so Edit stays reachable without a pointer.
    const key = (event: KeyboardEvent<HTMLElement>) => {
        if (onTap && event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
            event.preventDefault();
            onTap();
        }
    };
    return (
        <article
            id={messageAnchor(message.id)}
            className={[styles.message, message.kind === 'user' && styles.fromUser, onTap && styles.tappable].filter(Boolean).join(' ')}
            aria-label={messageLabel(message)}
            tabIndex={onTap ? 0 : undefined}
            onClick={tap}
            onKeyDown={key}
        >
            {editing ? (
                <EditForm message={message} later={later} onSave={onSave} onCancel={onCancel} />
            ) : (
                <MessageBody message={message} cast={cast} portraits={portraits} />
            )}
            {snapshots}
            {!editing && tools}
        </article>
    );
}

/**
 * The Message whose Edit shows after a tap (spec: "Action row"). A second tap on it, or a tap
 * anywhere outside it, hides it again.
 */
function useTappedMessage(canEdit: boolean) {
    const [tapped, setTapped] = useState<number | null>(null);
    // A turn or a write hides every action, and a Message tapped before it stays hidden after.
    const [couldEdit, setCouldEdit] = useState(canEdit);
    if (couldEdit !== canEdit) {
        setCouldEdit(canEdit);
        if (!canEdit) setTapped(null);
    }
    useEffect(() => {
        if (tapped === null) return;
        const onClick = (event: Event) => {
            const message = document.getElementById(messageAnchor(tapped));
            if (!message?.contains(event.target as Node)) setTapped(null);
        };
        // Capture, so a tap on another Message hides this one before that one shows its own.
        document.addEventListener('click', onClick, true);
        return () => document.removeEventListener('click', onClick, true);
    }, [tapped]);
    return [tapped, setTapped] as const;
}

/** How close to the end, in pixels, still counts as reading at the end. */
const AT_END_SLACK = 48;

/**
 * Keeps the thread at its end (spec: "Scrolling"). It opens at the end, or on the Message a
 * dashboard or Memory link names in the URL hash. It goes back to the end whenever `followKey`
 * changes (a Message added or replaced, the writing indicator shown or gone), and stays there
 * while the content or the thread itself changes size (a Snapshot loading, a notice showing),
 * unless the user has scrolled up to read.
 */
function useFollowEnd(followKey: string) {
    const threadRef = useRef<HTMLElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const atEndRef = useRef(true);
    const openedRef = useRef(false);

    useLayoutEffect(() => {
        const thread = threadRef.current;
        if (!thread) return;
        if (!openedRef.current) {
            openedRef.current = true;
            const hash = window.location.hash.slice(1);
            const target = hash ? document.getElementById(hash) : null;
            if (target) {
                target.scrollIntoView({ block: 'center' });
                target.classList.add('message-target');
                atEndRef.current = false;
                return;
            }
        }
        thread.scrollTop = thread.scrollHeight;
        atEndRef.current = true;
    }, [followKey]);

    useLayoutEffect(() => {
        const thread = threadRef.current;
        const content = contentRef.current;
        if (!thread || !content) return;
        const onScroll = () => {
            atEndRef.current = thread.scrollHeight - thread.scrollTop - thread.clientHeight <= AT_END_SLACK;
        };
        const observer = new ResizeObserver(() => {
            if (atEndRef.current) thread.scrollTop = thread.scrollHeight;
        });
        thread.addEventListener('scroll', onScroll, { passive: true });
        observer.observe(thread);
        observer.observe(content);
        return () => {
            thread.removeEventListener('scroll', onScroll);
            observer.disconnect();
        };
    }, []);

    return { threadRef, contentRef };
}

/** A line the user just sent, shown before the API has answered (spec: "Send feedback"). */
export interface PendingLine {
    text: string;
    identityName: string;
}

interface ChatThreadProps {
    messages: Message[];
    cast: Cast;
    /** The cast's Reference images, beside their lines. */
    portraits: Portraits;
    pending: PendingLine | null;
    /** A turn is being written: the indicator shows where the reply will appear. */
    writing: boolean;
    /** The Message being edited in place, if any. */
    editing: number | null;
    /** Edit is offered at all (no turn or write in flight, no other edit open). */
    canEdit: boolean;
    /** User Messages can't be edited while sending is blocked, since an edit runs a turn. */
    blocked: boolean;
    snapshots: ChatSnapshots;
    /** The reply ↺ Again is replacing: hidden while its replacement is written in its place. */
    replacing: number | null;
    /** ↺ Again on the newest reply. */
    onAgain(messageId: number): void;
    onEdit(messageId: number): void;
    onSave(message: Message, text: string): void;
    onCancelEdit(): void;
    /** 📷 in the action row: a Snapshot of the latest AI Message. */
    onSnapshot(): void;
    onOpenSnapshot(snapshot: Snapshot): void;
    onRetrySnapshot(job: SnapshotJob): void;
    onDismissSnapshot(job: SnapshotJob): void;
}

/** The Chat's Messages in order, as their own scroll area between the top bar and the composer. */
export function ChatThread({
    messages,
    cast,
    portraits,
    pending,
    writing,
    editing,
    canEdit,
    blocked,
    snapshots,
    replacing,
    onAgain,
    onEdit,
    onSave,
    onCancelEdit,
    onSnapshot,
    onOpenSnapshot,
    onRetrySnapshot,
    onDismissSnapshot,
}: ChatThreadProps) {
    // ↺ Again replaces the reply in place: it leaves the thread while the writing indicator shows.
    const shown = replacing === null ? messages : messages.filter((message) => message.id !== replacing);
    const last = shown[shown.length - 1];
    // The newest Message's text is in the key too: an edit replaces it in place, under its id.
    const newest = last ? `${last.id}:${messageText(last)}` : '';
    const { threadRef, contentRef } = useFollowEnd(`${shown.length}:${newest}:${pending !== null}:${writing}`);
    const storySize = { '--story-size': STORY_TEXT_SIZE[useTextSize()] } as CSSProperties;
    const [tapped, setTapped] = useTappedMessage(canEdit);
    // The action row goes under the latest AI Message (the Opening counts), the one a Snapshot is taken of.
    const newestAiMessage = shown.findLast((message) => message.kind === 'ai');

    const edit = (messageId: number) => {
        setTapped(null);
        onEdit(messageId);
    };

    return (
        <section ref={threadRef} className={styles.thread} style={storySize} aria-label="Messages">
            <div ref={contentRef} className={styles.content}>
                {shown.map((message, index) => {
                    // A User Message edit runs a turn, so it waits while sending is blocked.
                    const editable = canEdit && (message.kind === 'ai' || !blocked);
                    const withRow = canEdit && message === newestAiMessage;
                    let tools: ReactNode = null;
                    if (withRow) {
                        // ↺ Again runs a turn: only on a reply that is the newest Message, never the Opening.
                        const again = message === last && !isOpening(message) && !blocked;
                        tools = (
                            <ActionRow
                                onAgain={again ? () => onAgain(message.id) : null}
                                onEdit={() => edit(message.id)}
                                onSnapshot={onSnapshot}
                            />
                        );
                    } else if (editable && tapped === message.id) {
                        tools = (
                            <div className={styles.tools}>
                                <EditAction onEdit={() => edit(message.id)} />
                            </div>
                        );
                    }
                    return (
                        <MessageView
                            key={message.id}
                            message={message}
                            cast={cast}
                            portraits={portraits}
                            later={shown.length - index - 1}
                            editing={editing === message.id}
                            tools={tools}
                            snapshots={
                                message.kind === 'ai' && (
                                    <MessageSnapshots
                                        snapshots={snapshots.snapshots.filter((snapshot) => snapshot.messageId === message.id)}
                                        jobs={snapshots.jobs.filter((job) => job.messageId === message.id)}
                                        onOpen={onOpenSnapshot}
                                        onRetry={onRetrySnapshot}
                                        onDismiss={onDismissSnapshot}
                                    />
                                )
                            }
                            onTap={editable && !withRow ? () => setTapped((current) => (current === message.id ? null : message.id)) : null}
                            onSave={(text) => onSave(message, text)}
                            onCancel={onCancelEdit}
                        />
                    );
                })}
                {pending && (
                    <article className={styles.message} aria-label={`${pending.identityName} said`} aria-busy="true">
                        <UserLine identityName={pending.identityName} text={pending.text} />
                    </article>
                )}
                {writing && (
                    <p className={styles.writing} role="status">
                        <span className={styles.dots} aria-hidden="true">
                            <i />
                            <i />
                            <i />
                        </span>
                        Writing…
                    </p>
                )}
            </div>
        </section>
    );
}

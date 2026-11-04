'use client';

import Link from 'next/link';
import { FormEvent, Fragment, useEffect, useRef, useState } from 'react';

import { MemoryDrawer } from '@/components/chat/memory-drawer';
import { Camera, MessageSnapshots, SnapshotViewer, useChatSnapshots } from '@/components/chat/snapshots';
import { useApiQuery, useConnection } from '@/components/connection';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { backgroundPending, Chat, chatApi, EditedChat, latestReply, Message, messageText, modelLabel, rollbackNotice } from '@/lib/chat';
import { Memory, memoryApi, renderUser } from '@/lib/memory';
import { PersonaList } from '@/lib/persona';
import { Snapshot } from '@/lib/snapshot';

function messageLabel(message: Message): string {
    if (message.kind === 'user') return `${message.identityName} said`;
    return message.model === 'author' ? 'Opening' : 'AI reply';
}

function MessageBody({ message }: { message: Message }) {
    if (message.kind === 'user') {
        return (
            <>
                <p className="speaker">{message.identityName}</p>
                <p className="message-text">{message.text}</p>
            </>
        );
    }
    return message.parts.map((part, index) =>
        part.kind === 'narration' ? (
            <p key={index} className="narration message-text">
                {part.text}
            </p>
        ) : (
            <div key={index} className="speech">
                <p className="speaker">{part.speakerName}</p>
                <p className="message-text">{part.text}</p>
            </div>
        ),
    );
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

interface MessageViewProps {
    message: Message;
    later: number;
    editing: boolean;
    /** Edit is hidden while a turn is written or another Message is being edited. */
    canEdit: boolean;
    onEdit(): void;
    onSave(text: string): void;
    onCancel(): void;
}

function MessageView({ message, later, editing, canEdit, onEdit, onSave, onCancel }: MessageViewProps) {
    return (
        <article
            id={`message-${message.id}`}
            className={message.kind === 'user' ? 'message message-user' : 'message message-ai'}
            aria-label={messageLabel(message)}
        >
            {editing ? (
                <EditForm message={message} later={later} onSave={onSave} onCancel={onCancel} />
            ) : (
                <>
                    <MessageBody message={message} />
                    {canEdit && (
                        <div className="message-tools">
                            <button type="button" className="button button-quiet button-small" onClick={onEdit}>
                                Edit
                            </button>
                        </div>
                    )}
                </>
            )}
        </article>
    );
}

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
 * The worn identity (spec: stories 44–45): the Story's Role or any Persona, swappable at any
 * time. The next User Message is written as it; earlier ones keep the name they were sent under.
 */
function IdentitySwap({ chat, disabled, onSwap }: { chat: Chat; disabled: boolean; onSwap(personaId: number | null): void }) {
    const personas = useApiQuery<PersonaList>('/personas');
    const options = personas.status === 'ready' ? personas.data.personas.map(({ id, name }) => ({ id, name })) : [];
    // The worn Persona stays selectable while the list loads.
    if (chat.personaId !== null && !options.some((option) => option.id === chat.personaId)) {
        options.unshift({ id: chat.personaId, name: chat.identityName });
    }
    return (
        <label className="identity-swap">
            <span className="muted">Playing as</span>
            <select
                value={chat.personaId ?? ''}
                disabled={disabled}
                onChange={(event) => onSwap(event.target.value === '' ? null : Number(event.target.value))}
            >
                <option value="">{chat.roleName} (Role)</option>
                {options.map((option) => (
                    <option key={option.id} value={option.id}>
                        {option.name}
                    </option>
                ))}
            </select>
        </label>
    );
}

/** A "Memory added" toast (spec: story 83): one per Memory the AI added in the latest turn. */
interface Toast {
    memoryId: number;
    text: string;
}

/** How often the Chat is re-read while the last reply's background calls run. */
const BACKGROUND_POLL_MS = 1_000;

/**
 * The Chat screen (spec: "Chat screen"): narration and named speech in order, a composer,
 * and the notice line. No streaming: a "writing" indicator shows while the turn is written,
 * and a failed turn leaves the User Message with Retry. Any Message can be edited in place,
 * which discards the Messages after it and rolls back their changes, with a short notice of
 * what went; Reset starts the Chat over from the Opening. Bonds and Arcs never show here:
 * the dashboard link leads to them. Memory does: the drawer lists it, and a "Memory added"
 * toast appears for each Memory the AI adds once a turn's extraction is done. The camera
 * takes a Snapshot of the latest AI Message while play goes on; Snapshots show under their
 * Message, and a tap opens one full screen.
 */
export function ChatScreen({ initial }: { initial: Chat }) {
    const { reportUnreachable } = useConnection();
    const [chat, setChat] = useState(initial);
    const [draft, setDraft] = useState('');
    const [writing, setWriting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [rollback, setRollback] = useState<string | null>(null);
    const [drawer, setDrawer] = useState<{ open: boolean; focus: number | null; version: number }>({ open: false, focus: null, version: 0 });
    const [toasts, setToasts] = useState<Toast[]>([]);
    const snaps = useChatSnapshots(initial.storyId, initial.id);
    const [viewing, setViewing] = useState<Snapshot | null>(null);
    const endRef = useRef<HTMLDivElement>(null);
    const jumpedRef = useRef(false);
    /** The reply whose finished extraction was already announced, so a re-read never toasts twice. */
    const announcedRef = useRef<number | null>(latestReply(initial)?.id ?? null);

    useEffect(() => {
        // A dashboard link lands on its Message once; after that, follow the newest Message.
        const target = jumpedRef.current ? null : document.getElementById(window.location.hash.slice(1) || '');
        jumpedRef.current = true;
        if (target) {
            target.scrollIntoView({ block: 'center' });
            target.classList.add('message-target');
            return;
        }
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [chat.messages.length, writing]);

    // While the last reply's background calls run, re-read the Chat until they settle.
    useEffect(() => {
        if (!backgroundPending(chat)) return;
        const timer = setTimeout(() => {
            apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`).then(setChat, (caught: unknown) => {
                if (caught instanceof ApiUnreachableError) reportUnreachable();
            });
        }, BACKGROUND_POLL_MS);
        return () => clearTimeout(timer);
    }, [chat, reportUnreachable]);

    // Once a reply's extraction is done, announce what the AI added and let the drawer re-read.
    useEffect(() => {
        const reply = latestReply(chat);
        if (!reply || reply.memory?.status !== 'done' || announcedRef.current === reply.id) return;
        announcedRef.current = reply.id;
        setDrawer((current) => ({ ...current, version: current.version + 1 }));
        memoryApi.list(chat.storyId, chat.id).then(
            (list) => {
                const added = list.memories.filter((memory: Memory) => memory.messageId === reply.id && memory.writtenBy === 'ai');
                setToasts(added.map((memory) => ({ memoryId: memory.id, text: renderUser(memory.text, list.identityName) })));
            },
            () => {
                // The drawer shows the Memory either way; a missed toast is no loss.
            },
        );
    }, [chat]);

    const blocked = !chat.playable || chat.textCreditOut;

    const openMemory = (memoryId: number | null = null) => {
        setDrawer((current) => ({ open: true, focus: memoryId, version: current.version }));
        if (memoryId !== null) setToasts((current) => current.filter((toast) => toast.memoryId !== memoryId));
    };

    /** Scrolls to a Message and outlines it, from a Memory's jump link. */
    const jumpTo = (messageId: number) => {
        const target = document.getElementById(`message-${messageId}`);
        if (!target) return;
        window.history.replaceState(null, '', `#message-${messageId}`);
        for (const marked of document.querySelectorAll('.message-target')) marked.classList.remove('message-target');
        target.scrollIntoView({ block: 'center' });
        target.classList.add('message-target');
    };

    /**
     * The Chat after a write that may have changed the Memory (an edit, a reset): the drawer
     * re-reads, old toasts go, and the reply's extraction, which runs again after an edit,
     * is announced afresh once it is done.
     */
    const refreshMemory = (next: Chat): Chat => {
        setDrawer((current) => ({ ...current, version: current.version + 1 }));
        setToasts([]);
        announcedRef.current = null;
        // Snapshots of discarded or edited Messages left the timeline for the Gallery.
        void snaps.refresh();
        return next;
    };

    /** The edited Chat, after noting what its rewind rolled back. */
    const noteRollback = (edited: EditedChat): Chat => {
        setRollback(rollbackNotice(edited.rolledBack));
        return edited;
    };

    const runTurn = async (turn: () => Promise<Chat>) => {
        setWriting(true);
        setError(null);
        setRollback(null);
        try {
            setChat(await turn());
            setDraft('');
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) {
                reportUnreachable();
                return;
            }
            setError(caught instanceof ApiError ? caught.message : 'The turn failed.');
            // The User Message may have been stored before the turn failed: show it with Retry.
            try {
                setChat(await apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`));
            } catch {
                // The error above already tells the user; a reload shows the rest.
            }
        } finally {
            setWriting(false);
        }
    };

    /** A write that runs no turn: an AI Message edit, Reset, or a judge retry. */
    const runWrite = async (write: () => Promise<Chat>) => {
        setBusy(true);
        setError(null);
        setRollback(null);
        try {
            setChat(await write());
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    const send = (event: FormEvent) => {
        event.preventDefault();
        if (draft.trim() === '' || writing || blocked) return;
        void runTurn(() => chatApi.send(chat.storyId, chat.id, draft));
    };

    const saveEdit = (message: Message, text: string) => {
        setEditing(null);
        const edit = async () => refreshMemory(noteRollback(await chatApi.edit(chat.storyId, chat.id, message.id, text)));
        // An edited User Message gets a fresh reply, so it runs as a turn; an AI Message does not.
        if (message.kind === 'user') void runTurn(edit);
        else void runWrite(edit);
    };

    /** Swaps the worn identity; the drawer re-reads, since it renders {user} as the worn name. */
    const swapIdentity = (personaId: number | null) =>
        void runWrite(async () => {
            const swapped = await chatApi.swapIdentity(chat.storyId, chat.id, personaId);
            setDrawer((current) => ({ ...current, version: current.version + 1 }));
            return swapped;
        });

    /** Runs only the failed judge again, then re-reads the Chat so the notice clears. */
    const retryJudge = (messageId: number) =>
        void runWrite(async () => {
            await chatApi.retryJudge(chat.storyId, chat.id, messageId);
            return apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
        });

    /** The same for a failed Memory extraction; its adds are announced once the Chat reads done. */
    const retryExtraction = (messageId: number) =>
        void runWrite(async () => {
            announcedRef.current = null;
            await chatApi.retryExtraction(chat.storyId, chat.id, messageId);
            return apiFetch<Chat>(`/stories/${chat.storyId}/chats/${chat.id}`);
        });

    return (
        <main className="chat">
            <nav className="breadcrumbs">
                <Link href={`/stories/${chat.storyId}/chats`}>← Chats</Link>
                <span className="muted">
                    {chat.currentScene ? `Scene: ${chat.currentScene.name}` : 'Free play'}
                </span>
                <Link href={`/stories/${chat.storyId}/gallery?chat=${chat.id}`}>Gallery</Link>
                <Link href={`/stories/${chat.storyId}/chats/${chat.id}/dashboard`}>Dashboard →</Link>
            </nav>
            <div className="chat-head">
                <h1>{chat.title}</h1>
                <IdentitySwap chat={chat} disabled={writing || busy || editing !== null} onSwap={swapIdentity} />
                <button type="button" className="button button-quiet" onClick={() => openMemory()}>
                    Memory
                </button>
                <ConfirmButton
                    label="Reset"
                    question="Clear every Message and start this Chat over from the Opening?"
                    confirmLabel="Reset"
                    onConfirm={() => void runWrite(async () => refreshMemory(await chatApi.reset(chat.storyId, chat.id)))}
                    disabled={writing || busy || editing !== null || !chat.playable}
                />
            </div>

            {toasts.length > 0 && (
                <div className="toasts" aria-label="Memory added">
                    {toasts.map((toast) => (
                        <button key={toast.memoryId} type="button" className="toast" role="status" onClick={() => openMemory(toast.memoryId)}>
                            <strong>Memory added</strong>
                            <span>{toast.text}</span>
                        </button>
                    ))}
                </div>
            )}

            {drawer.open && (
                <MemoryDrawer
                    storyId={chat.storyId}
                    chatId={chat.id}
                    focusMemoryId={drawer.focus}
                    version={drawer.version}
                    onClose={() => setDrawer((current) => ({ ...current, open: false, focus: null }))}
                    onJump={jumpTo}
                />
            )}

            <section className="messages" aria-label="Messages">
                {chat.messages.map((message, index) => (
                    <Fragment key={message.id}>
                        <MessageView
                            message={message}
                            later={chat.messages.length - index - 1}
                            editing={editing === message.id}
                            canEdit={!writing && !busy && editing === null && (message.kind === 'ai' || !blocked)}
                            onEdit={() => setEditing(message.id)}
                            onSave={(text) => saveEdit(message, text)}
                            onCancel={() => setEditing(null)}
                        />
                        {message.kind === 'ai' && (
                            <MessageSnapshots
                                snapshots={snaps.state.snapshots.filter((snapshot) => snapshot.messageId === message.id)}
                                jobs={snaps.state.jobs.filter((job) => job.messageId === message.id)}
                                onOpen={setViewing}
                                onRetry={(job) => void snaps.retry(job)}
                                onDismiss={(job) => void snaps.dismiss(job)}
                            />
                        )}
                    </Fragment>
                ))}
                {writing && (
                    <p className="writing muted" role="status">
                        Writing…
                    </p>
                )}
                <div ref={endRef} />
            </section>

            {rollback && (
                <p className="notice rollback-notice" role="status">
                    {rollback}
                </p>
            )}
            <Notices chat={chat} onRetryJudge={retryJudge} onRetryExtraction={retryExtraction} retrying={busy} />
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            {chat.awaitingReply && !writing && (
                <p className="notice" role="status">
                    The last turn failed. Your message is kept.{' '}
                    <button
                        type="button"
                        className="button button-quiet"
                        disabled={blocked}
                        onClick={() => void runTurn(() => chatApi.retry(chat.storyId, chat.id))}
                    >
                        Retry
                    </button>
                </p>
            )}

            {viewing && (
                <SnapshotViewer
                    snapshot={viewing}
                    onClose={() => setViewing(null)}
                    onDelete={() => {
                        setViewing(null);
                        void snaps.remove(viewing);
                    }}
                    onRetake={
                        chat.imageCreditOut || viewing.messageId === null
                            ? undefined
                            : () => {
                                  setViewing(null);
                                  void snaps.take(viewing.hint, viewing.messageId ?? undefined);
                              }
                    }
                />
            )}
            <Camera
                disabledNote={chat.imageCreditOut ? 'Snapshots are off: image credit is used up. Play goes on.' : null}
                busy={writing || busy || editing !== null}
                error={snaps.error}
                onTake={(hint) => void snaps.take(hint)}
            />
            <form className="composer" onSubmit={send} aria-label="Composer">
                <textarea
                    aria-label={`Write as ${chat.identityName}`}
                    placeholder={`Write as ${chat.identityName}…`}
                    value={draft}
                    rows={3}
                    disabled={writing || blocked}
                    onChange={(event) => setDraft(event.target.value)}
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
        </main>
    );
}

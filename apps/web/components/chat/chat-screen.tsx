'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { Chat, chatApi, Message, messageText, modelLabel } from '@/lib/chat';

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
        <article className={message.kind === 'user' ? 'message message-user' : 'message message-ai'} aria-label={messageLabel(message)}>
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

/** What stands between the user and the next turn, if anything. */
function Notices({ chat }: { chat: Chat }) {
    return (
        <>
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
 * The Chat screen (spec: "Chat screen"): narration and named speech in order, a composer,
 * and the notice line. No streaming: a "writing" indicator shows while the turn is written,
 * and a failed turn leaves the User Message with Retry. Any Message can be edited in place,
 * which discards the Messages after it; Reset starts the Chat over from the Opening.
 */
export function ChatScreen({ initial }: { initial: Chat }) {
    const { reportUnreachable } = useConnection();
    const [chat, setChat] = useState(initial);
    const [draft, setDraft] = useState('');
    const [writing, setWriting] = useState(false);
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: 'end' });
    }, [chat.messages.length, writing]);

    const blocked = !chat.playable || chat.textCreditOut;

    const runTurn = async (turn: () => Promise<Chat>) => {
        setWriting(true);
        setError(null);
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

    /** A write that runs no turn: an AI Message edit, or Reset. */
    const runWrite = async (write: () => Promise<Chat>) => {
        setBusy(true);
        setError(null);
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
        const edit = () => chatApi.edit(chat.storyId, chat.id, message.id, text);
        // An edited User Message gets a fresh reply, so it runs as a turn; an AI Message does not.
        if (message.kind === 'user') void runTurn(edit);
        else void runWrite(edit);
    };

    return (
        <main className="chat">
            <nav className="breadcrumbs">
                <Link href={`/stories/${chat.storyId}/chats`}>← Chats</Link>
                <span className="muted">
                    {chat.currentScene ? `Scene: ${chat.currentScene.name}` : 'Free play'}
                </span>
            </nav>
            <div className="chat-head">
                <h1>{chat.title}</h1>
                <ConfirmButton
                    label="Reset"
                    question="Clear every Message and start this Chat over from the Opening?"
                    confirmLabel="Reset"
                    onConfirm={() => void runWrite(() => chatApi.reset(chat.storyId, chat.id))}
                    disabled={writing || busy || editing !== null || !chat.playable}
                />
            </div>

            <section className="messages" aria-label="Messages">
                {chat.messages.map((message, index) => (
                    <MessageView
                        key={message.id}
                        message={message}
                        later={chat.messages.length - index - 1}
                        editing={editing === message.id}
                        canEdit={!writing && !busy && editing === null && (message.kind === 'ai' || !blocked)}
                        onEdit={() => setEditing(message.id)}
                        onSave={(text) => saveEdit(message, text)}
                        onCancel={() => setEditing(null)}
                    />
                ))}
                {writing && (
                    <p className="writing muted" role="status">
                        Writing…
                    </p>
                )}
                <div ref={endRef} />
            </section>

            <Notices chat={chat} />
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

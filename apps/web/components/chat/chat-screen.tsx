'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ApiError, apiFetch, ApiUnreachableError } from '@/lib/api';
import { Chat, chatApi, Message, modelLabel } from '@/lib/chat';

function MessageView({ message }: { message: Message }) {
    if (message.kind === 'user') {
        return (
            <article className="message message-user" aria-label={`${message.identityName} said`}>
                <p className="speaker">{message.identityName}</p>
                <p className="message-text">{message.text}</p>
            </article>
        );
    }
    return (
        <article className="message message-ai" aria-label={message.model === 'author' ? 'Opening' : 'AI reply'}>
            {message.parts.map((part, index) =>
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
 * and a failed turn leaves the User Message with Retry.
 */
export function ChatScreen({ initial }: { initial: Chat }) {
    const { reportUnreachable } = useConnection();
    const [chat, setChat] = useState(initial);
    const [draft, setDraft] = useState('');
    const [writing, setWriting] = useState(false);
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

    const send = (event: FormEvent) => {
        event.preventDefault();
        if (draft.trim() === '' || writing || blocked) return;
        void runTurn(() => chatApi.send(chat.storyId, chat.id, draft));
    };

    return (
        <main className="chat">
            <nav className="breadcrumbs">
                <Link href={`/stories/${chat.storyId}/chats`}>← Chats</Link>
                <span className="muted">
                    {chat.currentScene ? `Scene: ${chat.currentScene.name}` : 'Free play'}
                </span>
            </nav>
            <h1>{chat.title}</h1>

            <section className="messages" aria-label="Messages">
                {chat.messages.map((message) => (
                    <MessageView key={message.id} message={message} />
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

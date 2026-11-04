'use client';

import Link from 'next/link';
import { useState } from 'react';

import { useConnection } from '@/components/connection';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi, ChatListItem, formatWhen } from '@/lib/chat';

import styles from './chat-list.module.css';

function RenameForm({ title, onSave, onCancel }: { title: string; onSave(title: string): void; onCancel(): void }) {
    const [value, setValue] = useState(title);
    return (
        <form
            className="rename"
            onSubmit={(event) => {
                event.preventDefault();
                onSave(value);
            }}
        >
            <input type="text" aria-label="Chat title" value={value} autoFocus onChange={(event) => setValue(event.target.value)} />
            <button type="submit" className="button button-quiet">
                Save
            </button>
            <button type="button" className="button button-quiet" onClick={onCancel}>
                Cancel
            </button>
        </form>
    );
}

/** The Chats of one Story: open, rename, or delete after confirming. */
export function ChatList({ storyId, initial }: { storyId: number; initial: ChatListItem[] }) {
    const { reportUnreachable } = useConnection();
    const [chats, setChats] = useState(initial);
    const [renaming, setRenaming] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const run = async (work: () => Promise<void>) => {
        setError(null);
        try {
            await work();
        } catch (caught) {
            if (caught instanceof ApiUnreachableError) reportUnreachable();
            else setError(caught instanceof ApiError ? caught.message : 'Something went wrong.');
        }
    };

    const rename = (chatId: number, title: string) =>
        run(async () => {
            const saved = await chatApi.rename(storyId, chatId, title);
            setChats((current) => current.map((chat) => (chat.id === chatId ? { ...chat, title: saved.title } : chat)));
            setRenaming(null);
        });

    const remove = (chatId: number) =>
        run(async () => {
            await chatApi.remove(storyId, chatId);
            setChats((current) => current.filter((chat) => chat.id !== chatId));
        });

    if (chats.length === 0) return <p className="muted">No Chats yet. Start one to play this Story.</p>;

    return (
        <>
            {error && <p role="alert">{error}</p>}
            <ul className="chat-list" aria-label="Chats">
                {chats.map((chat) => (
                    <li key={chat.id}>
                        {renaming === chat.id ? (
                            <RenameForm title={chat.title} onSave={(title) => void rename(chat.id, title)} onCancel={() => setRenaming(null)} />
                        ) : (
                            <Link href={`/stories/${storyId}/chats/${chat.id}`} className="chat-link">
                                <span className="story-title">{chat.title}</span>
                                <span className={styles.scene}>{chat.sceneName ?? 'Free play'}</span>
                                {chat.latestLine && <span className={styles.line}>{chat.latestLine}</span>}
                                <span className="muted chat-times">
                                    Started {formatWhen(chat.createdAt)} · Last played {formatWhen(chat.lastPlayedAt)}
                                </span>
                            </Link>
                        )}
                        <div className="toolbar">
                            <button type="button" className="button button-quiet" onClick={() => setRenaming(chat.id)}>
                                Rename
                            </button>
                            <ConfirmButton
                                label="Delete"
                                question={`Delete "${chat.title}" and everything in it?`}
                                confirmLabel="Delete"
                                onConfirm={() => void remove(chat.id)}
                            />
                        </div>
                    </li>
                ))}
            </ul>
        </>
    );
}

'use client';

import Link from 'next/link';
import { useId, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { BranchIcon, ChevronRightIcon } from '@/components/icons';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { chatApi, ChatListItem, formatWhen } from '@/lib/chat';

/** Why a write failed, in words; null when it was the connection, which the app reports itself. */
function failure(caught: unknown, reportUnreachable: () => void): string | null {
    if (caught instanceof ApiUnreachableError) {
        reportUnreachable();
        return null;
    }
    return caught instanceof ApiError ? caught.message : 'Something went wrong.';
}

/**
 * A Chat's new title (audit M55): a label you can see, Escape cancels, and a failed save says why
 * under the field, keeping what was typed.
 */
function RenameForm({ title, onSave, onCancel }: { title: string; onSave(title: string): Promise<string | null>; onCancel(): void }) {
    const [value, setValue] = useState(title);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const id = useId();
    return (
        <form
            className="grid gap-2 pt-1.5 pb-2"
            onSubmit={async (event) => {
                event.preventDefault();
                setSaving(true);
                setError(await onSave(value));
                setSaving(false);
            }}
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.preventDefault();
                onCancel();
            }}
        >
            <div className="field my-0">
                <label htmlFor={`${id}-title`}>Chat title</label>
                <input
                    id={`${id}-title`}
                    type="text"
                    value={value}
                    autoFocus
                    aria-invalid={error !== null}
                    aria-describedby={error ? `${id}-error` : undefined}
                    onChange={(event) => setValue(event.target.value)}
                />
                {error && (
                    <p id={`${id}-error`} role="alert" className="field-error">
                        {error}
                    </p>
                )}
            </div>
            <div className="toolbar">
                <button type="submit" className="button button-quiet" disabled={saving} aria-busy={saving || undefined}>
                    Save
                </button>
                <button type="button" className="button button-quiet" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

/** The Chats of one Story: open, rename, or delete after confirming. */
export function ChatList({ storyId, initial, emptyFocus }: { storyId: number; initial: ChatListItem[]; emptyFocus?(): HTMLElement | null }) {
    const { reportUnreachable } = useConnection();
    const [chats, setChats] = useState(initial);
    const [renaming, setRenaming] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);
    const list = useRef<HTMLUListElement>(null);

    /** Focus on a Chat's Rename button once React has drawn it again. */
    const focusRename = (chatId: number) =>
        requestAnimationFrame(() => list.current?.querySelector<HTMLElement>(`[data-chat-id="${chatId}"] [data-rename]`)?.focus());

    const rename = async (chatId: number, title: string): Promise<string | null> => {
        try {
            const saved = await chatApi.rename(storyId, chatId, title);
            setChats((current) => current.map((chat) => (chat.id === chatId ? { ...chat, title: saved.title } : chat)));
            setRenaming(null);
            focusRename(chatId);
            return null;
        } catch (caught) {
            return failure(caught, reportUnreachable);
        }
    };

    const remove = async (chatId: number) => {
        setError(null);
        try {
            await chatApi.remove(storyId, chatId);
            setChats((current) => current.filter((chat) => chat.id !== chatId));
        } catch (caught) {
            setError(failure(caught, reportUnreachable));
        }
    };

    /** After a delete, focus goes to the Chat that took its place, or the one before it (audit H2). */
    const focusAfter = (chatId: number) => {
        const at = chats.findIndex((chat) => chat.id === chatId);
        const next = chats[at + 1] ?? chats[at - 1];
        return () =>
            (next && list.current?.querySelector<HTMLElement>(`[data-chat-id="${next.id}"] a`)) ||
            list.current?.querySelector<HTMLElement>(`[data-chat-id="${chatId}"] button`) ||
            emptyFocus?.();
    };

    if (chats.length === 0) return <p className="muted">No Chats yet. Start one to play this Story.</p>;

    return (
        <>
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            <ul ref={list} className="m-0 grid list-none gap-3.5 p-0" aria-label="Chats">
                {chats.map((chat) => (
                    <li key={chat.id} data-chat-id={chat.id} className="rounded-lg bg-surface px-4 pt-3 pb-4">
                        {renaming === chat.id ? (
                            <RenameForm
                                title={chat.title}
                                onSave={(title) => rename(chat.id, title)}
                                onCancel={() => {
                                    setRenaming(null);
                                    focusRename(chat.id);
                                }}
                            />
                        ) : (
                            // The whole card above the buttons opens the Chat, and says so with a › (docs/ui-audit-2026-11-13.md, M1).
                            <Link
                                href={`/stories/${storyId}/chats/${chat.id}`}
                                className="-mx-2 grid gap-1 rounded-md px-2 pt-1.5 pb-3 text-text no-underline press active:bg-surface-raised"
                            >
                                <span className="flex items-start justify-between gap-3">
                                    <span className="font-semibold">{chat.title}</span>
                                    <ChevronRightIcon size={20} className="mt-0.5 shrink-0 text-muted" />
                                </span>
                                {chat.branchedFrom && (
                                    <span className="flex items-center gap-1 text-sm text-muted italic">
                                        <BranchIcon size={14} />
                                        Branched from {chat.branchedFrom.title}
                                    </span>
                                )}
                                <span className="text-xs font-bold tracking-wide text-accent">{chat.sceneName ?? 'Free play'}</span>
                                {chat.latestLine && <span className="line-clamp-2 text-md text-text">{chat.latestLine}</span>}
                                <span className="text-sm text-muted">
                                    Started {formatWhen(chat.createdAt)} · Last played {formatWhen(chat.lastPlayedAt)}
                                </span>
                            </Link>
                        )}
                        {/* Small and quiet, so the card reads before them (M1); Delete still asks first. */}
                        <div className="toolbar">
                            <button
                                type="button"
                                data-rename
                                className="button button-quiet button-small"
                                onClick={() => setRenaming(chat.id)}
                                aria-label={`Rename ${chat.title}`}
                                disabled={renaming === chat.id}
                            >
                                Rename
                            </button>
                            <ConfirmButton
                                label="Delete"
                                ariaLabel={`Delete ${chat.title}`}
                                className="button-small text-danger"
                                question={`Delete "${chat.title}" and everything in it?`}
                                confirmLabel="Delete"
                                onConfirm={() => remove(chat.id)}
                                focusAfter={focusAfter(chat.id)}
                            />
                        </div>
                    </li>
                ))}
            </ul>
        </>
    );
}

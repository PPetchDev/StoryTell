'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, useState } from 'react';

import { useApiQuery } from '@/components/connection';
import { ConfirmDialog } from '@/components/sheet/confirm-dialog';
import { Sheet } from '@/components/sheet/sheet';
import { Chat } from '@/lib/chat';
import { PersonaList } from '@/lib/persona';

import styles from './chat-top-bar.module.css';

const RESET_QUESTION = 'Clear every Message and start this Chat over from the Opening?';

/**
 * The worn identity (spec: stories 44–45): the Story's Role or any Persona, swappable at any
 * time. The next User Message is written as it; earlier ones keep the name they were sent under.
 * The menu stays open after a swap, so arrowing through the list by keyboard never closes it.
 */
function IdentitySwap({
    chat,
    disabled,
    onSwap,
}: {
    chat: Chat;
    disabled: boolean;
    onSwap(personaId: number | null): void;
}) {
    const personas = useApiQuery<PersonaList>('/personas');
    const options =
        personas.status === 'ready'
            ? personas.data.personas.map(({ id, name }) => ({ id, name }))
            : [];
    // The worn Persona stays selectable while the list loads.
    if (chat.personaId !== null && !options.some((option) => option.id === chat.personaId)) {
        options.unshift({ id: chat.personaId, name: chat.identityName });
    }
    return (
        <label className={`${styles.item} ${styles.swap}`}>
            <span className={styles.itemLabel}>Playing as</span>
            <select
                className={styles.select}
                value={chat.personaId ?? ''}
                disabled={disabled}
                onChange={(event) =>
                    onSwap(event.target.value === '' ? null : Number(event.target.value))
                }
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

/** Rename in place of the menu's rows; the sheet stays open, so the box can take focus at once. */
function RenameForm({ title, onSave }: { title: string; onSave(title: string): void }) {
    const [value, setValue] = useState(title);
    const save = (event: FormEvent) => {
        event.preventDefault();
        if (value.trim() !== '') onSave(value.trim());
    };
    return (
        <form className={styles.rename} onSubmit={save}>
            <h2 className={styles.renameTitle}>Rename Chat</h2>
            <input
                type="text"
                className={styles.renameInput}
                aria-label="Chat title"
                value={value}
                autoFocus
                maxLength={200}
                onChange={(event) => setValue(event.target.value)}
            />
            <button
                type="submit"
                className={`button ${styles.renameSave}`}
                disabled={value.trim() === ''}
            >
                Save
            </button>
        </form>
    );
}

/** One row of the ⋯ menu: a bold label with a quiet line under it. */
function MenuText({ label, sub }: { label: string; sub: string }) {
    return (
        <>
            <span className={styles.itemLabel}>{label}</span>
            <span className={styles.itemSub}>{sub}</span>
        </>
    );
}

interface MenuButtonProps {
    onClick(): void;
    disabled?: boolean;
    danger?: boolean;
    children: ReactNode;
}

function MenuButton({ onClick, disabled, danger, children }: MenuButtonProps) {
    return (
        <button
            type="button"
            className={danger ? `${styles.item} ${styles.danger}` : styles.item}
            onClick={onClick}
            disabled={disabled}
        >
            {children}
        </button>
    );
}

interface ChatTopBarProps {
    chat: Chat;
    /** A turn or a write is in flight, or a Message is being edited. */
    busy: boolean;
    /** The Scene strip is hidden on this device, so the menu offers it back. */
    stripHidden: boolean;
    onShowStrip(): void;
    onSwapIdentity(personaId: number | null): void;
    onOpenMemory(): void;
    onRename(title: string): void;
    onReset(): void;
}

/**
 * One thin row above the thread (spec: "Top bar"): back to the Story's Chats, the Chat's title
 * with the worn identity under it, and ⋯, which opens a bottom sheet with everything else.
 * Reset sits last in the danger style and asks first.
 */
export function ChatTopBar({
    chat,
    busy,
    stripHidden,
    onShowStrip,
    onSwapIdentity,
    onOpenMemory,
    onRename,
    onReset,
}: ChatTopBarProps) {
    const [menu, setMenu] = useState<'closed' | 'menu' | 'rename'>('closed');
    const [confirming, setConfirming] = useState(false);
    const close = () => setMenu('closed');
    /** Closes the menu, then runs the choice, so a drawer or dialog it opens takes the focus. */
    const choose = (action: () => void) => () => {
        close();
        action();
    };

    return (
        <>
            <header className={styles.bar}>
                <Link
                    href={`/stories/${chat.storyId}/chats`}
                    className={styles.icon}
                    aria-label="Back to Chats"
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="22"
                        height="22"
                        aria-hidden="true"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M15 18l-6-6 6-6" />
                    </svg>
                </Link>
                <div className={styles.title}>
                    <h1 className={styles.name}>{chat.title}</h1>
                    <span className={styles.identity}>as {chat.identityName}</span>
                </div>
                <button
                    type="button"
                    className={styles.icon}
                    aria-label="Chat menu"
                    aria-haspopup="dialog"
                    aria-expanded={menu !== 'closed'}
                    onClick={() => setMenu('menu')}
                >
                    <svg
                        viewBox="0 0 24 24"
                        width="22"
                        height="22"
                        aria-hidden="true"
                        fill="currentColor"
                    >
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                    </svg>
                </button>
            </header>

            {menu !== 'closed' && (
                <Sheet label={menu === 'rename' ? 'Rename Chat' : 'Chat menu'} onClose={close}>
                    {menu === 'rename' ? (
                        <RenameForm
                            title={chat.title}
                            onSave={(title) => {
                                close();
                                onRename(title);
                            }}
                        />
                    ) : (
                        <div className={styles.menu}>
                            <MenuButton onClick={choose(onOpenMemory)}>
                                <MenuText label="Memory" sub="What the story remembers" />
                            </MenuButton>
                            <Link
                                href={`/stories/${chat.storyId}/chats/${chat.id}/dashboard`}
                                className={styles.item}
                            >
                                <MenuText
                                    label="Dashboard"
                                    sub="The Scene and how the Characters feel"
                                />
                            </Link>
                            <Link
                                href={`/stories/${chat.storyId}/gallery?chat=${chat.id}`}
                                className={styles.item}
                            >
                                <MenuText label="Gallery" sub="Every Snapshot of this Chat" />
                            </Link>
                            <MenuButton onClick={() => setMenu('rename')} disabled={busy}>
                                <MenuText label="Rename" sub={chat.title} />
                            </MenuButton>
                            <IdentitySwap chat={chat} disabled={busy} onSwap={onSwapIdentity} />
                            {stripHidden && (
                                <MenuButton onClick={choose(onShowStrip)}>
                                    <MenuText
                                        label="Show Scene strip"
                                        sub="The current Scene and its goal"
                                    />
                                </MenuButton>
                            )}
                            <hr className={styles.rule} />
                            <MenuButton
                                danger
                                onClick={choose(() => setConfirming(true))}
                                disabled={busy || !chat.playable}
                            >
                                <MenuText label="Reset Chat" sub="Start again from the Opening" />
                            </MenuButton>
                        </div>
                    )}
                </Sheet>
            )}

            {confirming && (
                <ConfirmDialog
                    question={RESET_QUESTION}
                    confirmLabel="Reset"
                    onCancel={() => setConfirming(false)}
                    onConfirm={() => {
                        setConfirming(false);
                        onReset();
                    }}
                />
            )}
        </>
    );
}

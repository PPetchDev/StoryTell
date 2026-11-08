'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, useState } from 'react';

import { useApiQuery } from '@/components/connection';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { ConfirmDialog } from '@/components/sheet/confirm-dialog';
import { Sheet } from '@/components/sheet/sheet';
import { Cast, characterColour, Portraits } from '@/lib/character-colour';
import { Chat, messageHref } from '@/lib/chat';
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

/** The API's cap on an Author's note (.scratch/authors-note/spec.md): about 250 tokens. */
export const AUTHORS_NOTE_MAX = 1_000;

/** The menu row's quiet line: the note's first line (the row cuts it to fit), or how to start one. */
function noteSummary(note: string): string {
    const first = note.trim().split('\n')[0]?.trim() ?? '';
    return first === '' ? 'None: steer this Chat in your own words' : first;
}

/**
 * The Author's note in place of the menu's rows, like Rename (.scratch/authors-note/spec.md):
 * the user's own direction for this Chat. The box stops at the API's cap, so a longer paste
 * is cut there and Save never sends more than it accepts.
 */
function AuthorsNoteForm({
    note,
    onSave,
    onCancel,
}: {
    note: string;
    onSave(text: string): void;
    onCancel(): void;
}) {
    const [value, setValue] = useState(note);
    const save = (event: FormEvent) => {
        event.preventDefault();
        onSave(value);
    };
    return (
        <form className={styles.rename} onSubmit={save}>
            <h2 className={styles.renameTitle}>Author&apos;s note</h2>
            <p className={styles.noteHint}>
                Your direction for this Chat. The Narrator reads it every turn.
            </p>
            <textarea
                className={`${styles.renameInput} ${styles.noteInput}`}
                aria-label="Author's note"
                aria-describedby="authors-note-count"
                placeholder={'Keep it a slow burn.\nIt rains all day.'}
                value={value}
                autoFocus
                rows={5}
                maxLength={AUTHORS_NOTE_MAX}
                onChange={(event) => setValue(event.target.value)}
            />
            <span id="authors-note-count" className={styles.noteCount}>
                {value.length.toLocaleString('en-US')} / {AUTHORS_NOTE_MAX.toLocaleString('en-US')}
            </span>
            <button type="submit" className={`button ${styles.renameSave}`}>
                Save
            </button>
            <div className={styles.noteActions}>
                <button
                    type="button"
                    className="button button-quiet"
                    disabled={note === ''}
                    onClick={() => onSave('')}
                >
                    Clear
                </button>
                <button type="button" className="button button-quiet" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

/** Names in a sentence: "Mira", "Mira and Kai", "Mira, Kai and Oren". */
function nameList(names: string[]): string {
    return names.length < 2 ? (names[0] ?? '') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The menu row's quiet line (.scratch/speaker-controls/spec.md): "Everyone is in", or who is sitting out. */
function sittingOutSummary(names: string[]): string {
    if (names.length === 0) return 'Everyone is in';
    return `${nameList(names)} ${names.length === 1 ? 'is' : 'are'} sitting out`;
}

/**
 * "Who's in this Chat" in place of the menu's rows (.scratch/speaker-controls/spec.md): every
 * Character with their Portrait, name and a switch between "In the story" and "Sitting out".
 * Each switch saves the whole set at once, as a write; the sheet stays open, so several can be
 * switched in a row, and the switches wait while a turn or a write is in flight.
 */
function WhosInForm({
    chat,
    cast,
    characters,
    portraits,
    busy,
    error,
    onSave,
}: {
    chat: Chat;
    cast: Cast;
    characters: readonly { id: number; name: string }[];
    portraits: Portraits;
    busy: boolean;
    error: string | null;
    onSave(characterIds: number[]): void;
}) {
    const toggle = (characterId: number) => {
        const out = chat.sittingOut.includes(characterId);
        onSave(out ? chat.sittingOut.filter((id) => id !== characterId) : [...chat.sittingOut, characterId]);
    };
    return (
        <div className={styles.rename}>
            <h2 className={styles.renameTitle}>Who&apos;s in this Chat</h2>
            <p className={styles.noteHint}>
                Someone sitting out takes no part in the story until you bring them back.
            </p>
            <ul className={styles.whoList} aria-busy={busy}>
                {characters.map((character) => {
                    const inStory = !chat.sittingOut.includes(character.id);
                    const nameId = `who-${character.id}`;
                    return (
                        <li key={character.id} className={styles.who}>
                            <CharacterPortrait
                                name={character.name}
                                colour={characterColour(character.id, cast)}
                                portrait={portraits[character.id]}
                                className={styles.whoPortrait}
                            />
                            <span id={nameId} className={styles.whoName}>
                                {character.name}
                            </span>
                            <button
                                type="button"
                                role="switch"
                                aria-checked={inStory}
                                aria-labelledby={nameId}
                                className={inStory ? styles.whoSwitch : `${styles.whoSwitch} ${styles.whoOut}`}
                                disabled={busy}
                                onClick={() => toggle(character.id)}
                            >
                                {inStory ? 'In the story' : 'Sitting out'}
                            </button>
                        </li>
                    );
                })}
            </ul>
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
        </div>
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
    /** The Story's Character ids in cast order, which pick each Character's colour. */
    cast: Cast;
    /** The Story's Characters in cast order, for "Who's in this Chat". */
    characters: readonly { id: number; name: string }[];
    portraits: Portraits;
    /** The last write's error, shown in "Who's in this Chat" while it is open. */
    error: string | null;
    /** A turn or a write is in flight, or a Message is being edited. */
    busy: boolean;
    /** The Scene strip is hidden on this device, so the menu offers it back. */
    stripHidden: boolean;
    onShowStrip(): void;
    onSwapIdentity(personaId: number | null): void;
    onOpenMemory(): void;
    onRename(title: string): void;
    /** Saves the Author's note; an empty text clears it. */
    onSetAuthorsNote(text: string): void;
    /** Saves who is sitting out, the whole set at once. */
    onSetSittingOut(characterIds: number[]): void;
    onReset(): void;
}

/**
 * One thin row above the thread (spec: "Top bar"): back to the Story's Chats, the Chat's title
 * with the worn identity under it, and ⋯, which opens a bottom sheet with everything else.
 * Reset sits last in the danger style and asks first.
 */
export function ChatTopBar({
    chat,
    cast,
    characters,
    portraits,
    error,
    busy,
    stripHidden,
    onShowStrip,
    onSwapIdentity,
    onOpenMemory,
    onRename,
    onSetAuthorsNote,
    onSetSittingOut,
    onReset,
}: ChatTopBarProps) {
    const [menu, setMenu] = useState<'closed' | 'menu' | 'rename' | 'note' | 'who'>('closed');
    const sittingOutNames = chat.sittingOut.flatMap((id) => characters.find((character) => character.id === id)?.name ?? []);
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
                <Sheet
                    label={
                        menu === 'rename'
                            ? 'Rename Chat'
                            : menu === 'note'
                              ? "Author's note"
                              : menu === 'who'
                                ? "Who's in this Chat"
                                : 'Chat menu'
                    }
                    onClose={close}
                >
                    {menu === 'rename' ? (
                        <RenameForm
                            title={chat.title}
                            onSave={(title) => {
                                close();
                                onRename(title);
                            }}
                        />
                    ) : menu === 'note' ? (
                        <AuthorsNoteForm
                            note={chat.authorsNote}
                            onSave={(text) => {
                                close();
                                onSetAuthorsNote(text);
                            }}
                            onCancel={close}
                        />
                    ) : menu === 'who' ? (
                        <WhosInForm
                            chat={chat}
                            cast={cast}
                            characters={characters}
                            portraits={portraits}
                            busy={busy}
                            error={error}
                            onSave={onSetSittingOut}
                        />
                    ) : (
                        <div className={styles.menu}>
                            {chat.branchedFrom && (
                                // A Branch leads back to where the two Chats part (.scratch/branch/spec.md).
                                <Link
                                    href={
                                        chat.branchedFrom.messageId === null
                                            ? `/stories/${chat.storyId}/chats/${chat.branchedFrom.chatId}`
                                            : messageHref(chat.storyId, chat.branchedFrom.chatId, chat.branchedFrom.messageId)
                                    }
                                    className={styles.item}
                                >
                                    <MenuText label={`Branched from ${chat.branchedFrom.title}`} sub="Back to where the two Chats part" />
                                </Link>
                            )}
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
                            {/* A plain link: the API answers it as an attachment, so the page stays put. */}
                            <a
                                href={`/api/stories/${chat.storyId}/chats/${chat.id}/transcript`}
                                className={styles.item}
                                download
                                onClick={close}
                            >
                                <MenuText label="Download as text" sub="The whole Chat as a .txt file" />
                            </a>
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
                            {/* The first of the new rows (.scratch/sillytavern-gaps/integration.md). */}
                            <MenuButton onClick={() => setMenu('note')} disabled={busy}>
                                <MenuText label="Author's note" sub={noteSummary(chat.authorsNote)} />
                            </MenuButton>
                            {/* After Author's note (.scratch/sillytavern-gaps/integration.md), whatever the cast size. */}
                            <MenuButton onClick={() => setMenu('who')}>
                                <MenuText label="Who's in this Chat" sub={sittingOutSummary(sittingOutNames)} />
                            </MenuButton>
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

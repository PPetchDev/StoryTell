'use client';

import Link from 'next/link';
import { FormEvent, ReactNode, Ref, useEffect, useState } from 'react';

import { COLUMN, TEXT_BOX } from '@/components/chat/chat-classes';
import { useApiQuery } from '@/components/connection';
import { ChevronLeftIcon, MoreIcon } from '@/components/icons';
import { CharacterPortrait } from '@/components/portrait/character-portrait';
import { ConfirmDialog } from '@/components/sheet/confirm-dialog';
import { Sheet } from '@/components/sheet/sheet';
import { Cast, characterColour, Portraits } from '@/lib/character-colour';
import { Chat, messageHref } from '@/lib/chat';
import { PersonaList } from '@/lib/persona';

const RESET_QUESTION = 'Clear every Message and start this Chat over from the Opening?';

/** A round 44px icon button in the bar: ‹ back, the Visual novel view, ⋯. */
const BAR_ICON = [
    'bare-button grid size-11 shrink-0 place-items-center rounded-full text-text',
    'cursor-pointer press focus-ring active:bg-surface-raised',
    'aria-pressed:text-accent',
].join(' ');

/** A row of the ⋯ menu, a link or a button: 44px, its ring inside (the sheet's edge would clip one outside). */
const ITEM = [
    'bare-button group flex w-full min-h-11 rounded-md px-3 py-2.5',
    'text-left no-underline',
    'cursor-pointer press focus-ring-inset active:bg-surface-raised',
    'disabled:cursor-not-allowed disabled:text-faint',
].join(' ');

/** A menu row's quiet line, cut to one line; the whole of it is in the row's `title` (audit L8). */
const ITEM_SUB = 'max-w-full truncate text-sm group-disabled:text-faint';

/** A sheet's form (Rename, Author's note, Who's in this Chat): a heading over its fields. */
const SHEET_FORM = 'grid gap-3 px-1 pb-1';
const SHEET_TITLE = 'm-0 text-lg';
const SHEET_HINT = '-mt-1 mb-0 text-md text-muted';

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
        // The row holds a picker, so the row itself is not a tap target.
        <label className="flex w-full flex-col items-start rounded-md px-3 py-2.5 text-text">
            <span className="font-semibold">Playing as</span>
            {/* 44px tall, its edge 3:1 (audit M34, H14). */}
            <select
                className="mt-1.5 min-h-11 w-full rounded-sm border border-field-line bg-bg px-2.5 py-2 font-[inherit] text-text"
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
        <form className={SHEET_FORM} onSubmit={save}>
            <h2 className={SHEET_TITLE}>Rename Chat</h2>
            <input
                type="text"
                className={TEXT_BOX}
                aria-label="Chat title"
                value={value}
                autoFocus
                maxLength={200}
                onChange={(event) => setValue(event.target.value)}
            />
            <button type="submit" className="button w-full" disabled={value.trim() === ''}>
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
        <form className={SHEET_FORM} onSubmit={save}>
            <h2 className={SHEET_TITLE}>Author&apos;s note</h2>
            <p className={SHEET_HINT}>Your direction for this Chat. The Narrator reads it every turn.</p>
            <textarea
                className={`${TEXT_BOX} min-h-28 resize-y leading-[1.4]`}
                aria-label="Author's note"
                aria-describedby="authors-note-count"
                placeholder={'Keep it a slow burn.\nIt rains all day.'}
                value={value}
                autoFocus
                rows={5}
                maxLength={AUTHORS_NOTE_MAX}
                onChange={(event) => setValue(event.target.value)}
            />
            <span id="authors-note-count" className="-mt-2 justify-self-end text-sm text-muted tabular-nums">
                {value.length.toLocaleString('en-US')} / {AUTHORS_NOTE_MAX.toLocaleString('en-US')}
            </span>
            <button type="submit" className="button w-full">
                Save
            </button>
            <div className="grid grid-cols-2 gap-2">
                <button type="button" className="button button-quiet" disabled={note === ''} onClick={() => onSave('')}>
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

/** A pill that says On, In the story, or the like: the accent fill while on. */
const PILL_ON = 'border-accent-fill bg-accent-fill text-accent-text';
const PILL_OFF = 'border-field-line text-muted';

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
        <div className={SHEET_FORM}>
            <h2 className={SHEET_TITLE}>Who&apos;s in this Chat</h2>
            <p className={SHEET_HINT}>Someone sitting out takes no part in the story until you bring them back.</p>
            <ul className="m-0 grid list-none gap-1 p-0" aria-busy={busy}>
                {characters.map((character) => {
                    const inStory = !chat.sittingOut.includes(character.id);
                    const nameId = `who-${character.id}`;
                    const switchId = `who-${character.id}-switch`;
                    return (
                        <li key={character.id} className="flex min-h-12 items-center gap-3">
                            <CharacterPortrait
                                name={character.name}
                                colour={characterColour(character.id, cast)}
                                portrait={portraits[character.id]}
                                className="size-9 shrink-0 text-base"
                            />
                            <span id={nameId} className="min-w-0 flex-1 truncate font-semibold" title={character.name}>
                                {character.name}
                            </span>
                            <button
                                id={switchId}
                                type="button"
                                role="switch"
                                aria-checked={inStory}
                                // The name, then the words on the switch (audit L10: what is seen is in what is said).
                                aria-labelledby={`${nameId} ${switchId}`}
                                className={`bare-button min-h-11 min-w-30 shrink-0 cursor-pointer rounded-full border px-3 py-2 text-md font-semibold press focus-ring disabled:cursor-not-allowed disabled:opacity-55 ${inStory ? PILL_ON : PILL_OFF}`}
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
function MenuText({ label, sub, danger = false }: { label: string; sub: string; danger?: boolean }) {
    return (
        <>
            <span className="font-semibold">{label}</span>
            <span className={`${ITEM_SUB} ${danger ? 'text-danger' : 'text-muted'}`}>{sub}</span>
        </>
    );
}

interface MenuButtonProps {
    onClick(): void;
    disabled?: boolean;
    danger?: boolean;
    /** The whole quiet line, where the row cuts it. */
    title?: string;
    children: ReactNode;
}

function MenuButton({ onClick, disabled, danger, title, children }: MenuButtonProps) {
    return (
        <button
            type="button"
            className={`${ITEM} flex-col items-start ${danger ? 'text-danger' : 'text-text'}`}
            onClick={onClick}
            disabled={disabled}
            title={title}
        >
            {children}
        </button>
    );
}

/** A link row of the ⋯ menu. */
const LINK_ITEM = `${ITEM} flex-col items-start text-text`;

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
    /** Turns Read replies aloud on or off. */
    onSetAutoRead(autoRead: boolean): void;
    onReset(): void;
    /** Counts the asks for "Who's in this Chat" from outside the menu; each new one opens it. */
    whoRequest?: number;
    /** The Visual novel view is on (.scratch/chat-looks/spec.md); the toggle sits between the title and ⋯. */
    novel?: boolean;
    onToggleNovel?(): void;
    /** ⋯, for focus to come back to (hiding the Scene strip, which ⋯ brings back). */
    menuButtonRef?: Ref<HTMLButtonElement>;
    /** The Visual novel view's toggle, for focus to come back to after leaving the view. */
    novelToggleRef?: Ref<HTMLButtonElement>;
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
    onSetAutoRead,
    onReset,
    whoRequest = 0,
    novel = false,
    onToggleNovel,
    menuButtonRef,
    novelToggleRef,
}: ChatTopBarProps) {
    const [menu, setMenu] = useState<'closed' | 'menu' | 'rename' | 'note' | 'who'>('closed');
    const sittingOutNames = chat.sittingOut.flatMap((id) => characters.find((character) => character.id === id)?.name ?? []);
    const [confirming, setConfirming] = useState(false);
    const close = () => setMenu('closed');
    // The Character row's "Who's here" opens the same sheet (.scratch/speaker-controls/spec.md).
    useEffect(() => {
        if (whoRequest) setMenu('who');
    }, [whoRequest]);
    /** Closes the menu, then runs the choice, so a drawer or dialog it opens takes the focus. */
    const choose = (action: () => void) => () => {
        close();
        action();
    };
    const note = noteSummary(chat.authorsNote);
    const sittingOut = sittingOutSummary(sittingOutNames);

    return (
        <>
            {/* At most 56px; half-way into the page's side padding on a phone; the page colour, so a Backdrop shows behind the Messages only. */}
            <header className={`-mx-2 flex max-h-14 min-h-12 shrink-0 items-center gap-1 border-b border-line bg-bg py-1 ${COLUMN}`}>
                <Link href={`/stories/${chat.storyId}/chats`} className={BAR_ICON} aria-label="Back to Chats">
                    <ChevronLeftIcon size={22} strokeWidth={2} />
                </Link>
                {/* Cut to one line each; the whole title and name are in their `title` (audit L8). */}
                <div className="flex min-w-0 flex-1 flex-col leading-tight">
                    <h1 className="m-0 truncate text-note font-bold" title={chat.title}>
                        {chat.title}
                    </h1>
                    <span className="truncate text-xs text-muted" title={`as ${chat.identityName}`}>
                        as {chat.identityName}
                    </span>
                </div>
                {onToggleNovel && (
                    <button ref={novelToggleRef} type="button" className={BAR_ICON} aria-label="Visual novel view" aria-pressed={novel} onClick={onToggleNovel}>
                        {/* A figure over a text box: the speaker large, their words below. */}
                        <svg
                            viewBox="0 0 24 24"
                            width="22"
                            height="22"
                            aria-hidden="true"
                            fill={novel ? 'currentColor' : 'none'}
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        >
                            <circle cx="12" cy="6.5" r="2.5" />
                            <path d="M7.5 14c.6-2.4 2.3-3.8 4.5-3.8s3.9 1.4 4.5 3.8" fill="none" />
                            <rect x="3" y="15" width="18" height="6" rx="1.5" />
                        </svg>
                    </button>
                )}
                <button
                    ref={menuButtonRef}
                    type="button"
                    className={BAR_ICON}
                    aria-label="Chat menu"
                    aria-haspopup="dialog"
                    aria-expanded={menu !== 'closed'}
                    onClick={() => setMenu('menu')}
                >
                    <MoreIcon size={22} />
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
                        <div className="grid gap-0.5">
                            {chat.branchedFrom && (
                                // A Branch leads back to where the two Chats part (.scratch/branch/spec.md).
                                <Link
                                    href={
                                        chat.branchedFrom.messageId === null
                                            ? `/stories/${chat.storyId}/chats/${chat.branchedFrom.chatId}`
                                            : messageHref(chat.storyId, chat.branchedFrom.chatId, chat.branchedFrom.messageId)
                                    }
                                    className={LINK_ITEM}
                                >
                                    <MenuText label={`Branched from ${chat.branchedFrom.title}`} sub="Back to where the two Chats part" />
                                </Link>
                            )}
                            <MenuButton onClick={choose(onOpenMemory)}>
                                <MenuText label="Memory" sub="What the story remembers" />
                            </MenuButton>
                            <Link href={`/stories/${chat.storyId}/chats/${chat.id}/dashboard`} className={LINK_ITEM}>
                                <MenuText label="Dashboard" sub="The Scene and how the Characters feel" />
                            </Link>
                            <Link href={`/stories/${chat.storyId}/gallery?chat=${chat.id}`} className={LINK_ITEM}>
                                <MenuText label="Gallery" sub="Every Snapshot of this Chat" />
                            </Link>
                            {/* A plain link: the API answers it as an attachment, so the page stays put. */}
                            <a
                                href={`/api/stories/${chat.storyId}/chats/${chat.id}/transcript`}
                                className={LINK_ITEM}
                                download
                                onClick={close}
                            >
                                <MenuText label="Download as text" sub="The whole Chat as a .txt file" />
                            </a>
                            <MenuButton onClick={() => setMenu('rename')} disabled={busy} title={chat.title}>
                                <MenuText label="Rename" sub={chat.title} />
                            </MenuButton>
                            <IdentitySwap chat={chat} disabled={busy} onSwap={onSwapIdentity} />
                            {stripHidden && (
                                <MenuButton onClick={choose(onShowStrip)}>
                                    <MenuText label="Show Scene strip" sub="The current Scene and its goal" />
                                </MenuButton>
                            )}
                            {/* The first of the new rows (.scratch/sillytavern-gaps/integration.md). */}
                            <MenuButton onClick={() => setMenu('note')} disabled={busy} title={note}>
                                <MenuText label="Author's note" sub={note} />
                            </MenuButton>
                            {/* After Author's note (.scratch/sillytavern-gaps/integration.md), whatever the cast size. */}
                            <MenuButton onClick={() => setMenu('who')} title={sittingOut}>
                                <MenuText label="Who's in this Chat" sub={sittingOut} />
                            </MenuButton>
                            {/* The last of the new rows (.scratch/sillytavern-gaps/integration.md). The menu stays open. */}
                            <button
                                type="button"
                                role="switch"
                                aria-checked={chat.autoRead}
                                className={`${ITEM} flex-row items-center gap-3 text-text`}
                                disabled={busy}
                                onClick={() => onSetAutoRead(!chat.autoRead)}
                            >
                                <span className="flex min-w-0 flex-1 flex-col items-start">
                                    <MenuText label="Read replies aloud" sub="New replies play by themselves" />
                                </span>
                                <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-sm ${chat.autoRead ? PILL_ON : PILL_OFF}`} aria-hidden="true">
                                    {chat.autoRead ? 'On' : 'Off'}
                                </span>
                            </button>
                            <hr className="my-1 border-0 border-t border-line" />
                            <MenuButton danger onClick={choose(() => setConfirming(true))} disabled={busy || !chat.playable}>
                                <MenuText label="Reset Chat" sub="Start again from the Opening" danger />
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

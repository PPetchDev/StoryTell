'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { ConfirmButton } from '@/components/story-editor/fields';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Memory, memoryApi, MemoryList, renderUser } from '@/lib/memory';

interface KnownByPickerProps {
    cast: MemoryList['cast'];
    value: number[];
    onChange(value: number[]): void;
}

/** One checkbox per Character, for who knows the Memory. */
function KnownByPicker({ cast, value, onChange }: KnownByPickerProps) {
    return (
        <fieldset className="known-by-picker">
            <legend className="muted small">Known by</legend>
            {cast.map((character) => (
                <label key={character.id} className="chip chip-pick">
                    <input
                        type="checkbox"
                        checked={value.includes(character.id)}
                        onChange={(event) =>
                            onChange(
                                event.target.checked
                                    ? [...value, character.id]
                                    : value.filter((id) => id !== character.id),
                            )
                        }
                    />{' '}
                    {character.name}
                </label>
            ))}
        </fieldset>
    );
}

interface MemoryFormProps {
    cast: MemoryList['cast'];
    initialText: string;
    initialKnownBy: number[];
    submitLabel: string;
    busy: boolean;
    onSubmit(text: string, knownBy: number[]): void;
    onCancel?(): void;
}

function MemoryForm({ cast, initialText, initialKnownBy, submitLabel, busy, onSubmit, onCancel }: MemoryFormProps) {
    const [text, setText] = useState(initialText);
    const [knownBy, setKnownBy] = useState(initialKnownBy);
    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (text.trim() === '' || busy) return;
        onSubmit(text, knownBy);
    };
    return (
        <form className="memory-form" aria-label={`${submitLabel} Memory`} onSubmit={submit}>
            <textarea
                aria-label="Memory text"
                placeholder="What happened, or what was learned. Write {user} for yourself."
                value={text}
                rows={3}
                onChange={(event) => setText(event.target.value)}
            />
            <KnownByPicker cast={cast} value={knownBy} onChange={setKnownBy} />
            <div className="toolbar">
                <button type="submit" className="button button-small" disabled={busy || text.trim() === ''}>
                    {submitLabel}
                </button>
                {onCancel && (
                    <button type="button" className="button button-quiet button-small" onClick={onCancel}>
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
}

interface MemoryViewProps {
    list: MemoryList;
    memory: Memory;
    highlighted: boolean;
    busy: boolean;
    onEdit(text: string, knownBy: number[]): void;
    onDelete(): void;
    onRestore(): void;
    onJump(messageId: number): void;
}

/**
 * One Memory (spec: "Memory drawer"): its text with `{user}` rendered, Known-by chips, who
 * wrote it, a lock when locked, and a jump to the causing Message. Edit locks it.
 */
function MemoryView({ list, memory, highlighted, busy, onEdit, onDelete, onRestore, onJump }: MemoryViewProps) {
    const [editing, setEditing] = useState(false);
    const nameOf = (id: number) => list.cast.find((character) => character.id === id)?.name ?? 'a removed Character';
    const label = `Memory ${memory.id}`;
    return (
        <li
            id={`memory-${memory.id}`}
            className={highlighted ? 'memory memory-highlight' : 'memory'}
            aria-label={label}
        >
            {editing ? (
                <MemoryForm
                    cast={list.cast}
                    initialText={memory.text}
                    initialKnownBy={memory.knownBy}
                    submitLabel="Save"
                    busy={busy}
                    onSubmit={(text, knownBy) => {
                        setEditing(false);
                        onEdit(text, knownBy);
                    }}
                    onCancel={() => setEditing(false)}
                />
            ) : (
                <>
                    <p className="message-text">{renderUser(memory.text, list.identityName)}</p>
                    <p className="memory-chips">
                        {memory.knownBy.length === 0 ? (
                            <span className="chip chip-muted">Known by no one</span>
                        ) : (
                            memory.knownBy.map((id) => (
                                <span key={id} className="chip">
                                    {nameOf(id)}
                                </span>
                            ))
                        )}
                    </p>
                    <p className="muted small memory-meta">
                        <span>{memory.writtenBy === 'ai' ? 'Written by the AI' : 'Written by you'}</span>
                        {memory.locked && <span className="memory-lock">🔒 Locked</span>}
                        {memory.messageId !== null && (
                            <a
                                href={`#message-${memory.messageId}`}
                                onClick={(event) => {
                                    event.preventDefault();
                                    onJump(memory.messageId!);
                                }}
                            >
                                Go to the Message
                            </a>
                        )}
                    </p>
                    <div className="toolbar">
                        {memory.archived ? (
                            <button type="button" className="button button-quiet button-small" disabled={busy} onClick={onRestore}>
                                Restore
                            </button>
                        ) : (
                            <button type="button" className="button button-quiet button-small" disabled={busy} onClick={() => setEditing(true)}>
                                Edit
                            </button>
                        )}
                        <ConfirmButton
                            label="Delete"
                            question="Delete this Memory? The Characters forget it for good."
                            confirmLabel="Delete"
                            onConfirm={onDelete}
                            disabled={busy}
                        />
                    </div>
                </>
            )}
        </li>
    );
}

export interface MemoryDrawerProps {
    storyId: number;
    chatId: number;
    /** The Memory to open on and highlight, from a "Memory added" toast. */
    focusMemoryId: number | null;
    /** Bumped by the Chat screen when the Memory may have changed (a turn's extraction done, an edit, a reset). */
    version: number;
    onClose(): void;
    onJump(messageId: number): void;
}

/**
 * The Memory drawer on the Chat screen (spec: "Memory drawer"): every Memory with its text,
 * Known-by chips, author, lock and jump-to-Message link; Archived in a collapsed section;
 * add, edit (which locks), delete, restore (which locks). Opens from the Chat head and from a
 * "Memory added" toast, which lands on that Memory.
 */
export function MemoryDrawer({ storyId, chatId, focusMemoryId, version, onClose, onJump }: MemoryDrawerProps) {
    const { reportUnreachable } = useConnection();
    const [list, setList] = useState<MemoryList | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    const focusedRef = useRef<number | null>(null);

    const fail = (caught: unknown, fallback: string) => {
        if (caught instanceof ApiUnreachableError) reportUnreachable();
        else setError(caught instanceof ApiError ? caught.message : fallback);
    };

    useEffect(() => {
        let cancelled = false;
        memoryApi.list(storyId, chatId).then(
            (data) => !cancelled && setList(data),
            (caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                else setError(caught instanceof ApiError ? caught.message : 'Could not load the Memory.');
            },
        );
        return () => {
            cancelled = true;
        };
    }, [storyId, chatId, version, reportUnreachable]);

    useEffect(() => {
        if (!list || focusMemoryId === null || focusedRef.current === focusMemoryId) return;
        focusedRef.current = focusMemoryId;
        document.getElementById(`memory-${focusMemoryId}`)?.scrollIntoView({ block: 'center' });
    }, [list, focusMemoryId]);

    /** A write, then the list re-read so the drawer shows the Memory as the API has it. */
    const write = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        try {
            await work();
            setList(await memoryApi.list(storyId, chatId));
        } catch (caught) {
            fail(caught, 'Something went wrong.');
        } finally {
            setBusy(false);
        }
    };

    const active = list?.memories.filter((memory) => !memory.archived) ?? [];
    const archived = list?.memories.filter((memory) => memory.archived) ?? [];

    return (
        <aside className="memory-drawer" aria-label="Memory">
            <div className="memory-drawer-head">
                <h2>Memory</h2>
                <button type="button" className="button button-quiet button-small" onClick={onClose}>
                    Close
                </button>
            </div>
            <p className="muted small">
                What the Characters remember of this Chat. Each one knows only the Memories it is tagged on. Editing a Memory
                locks it from AI changes.
            </p>
            {error && (
                <p role="alert" className="turn-error">
                    {error}
                </p>
            )}
            {!list ? (
                <p className="muted">Loading…</p>
            ) : (
                <>
                    {adding ? (
                        <MemoryForm
                            cast={list.cast}
                            initialText=""
                            initialKnownBy={list.present}
                            submitLabel="Add"
                            busy={busy}
                            onSubmit={(text, knownBy) => {
                                setAdding(false);
                                void write(() => memoryApi.add(storyId, chatId, text, knownBy));
                            }}
                            onCancel={() => setAdding(false)}
                        />
                    ) : (
                        <button type="button" className="button button-small" disabled={busy} onClick={() => setAdding(true)}>
                            Add a Memory
                        </button>
                    )}
                    {active.length === 0 ? (
                        <p className="muted">Nothing remembered yet.</p>
                    ) : (
                        <ul className="memory-list" aria-label="Memories">
                            {active.map((memory) => (
                                <MemoryView
                                    key={memory.id}
                                    list={list}
                                    memory={memory}
                                    highlighted={memory.id === focusMemoryId}
                                    busy={busy}
                                    onEdit={(text, knownBy) => void write(() => memoryApi.edit(storyId, chatId, memory.id, { text, knownBy }))}
                                    onDelete={() => void write(() => memoryApi.remove(storyId, chatId, memory.id))}
                                    onRestore={() => void write(() => memoryApi.restore(storyId, chatId, memory.id))}
                                    onJump={onJump}
                                />
                            ))}
                        </ul>
                    )}
                    {archived.length > 0 && (
                        <details className="memory-archived">
                            <summary>Archived ({archived.length})</summary>
                            <ul className="memory-list" aria-label="Archived Memories">
                                {archived.map((memory) => (
                                    <MemoryView
                                        key={memory.id}
                                        list={list}
                                        memory={memory}
                                        highlighted={memory.id === focusMemoryId}
                                        busy={busy}
                                        onEdit={(text, knownBy) => void write(() => memoryApi.edit(storyId, chatId, memory.id, { text, knownBy }))}
                                        onDelete={() => void write(() => memoryApi.remove(storyId, chatId, memory.id))}
                                        onRestore={() => void write(() => memoryApi.restore(storyId, chatId, memory.id))}
                                        onJump={onJump}
                                    />
                                ))}
                            </ul>
                        </details>
                    )}
                </>
            )}
        </aside>
    );
}

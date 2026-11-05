'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { useConnection } from '@/components/connection';
import { useAutosave } from '@/components/story-editor/autosave';
import { ConfirmButton } from '@/components/story-editor/fields';
import { SaveStatus } from '@/components/story-editor/save-status';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { Memory, memoryApi, MemoryList, renderUser } from '@/lib/memory';

type Queue = ReturnType<typeof useAutosave>['queue'];

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

interface MemoryEditorProps {
    label: string;
    cast: MemoryList['cast'];
    initialText: string;
    initialKnownBy: number[];
    /** Called on every change that can be sent: the text is not empty. */
    onChange(text: string, knownBy: number[]): void;
    onDone(): void;
}

/**
 * A Memory's text and Known-by set, saved as they change (spec: "Saving"). What was typed stays
 * here whatever the API answers, so a failed save loses nothing; empty text is not sent.
 */
function MemoryEditor({ label, cast, initialText, initialKnownBy, onChange, onDone }: MemoryEditorProps) {
    const [text, setText] = useState(initialText);
    const [knownBy, setKnownBy] = useState(initialKnownBy);
    const errorId = useId();
    const empty = text.trim() === '';

    const change = (nextText: string, nextKnownBy: number[]) => {
        setText(nextText);
        setKnownBy(nextKnownBy);
        if (nextText.trim() !== '') onChange(nextText, nextKnownBy);
    };

    return (
        <div className="memory-form" role="group" aria-label={label}>
            <textarea
                aria-label="Memory text"
                placeholder="What happened, or what was learned. Write {user} for yourself."
                value={text}
                rows={3}
                autoFocus
                aria-describedby={empty && initialText !== '' ? errorId : undefined}
                onChange={(event) => change(event.target.value, knownBy)}
            />
            {/* A new Memory starts empty; only clearing an existing one's text is an error. */}
            {empty && initialText !== '' && (
                <p id={errorId} role="alert" className="field-error">
                    A Memory needs some text. Use Delete to forget it.
                </p>
            )}
            <KnownByPicker cast={cast} value={knownBy} onChange={(next) => change(text, next)} />
            <div className="toolbar">
                <button type="button" className="button button-small" onClick={onDone}>
                    Done
                </button>
            </div>
        </div>
    );
}

interface NewMemoryProps {
    list: MemoryList;
    storyId: number;
    chatId: number;
    queue: Queue;
    /** The Memory this form made, once its first save lands; the drawer leaves it out of the list meanwhile. */
    onCreated(memoryId: number): void;
    onSaved(memory: Memory): void;
    onDone(): void;
}

/** A Memory being added: its first save with text adds it, and later ones edit it. */
function NewMemory({ list, storyId, chatId, queue, onCreated, onSaved, onDone }: NewMemoryProps) {
    const key = useId();
    // Read when each save runs, after the earlier ones, so the add happens exactly once.
    const created = useRef<number | null>(null);
    // A save still waiting when Done is pressed lands after the form has gone: the Memory then
    // simply joins the list, so the drawer must not be told to hide it.
    const open = useRef(true);
    useEffect(() => {
        open.current = true;
        return () => {
            open.current = false;
        };
    }, []);

    const save = (text: string, knownBy: number[]) =>
        queue(
            `memory.new.${key}`,
            async () => {
                if (created.current !== null) return memoryApi.edit(storyId, chatId, created.current, { text, knownBy });
                const memory = await memoryApi.add(storyId, chatId, text, knownBy);
                created.current = memory.id;
                if (open.current) onCreated(memory.id);
                return memory;
            },
            onSaved,
        );

    return (
        <MemoryEditor
            label="New Memory"
            cast={list.cast}
            initialText=""
            initialKnownBy={list.present}
            onChange={save}
            onDone={onDone}
        />
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
                <MemoryEditor
                    label={`Edit ${label}`}
                    cast={list.cast}
                    initialText={memory.text}
                    initialKnownBy={memory.knownBy}
                    onChange={onEdit}
                    onDone={() => setEditing(false)}
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
 * add, edit (which locks), delete, restore (which locks). Adds and edits save as they are
 * typed, with the status in the drawer's header (spec: "Saving"). Opens from the Chat head and
 * from a "Memory added" toast, which lands on that Memory.
 */
export function MemoryDrawer({ storyId, chatId, focusMemoryId, version, onClose, onJump }: MemoryDrawerProps) {
    const { reportUnreachable } = useConnection();
    const { state, queue, commit } = useAutosave();
    const [list, setList] = useState<MemoryList | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    /** The Memory the open "new" form has added, kept out of the list until the form closes. */
    const [draftId, setDraftId] = useState<number | null>(null);
    const focusedRef = useRef<number | null>(null);

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

    /** A saved Memory takes its place in the list, or joins it when it is new. */
    const saved = (memory: Memory) =>
        setList((current) => {
            if (!current) return current;
            const known = current.memories.some((each) => each.id === memory.id);
            return {
                ...current,
                memories: known
                    ? current.memories.map((each) => (each.id === memory.id ? memory : each))
                    : [...current.memories, memory],
            };
        });

    const edit = (memoryId: number) => (text: string, knownBy: number[]) =>
        queue(`memory.${memoryId}`, () => memoryApi.edit(storyId, chatId, memoryId, { text, knownBy }), saved);

    /** Delete or restore, after any edits still waiting, then the list re-read as the API has it. */
    const write = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        await commit(
            async () => {
                await work();
                return memoryApi.list(storyId, chatId);
            },
            setList,
            setError,
        );
        setBusy(false);
    };

    const closeNew = () => {
        setAdding(false);
        setDraftId(null);
    };

    const shown = list?.memories.filter((memory) => memory.id !== draftId) ?? [];
    const active = shown.filter((memory) => !memory.archived);
    const archived = shown.filter((memory) => memory.archived);

    const view = (memory: Memory) => (
        <MemoryView
            key={memory.id}
            list={list!}
            memory={memory}
            highlighted={memory.id === focusMemoryId}
            busy={busy}
            onEdit={edit(memory.id)}
            onDelete={() => void write(() => memoryApi.remove(storyId, chatId, memory.id))}
            onRestore={() => void write(() => memoryApi.restore(storyId, chatId, memory.id))}
            onJump={onJump}
        />
    );

    return (
        <aside className="memory-drawer" aria-label="Memory">
            <div className="memory-drawer-head">
                <h2>Memory</h2>
                {list && <SaveStatus state={state} />}
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
                        <NewMemory
                            list={list}
                            storyId={storyId}
                            chatId={chatId}
                            queue={queue}
                            onCreated={setDraftId}
                            onSaved={saved}
                            onDone={closeNew}
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
                            {active.map(view)}
                        </ul>
                    )}
                    {archived.length > 0 && (
                        <details className="memory-archived">
                            <summary>Archived ({archived.length})</summary>
                            <ul className="memory-list" aria-label="Archived Memories">
                                {archived.map(view)}
                            </ul>
                        </details>
                    )}
                </>
            )}
        </aside>
    );
}

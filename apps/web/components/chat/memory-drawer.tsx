'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { bondDirection, GraphBond, GraphSelection, MemoryGraph, memoriesAbout, personName } from '@/components/chat/memory-graph';
import { BeliefsSection } from '@/components/chat/beliefs-section';
import { DocumentsInPlayCard } from '@/components/chat/documents-in-play-card';
import { LoreInPlayCard } from '@/components/chat/lore-in-play-card';
import { StorySoFarCard } from '@/components/chat/story-so-far-card';
import { useConnection } from '@/components/connection';
import { Autosave, useAutosave } from '@/components/story-editor/autosave';
import { ConfirmButton } from '@/components/story-editor/fields';
import { SaveStatus } from '@/components/story-editor/save-status';
import { ApiError, ApiUnreachableError } from '@/lib/api';
import { bondLevelsInWords } from '@/lib/bonds';
import { Portraits } from '@/lib/character-colour';
import type { ChatBond } from '@/lib/chat';
import { devicePreference } from '@/lib/device-preference';
import { beliefApi, LOCKED_WARNING, Memory, memoryApi, MemoryList, renderUser } from '@/lib/memory';

/** How the drawer shows the Memories: the list, or the Memory graph. A per-device preference. */
type MemoryViewKind = 'list' | 'graph';

const memoryViewKind = devicePreference<MemoryViewKind>({
    key: 'storytell.memoryView',
    fallback: 'list',
    parse: (stored) => (stored === 'list' || stored === 'graph' ? stored : null),
    serialise: (kind) => kind,
});

/** Whether the Memory graph draws the Bonds between the people (.scratch/bond-axes/spec.md). Starts off. */
const memoryGraphBonds = devicePreference<boolean>({
    key: 'storytell.memoryGraphBonds',
    fallback: false,
    parse: (stored) => (stored === 'on' ? true : stored === 'off' ? false : null),
    serialise: (on) => (on ? 'on' : null),
});

/** "Show Bonds", a switch beside the List / Graph choice. */
function ShowBondsSwitch({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
    return (
        <button type="button" role="switch" aria-checked={on} className="memory-bonds-switch" onClick={() => onChange(!on)}>
            <span className="memory-bonds-switch-track" aria-hidden="true" />
            Show Bonds
        </button>
    );
}

const VIEW_KINDS: readonly { kind: MemoryViewKind; label: string }[] = [
    { kind: 'list', label: 'List' },
    { kind: 'graph', label: 'Graph' },
];

/** List or Graph, as a two-choice radio group; arrow keys move between them. */
function MemoryViewSwitch({ value, onChange }: { value: MemoryViewKind; onChange(kind: MemoryViewKind): void }) {
    return (
        <div
            className="memory-view-switch"
            role="radiogroup"
            aria-label="Show Memories as"
            onKeyDown={(event) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
                event.preventDefault();
                const next = value === 'list' ? 'graph' : 'list';
                onChange(next);
                event.currentTarget.querySelector<HTMLElement>(`[data-kind="${next}"]`)?.focus();
            }}
        >
            {VIEW_KINDS.map(({ kind, label }) => (
                <button
                    key={kind}
                    type="button"
                    role="radio"
                    data-kind={kind}
                    aria-checked={kind === value}
                    tabIndex={kind === value ? 0 : -1}
                    onClick={() => onChange(kind)}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

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
    autosave: Autosave;
    /** The autosave key for this Memory's edits. */
    saveKey: string;
    /** Writes the Memory as it now reads; only called when the text is not empty. */
    send(text: string, knownBy: number[]): Promise<Memory>;
    onSaved(memory: Memory): void;
    onDone(): void;
}

/**
 * A Memory's text and Known-by set, saved as they change (spec: "Saving"). What was typed stays
 * here whatever the API answers: empty text is not sent, and Done closes the editor only once
 * everything has saved, so a failed save never takes the text with it.
 */
function MemoryEditor({ label, cast, initialText, initialKnownBy, autosave, saveKey, send, onSaved, onDone }: MemoryEditorProps) {
    const [text, setText] = useState(initialText);
    const [knownBy, setKnownBy] = useState(initialKnownBy);
    const [closing, setClosing] = useState(false);
    const errorId = useId();
    // A new Memory starts empty; only clearing an existing one's text is an error.
    const emptied = text.trim() === '' && initialText !== '';

    useEffect(() => {
        if (!closing) return;
        if (autosave.state.kind === 'saved') onDone();
        else if (autosave.state.kind === 'error') setClosing(false);
    }, [closing, autosave.state, onDone]);

    const save = (nextText: string, nextKnownBy: number[]) =>
        autosave.queue(saveKey, () => send(nextText, nextKnownBy), onSaved);

    const change = (nextText: string, nextKnownBy: number[]) => {
        setText(nextText);
        setKnownBy(nextKnownBy);
        if (nextText.trim() === '') autosave.cancel(saveKey);
        else save(nextText, nextKnownBy);
    };

    const done = () => {
        // After a failed save, Done tries once more; otherwise there is nothing new to send.
        if (autosave.state.kind === 'error' && text.trim() !== '') save(text, knownBy);
        setClosing(true);
        void autosave.flush();
    };

    return (
        <div className="memory-form" role="group" aria-label={label}>
            <textarea
                aria-label="Memory text"
                placeholder="What happened, or what was learned. Write {user} for yourself."
                value={text}
                rows={3}
                autoFocus
                aria-invalid={emptied}
                aria-describedby={emptied ? errorId : undefined}
                onChange={(event) => change(event.target.value, knownBy)}
            />
            {emptied && (
                <p id={errorId} role="alert" className="field-error">
                    A Memory needs some text. Use Delete to forget it.
                </p>
            )}
            <KnownByPicker cast={cast} value={knownBy} onChange={(next) => change(text, next)} />
            <div className="toolbar">
                <button type="button" className="button button-small" disabled={closing} onClick={done}>
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
    autosave: Autosave;
    /** The Memory this form added, once its first save lands; the drawer leaves it out of the list meanwhile. */
    onAdded(memoryId: number): void;
    onSaved(memory: Memory): void;
    onDone(): void;
}

/** A Memory being added: its first save with text adds it, and later ones edit it. */
function NewMemory({ list, storyId, chatId, autosave, onAdded, onSaved, onDone }: NewMemoryProps) {
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

    const send = async (text: string, knownBy: number[]) => {
        if (created.current !== null) return memoryApi.edit(storyId, chatId, created.current, { text, knownBy });
        const memory = await memoryApi.add(storyId, chatId, text, knownBy);
        created.current = memory.id;
        if (open.current) onAdded(memory.id);
        return memory;
    };

    return (
        <MemoryEditor
            label="New Memory"
            cast={list.cast}
            initialText=""
            initialKnownBy={list.present}
            autosave={autosave}
            saveKey={`memory.new.${key}`}
            send={send}
            onSaved={onSaved}
            onDone={onDone}
        />
    );
}

interface MemoryViewProps {
    list: MemoryList;
    memory: Memory;
    highlighted: boolean;
    /** The last turn sent it (.scratch/memory-by-meaning/spec.md: "Used last turn"). */
    inPlay: boolean;
    busy: boolean;
    autosave: Autosave;
    sendEdit(text: string, knownBy: number[]): Promise<Memory>;
    onSaved(memory: Memory): void;
    onDelete(): void;
    onRestore(): void;
    onJump(messageId: number): void;
}

/**
 * One Memory (spec: "Memory drawer"): its text with `{user}` rendered, Known-by chips, who
 * wrote it, a lock when locked, and a jump to the causing Message. Edit locks it.
 */
function MemoryView({ list, memory, highlighted, inPlay, busy, autosave, sendEdit, onSaved, onDelete, onRestore, onJump }: MemoryViewProps) {
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
                    autosave={autosave}
                    saveKey={`memory.${memory.id}`}
                    send={sendEdit}
                    onSaved={onSaved}
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
                        {inPlay && <span className="memory-in-play">In play</span>}
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
                            danger
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
    /** The Characters' Portraits, for the Memory graph's people. */
    portraits?: Portraits;
    /** The Chat's current Bonds, which "Show Bonds" draws in the graph. */
    bonds?: readonly ChatBond[];
    /** The Characters sitting out, whose Bonds are not drawn. */
    sittingOut?: readonly number[];
}

/**
 * The Memory drawer on the Chat screen (spec: "Memory drawer"): every Memory with its text,
 * Known-by chips, author, lock and jump-to-Message link; Archived in a collapsed section;
 * add, edit (which locks), delete, restore (which locks). Adds and edits save as they are
 * typed, with the status in the drawer's header (spec: "Saving"). Opens from the Chat head and
 * from a "Memory added" toast, which lands on that Memory.
 */
export function MemoryDrawer({ storyId, chatId, focusMemoryId, version, onClose, onJump, portraits, bonds = [], sittingOut = [] }: MemoryDrawerProps) {
    const { reportUnreachable } = useConnection();
    const autosave = useAutosave();
    const [list, setList] = useState<MemoryList | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [adding, setAdding] = useState(false);
    /** The Memory the open "new" form has added, kept out of the list until the form closes. */
    const [addedId, setAddedId] = useState<number | null>(null);
    const focusedRef = useRef<number | null>(null);
    const viewKind = memoryViewKind.useValue();
    const showBonds = memoryGraphBonds.useValue();
    const [selection, setSelection] = useState<GraphSelection>(null);
    /**
     * The Memories about the picked person when they were picked. They stay under the graph while
     * that person is picked, so editing a name out of a Memory does not close it mid-edit.
     */
    const [pickedAbout, setPickedAbout] = useState<ReadonlySet<number>>(new Set());
    const select = (next: GraphSelection) => {
        setSelection(next);
        if (next?.kind === 'person' && list) {
            const active = list.memories.filter((memory) => !memory.archived);
            setPickedAbout(new Set(memoriesAbout(active, list, next.person).map((memory) => memory.id)));
        }
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
        // In the graph, a "Memory added" toast lands on that Memory's dot, its card open below.
        setSelection({ kind: 'memory', id: focusMemoryId });
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


    /** Delete or restore, after any edits still waiting, then the list re-read as the API has it. */
    const write = async (work: () => Promise<unknown>) => {
        setBusy(true);
        setError(null);
        await autosave.commit(
            async () => {
                await work();
                return memoryApi.list(storyId, chatId);
            },
            setList,
            setError,
        );
        setBusy(false);
    };

    /** A Belief write, then the list re-read: whether it saved, so a form that failed keeps what was typed. */
    const writeBelief = async (work: () => Promise<unknown>): Promise<boolean> => {
        let saved = false;
        await write(async () => {
            await work();
            saved = true;
        });
        return saved;
    };

    const closeNew = () => {
        setAdding(false);
        setAddedId(null);
    };

    const shown = list?.memories.filter((memory) => memory.id !== addedId) ?? [];
    const active = shown.filter((memory) => !memory.archived);
    const archived = shown.filter((memory) => memory.archived);

    const view = (shownList: MemoryList) => (memory: Memory) => (
        <MemoryView
            key={memory.id}
            list={shownList}
            memory={memory}
            highlighted={memory.id === focusMemoryId}
            inPlay={shownList.inPlay.memoryIds.includes(memory.id)}
            busy={busy}
            autosave={autosave}
            sendEdit={(text, knownBy) => memoryApi.edit(storyId, chatId, memory.id, { text, knownBy })}
            onSaved={saved}
            onDelete={() => void write(() => memoryApi.remove(storyId, chatId, memory.id))}
            onRestore={() => void write(() => memoryApi.restore(storyId, chatId, memory.id))}
            onJump={onJump}
        />
    );

    /**
     * The Bonds the graph draws while "Show Bonds" is on: each current Bond between the user and the
     * Characters of the cast, leaving out any with a Character who sits out.
     */
    const graphBonds = (shownList: MemoryList): GraphBond[] => {
        if (!showBonds) return [];
        const inPlay = (characterId: number) =>
            shownList.cast.some((character) => character.id === characterId) && !sittingOut.includes(characterId);
        return bonds
            .filter((bond) => inPlay(bond.fromCharacterId) && (bond.toCharacterId === null || inPlay(bond.toCharacterId)))
            .map((bond) => ({ from: bond.fromCharacterId, to: bond.toCharacterId ?? 'user', label: bond.label, levels: bond.levels }));
    };

    /** What shows under the graph: the picked Memory's card, the Memories about the picked person, or a hint. */
    const graphPick = (shownList: MemoryList) => {
        if (selection?.kind === 'bond') {
            const bond = graphBonds(shownList).find((each) => each.from === selection.from && each.to === selection.to);
            if (bond) {
                const direction = bondDirection(shownList, bond);
                return (
                    <section className="memory-graph-pick" aria-label={direction}>
                        <h3>{direction}</h3>
                        <p className="bond-label">{bond.label}</p>
                        <p className="muted small">{bond.levels ? bondLevelsInWords(bond.levels) : 'Not measured yet'}</p>
                    </section>
                );
            }
        }
        const picked = selection?.kind === 'memory' ? active.find((memory) => memory.id === selection.id) : undefined;
        if (picked) {
            return (
                <ul className="memory-list" aria-label="Picked Memory">
                    {view(shownList)(picked)}
                </ul>
            );
        }
        if (selection?.kind === 'person') {
            const name = personName(shownList, selection.person);
            const aboutNow = new Set(memoriesAbout(active, shownList, selection.person).map((memory) => memory.id));
            const about = active.filter((memory) => aboutNow.has(memory.id) || pickedAbout.has(memory.id));
            const unknown =
                selection.person === 'user' ? 0 : active.filter((memory) => !memory.knownBy.includes(selection.person as number)).length;
            return (
                <section className="memory-graph-pick" aria-label={`Memories about ${name}`}>
                    <h3>
                        About {name} ({about.length})
                    </h3>
                    {unknown > 0 && (
                        <p className="muted small">
                            Faded dots are the {unknown === 1 ? 'Memory' : `${unknown} Memories`} {name} doesn’t know.
                        </p>
                    )}
                    {about.length === 0 ? (
                        <p className="muted">No Memory names {name} yet.</p>
                    ) : (
                        <ul className="memory-list">{about.map(view(shownList))}</ul>
                    )}
                </section>
            );
        }
        return <p className="muted small">Tap a person to see the Memories about them, or a dot to open one Memory.</p>;
    };

    return (
        <aside className="memory-drawer" aria-label="Memory">
            <div className="memory-drawer-head">
                <h2>Memory</h2>
                {list && <SaveStatus state={autosave.state} />}
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
            {list?.lockedWarning && (
                <p role="note" className="memory-locked-warning">
                    {LOCKED_WARNING}
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
                            autosave={autosave}
                            onAdded={setAddedId}
                            onSaved={saved}
                            onDone={closeNew}
                        />
                    ) : (
                        <button type="button" className="button button-small" disabled={busy} onClick={() => setAdding(true)}>
                            Add a Memory
                        </button>
                    )}
                    <StorySoFarCard storyId={storyId} chatId={chatId} version={version} />
                    <LoreInPlayCard storyId={storyId} chatId={chatId} version={version} />
                    <DocumentsInPlayCard storyId={storyId} chatId={chatId} version={version} />
                    <div className="memory-view-row">
                        <MemoryViewSwitch value={viewKind} onChange={memoryViewKind.set} />
                        {viewKind === 'graph' && <ShowBondsSwitch on={showBonds} onChange={memoryGraphBonds.set} />}
                    </div>
                    {active.length === 0 ? (
                        <p className="muted">Nothing remembered yet.</p>
                    ) : viewKind === 'graph' ? (
                        <>
                            <MemoryGraph
                                list={list}
                                memories={active}
                                selected={selection}
                                onSelect={select}
                                portraits={portraits}
                                bonds={graphBonds(list)}
                            />
                            {graphPick(list)}
                        </>
                    ) : (
                        <ul className="memory-list" aria-label="Memories">
                            {active.map(view(list))}
                        </ul>
                    )}
                    {viewKind === 'graph' && archived.length > 0 && (
                        <p className="muted small">
                            Archived Memories ({archived.length}) are left out of the graph. List shows them.
                        </p>
                    )}
                    {viewKind === 'list' && archived.length > 0 && (
                        <details className="memory-archived">
                            <summary>Archived ({archived.length})</summary>
                            <ul className="memory-list" aria-label="Archived Memories">
                                {archived.map(view(list))}
                            </ul>
                        </details>
                    )}
                    <BeliefsSection
                        list={list}
                        busy={busy}
                        onAdd={(fields) => writeBelief(() => beliefApi.add(storyId, chatId, fields))}
                        onEdit={(beliefId, fields) => writeBelief(() => beliefApi.edit(storyId, chatId, beliefId, fields))}
                        onDelete={(beliefId) => void writeBelief(() => beliefApi.remove(storyId, chatId, beliefId))}
                        onJump={onJump}
                    />
                </>
            )}
        </aside>
    );
}

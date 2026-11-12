'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';

import { announce } from '@/components/announcer';
import { bondDirection, GraphBond, GraphSelection, MemoryGraph, memoriesAbout, personName } from '@/components/chat/memory-graph';
import { BeliefsSection } from '@/components/chat/beliefs-section';
import { Summary } from '@/components/chat/disclosure';
import { DocumentsInPlayCard } from '@/components/chat/documents-in-play-card';
import { LoreInPlayCard } from '@/components/chat/lore-in-play-card';
import { StorySoFarCard } from '@/components/chat/story-so-far-card';
import { useDocked, useDrawerFocus } from '@/components/chat/use-drawer-focus';
import { useConnection } from '@/components/connection';
import { CloseIcon } from '@/components/icons';
import { ErrorState, Loading } from '@/components/query-state';
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

/** A Memory list's look: no bullets, the cards 14px apart. */
const MEMORY_LIST = 'mt-4 mb-0 grid list-none gap-3.5 p-0';

/** A small lock beside "Locked", in the icon set's line style (components/icons has none yet). */
function LockIcon() {
    return (
        <svg viewBox="0 0 24 24" width={14} height={14} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
            <rect x="5" y="11" width="14" height="9.5" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
    );
}

/** "Show Bonds", a switch beside the List / Graph choice: its track reads 3:1 when off (L34), and it slides only with motion on (M33). */
function ShowBondsSwitch({ on, onChange }: { on: boolean; onChange(on: boolean): void }) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={on}
            className="group bare-button inline-flex min-h-11 flex-none items-center gap-2 rounded-sm px-1 text-md text-text"
            onClick={() => onChange(!on)}
        >
            <span
                aria-hidden="true"
                className="relative h-5 w-9 rounded-full border border-field-line bg-quiet-fill group-aria-checked:border-accent-fill group-aria-checked:bg-accent-fill motion-safe:transition-colors motion-safe:duration-base"
            >
                <span className="absolute top-0.5 left-0.5 size-3.5 rounded-full bg-text group-aria-checked:translate-x-4 group-aria-checked:bg-accent-text motion-safe:transition-transform motion-safe:duration-base" />
            </span>
            Show Bonds
        </button>
    );
}

const VIEW_KINDS: readonly { kind: MemoryViewKind; label: string }[] = [
    { kind: 'list', label: 'List' },
    { kind: 'graph', label: 'Graph' },
];

/** List or Graph, as a two-choice radio group; arrow keys move between them. Each half is 44px tall (H30). */
function MemoryViewSwitch({ value, onChange }: { value: MemoryViewKind; onChange(kind: MemoryViewKind): void }) {
    return (
        <div
            className="my-3 flex min-w-0 flex-1 rounded-md border border-field-line bg-bg p-0.5"
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
                    className="bare-button min-h-11 flex-1 rounded-sm text-center text-md text-muted press aria-checked:bg-accent-fill aria-checked:font-semibold aria-checked:text-accent-text"
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
        <fieldset className="m-0 flex flex-wrap gap-2 border-0 p-0">
            <legend className="mb-1 p-0 text-sm text-muted">Known by</legend>
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
    const textId = useId();
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
        <div className="my-3 grid gap-2" role="group" aria-label={label}>
            {/* A label you can see, over the box (audit M55). */}
            <div className="field my-0">
                <label htmlFor={textId}>Memory text</label>
                <textarea
                    id={textId}
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
            </div>
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

/** The opening words of a Memory, to tell its buttons apart from the next one's (audit M11). */
function memoryGist(text: string): string {
    return text.length <= 40 ? text : `${text.slice(0, 40).trimEnd()}…`;
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
    onDelete(): Promise<unknown>;
    onRestore(): void;
    onUnlock(): void;
    onJump(messageId: number): void;
    /** Where focus goes once this Memory is deleted: the next one, or the drawer's heading. */
    focusAfter(): HTMLElement | null | undefined;
}

/**
 * One Memory (spec: "Memory drawer"): its text with `{user}` rendered, Known-by chips, who
 * wrote it, a lock when locked, and a jump to the causing Message. Edit locks it.
 */
function MemoryView({ list, memory, highlighted, inPlay, busy, autosave, sendEdit, onSaved, onDelete, onRestore, onUnlock, onJump, focusAfter }: MemoryViewProps) {
    const [editing, setEditing] = useState(false);
    const nameOf = (id: number) => list.cast.find((character) => character.id === id)?.name ?? 'a removed Character';
    const text = renderUser(memory.text, list.identityName);
    const gist = memoryGist(text);
    return (
        <li
            id={`memory-${memory.id}`}
            data-memory-id={memory.id}
            className={[
                'rounded-lg bg-surface px-4 py-3.5',
                // The Memory a "Memory added" toast opened on.
                highlighted && 'memory-highlight outline-2 outline-offset-2 outline-accent',
            ]
                .filter(Boolean)
                .join(' ')}
        >
            {editing ? (
                <MemoryEditor
                    label="Edit Memory"
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
                    <p className="mt-0 mb-2 whitespace-pre-wrap">{text}</p>
                    <p className="mt-0 mb-2 flex flex-wrap gap-2">
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
                    <p className="mt-0 mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
                        <span>{memory.writtenBy === 'ai' ? 'Written by the AI' : 'Written by you'}</span>
                        {memory.locked && (
                            <span className="inline-flex items-center gap-1 text-event">
                                <LockIcon />
                                Locked
                            </span>
                        )}
                        {inPlay && <span className="font-semibold text-accent">In play</span>}
                        {memory.messageId !== null && (
                            <a
                                href={`#message-${memory.messageId}`}
                                className="inline-flex min-h-11 items-center"
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
                            <button type="button" className="button button-quiet button-small" disabled={busy} onClick={onRestore} aria-label={`Restore ${gist}`}>
                                Restore
                            </button>
                        ) : (
                            <button
                                type="button"
                                className="button button-quiet button-small"
                                disabled={busy}
                                onClick={() => setEditing(true)}
                                aria-label={`Edit ${gist}`}
                            >
                                Edit
                            </button>
                        )}
                        {memory.locked && !memory.archived && (
                            <button type="button" className="button button-quiet button-small" disabled={busy} onClick={onUnlock} aria-label={`Unlock ${gist}`}>
                                Unlock
                            </button>
                        )}
                        <ConfirmButton
                            label="Delete"
                            ariaLabel={`Delete ${gist}`}
                            danger
                            question="Delete this Memory? The Characters forget it for good."
                            confirmLabel="Delete"
                            onConfirm={onDelete}
                            focusAfter={focusAfter}
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
 * The panel: below 768px it covers the screen, clear of the notch and the home bar (audit H5);
 * from 768px a 26rem panel over a scrim; from 1024px it docks beside the Chat, which makes room
 * (memory.css). `memory-drawer` is the hook that rule finds.
 */
const PANEL = [
    'memory-drawer fixed inset-0 z-drawer overflow-y-auto overscroll-contain bg-bg',
    'px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))]',
    'md:left-auto md:w-[26rem] md:border-l md:border-line md:px-5 md:pt-[max(1.25rem,env(safe-area-inset-top))] md:shadow-[-0.5rem_0_1.5rem_var(--shadow)]',
    'lg:w-[28rem] lg:bg-[color-mix(in_srgb,var(--surface)_30%,var(--bg))] lg:shadow-none',
].join(' ');

/**
 * The Memory drawer on the Chat screen (spec: "Memory drawer"): every Memory with its text,
 * Known-by chips, author, lock and jump-to-Message link; Archived in a collapsed section;
 * add, edit (which locks), delete, restore (which locks), unlock. Adds and edits save as they are
 * typed, with the status in the drawer's header (spec: "Saving"). Opens from the Chat head and
 * from a "Memory added" toast, which lands on that Memory.
 *
 * Below 1024px it is a dialog over the Chat (audit H4, M54): focus moves in, Escape and Close
 * leave, the Chat behind is inert, and focus goes back to what opened it. From 1024px it docks
 * beside the Chat as a complementary panel, and the Chat stays in use.
 */
export function MemoryDrawer({ storyId, chatId, focusMemoryId, version, onClose, onJump, portraits, bonds = [], sittingOut = [] }: MemoryDrawerProps) {
    const { reportUnreachable } = useConnection();
    const autosave = useAutosave();
    const docked = useDocked();
    const root = useRef<HTMLDivElement>(null);
    const panel = useRef<HTMLDivElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const addButton = useRef<HTMLButtonElement>(null);
    const pickRef = useRef<HTMLDivElement>(null);
    const headingId = useId();
    const [list, setList] = useState<MemoryList | null>(null);
    const [loadError, setLoadError] = useState<Error | null>(null);
    const [reloads, setReloads] = useState(0);
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

    useDrawerFocus(root, panel, heading, onClose, !docked);

    /**
     * A pick in the graph. What it opens under the graph comes into view and is said (audit M52),
     * so a tap or Enter on a node that opens something out of sight is never silent.
     */
    const select = (next: GraphSelection) => {
        setSelection(next);
        if (!list) return;
        const active = list.memories.filter((memory) => !memory.archived);
        if (next?.kind === 'person') {
            const about = memoriesAbout(active, list, next.person);
            setPickedAbout(new Set(about.map((memory) => memory.id)));
            const name = personName(list, next.person);
            announce(`${name}: ${about.length === 1 ? 'one Memory' : `${about.length} Memories`} about them, below the graph.`);
        } else if (next?.kind === 'memory') announce('The Memory is open below the graph.');
        else if (next?.kind === 'bond') announce(`${bondDirection(list, next)} is shown below the graph.`);
        if (next) {
            requestAnimationFrame(() => {
                const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
                pickRef.current?.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' });
            });
        }
    };

    useEffect(() => {
        let cancelled = false;
        setLoadError(null);
        memoryApi.list(storyId, chatId).then(
            (data) => !cancelled && setList(data),
            (caught: unknown) => {
                if (cancelled) return;
                if (caught instanceof ApiUnreachableError) reportUnreachable();
                else setLoadError(caught instanceof ApiError ? caught : new Error('Could not load the Memory.'));
            },
        );
        return () => {
            cancelled = true;
        };
    }, [storyId, chatId, version, reloads, reportUnreachable]);

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

    const closeNew = useCallback(() => {
        setAdding(false);
        setAddedId(null);
    }, []);

    const shown = list?.memories.filter((memory) => memory.id !== addedId) ?? [];
    const active = shown.filter((memory) => !memory.archived);
    const archived = shown.filter((memory) => memory.archived);

    /** After a delete, focus goes to the Memory that took its place in the same list, or the drawer's heading (audit H2). */
    const focusAfterDelete = (siblings: readonly Memory[], memory: Memory) => {
        const at = siblings.findIndex((each) => each.id === memory.id);
        const next = siblings[at + 1] ?? siblings[at - 1];
        return () =>
            (next && panel.current?.querySelector<HTMLElement>(`[data-memory-id="${next.id}"] button`)) || addButton.current || heading.current;
    };

    const view = (shownList: MemoryList, siblings: readonly Memory[]) => (memory: Memory) => (
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
            onDelete={() => write(() => memoryApi.remove(storyId, chatId, memory.id))}
            onRestore={() => void write(() => memoryApi.restore(storyId, chatId, memory.id))}
            onUnlock={() => void write(() => memoryApi.unlock(storyId, chatId, memory.id))}
            onJump={onJump}
            focusAfter={focusAfterDelete(siblings, memory)}
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
                    <section aria-label={direction}>
                        <h3 className="mt-0 mb-1 text-base">{direction}</h3>
                        <p className="m-0 font-bold text-accent">{bond.label}</p>
                        <p className="mt-1 mb-0 text-sm text-muted">{bond.levels ? bondLevelsInWords(bond.levels) : 'Not measured yet'}</p>
                    </section>
                );
            }
        }
        const picked = selection?.kind === 'memory' ? active.find((memory) => memory.id === selection.id) : undefined;
        if (picked) {
            return (
                <ul className={MEMORY_LIST} aria-label="Picked Memory">
                    {view(shownList, [picked])(picked)}
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
                <section aria-label={`Memories about ${name}`}>
                    <h3 className="mt-0 mb-1 text-base">
                        About {name} ({about.length})
                    </h3>
                    {unknown > 0 && (
                        <p className="m-0 text-sm text-muted">
                            Faded dots are the {unknown === 1 ? 'Memory' : `${unknown} Memories`} {name} doesn’t know.
                        </p>
                    )}
                    {about.length === 0 ? (
                        <p className="mt-2 mb-0 text-muted">No Memory names {name} yet.</p>
                    ) : (
                        <ul className={MEMORY_LIST}>{about.map(view(shownList, about))}</ul>
                    )}
                </section>
            );
        }
        return <p className="m-0 text-sm text-muted">Tap a person to see the Memories about them, or a dot to open one Memory.</p>;
    };

    return (
        <div ref={root} className="contents">
            {/* From 768px the panel leaves the Chat in sight: a scrim says it is out of reach until the drawer closes. */}
            {!docked && <div aria-hidden="true" className="fixed inset-0 z-drawer hidden bg-scrim md:block" onClick={onClose} />}
            <div
                ref={panel}
                className={PANEL}
                role={docked ? 'complementary' : 'dialog'}
                aria-modal={docked ? undefined : true}
                aria-labelledby={headingId}
            >
                <div className="mb-2 flex items-center justify-between gap-2">
                    <h2 ref={heading} id={headingId} tabIndex={-1} className="m-0 text-xl font-bold">
                        Memory
                    </h2>
                    {list && <SaveStatus state={autosave.state} />}
                    <button type="button" className="button button-quiet gap-1.5 px-3" onClick={onClose}>
                        <CloseIcon size={18} />
                        Close
                    </button>
                </div>
                <p className="mt-0 mb-4 text-sm text-muted">
                    What the Characters remember of this Chat. Each one knows only the Memories it is tagged on. Editing a Memory
                    locks it from AI changes.
                </p>
                {error && (
                    <p role="alert" className="turn-error mt-0">
                        {error}
                    </p>
                )}
                {list?.lockedWarning && (
                    <p role="note" className="my-2 rounded-sm border-l-3 border-event bg-quiet-fill px-3 py-2">
                        {LOCKED_WARNING}
                    </p>
                )}
                {!list ? (
                    loadError ? (
                        <ErrorState error={loadError} title="Couldn't load the Memory." onRetry={() => setReloads((count) => count + 1)} />
                    ) : (
                        <Loading label="Loading the Memory…" />
                    )
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
                            <button ref={addButton} type="button" className="button button-small" disabled={busy} onClick={() => setAdding(true)}>
                                Add a Memory
                            </button>
                        )}
                        <StorySoFarCard storyId={storyId} chatId={chatId} version={version} />
                        <LoreInPlayCard storyId={storyId} chatId={chatId} version={version} />
                        <DocumentsInPlayCard storyId={storyId} chatId={chatId} version={version} />
                        <div className="flex items-center gap-3">
                            <MemoryViewSwitch value={viewKind} onChange={memoryViewKind.set} />
                            {viewKind === 'graph' && <ShowBondsSwitch on={showBonds} onChange={memoryGraphBonds.set} />}
                        </div>
                        {active.length === 0 ? (
                            <p className="mt-0 text-muted">Nothing remembered yet.</p>
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
                                <div ref={pickRef} className="scroll-mb-4">
                                    {graphPick(list)}
                                </div>
                            </>
                        ) : (
                            <ul className={MEMORY_LIST} aria-label="Memories">
                                {active.map(view(list, active))}
                            </ul>
                        )}
                        {viewKind === 'graph' && archived.length > 0 && (
                            <p className="mt-3 mb-0 text-sm text-muted">
                                Archived Memories ({archived.length}) are left out of the graph. List shows them.
                            </p>
                        )}
                        {viewKind === 'list' && archived.length > 0 && (
                            <details className="group mt-4">
                                <Summary className="text-muted">Archived ({archived.length})</Summary>
                                <ul className={MEMORY_LIST} aria-label="Archived Memories">
                                    {archived.map(view(list, archived))}
                                </ul>
                            </details>
                        )}
                        <BeliefsSection
                            list={list}
                            busy={busy}
                            onAdd={(fields) => writeBelief(() => beliefApi.add(storyId, chatId, fields))}
                            onEdit={(beliefId, fields) => writeBelief(() => beliefApi.edit(storyId, chatId, beliefId, fields))}
                            onDelete={(beliefId) => writeBelief(() => beliefApi.remove(storyId, chatId, beliefId))}
                            onJump={onJump}
                        />
                    </>
                )}
            </div>
        </div>
    );
}

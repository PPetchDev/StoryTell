'use client';

import { useId, useRef, useState } from 'react';

import { Summary } from '@/components/chat/disclosure';
import { ConfirmButton } from '@/components/story-editor/fields';
import { Belief, BeliefFields, MemoryList, renderUser } from '@/lib/memory';

/** A list of Beliefs: no bullets, the cards 14px apart. */
const BELIEF_LIST = 'mt-4 mb-0 grid list-none gap-3.5 p-0';
const BELIEF_CARD = 'rounded-lg bg-surface px-4 py-3.5';

interface BeliefFormProps {
    label: string;
    list: MemoryList;
    initial: BeliefFields;
    busy: boolean;
    /** Answers whether it saved: the form stays open with what was typed when it didn't. */
    onSave(fields: BeliefFields): Promise<boolean>;
    onCancel(): void;
}

/** Who believes it, what they believe, and the Memory it doesn't match, if any. Saved with Save; Escape cancels. */
function BeliefForm({ label, list, initial, busy, onSave, onCancel }: BeliefFormProps) {
    const [characterId, setCharacterId] = useState(initial.characterId);
    const [text, setText] = useState(initial.text);
    const [contradicts, setContradicts] = useState<number | null>(initial.contradictsMemoryId);
    const id = useId();
    const memories = list.memories.filter((memory) => !memory.archived || memory.id === contradicts);
    const blank = text.trim() === '';
    return (
        <form
            className="my-3 grid gap-2"
            aria-label={label}
            onSubmit={(event) => {
                event.preventDefault();
                if (!blank) void onSave({ characterId, text: text.trim(), contradictsMemoryId: contradicts });
            }}
            onKeyDown={(event) => {
                if (event.key !== 'Escape') return;
                event.stopPropagation();
                onCancel();
            }}
        >
            <div className="field my-0">
                <label htmlFor={`${id}-who`}>Who believes it</label>
                <select id={`${id}-who`} value={characterId} onChange={(event) => setCharacterId(Number(event.target.value))}>
                    {list.cast.map((character) => (
                        <option key={character.id} value={character.id}>
                            {character.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="field my-0">
                <label htmlFor={`${id}-text`}>What they believe</label>
                <textarea
                    id={`${id}-text`}
                    placeholder="What they hold to be true, even if it isn't. Write {user} for yourself."
                    value={text}
                    rows={2}
                    autoFocus
                    onChange={(event) => setText(event.target.value)}
                />
            </div>
            <div className="field my-0">
                <label htmlFor={`${id}-truth`}>Doesn’t match (optional)</label>
                <select
                    id={`${id}-truth`}
                    value={contradicts ?? ''}
                    onChange={(event) => setContradicts(event.target.value === '' ? null : Number(event.target.value))}
                >
                    <option value="">No Memory</option>
                    {memories.map((memory) => (
                        <option key={memory.id} value={memory.id}>
                            {renderUser(memory.text, list.identityName)}
                        </option>
                    ))}
                </select>
            </div>
            <div className="toolbar">
                <button type="submit" className="button button-small" disabled={busy || blank}>
                    Save
                </button>
                <button type="button" className="button button-quiet button-small" onClick={onCancel}>
                    Cancel
                </button>
            </div>
        </form>
    );
}

interface BeliefViewProps {
    list: MemoryList;
    belief: Belief;
    busy: boolean;
    onEdit(fields: BeliefFields): Promise<boolean>;
    onDelete(): Promise<unknown>;
    onJump(messageId: number): void;
    /** Where focus goes once this Belief is deleted. */
    focusAfter(): HTMLElement | null | undefined;
}

/** One Belief: "Nara believes …", the Memory it doesn't match, and, once given up, the line that showed the truth. */
function BeliefView({ list, belief, busy, onEdit, onDelete, onJump, focusAfter }: BeliefViewProps) {
    const [editing, setEditing] = useState(false);
    const editButton = useRef<HTMLButtonElement>(null);
    const name = list.cast.find((character) => character.id === belief.characterId)?.name ?? 'A removed Character';
    const truth = belief.contradictsMemoryId === null ? undefined : list.memories.find((memory) => memory.id === belief.contradictsMemoryId);
    const inPlay = list.inPlay.beliefIds.includes(belief.id);
    const text = renderUser(belief.text, list.identityName);
    // Names the buttons down the list (audit M11): "Edit Nara's Belief: the river…".
    const whose = `${name}’s Belief: ${text.length <= 32 ? text : `${text.slice(0, 32).trimEnd()}…`}`;
    const stopEditing = () => {
        setEditing(false);
        requestAnimationFrame(() => editButton.current?.focus());
    };
    if (editing) {
        return (
            <li className={BELIEF_CARD} data-belief-id={belief.id}>
                <BeliefForm
                    label={`Edit Belief of ${name}`}
                    list={list}
                    initial={{ characterId: belief.characterId, text: belief.text, contradictsMemoryId: belief.contradictsMemoryId }}
                    busy={busy}
                    onSave={async (fields) => {
                        const saved = await onEdit(fields);
                        if (saved) stopEditing();
                        return saved;
                    }}
                    onCancel={stopEditing}
                />
            </li>
        );
    }
    return (
        <li className={BELIEF_CARD} data-belief-id={belief.id}>
            <p className="mt-0 mb-2 whitespace-pre-wrap">
                <span className="font-semibold">{name}</span> {belief.givenUp ? 'believed' : 'believes'} {text}
            </p>
            {truth && (
                <p className="mt-0 mb-2 border-l-3 border-event pl-2 text-sm text-muted">Doesn’t match: {renderUser(truth.text, list.identityName)}</p>
            )}
            {belief.givenUp && (
                <p className="mt-0 mb-2 text-sm text-muted">
                    Gave this up:{' '}
                    <a
                        href={`#message-${belief.givenUp.messageId}`}
                        onClick={(event) => {
                            event.preventDefault();
                            onJump(belief.givenUp!.messageId);
                        }}
                    >
                        {belief.givenUp.line}
                    </a>
                </p>
            )}
            <p className="mt-0 mb-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
                <span>{belief.writtenBy === 'ai' ? 'Written by the AI' : 'Written by you'}</span>
                {inPlay && <span className="font-semibold text-accent">In play</span>}
            </p>
            <div className="toolbar">
                <button
                    ref={editButton}
                    type="button"
                    className="button button-quiet button-small"
                    disabled={busy}
                    onClick={() => setEditing(true)}
                    aria-label={`Edit ${whose}`}
                >
                    Edit
                </button>
                <ConfirmButton
                    label="Delete"
                    ariaLabel={`Delete ${whose}`}
                    danger
                    question="Delete this Belief?"
                    confirmLabel="Delete"
                    onConfirm={onDelete}
                    focusAfter={focusAfter}
                    disabled={busy}
                />
            </div>
        </li>
    );
}

export interface BeliefsSectionProps {
    list: MemoryList;
    busy: boolean;
    onAdd(fields: BeliefFields): Promise<boolean>;
    onEdit(beliefId: number, fields: BeliefFields): Promise<boolean>;
    onDelete(beliefId: number): Promise<unknown>;
    onJump(messageId: number): void;
}

/**
 * The Memory drawer's Beliefs (.scratch/memory-by-meaning/spec.md, "In the Memory drawer"): under
 * the Memories, the held ones grouped by Character, each "Nara believes …" with the Memory it
 * doesn't match; the given-up ones folded below with the line that showed the truth. Add, edit and
 * delete. The Memory graph never draws them.
 */
export function BeliefsSection({ list, busy, onAdd, onEdit, onDelete, onJump }: BeliefsSectionProps) {
    const [adding, setAdding] = useState(false);
    const headingId = useId();
    const section = useRef<HTMLElement>(null);
    const heading = useRef<HTMLHeadingElement>(null);
    const addButton = useRef<HTMLButtonElement>(null);
    const held = list.beliefs.filter((belief) => belief.givenUp === null);
    const givenUp = list.beliefs.filter((belief) => belief.givenUp !== null);
    const holders = list.cast.filter((character) => held.some((belief) => belief.characterId === character.id));

    /** After a delete, focus goes to the next Belief in the same list, else Add a Belief, else the heading (audit H2). */
    const focusAfter = (siblings: readonly Belief[], belief: Belief) => {
        const at = siblings.findIndex((each) => each.id === belief.id);
        const next = siblings[at + 1] ?? siblings[at - 1];
        return () =>
            (next && section.current?.querySelector<HTMLElement>(`[data-belief-id="${next.id}"] button`)) || addButton.current || heading.current;
    };
    const view = (siblings: readonly Belief[]) => (belief: Belief) => (
        <BeliefView
            key={belief.id}
            list={list}
            belief={belief}
            busy={busy}
            onEdit={(fields) => onEdit(belief.id, fields)}
            onDelete={() => onDelete(belief.id)}
            onJump={onJump}
            focusAfter={focusAfter(siblings, belief)}
        />
    );
    const closeForm = () => {
        setAdding(false);
        requestAnimationFrame(() => addButton.current?.focus());
    };
    return (
        <section ref={section} className="mt-6" aria-labelledby={headingId}>
            <h3 ref={heading} id={headingId} tabIndex={-1} className="mt-0 mb-1 text-lg">
                Beliefs
            </h3>
            <p className="mt-0 mb-3 text-sm text-muted">
                What a Character holds to be true, which may be false. They act on it until the story shows them the truth.
            </p>
            {held.length === 0 ? (
                <p className="mt-0 text-muted">No one holds a Belief yet.</p>
            ) : (
                holders.map((character) => {
                    const theirs = held.filter((belief) => belief.characterId === character.id);
                    return (
                        <ul key={character.id} className={BELIEF_LIST} aria-label={`${character.name}’s Beliefs`}>
                            {theirs.map(view(theirs))}
                        </ul>
                    );
                })
            )}
            {adding ? (
                <BeliefForm
                    label="New Belief"
                    list={list}
                    initial={{ characterId: list.present[0] ?? list.cast[0]?.id ?? 0, text: '', contradictsMemoryId: null }}
                    busy={busy}
                    onSave={async (fields) => {
                        const saved = await onAdd(fields);
                        if (saved) closeForm();
                        return saved;
                    }}
                    onCancel={closeForm}
                />
            ) : (
                list.cast.length > 0 && (
                    <button ref={addButton} type="button" className="button button-small mt-3" disabled={busy} onClick={() => setAdding(true)}>
                        Add a Belief
                    </button>
                )
            )}
            {givenUp.length > 0 && (
                <details className="group mt-4">
                    <Summary className="text-muted">Given up ({givenUp.length})</Summary>
                    <ul className={BELIEF_LIST} aria-label="Given-up Beliefs">
                        {givenUp.map(view(givenUp))}
                    </ul>
                </details>
            )}
        </section>
    );
}
